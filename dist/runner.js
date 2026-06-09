import { chromium } from 'playwright';
import { detectPlatform } from './validators/auto-detect.js';
import { runUniversalChecks } from './validators/universal.js';
import { runShopifyChecks } from './validators/shopify.js';
import { runGtmChecks } from './validators/gtm.js';
export async function runValidation(options) {
    const { url, verbose, timeout } = options;
    let { platform } = options;
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (compatible; FitConsentValidator/1.0; +https://fitconsent.com)',
        // Disable service workers so we get a clean page load
        serviceWorkers: 'block',
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
        if (verbose)
            console.log(`\n  Loading ${url}...`);
        await page.goto(url, { waitUntil: 'networkidle', timeout });
    }
    catch (err) {
        await browser.close();
        throw new Error(`Failed to load ${url}: ${err.message}`);
    }
    // Auto-detect platform if not specified
    if (platform === 'universal') {
        const detected = await detectPlatform(page);
        if (detected !== 'universal') {
            if (verbose)
                console.log(`  [auto-detect] Platform detected: ${detected}`);
            platform = detected;
        }
    }
    else if (verbose) {
        console.log(`  [platform] Using specified platform: ${platform}`);
    }
    const allChecks = [];
    // Always run universal checks
    if (verbose)
        console.log('\n  Running universal checks…');
    const universalChecks = await runUniversalChecks(page, verbose);
    allChecks.push(...universalChecks);
    // Platform-specific checks
    if (platform === 'shopify') {
        if (verbose)
            console.log('\n  Running Shopify-specific checks…');
        const shopifyChecks = await runShopifyChecks(page, verbose);
        allChecks.push(...shopifyChecks);
    }
    else if (platform === 'gtm') {
        if (verbose)
            console.log('\n  Running GTM-specific checks…');
        const gtmChecks = await runGtmChecks(page, verbose);
        allChecks.push(...gtmChecks);
    }
    // GTM checks always run if GTM is detected, even on Shopify
    if (platform === 'shopify') {
        const hasGtm = await page.evaluate(() => !!document.querySelector('script[src*="googletagmanager.com/gtm.js"]'));
        if (hasGtm) {
            if (verbose)
                console.log('\n  GTM also detected on Shopify — running GTM checks…');
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
//# sourceMappingURL=runner.js.map