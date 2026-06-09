/**
 * Sniffs the platform from the loaded page by inspecting window globals,
 * script sources, and meta tags. Returns 'shopify', 'gtm', or 'universal'.
 */
export async function detectPlatform(page) {
    const detected = await page.evaluate(() => {
        // Shopify: window.Shopify is always present on Shopify storefronts
        const shopify = window.Shopify;
        if (shopify && typeof shopify === 'object')
            return 'shopify';
        // GTM: googletagmanager.com/gtm.js script tag present
        const hasGtm = !!document.querySelector('script[src*="googletagmanager.com/gtm.js"]');
        if (hasGtm)
            return 'gtm';
        return 'universal';
    });
    return detected;
}
//# sourceMappingURL=auto-detect.js.map