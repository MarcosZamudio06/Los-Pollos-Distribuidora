// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "../../auth/pages/LoginPage";
import { BrandingLogo } from "../BrandingLogo";
import { BrandingProvider } from "../BrandingProvider";
import {
  useBranding,
  useRemoveBrandingLogo,
  useSaveBranding,
  useUploadBrandingLogo,
} from "../brandingHooks";
import { BrandingSettingsPage } from "../BrandingSettingsPage";

const serviceMocks = vi.hoisted(() => ({
  getBranding: vi.fn(),
  updateBranding: vi.fn(),
  uploadLogo: vi.fn(),
  removeLogo: vi.fn(),
}));

vi.mock("../brandingService", () => ({
  brandingService: serviceMocks,
}));

vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({
    accessToken: "branding-admin-token",
    changePassword: vi.fn(),
    error: null,
    isAuthenticated: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    status: "guest",
    user: null,
  }),
}));

const defaultBranding = {
  displayName: "ERP",
  shortName: null,
  logoUrl: null,
  logoMimeType: null,
  hasLogo: false,
  version: 0,
};

const configuredBranding = {
  displayName: "Northstar Logistics",
  shortName: "Northstar",
  logoUrl: "https://objects.example.com/northstar-signed-logo",
  logoMimeType: "image/png",
  hasLogo: true,
  version: 3,
};

const roots: Root[] = [];

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, refetchInterval: false },
      mutations: { retry: false },
    },
  });
}

function BrandingProbe() {
  const { branding } = useBranding();
  return (
    <div>
      <output>{branding.displayName}</output>
      <BrandingLogo />
    </div>
  );
}

function BrandingMutationProbe() {
  const save = useSaveBranding();
  const upload = useUploadBrandingLogo();
  const remove = useRemoveBrandingLogo();
  const file = new File(["logo"], "logo.png", { type: "image/png" });

  return (
    <div>
      <button
        onClick={() =>
          void save.mutateAsync({
            displayName: "Northstar",
            shortName: null,
            version: 0,
          })
        }
      >
        Save name
      </button>
      <button onClick={() => void upload.mutateAsync({ file, version: 0 })}>
        Upload logo
      </button>
      <button onClick={() => void remove.mutateAsync(0)}>Remove logo</button>
    </div>
  );
}

async function renderWithBranding(children: ReactNode) {
  const client = createClient();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <BrandingProvider>{children}</BrandingProvider>
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return { client, container };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("runtime ERP branding", () => {
  beforeEach(() => {
    document.title = "";
    serviceMocks.getBranding.mockReset();
    serviceMocks.updateBranding.mockReset();
    serviceMocks.uploadLogo.mockReset();
    serviceMocks.removeLogo.mockReset();
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("shows ERP and keeps the application usable when branding is unavailable", async () => {
    serviceMocks.getBranding.mockRejectedValue(new Error("branding offline"));

    const { container } = await renderWithBranding(<BrandingProbe />);

    expect(container.querySelector("output")?.textContent).toBe("ERP");
    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe("ERP");
    expect(document.title).toBe("ERP");
    expect(document.querySelector("#app-favicon")?.getAttribute("href")).toBe(
      "/favicon.svg",
    );
  });

  it("loads a company identity before authentication and renders its logo on login", async () => {
    serviceMocks.getBranding.mockResolvedValue(configuredBranding);

    const { client, container } = await renderWithBranding(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(serviceMocks.getBranding).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(["company-branding"])).toEqual(
      configuredBranding,
    );
    expect(container.textContent).toContain("Northstar Logistics");
    expect(
      container
        .querySelector('img[alt="Northstar Logistics"]')
        ?.getAttribute("src"),
    ).toBe(configuredBranding.logoUrl);
    expect(document.title).toBe("Northstar Logistics");
    expect(
      document.querySelector<HTMLLinkElement>("#app-favicon")?.href,
    ).toBe(configuredBranding.logoUrl);
    expect(serviceMocks.getBranding).toHaveBeenCalledTimes(1);
  });

  it("updates shared branding consumers after saving without a page reload", async () => {
    serviceMocks.getBranding.mockResolvedValue(defaultBranding);
    serviceMocks.updateBranding.mockResolvedValue({
      ...defaultBranding,
      displayName: "Northstar Logistics",
      version: 1,
    });

    const { container } = await renderWithBranding(<BrandingSettingsPage />);
    const nameField = container.querySelector<HTMLInputElement>("#branding-name");
    expect(nameField).not.toBeNull();
    await act(async () => {
      setInputValue(nameField as HTMLInputElement, "Northstar Logistics");
    });
    const form = container.querySelector("form");
    expect(form).not.toBeNull();

    await act(async () => {
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(document.title).toBe("Northstar Logistics");
    expect(container.querySelector("main")?.textContent).toContain(
      "Northstar Logistics",
    );
    expect(serviceMocks.updateBranding).toHaveBeenCalledWith(
      {
        displayName: "Northstar Logistics",
        shortName: null,
        version: 0,
      },
      "branding-admin-token",
    );
  });

  it("passes the current AuthProvider token to every ADMIN branding mutation", async () => {
    serviceMocks.getBranding.mockResolvedValue(defaultBranding);
    serviceMocks.updateBranding.mockResolvedValue(configuredBranding);
    serviceMocks.uploadLogo.mockResolvedValue(configuredBranding);
    serviceMocks.removeLogo.mockResolvedValue(defaultBranding);

    const { container } = await renderWithBranding(<BrandingMutationProbe />);
    for (const label of ["Save name", "Upload logo", "Remove logo"]) {
      await act(async () => {
        Array.from(container.querySelectorAll("button"))
          .find((button) => button.textContent === label)
          ?.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    expect(serviceMocks.updateBranding).toHaveBeenCalledWith(
      { displayName: "Northstar", shortName: null, version: 0 },
      "branding-admin-token",
    );
    expect(serviceMocks.uploadLogo).toHaveBeenCalledWith(
      { file: expect.any(File), version: 0 },
      "branding-admin-token",
    );
    expect(serviceMocks.removeLogo).toHaveBeenCalledWith(
      0,
      "branding-admin-token",
    );
  });

  it("uses the configured image when available and the neutral placeholder after removal", async () => {
    serviceMocks.getBranding.mockResolvedValue(configuredBranding);
    const { client, container } = await renderWithBranding(<BrandingProbe />);

    const configuredLogo = container.querySelector<HTMLImageElement>(
      'img[alt="Northstar Logistics"]',
    );
    expect(configuredLogo?.getAttribute("src")).toBe(configuredBranding.logoUrl);

    await act(async () => {
      client.setQueryData(["company-branding"], defaultBranding);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe("ERP");
    expect(container.querySelector('img[alt="Northstar Logistics"]')).toBeNull();
    expect(document.querySelector("#app-favicon")?.getAttribute("href")).toBe(
      "/favicon.svg",
    );
  });

  it("resolves the same-build identity through the runtime API, not company build variables", () => {
    const serviceSource = readFileSync(
      resolve(process.cwd(), "src/features/branding/brandingService.ts"),
      "utf8",
    );

    expect(serviceSource).toContain("/branding");
    expect(serviceSource).not.toMatch(/VITE_COMPANY_|tenant-manifest/);
  });

  it("removes legacy company branding and keeps sale documents independent", () => {
    const auditedSources = [
      "src/components/layout/Sidebar.tsx",
      "src/features/auth/pages/LoginPage.tsx",
      "src/features/dashboard/DashboardPage.tsx",
      "index.html",
    ].map((path) => readFileSync(resolve(process.cwd(), path), "utf8"));

    for (const source of auditedSources) {
      expect(source).not.toMatch(
        /Pollos Distribuidora|El Pollo de los Pollos|logo-circular-colored|return "PD"/,
      );
    }

    const saleDocumentsSource = readFileSync(
      resolve(process.cwd(), "src/features/ventas/components.tsx"),
      "utf8",
    );
    for (const documentType of [
      "SIMPLE_NOTE",
      "LARGE_NOTE",
      "INTERNAL_RECEIPT",
      "SCALE_TICKET",
    ]) {
      expect(saleDocumentsSource).toContain(documentType);
    }
    expect(saleDocumentsSource).not.toMatch(
      /features\/branding|useBranding|BrandingLogo|logoUrl|Pollos Distribuidora|El Pollo de los Pollos/,
    );
  });
});
