import { afterEach, describe, expect, it, vi } from "vitest";
import {
  brandingService,
  type BrandingSnapshot,
} from "../brandingService";

const branding: BrandingSnapshot = {
  displayName: "ERP",
  shortName: null,
  logoUrl: null,
  logoMimeType: null,
  hasLogo: false,
  version: 1,
};

function captureRequests() {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({ data: branding }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    },
  );
  return requests;
}

function authorizationOf(init?: RequestInit) {
  return new Headers(init?.headers).get("authorization");
}

describe("branding service authentication", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the Bearer token with logo upload and preserves browser multipart handling", async () => {
    const requests = captureRequests();
    const file = new File(["png contents"], "logo.png", { type: "image/png" });

    await brandingService.uploadLogo(
      { file, version: 1 },
      "branding-access-token",
    );

    const init = requests[0]?.init;
    expect(authorizationOf(init)).toBe("Bearer branding-access-token");
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get("logo")).toBe(file);
    expect(new Headers(init?.headers).has("content-type")).toBe(false);
  });

  it("sends the Bearer token with logo deletion", async () => {
    const requests = captureRequests();

    await brandingService.removeLogo(1, "branding-access-token");

    expect(requests[0]?.url).toContain("/branding/logo?version=1");
    expect(authorizationOf(requests[0]?.init)).toBe(
      "Bearer branding-access-token",
    );
  });

  it("keeps branding GET public while authenticating name updates", async () => {
    const requests = captureRequests();

    await brandingService.getBranding();
    await brandingService.updateBranding(
      { displayName: "Northstar", shortName: null, version: 1 },
      "branding-access-token",
    );

    expect(requests[0]?.url).toContain("/branding");
    expect(authorizationOf(requests[0]?.init)).toBeNull();
    expect(authorizationOf(requests[1]?.init)).toBe(
      "Bearer branding-access-token",
    );
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
      displayName: "Northstar",
      shortName: null,
      version: 1,
    });
  });
});
