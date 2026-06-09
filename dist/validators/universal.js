/**
 * Checks that apply to every website regardless of platform:
 * 1. Consent Mode V2 defaults declared before GA4 fires
 * 2. gtag consent update fires after simulated user interaction
 * 3. No analytics/marketing scripts execute before consent is given
 * 4. fitconsent_given cookie structure (if FitConsent is installed)
 */
export async function runUniversalChecks(page, verbose) {
    const results = [];
    // ── Check 1: Consent Mode V2 defaults set before first GA4 hit ───────────
    const defaultsBeforeHit = await page.evaluate(() => {
        const dl = window.dataLayer ?? [];
        let defaultSet = false;
        let ga4HitBeforeDefault = false;
        let defaultIndex = -1;
        for (let i = 0; i < dl.length; i++) {
            const entry = dl[i];
            if (!entry || typeof entry !== 'object')
                continue;
            // Consent default command (traditional gtag/direct dataLayer pattern)
            if (entry[0] === 'consent' && entry[1] === 'default' &&
                typeof entry[2] === 'object' && entry[2] !== null) {
                defaultSet = true;
                defaultIndex = i;
                continue;
            }
            // GA4 hit: event or config push with measurement_id
            const hasMeasurementId = typeof entry['measurement_id'] === 'string' ||
                (typeof entry[0] === 'string' &&
                    ((entry[0] === 'config' || entry[0] === 'event')));
            if (!defaultSet && hasMeasurementId) {
                ga4HitBeforeDefault = true;
            }
        }
        if (defaultSet) {
            if (ga4HitBeforeDefault) {
                return { ok: false, detail: `GA4 hit detected before consent default at index ${defaultIndex}` };
            }
            return { ok: true, detail: `Consent defaults found at dataLayer[${defaultIndex}] before any GA4 hit` };
        }
        const ics = window.google_tag_data?.ics;
        if (ics?.usedDefault && !ics?.wasSetLate) {
            return {
                ok: true,
                detail: 'Consent defaults initialized via GTM Consent Initialization trigger (Custom Template — setDefaultConsentState)',
            };
        }
        return { ok: false, detail: `No gtag('consent','default',...) found in dataLayer (${dl.length} entries)` };
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
    // ── Check 4: fitconsent_given cookie structure (captured BEFORE simulated interaction) ──
    // Must run before U2 because the accept-button simulation may trigger cookie creation.
    const cookieResult = await page.evaluate(() => {
        const raw = document.cookie
            .split(';')
            .map((c) => c.trim())
            .find((c) => c.startsWith('fitconsent_given='));
        if (!raw) {
            return { ok: true, detail: 'FitConsent not installed — check skipped', found: false };
        }
        try {
            const value = decodeURIComponent(raw.split('=').slice(1).join('='));
            const parsed = JSON.parse(value);
            if (typeof parsed.choices !== 'object') {
                return { ok: false, detail: 'fitconsent_given cookie found but missing "choices" key', found: true };
            }
            if (typeof parsed.geo !== 'string') {
                return { ok: false, detail: 'fitconsent_given cookie found but missing "geo" key', found: true };
            }
            const choiceCount = Object.keys(parsed.choices).length;
            return { ok: true, detail: `fitconsent_given cookie valid — ${choiceCount} consent choices, geo="${parsed.geo}"`, found: true };
        }
        catch {
            return { ok: false, detail: 'fitconsent_given cookie found but is not valid JSON', found: true };
        }
    });
    // ── Check 2: gtag consent update fires after simulated acceptance ─────────
    // Handles two scenarios:
    //   a) Returning visitor: consent update already in dataLayer (fired from stored cookie)
    //   b) New visitor: simulate a click on a common accept button and wait for the update
    const consentUpdateResult = await page.evaluate(async () => {
        const dl = window.dataLayer ?? [];
        // Helper: check any entry (array or Arguments object) for consent command
        const isConsentEntry = (e, subcommand) => {
            if (!e || typeof e !== 'object')
                return false;
            const entry = e;
            return entry[0] === 'consent' && entry[1] === subcommand;
        };
        // Returning visitor: update was already pushed from stored consent cookie
        const existingUpdate = dl.find(e => isConsentEntry(e, 'update'));
        if (existingUpdate) {
            const params = existingUpdate[2];
            const granted = params ? Object.values(params).filter(v => v === 'granted').length : 0;
            return { ok: true, detail: `Consent update found in dataLayer (${granted} granted signals — triggered from stored consent cookie)` };
        }
        const ics = window.google_tag_data?.ics;
        if (ics?.usedUpdate) {
            return { ok: true, detail: 'Consent update applied via GTM Custom Template (usedUpdate confirmed in google_tag_data)' };
        }
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
            const el = document.querySelector(sel);
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
        const updateEntry = newEntries.find(e => isConsentEntry(e, 'update'));
        if (!updateEntry) {
            return { ok: false, detail: `Accept button clicked but no gtag('consent','update',...) pushed to dataLayer` };
        }
        const params = updateEntry[2];
        const granted = params ? Object.values(params).filter(v => v === 'granted').length : 0;
        return { ok: true, detail: `consent update fired with ${granted} granted signals after user accept` };
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
    const prematureScripts = await page.evaluate(() => {
        const TRACKING_PATTERNS = [
            /google-analytics\.com\/collect/,
            /google-analytics\.com\/g\/collect/,
            /googletagmanager\.com\/gtm\.js/,
            /connect\.facebook\.net\/.*\/fbevents/,
            /bat\.bing\.com\/bat\.js/,
            /snap\.licdn\.com\/li\.lms-analytics/,
            /static\.ads-twitter\.com/,
        ];
        const dl = window.dataLayer ?? [];
        let consentDefaultSeen = false;
        for (const entry of dl) {
            const e = entry;
            if (e && e[0] === 'consent' && e[1] === 'default') {
                consentDefaultSeen = true;
                break;
            }
        }
        // GTM Custom Template pattern: setDefaultConsentState() — check google_tag_data.ics
        if (!consentDefaultSeen) {
            const ics = window.google_tag_data?.ics;
            if (ics?.usedDefault && !ics?.wasSetLate) {
                consentDefaultSeen = true;
            }
        }
        // Scan script tags for known tracking URLs loaded without consent default
        const scripts = Array.from(document.querySelectorAll('script[src]'))
            .map(s => s.src)
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
//# sourceMappingURL=universal.js.map