// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerFormModal } from "../components/CustomerFormModal";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockState = vi.hoisted(() => ({
  saveCustomer: { isPending: false, mutateAsync: vi.fn() },
}));

vi.mock("../hooks/useCustomers", () => ({
  useSaveCustomer: () => mockState.saveCustomer,
}));

function getInput(container: HTMLElement, id: string) {
  const element = container.querySelector(`#${id}`);
  if (!(element instanceof HTMLInputElement))
    throw new Error(`Input not found: ${id}`);
  return element;
}

function getSelect(container: HTMLElement, id: string) {
  const element = container.querySelector(`#${id}`);
  if (!(element instanceof HTMLSelectElement))
    throw new Error(`Select not found: ${id}`);
  return element;
}

function setNativeValue(element: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );
  descriptor?.set?.call(element, value);
}

async function renderDom(
  element: React.ReactElement,
): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return { container, root };
}

describe("CustomerFormModal UX", () => {
  beforeEach(() => {
    mockState.saveCustomer = { isPending: false, mutateAsync: vi.fn() };
  });

  it("renderiza placeholders y ayudas para captura empresarial", () => {
    const html = renderToStaticMarkup(
      <CustomerFormModal
        canManageCommercialTerms
        customer={null}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain("CLI-000123");
    expect(html).toContain("Pollería Los Hermanos");
    expect(html).toContain("229 123 4567");
    expect(html).toContain("cliente@empresa.com.mx");
    expect(html).toContain(
      "Av. Independencia #245, Col. Centro, Veracruz, Ver.",
    );
    expect(html).toContain("25,000.00");
    expect(html).not.toContain("Ruta asignada");
    expect(html).not.toContain("Selecciona una ruta");
    expect(html).not.toContain("Política comercial");
    expect(html).toContain(
      "RFC SAT: 12 caracteres para persona moral y 13 para persona física.",
    );
    expect(html).toContain("Datos fiscales CFDI 4.0");
    expect(html).toContain("Dirección comercial");
    expect(html).toContain("Dirección de entrega");
    expect(html).toContain("Domicilio fiscal (opcional)");
    expect(html).toContain("Código postal fiscal");
    expect(html).toContain("Régimen fiscal");
    expect(html).toContain("Uso de CFDI");
  });

  it("formatea teléfono y RFC mientras el usuario captura", async () => {
    const { container, root } = await renderDom(
      <CustomerFormModal
        canManageCommercialTerms
        customer={null}
        onClose={() => undefined}
      />,
    );

    try {
      const phone = getInput(container, "customer-form-phone");
      const taxId = getInput(container, "customer-form-taxId");
      const fiscalPostalCode = getInput(
        container,
        "customer-form-fiscalPostalCode",
      );

      await act(async () => {
        setNativeValue(phone, "229abc1234567");
        phone.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(phone.value).toBe("229 123 4567");

      await act(async () => {
        setNativeValue(taxId, " abc010203ab9 ");
        taxId.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(taxId.value).toBe("ABC010203AB9");

      await act(async () => {
        setNativeValue(fiscalPostalCode, "91a700");
        fiscalPostalCode.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(fiscalPostalCode.value).toBe("91700");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("renderiza los catálogos SAT como selects controlados", async () => {
    const { container, root } = await renderDom(
      <CustomerFormModal
        canManageCommercialTerms
        customer={null}
        onClose={() => undefined}
      />,
    );

    try {
      expect(
        getSelect(container, "customer-form-fiscalRegime").textContent,
      ).toContain("601");
      expect(
        getSelect(container, "customer-form-fiscalUseCode").textContent,
      ).toContain("G03");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("conserva los espacios mientras se captura el nombre", async () => {
    const { container, root } = await renderDom(
      <CustomerFormModal
        canManageCommercialTerms
        customer={null}
        onClose={() => undefined}
      />,
    );

    try {
      const name = getInput(container, "customer-form-name");

      await act(async () => {
        setNativeValue(name, "Pollería ");
        name.dispatchEvent(new Event("input", { bubbles: true }));
      });

      expect(name.value).toBe("Pollería ");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});
