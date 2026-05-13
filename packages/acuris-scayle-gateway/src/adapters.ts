/**
 * Runtime adapters wrapping `processAddressCheck` for common deployment
 * targets. The core stays pure; the adapters handle JSON parsing, HTTP
 * response shaping, and (optional) HTTP Basic Auth — which SCAYLE
 * supports for gateway endpoints.
 */
import { processAddressCheck } from "./processAddressCheck.js";
import type {
  AddressCheckRequest,
  AddressCheckResponse,
  GatewayConfig,
} from "./types.js";

export interface AuthConfig {
  /** HTTP Basic Auth username SCAYLE will send. Optional. */
  basicAuthUser?: string;
  /** HTTP Basic Auth password. Required if `basicAuthUser` is set. */
  basicAuthPass?: string;
}

/** Generic async handler — for runtimes that don't fit a named adapter. */
export function buildGatewayHandler(config: GatewayConfig = {}) {
  return async (body: AddressCheckRequest | unknown): Promise<AddressCheckResponse> => {
    return processAddressCheck(body, config);
  };
}

/** Node http handler — Express, raw http, Fastify wrappers, etc. */
export function buildNodeHttpHandler(config: GatewayConfig & AuthConfig = {}) {
  const expectAuth = !!config.basicAuthUser;
  const expectedHeader = expectAuth
    ? "Basic " + Buffer.from(`${config.basicAuthUser}:${config.basicAuthPass}`).toString("base64")
    : undefined;
  return async (
    req: { method?: string; body?: unknown; headers?: Record<string, unknown> },
    res: {
      statusCode: number;
      setHeader: (k: string, v: string) => void;
      end: (s?: string) => void;
    },
  ): Promise<void> => {
    if (req.method && req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.end();
      return;
    }
    if (expectAuth) {
      const got = headerValue(req.headers, "authorization");
      if (got !== expectedHeader) {
        res.statusCode = 401;
        res.setHeader("WWW-Authenticate", 'Basic realm="acuris-scayle-gateway"');
        res.end();
        return;
      }
    }
    try {
      const result = await processAddressCheck(req.body, config);
      writeResponse(res, result);
    } catch (err) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ reason: err instanceof Error ? err.message : "internal_error" }));
    }
  };
}

/** AWS Lambda (API Gateway proxy v2) handler. */
export function buildLambdaHandler(config: GatewayConfig & AuthConfig = {}) {
  const expectAuth = !!config.basicAuthUser;
  const expectedHeader = expectAuth
    ? "Basic " + Buffer.from(`${config.basicAuthUser}:${config.basicAuthPass}`).toString("base64")
    : undefined;
  return async (event: {
    body?: string | null;
    headers?: Record<string, string | undefined>;
  }): Promise<{
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  }> => {
    const baseHeaders = { "Content-Type": "application/json" };
    if (expectAuth) {
      const got = (event.headers?.authorization ?? event.headers?.Authorization) ?? "";
      if (got !== expectedHeader) {
        return {
          statusCode: 401,
          headers: { ...baseHeaders, "WWW-Authenticate": 'Basic realm="acuris-scayle-gateway"' },
          body: "",
        };
      }
    }
    let parsed: AddressCheckRequest;
    try {
      parsed = JSON.parse(event.body ?? "{}") as AddressCheckRequest;
    } catch {
      return {
        statusCode: 422,
        headers: baseHeaders,
        body: JSON.stringify({ reason: "address_payload_unparseable" }),
      };
    }
    try {
      const result = await processAddressCheck(parsed, config);
      return lambdaShape(result, baseHeaders);
    } catch (err) {
      return {
        statusCode: 503,
        headers: baseHeaders,
        body: JSON.stringify({ reason: err instanceof Error ? err.message : "internal_error" }),
      };
    }
  };
}

function writeResponse(
  res: {
    statusCode: number;
    setHeader: (k: string, v: string) => void;
    end: (s?: string) => void;
  },
  result: AddressCheckResponse,
): void {
  res.statusCode = result.status;
  if (result.status === 200) {
    if ("suggestions" in result) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ suggestions: result.suggestions }));
    } else {
      res.end();
    }
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ reason: result.reason }));
}

function lambdaShape(
  result: AddressCheckResponse,
  baseHeaders: Record<string, string>,
): { statusCode: number; headers: Record<string, string>; body: string } {
  if (result.status === 200) {
    if ("suggestions" in result) {
      return {
        statusCode: 200,
        headers: baseHeaders,
        body: JSON.stringify({ suggestions: result.suggestions }),
      };
    }
    return { statusCode: 200, headers: baseHeaders, body: "" };
  }
  return {
    statusCode: result.status,
    headers: baseHeaders,
    body: JSON.stringify({ reason: result.reason }),
  };
}

function headerValue(headers: Record<string, unknown> | undefined, key: string): string {
  if (!headers) return "";
  // node http lowercases header names; some frameworks preserve case.
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === key.toLowerCase()) return String(v ?? "");
  }
  return "";
}
