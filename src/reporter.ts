import type { ValidationReport, CheckStatus } from './types.js';

const ICONS: Record<CheckStatus, string> = {
  pass: '✓',
  fail: '✗',
  warn: '⚠',
  skip: '–',
};

const LABELS: Record<CheckStatus, string> = {
  pass: 'PASS',
  fail: 'FAIL',
  warn: 'WARN',
  skip: 'SKIP',
};

function pad(s: string, n: number): string {
  return s.padEnd(n, ' ');
}

export function printReport(report: ValidationReport, useColor: boolean): void {
  const c = useColor ? makeColors() : noColors();

  console.log('');
  console.log(c.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(c.bold(' FitConsent — Consent Mode Validator'));
  console.log(c.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(`  URL:       ${report.url}`);
  console.log(`  Platform:  ${report.platform}`);
  console.log(`  Checked:   ${new Date(report.timestamp).toLocaleString()}`);
  console.log('');

  for (const check of report.checks) {
    const icon = ICONS[check.status];
    const label = LABELS[check.status];
    const coloredLabel = check.status === 'pass'
      ? c.green(`${icon} ${label}`)
      : check.status === 'fail'
        ? c.red(`${icon} ${label}`)
        : check.status === 'warn'
          ? c.yellow(`${icon} ${label}`)
          : c.dim(`${icon} ${label}`);

    console.log(`  ${pad(`[${check.id}]`, 5)} ${coloredLabel.padEnd(useColor ? 20 : 8)}  ${check.name}`);
    console.log(`         ${c.dim(check.detail)}`);

    if (check.fix && (check.status === 'fail' || check.status === 'warn')) {
      console.log(`         ${c.cyan('Fix:')} ${check.fix}`);
    }
    console.log('');
  }

  console.log(c.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

  const summary: string[] = [];
  if (report.passed > 0) summary.push(c.green(`${report.passed} passed`));
  if (report.failed > 0) summary.push(c.red(`${report.failed} failed`));
  if (report.warned > 0) summary.push(c.yellow(`${report.warned} warnings`));
  if (report.skipped > 0) summary.push(c.dim(`${report.skipped} skipped`));

  console.log(`  ${summary.join('  ')}`);
  console.log('');

  if (report.failed > 0) {
    console.log(c.dim('  For production consent management, these checks are handled automatically'));
    console.log(c.dim('  by FitConsent — https://fitconsent.com'));
    console.log('');
  }
}

export function exitCode(report: ValidationReport): number {
  return report.failed > 0 ? 1 : 0;
}

function makeColors() {
  return {
    bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
    green: (s: string) => `\x1b[32m${s}\x1b[0m`,
    red: (s: string) => `\x1b[31m${s}\x1b[0m`,
    yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
    cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
    dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  };
}

function noColors() {
  return {
    bold: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    yellow: (s: string) => s,
    cyan: (s: string) => s,
    dim: (s: string) => s,
  };
}
