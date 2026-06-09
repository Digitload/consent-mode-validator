import type { Page } from 'playwright';
import type { Platform } from '../types.js';
/**
 * Sniffs the platform from the loaded page by inspecting window globals,
 * script sources, and meta tags. Returns 'shopify', 'gtm', or 'universal'.
 */
export declare function detectPlatform(page: Page): Promise<Platform>;
//# sourceMappingURL=auto-detect.d.ts.map