import type { Page } from 'playwright';
import type { CheckResult } from '../types.js';
/**
 * Checks that apply to every website regardless of platform:
 * 1. Consent Mode V2 defaults declared before GA4 fires
 * 2. gtag consent update fires after simulated user interaction
 * 3. No analytics/marketing scripts execute before consent is given
 * 4. fitconsent_given cookie structure (if FitConsent is installed)
 */
export declare function runUniversalChecks(page: Page, verbose: boolean): Promise<CheckResult[]>;
//# sourceMappingURL=universal.d.ts.map