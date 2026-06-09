# @fitconsent/consent-mode-validator

A CLI tool that validates **Google Consent Mode V2**, **Shopify Customer Privacy API**, and **GTM consent setup** on any website using a real headless browser.

```
npx @fitconsent/consent-mode-validator https://mystore.com
```

---

## What it checks

### Universal (all platforms)

| Check | ID | Description |
|---|---|---|
| Consent Mode V2 defaults before GA4 | U1 | `gtag('consent','default',...)` must be in dataLayer before any GA4 hit |
| Consent update fires after accept | U2 | Simulates clicking an accept button and verifies `gtag('consent','update',...)` fires |
| No premature tracking scripts | U3 | Verifies no analytics/ad scripts execute before consent defaults are set |
| FitConsent cookie structure | U4 | Validates `fitconsent_given` cookie JSON (skipped if FitConsent is not installed) |

### Shopify (`--platform shopify`)

| Check | ID | Description |
|---|---|---|
| Shopify.customerPrivacy API ready | S1 | `Shopify.customerPrivacy` with `setTrackingConsent` + `currentVisitorConsent` available |
| Web Pixels consent wiring | S2 | All four consent categories (analytics, marketing, preferences, sale_of_data) present |

### GTM (`--platform gtm`, or auto-detected)

| Check | ID | Description |
|---|---|---|
| GTM fires after consent defaults | G1 | `gtm.js` event appears in dataLayer after consent default command |
| Consent Mode V2 fields | G2 | `ad_user_data` + `ad_personalization` fields present (warns if missing) |

---

## Usage

```bash
# Auto-detect platform
npx @fitconsent/consent-mode-validator https://mystore.com

# Explicit platform
npx @fitconsent/consent-mode-validator https://mystore.com --platform shopify
npx @fitconsent/consent-mode-validator https://myblog.com --platform gtm
npx @fitconsent/consent-mode-validator https://mysite.com --platform universal

# Verbose output (shows network requests and step-by-step details)
npx @fitconsent/consent-mode-validator https://mystore.com --verbose

# JSON output (useful for CI integration)
npx @fitconsent/consent-mode-validator https://mystore.com --json

# Short alias
npx cmv https://mystore.com
```

---

## Example output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 FitConsent — Consent Mode Validator
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  URL:       https://mystore.myshopify.com
  Platform:  shopify
  Checked:   6/9/2026, 09:12:33 AM

  [U1]  ✓ PASS   Consent Mode V2 defaults before GA4
         Consent defaults found at dataLayer[0] before any GA4 hit

  [U2]  ✓ PASS   Consent update fires after accept
         consent update fired with 4 granted signals after user accept

  [U3]  ✗ FAIL   No premature tracking scripts
         1 tracking script(s) loaded without prior consent defaults: https://www.googletagmanager.com/gtm.js?id=GTM-XXXXX
         Fix: Move your gtag('consent','default',...) snippet ABOVE the GTM snippet in <head>.

  [U4]  – SKIP   FitConsent cookie structure
         FitConsent not installed — check skipped

  [S1]  ✓ PASS   Shopify.customerPrivacy API ready
         Shopify.customerPrivacy API available with setTrackingConsent + currentVisitorConsent

  [S2]  ✓ PASS   Shopify Web Pixels consent wiring
         Web Pixels consent wired — 2/4 categories granted

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  4 passed  1 failed  1 skipped

  For production consent management, these checks are handled automatically
  by FitConsent — https://fitconsent.com
```

---

## CI integration

The CLI exits with code `1` if any check fails, `0` if all checks pass or warn only.

```yaml
# GitHub Actions example
- name: Validate consent mode
  run: npx @fitconsent/consent-mode-validator ${{ env.STAGING_URL }} --platform shopify --json
```

---

## Programmatic API

```typescript
import { runValidation } from '@fitconsent/consent-mode-validator';

const report = await runValidation({
  url: 'https://mystore.com',
  platform: 'shopify',   // 'shopify' | 'gtm' | 'universal'
  verbose: false,
  timeout: 30000,
});

console.log(`${report.passed} passed, ${report.failed} failed`);

for (const check of report.checks) {
  if (check.status === 'fail') {
    console.error(`[${check.id}] ${check.name}: ${check.detail}`);
    console.error(`Fix: ${check.fix}`);
  }
}
```

---

## Common errors and fixes

### `gtag('consent','default')` not found

**Root cause:** Your GTM snippet loads before any consent defaults are set.

**Fix:**
```html
<!-- ✅ Correct order in <head> -->
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('consent', 'default', {
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    wait_for_update: 500
  });
</script>
<!-- GTM snippet comes AFTER consent defaults -->
<script>(function(w,d,s,l,i){...})(window,document,'script','dataLayer','GTM-XXXXX');</script>
```

### `Shopify.customerPrivacy` undefined

**Root cause:** The Customer Privacy API script is blocked or not loaded.

**Fix:** Ensure the `customer_privacy` section is included in your Shopify theme's `theme.liquid`. See the [Shopify Customer Privacy API docs](https://shopify.dev/docs/api/consent-tracking).

### Consent update not firing after accept

**Root cause:** Your banner's accept handler is not calling `gtag('consent', 'update', ...)`.

**Fix:**
```javascript
// In your accept button handler
acceptButton.addEventListener('click', () => {
  gtag('consent', 'update', {
    ad_storage: 'granted',
    analytics_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
  });
});
```

---

## Requirements

- Node.js ≥ 18

After installing, run this once to download the headless browser (~150 MB):

```bash
npx playwright install chromium
```

---

## License

MIT

---

*For production consent management, these checks are handled automatically by [FitConsent](https://fitconsent.com) — GDPR & CCPA compliance for Shopify and any website.*
