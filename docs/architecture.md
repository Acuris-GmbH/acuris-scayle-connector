# Architecture

How the two packages relate, why the API key always lives on the server,
and the rationale behind retry / timeout defaults. Written for engineers
integrating the connector into a production SCAYLE storefront.

## 30-second summary

```
   Browser                       Your backend                   Acuris
   ─────────                     ─────────                      ─────────

   <AcurisAddressInput>   ──►    /api/acuris/suggest   ──►   GET  /suggest
   <AcurisAddressValidator> ─►   /api/acuris/validate  ──►   POST /validate
                                 (acuris-av-sdk +            (api.acuris-geo.com)
                                  ACURIS_API_KEY +
                                  iso2ToIso3)

   SCAYLE Checkout                                              Acuris
   ─────────────                                                ──────
   on every shipping/billing
   address change      ──►       your-lambda/url       ──►   POST /validate
                                 (acuris-scayle-gateway +     POST /suggest
                                  ACURIS_API_KEY)
```

Three pieces, two trust boundaries:

1. **Storefront component → merchant proxy.** React in the browser calls
   the merchant's own `/api/acuris/*` routes. No Acuris key ever crosses
   into the browser bundle.
2. **Merchant proxy → Acuris.** The proxy uses `@acuris-geo/av-sdk` with
   the key from `process.env`. It also converts SCAYLE-native ISO-2
   country codes to Acuris's ISO-3 (`iso2ToIso3`).
3. **SCAYLE → Address-Check Gateway.** SCAYLE POSTs every shipping/
   billing address change to the gateway URL registered in Panel.
   The gateway responds 200 (exact match), 200 + suggestions
   (corrections — SCAYLE opens its native overlay), 422 (country
   unsupported), or 503 (Acuris temporarily unavailable).

## The two packages

### `@acuris-geo/scayle-checkout` (client)

React components + hooks + boundary mappers.

- Peer-depends on `react ^18 || ^19`.
- Depends on `@acuris-geo/av-sdk` only for shared types.
- Components: `<AcurisAddressInput>` (debounced typeahead),
  `<AcurisAddressValidator>` (render-prop wrapper around a form).
- Hooks: `useAcurisSuggest`, `useAcurisValidation`.
- Boundary helpers: `toAcurisInput`, `toBaseAddress`,
  `suggestionToBaseAddress`, `iso2ToIso3`, `iso3ToIso2`,
  `adaptWireToSdk`.
- SSR-safe. No browser-only globals are touched during render.
- Works under Nuxt-first SCAYLE storefronts (when the merchant exposes
  a thin React subtree) and under Next.js BFF storefronts. Unstyled by
  default; the sample app ships a polished styled-jsx layer.

### `@acuris-geo/scayle-gateway` (server)

Node handler implementing SCAYLE's documented address-check gateway HTTP
contract.

- Zero React deps; safe for Lambda, Cloud Functions, or any Node runtime.
- Exports `processAddressCheck` (runtime-agnostic core) plus thin
  adapters: `buildGatewayHandler`, `buildNodeHttpHandler`,
  `buildLambdaHandler`.
- HTTP Basic Auth is supported on the Node http and Lambda adapters —
  SCAYLE encrypts auth in transit and a shared secret in Panel is the
  recommended posture.
- Two-stage decision:
  - **Rooftop + confidence ≥ `exactConfidence`** → 200 with no body. SCAYLE
    proceeds.
  - **Lower confidence** → 200 + suggestions from Acuris's `/suggest`.
    SCAYLE renders its native correction overlay.
  - **Country in `unsupportedCountries`** → 422. SCAYLE marks the
    address invalid.
  - **Acuris-side failure** → 503. SCAYLE retries.
- The default `extractAddress` reads the documented envelope
  `{ address, addressType, context }`. Pass a custom `extractAddress`
  if your tenant's envelope differs.

## Why a backend proxy is non-negotiable

An Acuris API key is a paid credential — every call decrements credits.
If we let the browser carry the key:

1. Anyone visiting the storefront can read it from the network tab.
2. Bots will scrape it within hours.
3. The customer's credit pool drains overnight.

The connector therefore enforces the proxy pattern by design:

- **The SDK refuses to instantiate without an API key.** That key has to
  come from `process.env.ACURIS_API_KEY` on the server.
- **The React components require an `endpoints` prop** pointing at your
  own routes. There is no escape hatch to call Acuris directly from the
  browser.

## ISO-2 ↔ ISO-3 — where the conversion happens

SCAYLE uses ISO-3166-1 alpha-2 nested in a country object
(`{ iso2Code: "DE" }`). Acuris uses ISO-3 lowercase (`"deu"`). The
conversion happens **exactly once** at each Acuris boundary:

```ts
// pages/api/acuris/validate.ts
const result = await validateAddress(client, input, {
  country: iso2ToIso3(req.body.country),    // ← here
});
```

The wire format between browser and proxy stays in SCAYLE vocabulary.

## Why both a widget and a gateway

SCAYLE's gateway contract is the **canonical** integration point — it runs
on every address change, can't be bypassed, and integrates with SCAYLE's
own correction overlay. So why also ship a React component?

- A merchant who runs Nuxt-first SCAYLE storefronts gets typeahead +
  on-submit validation that feels native, instead of waiting for the
  gateway's pop-up overlay after submission.
- Headless storefronts that don't use SCAYLE's Webcomponent checkout (a
  growing minority) still need address validation. The widget covers them.

For most merchants, ship both. The gateway is the floor; the widget is
the polish.

## Retry and timeout defaults

The SDK ships with conservative defaults that work for a checkout flow:

| Setting           | Default | Rationale                                         |
| ----------------- | ------- | ------------------------------------------------- |
| `timeoutMs`       | 5000 ms | Long enough for cold-start cascades, short enough that users don't sit on a spinner. |
| `maxRetries`      | 3       | Acuris occasionally returns 429 during peak hours; three attempts smooths that without amplifying real outages. |
| backoff base      | 200 ms  | First retry lands at ~200 ms.                      |
| backoff cap       | 4000 ms | Worst-case retry pair never delays a user >5 s.   |
| jitter            | ±25 %   | Avoids thundering when many clients see the same 429 simultaneously. |

The **gateway package** uses a tighter `timeoutMs: 3000` default because
SCAYLE expects a quick response on every keystroke-like address change
during checkout. Raise to 5000 if your handler runs in a different region
from Acuris.

## Failure semantics

The widget and the gateway have different failure stances:

- **Widget**: on a network error, surfaces the error to the user and lets
  them retry. Doesn't block submission — the merchant decides whether to
  treat unverified addresses as a hard stop.
- **Gateway**: on a network error or 5xx, returns 503. SCAYLE retries.
  This is the right posture for a sync side-effect: we don't want to
  trigger a false "address invalid" because Acuris had a 200-ms hiccup.

Both can be tuned in future minors — file an issue if you need fail-closed
gateway behaviour for compliance reasons.

## Versioning

Both packages are versioned in lockstep (`0.1.0`, `0.1.1`, …) and depend
on the same `^0.1.1` of `@acuris-geo/av-sdk`. They will remain in
lockstep through `1.0.0`.
