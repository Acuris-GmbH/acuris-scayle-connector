import Link from "next/link";

export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "2.5rem 1.25rem 4rem", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <h1>Acuris × SCAYLE — sample storefront</h1>
      <p>
        Minimal Next.js app showing how a SCAYLE merchant wires the Acuris
        connector into their checkout flow. It uses{" "}
        <code>@acuris-geo/scayle-checkout</code> on the client and{" "}
        <code>@acuris-geo/av-sdk</code> behind a Next.js API route.
      </p>
      <p>
        <Link href="/checkout">→ Go to the demo checkout</Link>
      </p>
      <h2>How it works</h2>
      <ol>
        <li>Browser renders the address fields with <code>&lt;AcurisAddressInput&gt;</code>.</li>
        <li>Each keystroke (debounced) hits <code>/api/acuris/suggest</code> on this app.</li>
        <li>That route converts the ISO-2 country code to ISO-3 and calls the SDK with <code>ACURIS_API_KEY</code>.</li>
        <li>On submit, <code>&lt;AcurisAddressValidator&gt;</code> POSTs the structured SCAYLE <code>BaseAddress</code> to <code>/api/acuris/validate</code>.</li>
        <li>Acuris returns a result with <code>accuracy_type</code>, <code>confidence</code>, and a standardized address.</li>
      </ol>
      <h2>Production hardening</h2>
      <p>
        SCAYLE supports a server-side <em>address-check gateway</em>: a
        merchant registers a URL in Panel and SCAYLE POSTs every address
        change there during checkout. Pair this storefront component with{" "}
        <code>@acuris-geo/scayle-gateway</code> — a Lambda/Node handler
        implementing that contract. The React component guides the buyer;
        the gateway closes the bypass and lets SCAYLE display its native
        correction overlay.
      </p>
      <p>
        Read{" "}
        <a href="https://github.com/Acuris-GmbH/acuris-scayle-connector/blob/main/docs/scayle-integration-guide.md">
          the integration guide
        </a>{" "}
        for production wiring against Nuxt or a custom Next.js BFF, and the
        gateway registration steps in the SCAYLE Panel.
      </p>
    </main>
  );
}
