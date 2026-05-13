import { describe, expect, it } from "vitest";
import type { ValidationResult } from "@acuris-geo/av-sdk";
import {
  toAcurisInput,
  toBaseAddress,
  suggestionToBaseAddress,
} from "../src/boundary.js";

describe("toAcurisInput", () => {
  it("maps SCAYLE BaseAddress to Acuris fielded input", () => {
    const r = toAcurisInput({
      country: { iso2Code: "DE" },
      street: "Hammanstr.",
      houseNumber: "1",
      zipCode: "67549",
      city: "Worms",
      firstName: "Jane",
      lastName: "Brand",
    });
    expect(r).toEqual({
      street: "Hammanstr.",
      house_number: "1",
      locality: undefined,
      city: "Worms",
      state: undefined,
      postcode: "67549",
    });
  });

  it("does not emit country (travels separately on the wire)", () => {
    const r = toAcurisInput({
      country: { iso2Code: "DE" },
      street: "X",
      city: "Y",
      firstName: "a",
      lastName: "b",
    });
    expect("country" in r).toBe(false);
  });

  it("forwards `additional` as `locality`", () => {
    const r = toAcurisInput({
      country: { iso2Code: "DE" },
      street: "Hammanstr.",
      city: "Worms",
      additional: "Hinterhaus 3B",
      firstName: "a",
      lastName: "b",
    });
    expect(r.locality).toBe("Hinterhaus 3B");
  });

  it("works on the lighter SimpleAddress shape (no `additional` accessor crash)", () => {
    const r = toAcurisInput({ street: "Hammanstr.", city: "Worms" });
    expect(r.locality).toBeUndefined();
    expect(r.street).toBe("Hammanstr.");
  });
});

const ROOFTOP: ValidationResult = {
  accuracy_type: "rooftop",
  confidence: 1.0,
  match_type: "rooftop",
  match_score: 1.0,
  input_corrected: false,
  match_components: { city: true, house_number: true, state: false, street: true, zip: true },
  standardized: {
    country: "deu",
    street: "Hammanstr.",
    house_number: "1",
    city: "Worms",
    postcode: "67549",
    formatted_address: "Hammanstr. 1\n67549 Worms\nGERMANY",
  },
};

describe("toBaseAddress", () => {
  it("wraps country back into the nested {iso2Code} shape, uppercase", () => {
    const a = toBaseAddress(ROOFTOP, {
      firstName: "Jane",
      lastName: "Brand",
      country: { iso2Code: "DE" },
    });
    expect(a.country).toEqual({ iso2Code: "DE" });
  });

  it("uses standardized street / houseNumber / zipCode / city", () => {
    const a = toBaseAddress(ROOFTOP, {
      firstName: "Jane",
      lastName: "Brand",
      country: { iso2Code: "DE" },
    });
    expect(a.street).toBe("Hammanstr.");
    expect(a.houseNumber).toBe("1");
    expect(a.zipCode).toBe("67549");
    expect(a.city).toBe("Worms");
  });

  it("preserves identity fields from base", () => {
    const a = toBaseAddress(ROOFTOP, {
      country: { iso2Code: "DE" },
      firstName: "Jane",
      lastName: "Brand",
      phone: "+49 1234",
      additional: "3B",
      salutationCode: "f",
      title: "Dr.",
    });
    expect(a.firstName).toBe("Jane");
    expect(a.lastName).toBe("Brand");
    expect(a.phone).toBe("+49 1234");
    expect(a.additional).toBe("3B");
    expect(a.salutationCode).toBe("f");
    expect(a.title).toBe("Dr.");
  });

  it("falls back to base.country when standardized has no country", () => {
    const partial: ValidationResult = {
      ...ROOFTOP,
      standardized: { ...ROOFTOP.standardized!, country: "" as unknown as string },
    };
    expect(toBaseAddress(partial, { country: { iso2Code: "FR" } }).country.iso2Code).toBe("FR");
  });
});

describe("suggestionToBaseAddress", () => {
  it("maps a SuggestionHit into SCAYLE BaseAddress shape", () => {
    const a = suggestionToBaseAddress(
      {
        country: "deu",
        street: "Hammanstr.",
        house_number: "1",
        city: "Worms",
        postcode: "67549",
        lat: 49.6316,
        lng: 8.3464,
      },
      { firstName: "Jane", lastName: "Brand" },
    );
    expect(a.country).toEqual({ iso2Code: "DE" });
    expect(a.street).toBe("Hammanstr.");
    expect(a.houseNumber).toBe("1");
    expect(a.zipCode).toBe("67549");
    expect(a.city).toBe("Worms");
    expect(a.firstName).toBe("Jane");
  });
});
