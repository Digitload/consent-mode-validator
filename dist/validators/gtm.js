/**
 * GTM-specific check:
 * 7. GTM container fires after consent defaults are set in dataLayer
 */
export async function runGtmChecks(page, verbose) {
    const results = [];
    // ── Check 7: GTM fires after consent defaults ─────────────────────────────
    const gtmOrderResult = await page.evaluate(() => {
        const dl = window.dataLayer ?? [];
        let consentDefaultIndex = -1;
        let gtmLoadIndex = -1;
        for (let i = 0; i < dl.length; i++) {
            const entry = dl[i];
            if (!entry || typeof entry !== 'object')
                continue;
            // Consent default
            if (entry[0] === 'consent' && entry[1] === 'default') {
                if (consentDefaultIndex === -1)
                    consentDefaultIndex = i;
                continue;
            }
            // GTM fires a 'gtm.js' event as its first push
            if (entry['event'] === 'gtm.js' && gtmLoadIndex === -1) {
                gtmLoadIndex = i;
            }
        }
        if (gtmLoadIndex === -1) {
            // GTM may be loaded async — check for script tag
            const hasGtmScript = !!document.querySelector('script[src*="googletagmanager.com/gtm.js"]');
            if (!hasGtmScript) {
                return { ok: false, detail: 'No GTM script found on the page' };
            }
            return { ok: false, detail: 'GTM script tag present but gtm.js event not found in dataLayer — GTM may have failed to load' };
        }
        if (consentDefaultIndex === -1) {
            return {
                ok: false,
                detail: `GTM loaded (dataLayer[${gtmLoadIndex}]) but no consent default found — GTM fired without consent initialization`,
            };
        }
        if (gtmLoadIndex < consentDefaultIndex) {
            return {
                ok: false,
                detail: `GTM loaded at dataLayer[${gtmLoadIndex}] BEFORE consent default at dataLayer[${consentDefaultIndex}] — tags may have fired without consent`,
            };
        }
        return {
            ok: true,
            detail: `GTM loaded at dataLayer[${gtmLoadIndex}] AFTER consent default at dataLayer[${consentDefaultIndex}] — correct order`,
        };
    });
    results.push({
        id: 'G1',
        name: 'GTM fires after consent defaults',
        status: gtmOrderResult.ok ? 'pass' : 'fail',
        detail: gtmOrderResult.detail,
        fix: gtmOrderResult.ok
            ? undefined
            : "Move your gtag('consent','default',...) snippet ABOVE the GTM snippet in <head>. The consent defaults must be in dataLayer before GTM loads. See: https://fitconsent.com/en/documentation/gtm-setup",
    });
    // ── Bonus: Consent Mode V2 fields present (not just V1) ───────────────────
    const v2FieldsResult = await page.evaluate(() => {
        const dl = window.dataLayer ?? [];
        const V2_FIELDS = ['ad_user_data', 'ad_personalization'];
        for (const entry of dl) {
            const e = entry;
            if (e && e[0] === 'consent' && (e[1] === 'default' || e[1] === 'update')) {
                const params = e[2];
                if (!params || typeof params !== 'object')
                    continue;
                const hasV2 = V2_FIELDS.every(f => f in params);
                if (hasV2) {
                    return { ok: true, detail: `Consent Mode V2 fields (ad_user_data, ad_personalization) found in ${e[1]} command` };
                }
            }
        }
        return {
            ok: false,
            detail: 'Consent Mode V2 fields (ad_user_data, ad_personalization) not found — you may be running V1 only',
        };
    });
    results.push({
        id: 'G2',
        name: 'Consent Mode V2 fields present',
        status: v2FieldsResult.ok ? 'pass' : 'warn',
        detail: v2FieldsResult.detail,
        fix: v2FieldsResult.ok
            ? undefined
            : "Add ad_user_data and ad_personalization to your consent default/update commands to comply with Google Consent Mode V2. See: https://fitconsent.com/en/articles/google-consent-mode-v2",
    });
    if (verbose) {
        console.log(`  [gtm] ${results.length} checks complete`);
    }
    return results;
}
//# sourceMappingURL=gtm.js.map