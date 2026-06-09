import { Command } from 'commander';
import type { Platform } from './types.js';
import { runValidation } from './runner.js';
import { printReport, exitCode } from './reporter.js';

export default async function main() {
  const program = new Command();

  program
    .name('consent-mode-validator')
    .alias('cmv')
    .description('Validate Google Consent Mode V2, Shopify Customer Privacy API, and GTM consent setup on any website')
    .version('1.0.0')
    .argument('<url>', 'Website URL to validate (e.g. https://mystore.com)')
    .option(
      '-p, --platform <platform>',
      'Platform to validate: shopify | gtm | universal (default: auto-detect)',
      'universal'
    )
    .option('-v, --verbose', 'Show detailed output and network requests', false)
    .option('--no-color', 'Disable colored output')
    .option('--timeout <ms>', 'Page load timeout in milliseconds', '30000')
    .option('--json', 'Output results as JSON', false)
    .action(async (url: string, opts: {
      platform: string;
      verbose: boolean;
      color: boolean;
      timeout: string;
      json: boolean;
    }) => {
      const validPlatforms = ['shopify', 'gtm', 'universal'];
      if (!validPlatforms.includes(opts.platform)) {
        console.error(`Error: --platform must be one of: ${validPlatforms.join(', ')}`);
        process.exit(1);
      }

      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }

      if (!opts.json) {
        console.log(`\nValidating ${url}…`);
      }

      try {
        const report = await runValidation({
          url,
          platform: opts.platform as Platform,
          verbose: opts.verbose,
          timeout: parseInt(opts.timeout, 10),
        });

        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          printReport(report, opts.color);
        }

        process.exit(exitCode(report));
      } catch (err) {
        console.error(`\nError: ${(err as Error).message}`);
        if (opts.verbose) console.error((err as Error).stack);
        process.exit(2);
      }
    });

  await program.parseAsync(process.argv);
}
