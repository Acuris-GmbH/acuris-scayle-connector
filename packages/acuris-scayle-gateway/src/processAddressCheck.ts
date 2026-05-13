import {
  AcurisClient,
  AcurisError,
  AcurisNotFoundError,
  suggestAddress,
  validateAddress,
  type FieldedAddressInput,
  type SuggestionHit,
  type ValidationResult,
} from "@acuris-geo/av-sdk";
import { iso2ToIso3, iso3ToIso2 } from "./iso.js";
import type {
  AddressCheckRequest,
  AddressCheckResponse,
  AddressSuggestion,
  BaseAddress,
  GatewayConfig,
} from "./types.js";

const DEFAULT_MIN = 0.95;
const DEFAULT_MAX_SUGGESTIONS = 5;

/**
 * Core gateway handler — runtime-agnostic. Takes a parsed Address Check
 * Request, returns the response envelope the HTTP runtime should serialise.
 *
 *   const r = await processAddressCheck(req, { apiKey });
 *   r.status === 200             → respond 200 with optional `suggestions` body.
 *   r.status === 422 | 503       → respond with that code + JSON `{reason}`.
 *
 * Behaviour by Acuris validate outcome:
 *   accuracy_type=rooftop + confidence ≥ exactConfidence  → 200 (no body)
 *   any other match ≥ minConfidence                       → 200 + suggestions
 *   no match / low confidence                             → 200 + suggestions
 *                                                           (from /suggest)
 *   country in unsupportedCountries                       → 422
 *   Acuris-side failure (5xx, network)                    → 503
 */
export async function processAddressCheck(
  request: AddressCheckRequest | unknown,
  config: GatewayConfig = {},
  clientOverride?: AcurisClient,
): Promise<AddressCheckResponse> {
  const extract = config.extractAddress ?? defaultExtract;
  const addr = extract(request);
  if (!addr) {
    return { status: 422, reason: "address_payload_unparseable" };
  }

  const iso2 = addr.country?.iso2Code?.toUpperCase();
  if (!iso2) {
    return { status: 422, reason: "country_code_missing" };
  }
  const skip = new Set((config.unsupportedCountries ?? []).map((c) => c.toUpperCase()));
  if (skip.has(iso2)) {
    return { status: 422, reason: "country_not_supported_by_provider" };
  }

  const minConfidence = config.minConfidence ?? DEFAULT_MIN;
  const exactConfidence = config.exactConfidence ?? minConfidence;
  const maxSuggestions = config.maxSuggestions ?? DEFAULT_MAX_SUGGESTIONS;
  const client = clientOverride ?? buildClient(config);

  let result: ValidationResult | undefined;
  try {
    result = await validateOne(client, addr);
  } catch (err) {
    if (err instanceof AcurisNotFoundError) {
      result = undefined; // fall through to /suggest below
    } else if (err instanceof AcurisError) {
      return { status: 503, reason: "upstream_temporarily_unavailable" };
    } else {
      return { status: 503, reason: "internal_error" };
    }
  }

  // Exact-match path: rooftop + high confidence → 200 with no body.
  if (
    result &&
    result.accuracy_type === "rooftop" &&
    result.confidence >= exactConfidence
  ) {
    return { status: 200 };
  }

  // High-but-not-rooftop confidence → return the standardized result as one suggestion.
  if (result && result.confidence >= minConfidence && result.standardized) {
    const sug = standardizedToSuggestion(result, addr);
    return { status: 200, suggestions: [sug] };
  }

  // Fallback: hit /suggest for alternatives. If even that returns nothing, return
  // an empty suggestions array — SCAYLE renders "no suggestions, proceed at your own risk".
  let hits: SuggestionHit[] = [];
  try {
    const q = composeQueryString(addr);
    if (q) {
      hits = await suggestAddress(client, q, {
        country: iso2ToIso3(iso2),
        limit: maxSuggestions,
      });
    }
  } catch {
    // Suggest is allowed to fail; fall through to empty list.
  }

  const suggestions = hits.map((h) => suggestionToScayle(h, addr));
  return { status: 200, suggestions };
}

function defaultExtract(body: unknown): BaseAddress | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  // Documented envelope: { address: BaseAddress, addressType?, context? }
  if (b.address && typeof b.address === "object") return b.address as BaseAddress;
  // Defensive: some tenants may POST the BaseAddress directly.
  if ("country" in b && "street" in b) return b as unknown as BaseAddress;
  return undefined;
}

async function validateOne(client: AcurisClient, addr: BaseAddress): Promise<ValidationResult> {
  const input: FieldedAddressInput = {
    street: addr.street,
    house_number: addr.houseNumber,
    locality: addr.additional,
    city: addr.city,
    state: addr.state,
    postcode: addr.zipCode,
  };
  return validateAddress(client, input, { country: iso2ToIso3(addr.country.iso2Code) });
}

function composeQueryString(addr: BaseAddress): string {
  return [
    [addr.houseNumber, addr.street].filter(Boolean).join(" "),
    [addr.zipCode, addr.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ")
    .trim();
}

function standardizedToSuggestion(
  result: ValidationResult,
  original: BaseAddress,
): AddressSuggestion {
  const s = result.standardized;
  const corrections = describeCorrections(original, s);
  return {
    country: {
      iso2Code: s?.country ? iso3ToIso2(s.country) : original.country.iso2Code,
    },
    street: s?.street ?? original.street,
    houseNumber: s?.house_number ?? original.houseNumber,
    zipCode: s?.postcode ?? original.zipCode,
    city: s?.city ?? original.city,
    state: s?.state ?? original.state,
    firstName: original.firstName,
    lastName: original.lastName,
    additional: original.additional,
    phone: original.phone,
    title: original.title,
    salutationCode: original.salutationCode,
    changeSummary: corrections.length > 0 ? corrections.join("; ") : undefined,
  };
}

function suggestionToScayle(
  hit: SuggestionHit,
  original: BaseAddress,
): AddressSuggestion {
  return {
    country: {
      iso2Code: hit.country ? iso3ToIso2(hit.country) : original.country.iso2Code,
    },
    street: hit.street ?? original.street,
    houseNumber: hit.house_number ?? original.houseNumber,
    zipCode: hit.postcode ?? original.zipCode,
    city: hit.city ?? original.city,
    state: hit.state ?? original.state,
    firstName: original.firstName,
    lastName: original.lastName,
    additional: original.additional,
    phone: original.phone,
    title: original.title,
    salutationCode: original.salutationCode,
  };
}

function describeCorrections(
  original: BaseAddress,
  standardized: ValidationResult["standardized"],
): string[] {
  if (!standardized) return [];
  const out: string[] = [];
  const ci = (a?: string, b?: string) => (a ?? "").toLowerCase() !== (b ?? "").toLowerCase();
  if (standardized.street && ci(original.street, standardized.street)) {
    out.push(`Street corrected: ${original.street} → ${standardized.street}`);
  }
  if (standardized.house_number && ci(original.houseNumber, standardized.house_number)) {
    out.push(`House number corrected: ${original.houseNumber ?? "—"} → ${standardized.house_number}`);
  }
  if (standardized.postcode && ci(original.zipCode, standardized.postcode)) {
    out.push(`Postcode corrected: ${original.zipCode ?? "—"} → ${standardized.postcode}`);
  }
  if (standardized.city && ci(original.city, standardized.city)) {
    out.push(`City corrected: ${original.city} → ${standardized.city}`);
  }
  return out;
}

function buildClient(config: GatewayConfig): AcurisClient {
  return new AcurisClient({
    apiKey: config.apiKey ?? process.env.ACURIS_API_KEY,
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs ?? 3000,
    userAgent: "acuris-scayle-gateway/0.1.0",
  });
}
