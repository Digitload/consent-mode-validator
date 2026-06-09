import type { Page } from 'playwright';
import type { CheckResult } from '../types.js';

/**
 * Checks that apply to every website regardless of platform:
 * 1. Consent Mode V2 defaults declared before GA4 fires
 * 2. gtag consent update fires after simulated user interaction
 * 3. No analytics/marketing scripts execute before consent is given
 * 4. fitconsent_given cookie structure (if FitConsent is installed)
 */
export async function runUniversalChecks(page: Page, verbose: boolean): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // ── Check 1: Consent Mode V2 defaults set before first GA4 hit ───────────
  const defaultsBeforeHit = await page.evaluate((): { ok: boolean; detail: string } => {
    const dl: unknown[] = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
    let defaultSet = false;
    let ga4HitBeforeDefault = false;
    let defaultIndex = -1;

    for (let i = 0; i < dl.length; i++) {
      const entry = dl[i] as Record<string, unknown>;
      if (!entry || typeof entry !== 'object') continue;

      // Consent default command
      if (
        entry[0] === 'consent' && entry[1] === 'default' &&
        typeof entry[2] === 'object' && entry[2] !== null
      ) {
        defaultSet = true;
        defaultIndex = i;
        continue;
      }

      // GA4 hit: event or config push with measurement_id
      const hasMeasurementId = typeof entry['measurement_id'] === 'string' ||
        (Array.isArray(entry) && typeof (entry as string[])[0] === 'string' &&
          ((entry as string[])[0] === 'config' || (entry as string[])[0] === 'event'));

      if (!defaultSet && hasMeasurementId) {
        ga4HitBeforeDefault = true;
      }
    }

    if (!defaultSet) {
      return { ok: false, detail: `No gtag('consent','default',...) found in dataLayer (${dl.length} entries)` };
    }
    if (ga4HitBeforeDefault) {
      return { ok: false, detail: `GA4 hit detected before consent default at index ${defaultIndex}` };
    }
    return { ok: true, detail: `Consent defaults found at dataLayer[${defaultIndex}] before any GA4 hit` };
  });

  results.push({
    id: 'U1',
    name: 'Consent Mode V2 defaults before GA4',
    status: defaultsBeforeHit.ok ? 'pass' : 'fail',
    detail: defaultsBeforeHit.detail,
    fix: defaultsBeforeHit.ok
      ? undefined
      : "Call gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',...}) before loading GTM or GA4. See: https://fitconsent.com/en/documentation/gtm-setup",
  });

  // ── Check 2: gtag consent update fires after simulated acceptance ─────────
  // Inject a lightweight consent-update spy, then simulate a click on common
  // accept button selectors and verify an update command reaches dataLayer.
  const consentUpdateResult = await page.evaluate(async (): Promise<{ ok: boolean; detail: string }> => {
    const dl: unknown[] = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
    const beforeCount = dl.length;

    const ACCEPT_SELECTORS = [
      '[id*="accept"]', '[class*="accept"]',
      '[id*="agree"]', '[class*="agree"]',
      '[data-consent="accept"]', '[data-action="accept"]',
      'button[id*="consent"]', 'button[class*="consent"]',
    ];

    // Try to click an accept button
    let clicked = false;
    for (const sel of ACCEPT_SELECTORS) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el) {
        el.click();
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      return { ok: false, detail: 'No accept button found — could not simulate consent interaction' };
    }

    // Wait up to 1 second for dataLayer update
    await new Promise(r => setTimeout(r, 1000));

    const newEntries = dl.slice(beforeCount);
    const hasUpdate = newEntries.some(e => {
      if (!Array.isArray(e)) return false;
      return e[0] === 'consent' && e[1] === 'update';
    });

    if (!hasUpdate) {
      return { ok: false, detail: `Accept button clicked but no gtag('consent','update',...) pushed to dataLayer` };
    }

    const updateEntry = newEntries.find(e => Array.isArray(e) && e[0] === 'consent' && e[1] === 'update') as unknown[];
    const granted = Object.values(updateEntry[2] as Record<string, string>).filter(v => v === 'granted');
    return { ok: true, detail: `consent update fired with ${granted.length} granted signals after user accept` };
  });

  results.push({
    id: 'U2',
    name: 'Consent update fires after accept',
    status: consentUpdateResult.ok ? 'pass' : (consentUpdateResult.detail.includes('No accept button') ? 'warn' : 'fail'),
    detail: consentUpdateResult.detail,
    fix: consentUpdateResult.ok
      ? undefined
      : "Your consent banner must call gtag('consent','update',{analytics_storage:'granted',...}) when the user accepts. See: https://fitconsent.com/en/documentation/direct-embed",
  });

  // ── Check 3: No marketing/analytics scripts fire before consent ───────────
  const prematureScripts = await page.evaluate((): { ok: boolean; detail: string; scripts: string[] } => {
    const TRACKING_PATTERNS = [
      /google-analytics\.com\/collect/,
      /google-analytics\.com\/g\/collect/,
      /googletagmanager\.com\/gtm\.js/,
      /connect\.facebook\.net\/.*\/fbevents/,
      /bat\.bing\.com\/bat\.js/,
      /snap\.licdn\.com\/li\.lms-analytics/,
      /static\.ads-twitter\.com/,
    ];

    const dl: unknown[] = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
    let consentDefaultSeen = false;

    // Check if consent default was declared before GTM loaded
    for (const entry of dl) {
      const e = entry as Record<string, unknown>;
      if (e && e[0] === 'consent' && e[1] === 'default') {
        consentDefaultSeen = true;
        break;
      }
    }

    // Scan script tags for known tracking URLs loaded without consent default
    const scripts = Array.from(document.querySelectorAll('script[src]'))
      .map(s => (s as HTMLScriptElement).src)
      .filter(src => TRACKING_PATTERNS.some(p => p.test(src)));

    if (!consentDefaultSeen && scripts.length > 0) {
      return { ok: false, detail: `${scripts.length} tracking script(s) loaded without prior consent defaults`, scripts };
    }

    return { ok: true, detail: 'No premature tracking script execution detected', scripts: [] };
  });

  results.push({
    id: 'U3',
    name: 'No premature tracking scripts',
    status: prematureScripts.ok ? 'pass' : 'fail',
    detail: prematureScripts.ok
      ? prematureScripts.detail
      : `${prematureScripts.detail}: ${prematureScripts.scripts.slice(0, 2).join(', ')}`,
    fix: prematureScripts.ok
      ? undefined
      : 'Set consent defaults BEFORE loading GTM. Move your gtag consent default snippet above the GTM script tag.',
  });

  // ── Check 4: fitconsent_given cookie structure ────────────────────────────
  const cookieResult = await page.evaluate((): { ok: boolean; detail: string; found: boolean } => {
    const raw = document.cookie
      .split(';')
      .map((c: string) => c.trim())
      .find((c: string) => c.startsWith('fitconsent_given='));

    if (!raw) {
      return { ok: true, detail: 'FitConsent not installed — check skipped', found: false };
    }

    try {
      const value = decodeURIComponent(raw.split('=').slice(1).join('='));
      const parsed = JSON.parse(value) as Record<string, unknown>;

      if (typeof parsed.choices !== 'object') {
        return { ok: false, detail: 'fitconsent_given cookie found but missing "choices" key', found: true };
      }
      if (typeof parsed.geo !== 'string') {
        return { ok: false, detail: 'fitconsent_given cookie found but missing "geo" key', found: true };
      }

      const choiceCount = Object.keys(parsed.choices as object).length;
      return { ok: true, detail: `fitconsent_given cookie valid — ${choiceCount} consent choices, geo="${parsed.geo}"`, found: true };
    } catch {
      return { ok: false, detail: 'fitconsent_given cookie found but is not valid JSON', found: true };
    }
  });

  results.push({
    id: 'U4',
    name: 'FitConsent cookie structure',
    status: cookieResult.found ? (cookieResult.ok ? 'pass' : 'fail') : 'skip',
    detail: cookieResult.detail,
    fix: cookieResult.ok || !cookieResult.found
      ? undefined
      : 'The fitconsent_given cookie must be JSON with "choices" and "geo" keys. Re-install FitConsent or check for cookie conflicts.',
  });

  if (verbose) {
    console.log(`  [universal] ${results.length} checks complete`);
  }

  return results;
}
