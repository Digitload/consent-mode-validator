import type { Page } from 'playwright';
import type { CheckResult } from '../types.js';
/**
 * GTM-specific check:
 * 7. GTM container fires after consent defaults are set in dataLayer
 */
export declare function runGtmChecks(page: Page, verbose: boolean): Promise<CheckResult[]>;
//# sourceMappingURL=gtm.d.ts.map