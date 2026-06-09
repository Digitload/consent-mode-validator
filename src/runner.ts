import { chromium } from 'playwright';
import { existsSync } from 'fs';
import type { ValidatorOptions, ValidationReport, CheckResult } from './types.js';
import { detectPlatform } from './validators/auto-detect.js';
import { runUniversalChecks } from './validators/universal.js';
import { runShopifyChecks } from './validators/shopify.js';
import { runGtmChecks } from './validators/gtm.js';

function findSystemChrome(): string | undefined {
  if (process.env.CHROME_EXECUTABLE_PATH) return process.env.CHROME_EXECUTABLE_PATH;
  const candidates = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  return candidates.find(p => existsSync(p));
}

export async function runValidation(options: ValidatorOptions): Promise<ValidationReport> {
  const { url, verbose, timeout } = options;
  let { platform } = options;

  const executablePath = findSystemChrome();
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
    ...(executablePath ? { executablePath } : {}),
  });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    serviceWorkers: 'block',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
  });
  // Mask the webdriver flag that headless Chrome exposes
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await context.newPage();

  // Intercept and log requests in verbose mode
  if (verbose) {
    page.on('request', req => {
      if (/google-analytics|googletagmanager|bat\.bing|facebook/.test(req.url())) {
        console.log(`  [network] ${req.method()} ${req.url().slice(0, 80)}`);
      }
    });
  }

  try {
    if (verbose) console.log(`\n  Loading ${url}...`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout });
    } catch (timeoutErr) {
      // Sites with live content (live scores, ad pings, WebSockets) never reach
      // networkidle. Fall back to 'load' + a short wait so consent scripts
      // have time to initialise before checks run.
      if ((timeoutErr as Error).message.includes('Timeout')) {
        if (verbose) console.log(`  [warn] networkidle timed out — retrying with load+wait`);
        await page.goto(url, { waitUntil: 'load', timeout });
        await page.waitForTimeout(2500);
      } else {
        throw timeoutErr;
      }
    }
  } catch (err) {
    await browser.close();
    throw new Error(`Failed to load ${url}: ${(err as Error).message}`);
  }

  // Detect bot-protection blocks (Akamai, Cloudflare, etc.) that serve
  // an "Access Denied" page instead of the real site. Running checks on a
  // blocked page produces false results, so we surface a clear error early.
  const isBlocked = await page.evaluate(() => {
    const title = document.title.toLowerCase();
    const body = document.body?.innerText?.slice(0, 200).toLowerCase() ?? '';
    return (
      title.includes('access denied') ||
      title.includes('403 forbidden') ||
      title.includes('attention required') ||
      title.includes('just a moment') ||
      (body.includes('access denied') && body.includes('permission'))
    );
  });

  if (isBlocked) {
    await browser.close();
    throw new Error(
      `The page at ${url} returned an "Access Denied" response — the site's bot protection (e.g. Akamai, Cloudflare) is blocking the headless browser. Results would be unreliable; validation aborted.`
    );
  }

  // Auto-detect platform if not specified
  if (platform === 'universal') {
    const detected = await detectPlatform(page);
    if (detected !== 'universal') {
      if (verbose) console.log(`  [auto-detect] Platform detected: ${detected}`);
      platform = detected;
    }
  } else if (verbose) {
    console.log(`  [platform] Using specified platform: ${platform}`);
  }

  const allChecks: CheckResult[] = [];

  // Always run universal checks
  if (verbose) console.log('\n  Running universal checks…');
  const universalChecks = await runUniversalChecks(page, verbose);
  allChecks.push(...universalChecks);

  // Platform-specific checks
  if (platform === 'shopify') {
    if (verbose) console.log('\n  Running Shopify-specific checks…');
    const shopifyChecks = await runShopifyChecks(page, verbose);
    allChecks.push(...shopifyChecks);
  } else if (platform === 'gtm') {
    if (verbose) console.log('\n  Running GTM-specific checks…');
    const gtmChecks = await runGtmChecks(page, verbose);
    allChecks.push(...gtmChecks);
  }

  // GTM checks always run if GTM is detected, even on Shopify
  if (platform === 'shopify') {
    const hasGtm = await page.evaluate(() =>
      !!document.querySelector('script[src*="googletagmanager.com/gtm.js"]')
    );
    if (hasGtm) {
      if (verbose) console.log('\n  GTM also detected on Shopify — running GTM checks…');
      const gtmChecks = await runGtmChecks(page, verbose);
      allChecks.push(...gtmChecks);
    }
  }

  await browser.close();

  const passed = allChecks.filter(c => c.status === 'pass').length;
  const failed = allChecks.filter(c => c.status === 'fail').length;
  const warned = allChecks.filter(c => c.status === 'warn').length;
  const skipped = allChecks.filter(c => c.status === 'skip').length;

  return {
    url,
    platform,
    timestamp: new Date().toISOString(),
    passed,
    failed,
    warned,
    skipped,
    checks: allChecks,
  };
}
