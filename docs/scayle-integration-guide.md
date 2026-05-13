# SCAYLE integration guide

> Wiring the Acuris connector into a SCAYLE-based storefront. Written for
> the engineer doing the integration — assumes you have a SCAYLE tenant
> (or ISV partner access) and at least one Checkout API call working in
> your codebase already.

## What you'll have at the end

- Address typeahead on your storefront's address step, powered by Acuris.
- A "validate on submit" pass that catches bad addresses **before** they
  hit SCAYLE's Checkout API.
- An **address-check gateway** registered in SCAYLE Panel that runs
  server-side on every shipping/billing address change — closing the
  bypass that storefront-only validation can't.
- Zero Acuris credentials in your browser bundle.

## Prerequisites

- A SCAYLE tenant — sales-gated. Apply to the
  [SCAYLE ISV partner program](https://www.scayle.com/isv-partners/)
  for the partner-onboarding lane.
- An Acuris API key. Get one at
  [acuris-geo.com/acuris-pricing](https://acuris-geo.com/acuris-pricing/).
- Node 18.17+.
- Your existing storefront framework: Nuxt with
  `@scayle/storefront-nuxt` is the canonical SCAYLE stack; Next.js BFFs
  work too with a thin React subtree.

## Install

```bash
npm install @acuris-geo/scayle-checkout @acuris-geo/scayle-gateway
```

Add the API key to your server-side env:

```
# .env.local
ACURIS_API_KEY=sk-...your-key...
```

---

## Step 1 — Add the proxy API routes

The React components call your backend, not Acuris directly. Drop two
routes into your Next.js BFF (or the equivalent in your Nuxt server
runtime).

### `pages/api/acuris/validate.ts`

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { AcurisClient, validateAddress, AcurisError } from "@acuris-geo/av-sdk";
import { iso2ToIso3 } from "@acuris-geo/scayle-checkout";

let client: AcurisClient | null = null;
function getClient() {
  if (!client) client = new AcurisClient({ apiKey: process.env.ACURIS_API_KEY });
  return client;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const { country, input } = req.body ?? {};
  if (!country || !input) return res.status(400).json({ error: "bad_request" });
  try {
    res.status(200).json(
      await validateAddress(getClient(), input, { country: iso2ToIso3(country) }),
    );
  } catch (err) {
    if (err instanceof AcurisError) return res.status(err.status ?? 502).json({ error: err.message });
    res.status(500).json({ error: String(err) });
  }
}
```

### `pages/api/acuris/suggest.ts`

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { AcurisClient, suggestAddress, AcurisError } from "@acuris-geo/av-sdk";
import { iso2ToIso3 } from "@acuris-geo/scayle-checkout";

let client: AcurisClient | null = null;
function getClient() {
  if (!client) client = new AcurisClient({ apiKey: process.env.ACURIS_API_KEY });
  return client;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
  const country = String(req.query.country ?? "");
  const q = String(req.query.q ?? "");
  if (!country) return res.status(400).json({ error: "bad_request" });
  try {
    res.status(200).json({
      suggestions: await suggestAddress(getClient(), q, { country: iso2ToIso3(country), limit: 5 }),
    });
  } catch (err) {
    if (err instanceof AcurisError) return res.status(err.status ?? 502).json({ error: err.message });
    res.status(500).json({ error: String(err) });
  }
}
```

For Nuxt server routes, define them under `server/api/acuris/` with the
same logic — the SDK is framework-agnostic.

---

## Step 2 — Wire the React components into your address step

```tsx
import { useState } from "react";
import {
  AcurisAddressInput,
  AcurisAddressValidator,
  suggestionToBaseAddress,
  toBaseAddress,
  hitToDisplay,
  type BaseAddress,
  type SuggestionHit,
} from "@acuris-geo/scayle-checkout";

const ENDPOINTS = { validate: "/api/acuris/validate", suggest: "/api/acuris/suggest" };

export function AddressStep({ country, onAddressVerified }: {
  country: string;                     // ISO-2: "DE", "US", "NL"
  onAddressVerified: (addr: BaseAddress) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<SuggestionHit | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const baseAddress = picked
    ? suggestionToBaseAddress(picked, {
        country: { iso2Code: country },
        firstName,
        lastName,
      })
    : null;

  return (
    <AcurisAddressValidator
      endpoints={ENDPOINTS}
      country={country}
      address={baseAddress ?? search}
      trigger="submit"
    >
      {({ status, result, error, formProps }) => (
        <form
          {...formProps}
          onSubmit={async (e) => {
            formProps.onSubmit(e);
            if (status === "ok" && result) {
              const verified = toBaseAddress(result, baseAddress ?? {
                country: { iso2Code: country },
                firstName, lastName, street: "", city: "",
              });
              await onAddressVerified(verified);
            }
          }}
        >
          {/* firstName, lastName inputs… */}
          <AcurisAddressInput
            endpoints={ENDPOINTS}
            country={country}
            value={search}
            onChange={(v) => {
              setSearch(v);
              if (picked && v !== hitToDisplay(picked)) setPicked(null);
            }}
            onSelect={setPicked}
            placeholder="Start typing your address…"
          />
          <button type="submit">Continue to shipping</button>
          {status === "error" && <p role="alert">Couldn't verify: {error?.message}</p>}
        </form>
      )}
    </AcurisAddressValidator>
  );
}
```

---

## Step 3 — Hand the verified address to SCAYLE

`toBaseAddress(result, base)` returns a SCAYLE `BaseAddress`. Hand it to
the SCAYLE Checkout API's `PUT /api/co/v3/state/order/addresses/{type}`
mutation directly:

```ts
// Pseudo-code — your Checkout API client will look different in practice.
await scayleCheckout.setShippingAddress(verifiedAddress);
```

SCAYLE requires `firstName`, `lastName`, `street`, `city`, and
`country.iso2Code` for an Order — the mapper preserves identity fields
from the `base` argument so the merchant must supply names before
submission.

---

## Step 4 — Deploy the address-check gateway

The storefront component guides the buyer; the gateway closes the bypass.
Deploy a Lambda (or Cloud Function) running the handler:

```ts
import { buildLambdaHandler } from "@acuris-geo/scayle-gateway";

export const handler = buildLambdaHandler({
  apiKey: process.env.ACURIS_API_KEY!,
  minConfidence: 0.95,
  maxSuggestions: 5,
  basicAuthUser: "scayle",
  basicAuthPass: process.env.SCAYLE_GATEWAY_PASSWORD!,
});
```

Then register the URL + Basic Auth credentials in **SCAYLE Panel →
Checkout → Address Validation → Custom Provider**.

SCAYLE will POST every shipping/billing address change to that URL
during checkout. The handler responds:

| Acuris result | Gateway response | SCAYLE behaviour |
|---|---|---|
| `rooftop` + confidence ≥ `exactConfidence` | `200` no body | Address accepted; checkout proceeds. |
| Lower confidence | `200 + suggestions[]` | SCAYLE opens its native correction overlay. |
| Country in `unsupportedCountries` | `422` | Address marked invalid. |
| Acuris network / 5xx | `503` | SCAYLE retries. |

---

## Step 5 — Decide what to do with imperfect matches

`accuracy_type` gives you a coarse precision bucket. A reasonable policy
for the storefront-side `<AcurisAddressValidator>`:

| `accuracy_type`             | Action                                          |
| --------------------------- | ----------------------------------------------- |
| `rooftop`, `parcel`         | Auto-accept, proceed.                           |
| `street_interpolated`       | Auto-accept; log for ops.                       |
| `street_center`, `postcode` | "Looks like X — is this right?" inline confirm. |
| `locality`, `centroid`      | Reject; surface Acuris's `corrections[]`.       |
| `null` (no match)           | Reject; ask the buyer to refine.                |

The gateway uses a coarser two-level policy (`exact` vs `suggestions`)
because SCAYLE owns the user-facing overlay UI after that.

---

## Test addresses

Manual smoke before going live:

1. **Hammanstr. 1, 67549 Worms / Germany.** Expect `rooftop`, confidence
   1.00, lat 49.6316, lng 8.3464. This is the canonical "happy path".
2. **A typo.** Swap two letters in the street. Expect `input_corrected:
   true` and the corrected form in `standardized.formatted_address`.
3. **A non-EU country.** SCAYLE tenants typically ship DACH + EU
   primarily. Confirm your `unsupportedCountries` list returns 422 for
   any out-of-scope country.

---

## Common pitfalls

**Country code shape.** SCAYLE's `country` is **nested**:
`{ iso2Code: "DE" }`. Don't pass a flat `"DE"` string — TypeScript catches
this but JavaScript callers will silently misroute.

**Names are required at the Order boundary.** SCAYLE rejects orders
without `firstName` and `lastName`. The `toBaseAddress(result, base)`
mapper preserves them from `base` but defaults to empty strings if you
forget to pass them.

**Hydration mismatch on first paint.** Define the `endpoints` object as
a module constant (not inline in JSX) and memoize the `address` prop —
otherwise React may warn about prop instability.

**Gateway URL not registered.** The storefront component alone isn't
"production-ready" by SCAYLE's posture — partner code, CSV imports, and
SCAYLE's own Webcomponent checkout all hit the gateway, not the React
widget. Ship both.

---

## Going further

- **Nuxt-native demo.** The current sample is Next.js for portability.
  A Nuxt + `@scayle/storefront-nuxt` sample is on the roadmap.
- **Webcomponent slot integration.** SCAYLE's Webcomponent checkout
  exposes named HTML slots; the React widget can be rendered into one
  for tenants on the hosted checkout.
- **ISV partner Marketplace listing.** Once the connector has a pilot
  merchant, apply to scayle.com/isv-partners for an official listing.

For anything unclear, file an issue at
[github.com/Acuris-GmbH/acuris-scayle-connector/issues](https://github.com/Acuris-GmbH/acuris-scayle-connector/issues)
or email `support@acuris-geo.com`.
