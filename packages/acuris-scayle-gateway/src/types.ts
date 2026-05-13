/**
 * Types for SCAYLE's third-party address-check gateway HTTP contract.
 *
 * Docs:
 *   https://scayle.dev/documentation/storefront/checkout/address-validation/how-to-integrate-a-custom-address-check-provider
 *
 * SCAYLE registers a Gateway URL in the merchant Panel. During checkout,
 * SCAYLE POSTs an Address Check Request to that URL on every shipping/
 * billing address change. The gateway must respond with one of:
 *
 *   200 (no body)                      — exact match; let the order through.
 *   200 + { suggestions: [...] }       — corrections; SCAYLE opens its overlay.
 *   422 + { reason: "..." }            — country / address-type not supported.
 *   503 + { reason: "..." }            — temporary; SCAYLE retries.
 *
 * The on-the-wire shape of the inbound Request was inferred from public
 * SCAYLE docs and the `@scayle/checkout-types` package. If your tenant's
 * gateway envelope differs, pass an `extractAddress` callback to
 * `processAddressCheck` to map between shapes.
 */

/** Two-letter ISO-3166-1 alpha-2 country code, uppercase. */
export type CountryCodeIso2 = string;

export interface ScayleCountry {
  iso2Code: CountryCodeIso2;
}

/** Mirrors `BaseAddress` from `@scayle/checkout-types`. */
export interface BaseAddress {
  country: ScayleCountry;
  street: string;
  houseNumber?: string;
  zipCode?: string;
  city: string;
  state?: string;
  title?: string;
  salutationCode?: "f" | "m" | "d" | "n";
  firstName?: string;
  lastName?: string;
  additional?: string;
  phone?: string;
}

/**
 * The inbound SCAYLE Address Check Request envelope. Treat `addressType`
 * defensively — if SCAYLE evolves the shape we still want to extract
 * the address and respond cleanly.
 */
export interface AddressCheckRequest {
  /** "shipping" or "billing" — which side of the order we're validating. */
  addressType?: "shipping" | "billing" | string;
  /** The address SCAYLE wants checked. */
  address: BaseAddress;
  /** Tenant/shop hints; may include shop key, customer ID, basket ID. */
  context?: Record<string, unknown>;
}

/**
 * A suggested correction. SCAYLE renders these in its native overlay; the
 * shape is documented in the gateway protocol — we mirror the public
 * fields. Most providers return 1–5 entries.
 */
export interface AddressSuggestion extends BaseAddress {
  /**
   * Optional human-readable difference summary ("Postcode corrected from
   * 67550 to 67549"). SCAYLE renders this in its overlay.
   */
  changeSummary?: string;
}

export type AddressCheckResponse =
  | { status: 200 } // exact match — empty body
  | { status: 200; suggestions: AddressSuggestion[] }
  | { status: 422; reason: string }
  | { status: 503; reason: string };

export interface GatewayConfig {
  /** Acuris API key. Falls back to process.env.ACURIS_API_KEY. */
  apiKey?: string;
  /** Below this confidence we return suggestions instead of 200-exact. Default 0.95. */
  minConfidence?: number;
  /** Above this confidence + accuracy=rooftop we return 200-exact. Same as minConfidence by default. */
  exactConfidence?: number;
  /** Max suggestions to return when below exactConfidence. Default 5. */
  maxSuggestions?: number;
  /** Override the Acuris base URL (defaults to https://api.acuris-geo.com). */
  baseUrl?: string;
  /** Per-call timeout, ms. Default 3000. SCAYLE expects a quick response. */
  timeoutMs?: number;
  /** ISO-2 country codes to refuse (return 422). Useful when an upstream
   *  carrier doesn't ship there. */
  unsupportedCountries?: string[];
  /**
   * Custom extractor if your SCAYLE tenant POSTs a different envelope shape
   * than the documented `{ address, addressType, context }`. Return the
   * `BaseAddress` to validate, or undefined to refuse with 422.
   */
  extractAddress?: (body: unknown) => BaseAddress | undefined;
}
