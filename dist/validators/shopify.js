/**
 * Shopify-specific checks:
 * 5. Shopify.customerPrivacy API is available before GTM fires
 * 6. Web Pixels consent mode signals are correctly wired
 */
export async function runShopifyChecks(page, verbose) {
    const results = [];
    // ── Check 5: Shopify.customerPrivacy loads before GTM ────────────────────
    const privacyApiResult = await page.evaluate(() => {
        const shopify = window.Shopify;
        if (!shopify) {
            return { ok: false, detail: 'window.Shopify is not defined — not a Shopify storefront or script blocked' };
        }
        if (!shopify.customerPrivacy) {
            return { ok: false, detail: 'Shopify.customerPrivacy is undefined — Customer Privacy API not loaded' };
        }
        const api = shopify.customerPrivacy;
        const hasSetTrackingConsent = typeof api.setTrackingConsent === 'function';
        const hasCurrentVisitorConsent = typeof api.currentVisitorConsent === 'function';
        if (!hasSetTrackingConsent || !hasCurrentVisitorConsent) {
            return {
                ok: false,
                detail: `Shopify.customerPrivacy loaded but incomplete — setTrackingConsent: ${hasSetTrackingConsent}, currentVisitorConsent: ${hasCurrentVisitorConsent}`,
            };
        }
        // Check GTM loaded after customerPrivacy by examining script order
        const scripts = Array.from(document.querySelectorAll('script[src]'));
        const gtmIndex = scripts.findIndex(s => /googletagmanager\.com\/gtm\.js/.test(s.src));
        // customerPrivacy is injected by Shopify core before body scripts in most themes
        // We verify GTM exists and is not the first script (a heuristic signal)
        if (gtmIndex === 0) {
            return { ok: false, detail: 'GTM appears to be the first script loaded — Shopify.customerPrivacy may not be ready' };
        }
        return { ok: true, detail: `Shopify.customerPrivacy API available with setTrackingConsent + currentVisitorConsent` };
    });
    results.push({
        id: 'S1',
        name: 'Shopify.customerPrivacy API ready',
        status: privacyApiResult.ok ? 'pass' : 'fail',
        detail: privacyApiResult.detail,
        fix: privacyApiResult.ok
            ? undefined
            : "Add Shopify's Customer Privacy API script before GTM. See: https://fitconsent.com/en/documentation/shopify-setup",
    });
    // ── Check 6: Web Pixels consent mode wiring ───────────────────────────────
    const webPixelsResult = await page.evaluate(() => {
        const shopify = window.Shopify;
        if (!shopify?.customerPrivacy) {
            return { ok: false, detail: 'Shopify.customerPrivacy not available — cannot check Web Pixels wiring' };
        }
        const api = shopify.customerPrivacy;
        let currentConsent = {};
        try {
            if (typeof api.currentVisitorConsent === 'function') {
                currentConsent = api.currentVisitorConsent();
            }
        }
        catch {
            return { ok: false, detail: 'Error calling Shopify.customerPrivacy.currentVisitorConsent()' };
        }
        // Web Pixels consent categories
        const categories = ['analytics', 'marketing', 'preferences', 'sale_of_data'];
        const missing = categories.filter(c => !(c in currentConsent));
        if (missing.length > 0) {
            return {
                ok: false,
                detail: `currentVisitorConsent() missing categories: ${missing.join(', ')} — Web Pixels may fire without proper consent`,
            };
        }
        // Check consent values are valid
        const invalid = Object.entries(currentConsent)
            .filter(([k]) => categories.includes(k))
            .filter(([, v]) => v !== 'yes' && v !== 'no' && v !== '');
        if (invalid.length > 0) {
            return {
                ok: false,
                detail: `Invalid consent values for: ${invalid.map(([k, v]) => `${k}="${v}"`).join(', ')} — expected "yes", "no", or ""`,
            };
        }
        const grantedCount = Object.entries(currentConsent)
            .filter(([k]) => categories.includes(k))
            .filter(([, v]) => v === 'yes').length;
        return { ok: true, detail: `Web Pixels consent wired — ${grantedCount}/${categories.length} categories granted` };
    });
    results.push({
        id: 'S2',
        name: 'Shopify Web Pixels consent wiring',
        status: webPixelsResult.ok ? 'pass' : 'fail',
        detail: webPixelsResult.detail,
        fix: webPixelsResult.ok
            ? undefined
            : 'Ensure your CMP calls Shopify.customerPrivacy.setTrackingConsent() with all four categories (analytics, marketing, preferences, sale_of_data). See: https://fitconsent.com/en/documentation/shopify-setup',
    });
    if (verbose) {
        console.log(`  [shopify] ${results.length} checks complete`);
    }
    return results;
}
//# sourceMappingURL=shopify.js.map