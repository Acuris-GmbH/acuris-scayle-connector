/**
 * @acuris-geo/scayle-gateway — Node handler implementing SCAYLE's
 * third-party address-check gateway HTTP contract.
 *
 *   import { buildLambdaHandler } from "@acuris-geo/scayle-gateway";
 *
 *   export const handler = buildLambdaHandler({
 *     apiKey: process.env.ACURIS_API_KEY!,
 *     minConfidence: 0.95,
 *     maxSuggestions: 5,
 *     basicAuthUser: "scayle",
 *     basicAuthPass: process.env.SCAYLE_GATEWAY_PASSWORD!,
 *   });
 *
 * Register the handler URL in **SCAYLE Panel → Checkout → Address
 * Validation → Custom Provider**.
 */
export { processAddressCheck } from "./processAddressCheck.js";
export {
  buildGatewayHandler,
  buildNodeHttpHandler,
  buildLambdaHandler,
} from "./adapters.js";
export type { AuthConfig } from "./adapters.js";
export { iso2ToIso3, iso3ToIso2 } from "./iso.js";

export type {
  AddressCheckRequest,
  AddressCheckResponse,
  AddressSuggestion,
  BaseAddress,
  CountryCodeIso2,
  GatewayConfig,
  ScayleCountry,
} from "./types.js";
