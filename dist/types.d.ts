export type Platform = 'shopify' | 'gtm' | 'universal';
export type CheckStatus = 'pass' | 'fail' | 'skip' | 'warn';
export interface CheckResult {
    id: string;
    name: string;
    status: CheckStatus;
    detail: string;
    fix?: string;
}
export interface ValidatorOptions {
    url: string;
    platform: Platform;
    verbose: boolean;
    timeout: number;
}
export interface ValidationReport {
    url: string;
    platform: Platform;
    timestamp: string;
    passed: number;
    failed: number;
    warned: number;
    skipped: number;
    checks: CheckResult[];
}
//# sourceMappingURL=types.d.ts.map