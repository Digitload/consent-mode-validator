import type { Page } from 'playwright';
import type { CheckResult } from '../types.js';
/**
 * Shopify-specific checks:
 * 5. Shopify.customerPrivacy API is available before GTM fires
 * 6. Web Pixels consent mode signals are correctly wired
 */
export declare function runShopifyChecks(page: Page, verbose: boolean): Promise<CheckResult[]>;
//# sourceMappingURL=shopify.d.ts.map