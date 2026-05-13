/**
 * Boundary mappers between SCAYLE `BaseAddress` and Acuris's wire format.
 * The load-bearing piece of this connector: SCAYLE wraps country in a
 * nested object and uses `zipCode` / `houseNumber`, while Acuris speaks
 * ISO-3 lowercase + flat `street` / `house_number` / `postcode`.
 */
import type { FieldedAddressInput, ValidationResult } from "@acuris-geo/av-sdk";
import { iso3ToIso2 } from "./iso.js";
import type { BaseAddress, SimpleAddress, SuggestionHit } from "./types.js";

/**
 * SCAYLE BaseAddress (or SimpleAddress) → Acuris fielded input.
 *
 *   { country: { iso2Code: "DE" }, street: "Hammanstr.", houseNumber: "1",
 *     zipCode: "67549", city: "Worms" }
 *     →
 *   { street: "Hammanstr.", house_number: "1", postcode: "67549", city: "Worms" }
 *
 * Country is NOT included in the output — it travels separately at the top
 * of the validate-proxy wire payload so the proxy can do the
 * ISO-2 → ISO-3 conversion in one place.
 */
export function toAcurisInput(addr: BaseAddress | SimpleAddress): FieldedAddressInput {
  return {
    street: addr.street,
    house_number: addr.houseNumber,
    locality: "additional" in addr ? addr.additional : undefined,
    city: addr.city,
    state: addr.state,
    postcode: addr.zipCode,
  };
}

/**
 * Acuris validate result → SCAYLE BaseAddress.
 *
 * `base` lets the caller carry through identity fields (firstName,
 * lastName, phone, title, salutationCode, additional) that Acuris doesn't
 * see. Locale fields are overwritten by Acuris's standardized values;
 * identity fields pass through unchanged.
 */
export function toBaseAddress(
  result: ValidationResult,
  base: Partial<BaseAddress> = {},
): BaseAddress {
  const s = result.standardized;
  const iso3 = s?.country || base.country?.iso2Code || "";
  const country = s?.country
    ? { iso2Code: iso3ToIso2(iso3) }
    : (base.country ?? { iso2Code: "" });
  return {
    country,
    street: s?.street ?? base.street ?? "",
    houseNumber: s?.house_number ?? base.houseNumber,
    zipCode: s?.postcode ?? base.zipCode,
    city: s?.city ?? base.city ?? "",
    state: s?.state ?? base.state,
    title: base.title,
    salutationCode: base.salutationCode,
    firstName: base.firstName ?? "",
    lastName: base.lastName ?? "",
    additional: base.additional,
    phone: base.phone,
  };
}

/** Acuris suggestion hit → SCAYLE BaseAddress. */
export function suggestionToBaseAddress(
  hit: SuggestionHit,
  base: Partial<BaseAddress> = {},
): BaseAddress {
  return {
    country: {
      iso2Code: hit.country ? iso3ToIso2(hit.country) : (base.country?.iso2Code ?? ""),
    },
    street: hit.street ?? base.street ?? "",
    houseNumber: hit.house_number ?? base.houseNumber,
    zipCode: hit.postcode ?? base.zipCode,
    city: hit.city ?? base.city ?? "",
    state: hit.state ?? base.state,
    title: base.title,
    salutationCode: base.salutationCode,
    firstName: base.firstName ?? "",
    lastName: base.lastName ?? "",
    additional: base.additional,
    phone: base.phone,
  };
}
