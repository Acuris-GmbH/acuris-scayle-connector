# acuris-scayle-connector

> Drop-in address validation + geocoding for [SCAYLE](https://www.scayle.com)
> headless checkouts, powered by [Acuris](https://acuris-geo.com). Ships
> two npm packages — a React widget pair that emits SCAYLE-native
> `BaseAddress` objects, and a Node handler implementing SCAYLE's
> first-class **third-party address-check gateway contract**. Drops
> straight into the merchant's address-check provider configuration in
> the SCAYLE Panel; replaces the built-in Google Maps Autocomplete
> option.

[![CI](https://github.com/Acuris-GmbH/acuris-scayle-connector/actions/workflows/ci.yml/badge.svg)](https://github.com/Acuris-GmbH/acuris-scayle-connector/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Status:** beta (`0.1.0`).

---

## What this is

SCAYLE is the German headless commerce platform spun out of ABOUT YOU,
focused on European fashion brands. Unlike most platforms in this
family, SCAYLE ships a **first-class address-check gateway protocol**
— a documented HTTP contract for plugging in third-party address
validation — which is exactly the integration surface this connector
fills.

- **`@acuris-geo/scayle-checkout`** — React components +
  hooks. `<AcurisAddressInput>` typeahead and
  `<AcurisAddressValidator>` render-prop, emitting SCAYLE
  `BaseAddress`-shaped objects (nested `country.iso2Code`, split
  `street`/`houseNumber`, `zipCode`, `firstName`/`lastName`). Drops
  into Nuxt-first SCAYLE storefronts or any React BFF.
- **`@acuris-geo/scayle-gateway`** — Node handler implementing
  SCAYLE's **Address Check Request** contract. Responds `200` (exact
  match — let the order through), `200` + `suggestions` (corrections
  — SCAYLE opens its native overlay), `422` (country unsupported), or
  `503` (Acuris temporarily unavailable). Deployable to Lambda, Cloud
  Functions, or any Node runtime.
- **A working Next.js demo** — `examples/scayle-storefront` —
  clone, set `ACURIS_API_KEY`, deploy to Vercel.

> **Note:** This is a community integration. It is **not** an officially
> certified SCAYLE ISV partner integration yet — the ISV partner
> program at [scayle.com/isv-partners](https://www.scayle.com/isv-partners/)
> is the appropriate next step once we have a pilot merchant.

---

## Use with AI coding agents

If you build with Claude Code, Cursor, GitHub Copilot, OpenCode, Codex,
Gemini CLI, or any other tool that supports
[Agent Skills](https://agentskills.io), install the Acuris agent
context. It bundles two skills:

- **`acuris-address`** — wires Acuris AV/Geo/RevGeo/autocomplete into
  your project. Knows the SDK shape, the right headers, the typed
  error hierarchy, and the SCAYLE-specific patterns (the storefront
  widget + the address-check gateway handler that implements SCAYLE's
  documented `200/422/503` contract). Includes migration recipes from
  libAddressDoctor (Informatica), Loqate, Experian QAS, Melissa, and
  Smarty.
- **`acuris-eudi`** — wires the Acuris EUDI Wallet Verifier
  (OID4VP / SD-JWT VC at `eudi.acuris-geo.com`) into a bank KYC flow.

Each skill auto-activates only when your task matches.

```bash
# Claude Code (self-hosted marketplace today; official listing pending review):
/plugin marketplace add Acuris-GmbH/acuris-agent-context
/plugin install acuris@acuris-plugins

# Cursor, Copilot, Codex, OpenCode, Gemini CLI, Kiro, Goose, others:
npx skills add Acuris-GmbH/acuris-agent-context
```

Source: <https://github.com/Acuris-GmbH/acuris-agent-context> · Docs: <https://acuris-gmbh.github.io/acuris-agent-context/>

---

## Why two packages?

SCAYLE's gateway contract is a server-side hook fired on every shipping/
billing address change during checkout. That's the canonical place to
gate validation — but a storefront with a React-driven address form can
*also* benefit from inline typeahead before submission. The two packages
serve those two surfaces:

| | `@acuris-geo/scayle-checkout` | `@acuris-geo/scayle-gateway` |
|---|---|---|
| Where it runs | Browser | Merchant backend (Lambda / Node) |
| Surface | Inline typeahead + on-submit validation | SCAYLE's documented gateway HTTP contract |
| Required for go-live | No — optional UX boost | **Yes** — registered in SCAYLE Panel |
| Bypass-proof | No (browser-only) | Yes (every Cart update fires the gateway) |

Most merchants will ship both. The gateway alone is the minimum for
"replace Google Maps Autocomplete with Acuris".

---

## Quick start

```bash
npm install @acuris-geo/scayle-checkout @acuris-geo/scayle-gateway
```

You also need an Acuris API key — get one at
[acuris-geo.com/acuris-pricing](https://acuris-geo.com/acuris-pricing/).

### Frontend (React, inside your Nuxt/Next.js storefront)

```tsx
import {
  AcurisAddressInput,
  AcurisAddressValidator,
  toBaseAddress,
} from "@acuris-geo/scayle-checkout";

const ENDPOINTS = { validate: "/api/acuris/validate", suggest: "/api/acuris/suggest" };

<AcurisAddressValidator endpoints={ENDPOINTS} country="DE" address={picked}>
  {({ status, result, formProps }) => (
    <form {...formProps}>
      <AcurisAddressInput endpoints={ENDPOINTS} country="DE" value={search} onChange={setSearch} onSelect={setPicked} />
      <button type="submit">Continue</button>
      {status === "ok" && (
        // Result is already SCAYLE-shaped. Hand to the Checkout API.
        await scayleCheckout.setShippingAddress(toBaseAddress(result))
      )}
    </form>
  )}
</AcurisAddressValidator>
```

### Server (Address-Check Gateway)

```ts
import { buildLambdaHandler } from "@acuris-geo/scayle-gateway";

export const handler = buildLambdaHandler({
  apiKey: process.env.ACURIS_API_KEY!,
  minConfidence: 0.8,
  maxSuggestions: 5,
});
```

Register the handler URL in **SCAYLE Panel → Checkout → Address
Validation → Custom Provider**. SCAYLE will POST every shipping/
billing address change there during checkout.

---

## Repository layout

```
packages/
  acuris-scayle-checkout/   React widgets + hooks
  acuris-scayle-gateway/    Node handler for SCAYLE's address-check gateway contract
examples/
  scayle-storefront/        Runnable Next.js demo with proxy routes
docs/
  research.md                  Phase 1 platform research
  architecture.md              Why two packages, ISO-2↔ISO-3 boundary, retry/timeout
  scayle-integration-guide.md  Production wiring guide
```

## Live demo

[acuris-scayle-demo.vercel.app](https://acuris-scayle-demo.vercel.app) — Next.js
storefront with the SCAYLE-shaped components wired against a Next.js
API proxy. Type `Hammanstr` in Germany and pick the Worms result —
expect `rooftop`, confidence `1.00`, lat 49.6316, lng 8.3464.

## License

[MIT](LICENSE) © Acuris GmbH.
