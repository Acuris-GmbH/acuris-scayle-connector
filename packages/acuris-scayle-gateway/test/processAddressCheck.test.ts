import { describe, expect, it } from "vitest";
import { AcurisClient } from "@acuris-geo/av-sdk";
import { processAddressCheck } from "../src/processAddressCheck.js";
import type { AddressCheckRequest, BaseAddress } from "../src/types.js";

const ROOFTOP = {
  accuracy_type: "rooftop",
  confidence: 1,
  match_type: "rooftop",
  match_score: 1,
  match_components: {},
  input_corrected: false,
  standardized: {
    country: "deu",
    city: "WORMS",
    postcode: "67549",
    street: "HAMMANSTR.",
    house_number: "1",
    formatted_address: "Hammanstr. 1\n67549 Worms\nGERMANY",
  },
};

const CORRECTED = {
  ...ROOFTOP,
  accuracy_type: "street_interpolated",
  confidence: 0.97,
  standardized: { ...ROOFTOP.standardized, postcode: "67549" },
  input_corrected: true,
};

const LOW_CONFIDENCE = {
  ...ROOFTOP,
  accuracy_type: "locality",
  confidence: 0.4,
};

const SUGGESTIONS = {
  suggestions: [
    {
      country: "deu",
      city: "Worms",
      postcode: "67549",
      street: "Hammanstr.",
      house_number: "1",
      formatted_address: "Hammanstr. 1\n67549 Worms",
    },
  ],
};

function clientFromQueue(responses: Array<{ body: unknown; status?: number }>): AcurisClient {
  const queue = [...responses];
  return new AcurisClient({
    apiKey: "test",
    maxRetries: 0,
    fetch: (() => {
      const next = queue.shift() ?? { body: {}, status: 200 };
      return Promise.resolve(
        new Response(JSON.stringify(next.body), { status: next.status ?? 200 }),
      );
    }) as unknown as typeof fetch,
  });
}

const req: AddressCheckRequest = {
  addressType: "shipping",
  address: {
    country: { iso2Code: "DE" },
    street: "Hammanstr.",
    houseNumber: "1",
    zipCode: "67549",
    city: "Worms",
    firstName: "Jane",
    lastName: "Brand",
  },
};

describe("processAddressCheck", () => {
  it("returns 200 with no body when rooftop + confidence ≥ exactConfidence", async () => {
    const r = await processAddressCheck(req, { exactConfidence: 0.95 }, clientFromQueue([{ body: ROOFTOP }]));
    expect(r.status).toBe(200);
    expect("suggestions" in r).toBe(false);
  });

  it("returns 200 + suggestions for a corrected (non-rooftop) high-confidence match", async () => {
    const r = await processAddressCheck(req, {}, clientFromQueue([{ body: CORRECTED }]));
    expect(r.status).toBe(200);
    expect("suggestions" in r).toBe(true);
    if ("suggestions" in r) {
      expect(r.suggestions).toHaveLength(1);
      expect(r.suggestions[0]!.country).toEqual({ iso2Code: "DE" });
    }
  });

  it("falls back to /suggest on a low-confidence match", async () => {
    const r = await processAddressCheck(
      req,
      { minConfidence: 0.9 },
      clientFromQueue([{ body: LOW_CONFIDENCE }, { body: SUGGESTIONS }]),
    );
    expect(r.status).toBe(200);
    if ("suggestions" in r) {
      expect(r.suggestions).toHaveLength(1);
      expect(r.suggestions[0]!.street).toBe("Hammanstr.");
    }
  });

  it("returns 422 for an unparseable payload", async () => {
    const r = await processAddressCheck("not an object", {}, clientFromQueue([]));
    expect(r.status).toBe(422);
  });

  it("returns 422 when country.iso2Code is missing", async () => {
    const bad: AddressCheckRequest = { address: { ...req.address, country: { iso2Code: "" } } };
    const r = await processAddressCheck(bad, {}, clientFromQueue([]));
    expect(r.status).toBe(422);
  });

  it("respects unsupportedCountries", async () => {
    const r = await processAddressCheck(
      req,
      { unsupportedCountries: ["DE"] },
      clientFromQueue([]),
    );
    expect(r.status).toBe(422);
    if (r.status === 422) expect(r.reason).toMatch(/not_supported/);
  });

  it("returns 503 when Acuris throws a non-NotFound error", async () => {
    const flakyClient = new AcurisClient({
      apiKey: "test",
      maxRetries: 0,
      fetch: (() => Promise.reject(new TypeError("ECONNREFUSED"))) as unknown as typeof fetch,
    });
    const r = await processAddressCheck(req, {}, flakyClient);
    expect(r.status).toBe(503);
  });

  it("treats raw BaseAddress (no envelope) as input via default extractor", async () => {
    const r = await processAddressCheck(req.address as BaseAddress, {}, clientFromQueue([{ body: ROOFTOP }]));
    expect(r.status).toBe(200);
  });

  it("honours a custom extractAddress", async () => {
    const r = await processAddressCheck(
      { payload: { addr: req.address } },
      {
        extractAddress: (body) => {
          if (body && typeof body === "object") {
            const b = body as { payload?: { addr?: BaseAddress } };
            return b.payload?.addr;
          }
          return undefined;
        },
      },
      clientFromQueue([{ body: ROOFTOP }]),
    );
    expect(r.status).toBe(200);
  });
});
