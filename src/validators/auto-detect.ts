import type { Page } from 'playwright';
import type { Platform } from '../types.js';

/**
 * Sniffs the platform from the loaded page by inspecting window globals,
 * script sources, and meta tags. Returns 'shopify', 'gtm', or 'universal'.
 */
export async function detectPlatform(page: Page): Promise<Platform> {
  const detected = await page.evaluate((): string => {
    // Shopify: window.Shopify is always present on Shopify storefronts
    const shopify = (window as unknown as { Shopify?: unknown }).Shopify;
    if (shopify && typeof shopify === 'object') return 'shopify';

    // GTM: googletagmanager.com/gtm.js script tag present
    const hasGtm = !!document.querySelector('script[src*="googletagmanager.com/gtm.js"]');
    if (hasGtm) return 'gtm';

    return 'universal';
  });

  return detected as Platform;
}
