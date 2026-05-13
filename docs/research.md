# SCAYLE connector — Phase 1 research

Date: 2026-05-13. Centra reference at `/opt/acuris/services/acuris-centra-connector/`.

## 1. Address data model

Verified against the official `@scayle/checkout-types` npm package (v2.1.73, downloaded for this research) and the address-handling docs. The canonical shape is:

```ts
// from @scayle/checkout-types
export type SimpleAddress = {
  street: string;
  houseNumber?: string;
  zipCode?: string;
  city: string;
  state?: string;
};
export type BaseAddress = SimpleAddress & {
  country: { iso2Code: Country };          // ISO-2, uppercase ("DE", "FR")
  title?: string;
  salutationCode?: 'f' | 'm' | 'd' | 'n';
  firstName: string;
  lastName: string;
  additional?: string;
  phone?: string;
};
export type Address = BaseAddress & { id: number; hash: string };
export type ShippingAddress = Address & CollectionPointAddressPart;
```

Key facts: country is a **nested object** `{ iso2Code }` not a flat string (Centra-style); ISO-2 uppercase. Street and house number are **split** (`street` + `houseNumber`). Postal field is `zipCode` (not `postalCode`/`postcode`). `state` is optional and rarely used in EU shops. Recipient is `firstName` + `lastName` (no `companyName` in the base type). Required at minimum: `street`, `city`, `firstName`, `lastName`, `country.iso2Code`. Address-handling docs confirm orderState exposes `orderState.addresses.billing` and `orderState.addresses.shipping`, and the PUT endpoint is `/api/co/v3/state/order/addresses/{type}` (where `{type}` is `billing` or `shipping`). Source: https://scayle.dev/documentation/storefront/checkout/implementation/headless-checkout/integration/address-handling and `npm show @scayle/checkout-types`.

## 2. Storefront SDK / checkout API

SCAYLE ships two parallel SDKs, and address handling lives in only one of them:

- `@scayle/storefront-api` (TS) — product/basket/wishlist only. The basket endpoint set is `getBasket`, `createItem`, `updateItem`, `deleteItem`, `bulkUpdatePromotions`. **No address methods exist on the basket.** Auth: `X-Access-Token` header (https://scayle.dev/api-guides/storefront-api/getting-started/authentication).
- `@scayle/storefront-nuxt` is the canonical full-stack framework (Nuxt module). Most production SCAYLE merchants run on Nuxt, not bare Next.js.
- **Checkout API** is separate: REST under `/api/co/v3/...`, authenticated with a **per-customer JWT** signed by the shop and exchanged at `/api/co/v3/state/order/start`. `@scayle/checkout-types` ships the types but no client.

**Recommendation: pure React component, never wrap the SDK.** Reasoning: (a) the Storefront SDK doesn't own addresses at all, so there's nothing to wrap; (b) the Checkout API takes JWT-bearing PUTs that are merchant-server-signed — the merchant must mint the JWT regardless; (c) SCAYLE already has a documented gateway pattern (see §4) which is the *correct* surface for inline validation, and that pattern lives behind the merchant's own backend, not the SDK. So Acuris ships: (i) a React `<AcurisAddressInput>` / `<AcurisAddressValidator>` that emits SCAYLE-shaped objects (mapping `street`/`houseNumber`/`zipCode`/`country.iso2Code`), and (ii) optionally a Node "address-check gateway" reference adapter for the §4 webhook contract.

## 3. Auth model for the demo

Two layers:

- **Storefront API token** (`X-Access-Token`) — minted in SCAYLE Panel by a tenant admin. Not self-serve.
- **Checkout API JWT** — minted by the merchant server, audience = SCAYLE env URL, basket id in claims (see https://scayle.dev/documentation/storefront/checkout/implementation/headless-checkout/integration/initialize-checkout).

There is **no public sandbox**. The `/en/sandbox` URL 404s; the sitemap exposes no `signup`, `trial`, `get-started/account`, or `request-access` page; the address-validation extension docs explicitly say "reach out to your SCAYLE Account Manager" to configure the endpoint (https://scayle.dev/documentation/storefront/checkout/address-validation/how-to-integrate-a-custom-address-check-provider). For Phase 2 the realistic demo path is: (a) record fixture API responses from a SCAYLE blog post / public scayle.com storefront and mock them, OR (b) get a tenant via the SCAYLE ISV partner program at https://www.scayle.com/isv-partners/ (also sales-gated but the explicit ISV onboarding lane).

## 4. Plug-in points

SCAYLE has a **first-class third-party address-validation gateway contract** — this is exactly the Acuris integration surface:

- Docs: https://scayle.dev/documentation/storefront/checkout/address-validation/how-to-integrate-a-custom-address-check-provider
- Pattern: tenant registers a Gateway URL in Panel → SCAYLE checkout POSTs an Address Check Request to it on every shipping/billing address change → gateway responds with 200 (exact match), 200+suggestions array (alternatives — checkout opens overlay), 422 (not supported), 503 (temporary). Basic Auth supported.
- Built-in alternatives this displaces: regex validation (free), Google Maps Autocomplete (free, toggle in Panel). Acuris competes head-on with the Google option — and SCAYLE is already pushing merchants away from Google for B2B / Packstation exclusion reasons (release notes 2.1.83 "Prevent Invalid Delivery Addresses via Google Autocomplete").
- Other plug-in points: HTML Slots in the Checkout Webcomponent (visual injection), Webhooks (`Settings > Webhooks > Checkout Webhooks`, async — wrong shape for sync validation), Dynamic Fields config (toggle phone/title/etc per area).

**Two integration modes** to offer: (1) the gateway/webhook (server-side, language-agnostic, works with both Webcomponent and Headless), (2) the React component (client-side, headless-only, lets us own the typeahead UX).

## 5. Material differences from Centra

Field-by-field, Centra (`packages/acuris-centra-checkout/src/types.ts`, `examples/centra-storefront/pages/checkout.tsx`):

| | Centra | SCAYLE |
|---|---|---|
| Country code | ISO-3 lowercase (`"deu"`, `"usa"`) | ISO-2 uppercase, nested `country.iso2Code: "DE"` |
| Address fields | flat `street`/`house_number`/`city`/`state`/`postcode` | nested into `BaseAddress`, postal is `zipCode` |
| Storefront stack | Next.js sample (`examples/centra-storefront`) | Nuxt-first (`@scayle/storefront-nuxt`), Next.js works but is not the canonical path |
| Auth for demo | Centra public token + open dev environments | No public sandbox; ISV partner gate |
| Extension model | Merchant edits frontend code; no validation hook | Documented sync address-check gateway + Webcomponent slots + webhooks |

**We cannot clone-and-rename Centra.** Material rewrites required: (a) `CountryCode` type (av-sdk uses ISO-3 lowercase; need a translation layer at the SCAYLE adapter boundary); (b) field-name mapping (`postcode→zipCode`, `house_number→houseNumber`, flat `country→country.iso2Code`); (c) add the gateway adapter (Centra has nothing equivalent); (d) Nuxt demo target alongside Next.js. The React component shell, the validate/suggest proxy routes, and the av-sdk integration **can** be reused as-is.

## Availability check

- GitHub `acuris-Gmbh/acuris-scayle-connector`, `Acuris-Gmbh/scayle-connector`, `LeventACURIS/acuris-scayle-connector` — all unclaimed (gh 404).
- npm `@acuris-geo/scayle-checkout`, `@acuris/scayle-checkout`, `@acuris-geo/scayle`, `acuris-scayle-connector` — all unclaimed (registry 404).
- SCAYLE partner pages: https://www.scayle.com/partner/ and https://www.scayle.com/isv-partners/ (ISV is the relevant track).

## Open questions before coding

- **Tenant access**: do we apply to the SCAYLE ISV partner program now, or build against mocked fixtures first and pursue partner status once we have a demo to show?
- **Gateway vs component split**: ship both in v1, or lead with the React component (faster to demo, no SCAYLE-side config required) and add the gateway in v1.1?
- **Country coverage at launch**: SCAYLE merchants are EU fashion (DACH-heavy). Confirm the launch set is DEU/AUT/CHE/NLD/FRA/ITA/ESP/GBR — all already Path-A live.
- **`country.iso2Code` → av-sdk `CountryCode` mapping**: introduce a `toAcurisCountry(iso2)` helper that maps `"DE"→"deu"` etc, OR change av-sdk to accept ISO-2 directly (cross-cutting; affects all connectors).
- **JWT signing in the Next.js demo**: needs a fake shop key + secret to mint the session JWT. Confirm SCAYLE publishes the JWT claim spec in public docs (the init-checkout page shows the claim names but not the signing algorithm/key format — likely needs Account Manager).
- **Address suggestion overlay UX**: when SCAYLE displays its own overlay from gateway suggestions, our React typeahead becomes redundant for that step. Decide whether the typeahead runs *before* form submission (own UX) or we rely solely on the gateway suggestion overlay (SCAYLE-native UX). Likely both, configurable.
