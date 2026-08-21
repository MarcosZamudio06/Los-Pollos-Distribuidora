import { isIP } from "node:net";

const [origin, mode] = process.argv.slice(2);
const production = mode === "--production";

let url;
try {
  url = new URL(origin);
} catch {
  // Handled by the shared validation below.
}

const validOrigin =
  url &&
  ["http:", "https:"].includes(url.protocol) &&
  url.origin === origin &&
  !origin.includes("*");

if (!validOrigin) {
  console.error(
    "OBJECT_STORAGE_PUBLIC_ORIGIN must be an explicit HTTP(S) origin without wildcards",
  );
  process.exit(1);
}

if (production) {
  const hostname = url.hostname.toLowerCase();
  const reservedHostname =
    isIP(hostname) !== 0 ||
    hostname === "localhost" ||
    hostname === "example.com" ||
    hostname.endsWith(".example.com") ||
    hostname.endsWith(".example.test") ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".invalid") ||
    hostname.endsWith(".localhost");

  if (url.protocol !== "https:" || reservedHostname) {
    console.error(
      "Production OBJECT_STORAGE_PUBLIC_ORIGIN must use HTTPS and an approved non-placeholder hostname",
    );
    process.exit(1);
  }
}
