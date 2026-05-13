import { describe, expect, it, vi } from "vitest";
import {
  buildGatewayHandler,
  buildLambdaHandler,
  buildNodeHttpHandler,
} from "../src/adapters.js";

describe("buildGatewayHandler", () => {
  it("returns a function", () => {
    expect(typeof buildGatewayHandler({ apiKey: "test" })).toBe("function");
  });
});

describe("buildNodeHttpHandler", () => {
  it("405s on non-POST", async () => {
    const handler = buildNodeHttpHandler({ apiKey: "test" });
    const res = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
    await handler({ method: "GET" } as never, res as never);
    expect(res.statusCode).toBe(405);
  });

  it("returns 422 + reason for an unparseable address payload", async () => {
    const handler = buildNodeHttpHandler({ apiKey: "test" });
    const res = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
    await handler({ method: "POST", body: "not an object" } as never, res as never);
    expect(res.statusCode).toBe(422);
    expect((res.end as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatch(/address_payload_unparseable/);
  });

  it("rejects with 401 when basic auth is required and the header is missing", async () => {
    const handler = buildNodeHttpHandler({
      apiKey: "test",
      basicAuthUser: "scayle",
      basicAuthPass: "shh",
    });
    const res = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
    await handler({ method: "POST", body: {}, headers: {} } as never, res as never);
    expect(res.statusCode).toBe(401);
  });

  it("accepts valid basic auth", async () => {
    const handler = buildNodeHttpHandler({
      apiKey: "test",
      basicAuthUser: "scayle",
      basicAuthPass: "shh",
    });
    const goodAuth = "Basic " + Buffer.from("scayle:shh").toString("base64");
    const res = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
    await handler({ method: "POST", body: {}, headers: { authorization: goodAuth } } as never, res as never);
    // body is empty object — fails extractor with 422; auth passes (not 401).
    expect(res.statusCode).toBe(422);
  });
});

describe("buildLambdaHandler", () => {
  it("422s on malformed JSON body", async () => {
    const handler = buildLambdaHandler({ apiKey: "test" });
    const r = await handler({ body: "{not json" });
    expect(r.statusCode).toBe(422);
    expect(JSON.parse(r.body).reason).toBe("address_payload_unparseable");
  });

  it("rejects with 401 when basic auth fails", async () => {
    const handler = buildLambdaHandler({
      apiKey: "test",
      basicAuthUser: "scayle",
      basicAuthPass: "shh",
    });
    const r = await handler({ body: "{}", headers: { authorization: "Basic wrong" } });
    expect(r.statusCode).toBe(401);
  });

  it("422s on missing country code", async () => {
    const handler = buildLambdaHandler({ apiKey: "test" });
    const r = await handler({
      body: JSON.stringify({
        address: { country: { iso2Code: "" }, street: "X", city: "Y" },
      }),
    });
    expect(r.statusCode).toBe(422);
  });
});
