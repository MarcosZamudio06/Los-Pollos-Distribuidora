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
  // Require canonical DNS labels, not IP literals, local names or trailing dots.
  const publicHostname =
    hostname.length <= 253 &&
    hostname.includes(".") &&
    hostname
      .split(".")
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
  const reservedHostname =
    !publicHostname ||
    isIP(hostname) !== 0 ||
    [
      "localhost",
      "local",
      "test",
      "invalid",
      "example",
      "example.com",
      "example.net",
      "example.org",
      "arpa",
    ].some(
      (reserved) => hostname === reserved || hostname.endsWith(`.${reserved}`),
    );

  if (url.protocol !== "https:" || reservedHostname) {
    console.error(
      "Production OBJECT_STORAGE_PUBLIC_ORIGIN must use HTTPS and an approved non-placeholder hostname",
    );
    process.exit(1);
  }
}
