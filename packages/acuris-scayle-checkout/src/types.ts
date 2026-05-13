/**
 * Public types for @acuris-geo/scayle-checkout.
 *
 * Field names mirror SCAYLE's `BaseAddress` shape verbatim, as published
 * in the official `@scayle/checkout-types` package. The connector ships
 * mappers that translate between this shape and Acuris's wire format —
 * the mapping is the work the connector exists to do.
 *
 * Notable SCAYLE-isms (vs other headless commerce types):
 *  - `country` is a **nested object** `{ iso2Code: "DE" }`, not a flat string.
 *  - Postal field is `zipCode`, not `postcode` / `postalCode`.
 *  - Street / house number are split: `street` + `houseNumber`.
 *  - Recipient is `firstName` + `lastName`; no `companyName` in the base type.
 *  - `additional` is the multipurpose extras field (apartment, building, etc).
 */
import type { SuggestionHit, ValidationResult } from "@acuris-geo/av-sdk";
export type { SuggestionHit, ValidationResult };

/** ISO-3166-1 alpha-2 country code, uppercase (e.g. "DE", "FR", "NL"). */
export type CountryCodeIso2 = string;

/** SCAYLE's nested-country wrapper. */
export interface ScayleCountry {
  iso2Code: CountryCodeIso2;
}

export interface SimpleAddress {
  street: string;
  houseNumber?: string;
  zipCode?: string;
  city: string;
  state?: string;
}

/**
 * SCAYLE `BaseAddress`. Required for an Order: street, city, firstName,
 * lastName, country.iso2Code. All other fields optional.
 */
export interface BaseAddress extends SimpleAddress {
  country: ScayleCountry;
  title?: string;
  salutationCode?: "f" | "m" | "d" | "n";
  firstName: string;
  lastName: string;
  /** Free-text extras — apartment, building, c/o, etc. */
  additional?: string;
  phone?: string;
}

export interface AcurisEndpoints {
  validate: string;
  suggest?: string;
}

export interface AcurisAddressInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "onSelect"> {
  endpoints: AcurisEndpoints;
  /** ISO-2 country code, SCAYLE-native ("DE", "FR"). */
  country: CountryCodeIso2;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (hit: SuggestionHit) => void;
  debounceMs?: number;
  minQueryLength?: number;
  limit?: number;
  state?: string;
  renderSuggestion?: (hit: SuggestionHit, index: number) => React.ReactNode;
  suggestionsClassName?: string;
}

export interface AcurisAddressValidatorProps {
  endpoints: AcurisEndpoints;
  country: CountryCodeIso2;
  address: BaseAddress | SimpleAddress | string;
  trigger?: "blur" | "submit" | "manual";
  children: (state: ValidatorRenderState) => React.ReactNode;
}

export interface ValidatorRenderState {
  status: "idle" | "loading" | "ok" | "error";
  result?: ValidationResult;
  error?: Error;
  validate: () => Promise<ValidationResult | undefined>;
  formProps: {
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    onBlur: (e: React.FocusEvent<HTMLFormElement>) => void;
  };
}
