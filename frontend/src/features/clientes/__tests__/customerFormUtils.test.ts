import { describe, expect, it } from "vitest";
import {
  cleanCustomerNumber,
  cleanEmail,
  cleanTaxId,
  formatCurrencyDisplay,
  formatMexicanPhone,
  getCustomerFiscalCompatibilityError,
  parseCurrencyValue,
  toCustomerFormValues,
  validateCustomerField,
  validateCustomerForm,
  type CustomerFormDraft,
} from "../customerFormUtils";

const draft: CustomerFormDraft = {
  address: "Av. Independencia #245, Col. Centro, Veracruz, Ver.",
  assignedRouteId: "route-1",
  billingEmail: "facturacion@empresa.com.mx",
  commercialName: "Pollería Los Hermanos",
  commercialPolicyId: "policy-1",
  creditDays: "30",
  creditLimit: "25000",
  creditStatus: "ACTIVE",
  customerNumber: "CLI-000123",
  customerType: "RETAIL",
  deliveryAddress: "Av. Independencia #245, Col. Centro, Veracruz, Ver.",
  email: "cliente@empresa.com.mx",
  fiscalAddress: "Av. Independencia #245, Col. Centro, Veracruz, Ver.",
  fiscalName: "Comercializadora del Golfo S.A. de C.V.",
  fiscalPostalCode: "91700",
  fiscalRegime: "601",
  fiscalUseCode: "G03",
  name: "Pollería Los Hermanos",
  phone: "2291234567",
  priceListId: "PL-MAYOREO-01",
  requiresBilling: true,
  taxId: "ABC010203AB9",
};

describe("customer form utilities", () => {
  it("normaliza teléfonos, RFC, emails y montos para captura mexicana", () => {
    expect(cleanCustomerNumber(" cli-000123$ ")).toBe("CLI-000123");
    expect(cleanEmail(" Cliente@Empresa.com.mx ")).toBe(
      "cliente@empresa.com.mx",
    );
    expect(cleanTaxId(" abc010203ab9 ")).toBe("ABC010203AB9");
    expect(formatMexicanPhone("2291234567")).toBe("229 123 4567");
    expect(formatCurrencyDisplay("25000")).toBe("25,000.00");
    expect(parseCurrencyValue("25,000.00")).toBe(25000);
  });

  it("acepta los campos válidos del formulario de cliente", () => {
    expect(validateCustomerField("taxId", draft, true)).toBeNull();
    expect(validateCustomerField("fiscalPostalCode", draft, true)).toBeNull();
    expect(validateCustomerField("fiscalRegime", draft, true)).toBeNull();
    expect(validateCustomerField("fiscalUseCode", draft, true)).toBeNull();
    expect(validateCustomerField("phone", draft, true)).toBeNull();
    expect(validateCustomerForm(draft, true)).toEqual({});
    expect(toCustomerFormValues(draft).creditLimit).toBe(25000);
    expect(toCustomerFormValues(draft).assignedRouteId).toBe("route-1");
    expect(toCustomerFormValues(draft).commercialPolicyId).toBe("policy-1");
  });

  it("exige el perfil fiscal completo solo cuando requiere facturación", () => {
    const incomplete = {
      ...draft,
      billingEmail: "",
      fiscalName: "",
      taxId: "",
      fiscalPostalCode: "",
      fiscalRegime: "",
      fiscalUseCode: "",
    };

    expect(validateCustomerForm(incomplete, true)).toEqual(
      expect.objectContaining({
        billingEmail: expect.stringContaining("obligatorio"),
        fiscalName: expect.stringContaining("obligatoria"),
        taxId: expect.stringContaining("obligatorio"),
        fiscalPostalCode: expect.stringContaining("obligatorio"),
        fiscalRegime: expect.stringContaining("obligatorio"),
        fiscalUseCode: expect.stringContaining("obligatorio"),
      }),
    );
    expect(
      validateCustomerForm({ ...incomplete, requiresBilling: false }, true),
    ).toEqual({});
  });

  it("rechaza códigos fiscales fuera del catálogo compartido", () => {
    expect(
      validateCustomerField(
        "fiscalRegime",
        { ...draft, fiscalRegime: "999" },
        true,
      ),
    ).toContain("catálogo SAT");
    expect(
      validateCustomerField(
        "fiscalUseCode",
        { ...draft, fiscalUseCode: "P01" },
        true,
      ),
    ).toContain("catálogo SAT");
  });

  it("valida la compatibilidad SAT por persona y régimen", () => {
    expect(getCustomerFiscalCompatibilityError(draft)).toBeNull();
    expect(
      getCustomerFiscalCompatibilityError({
        ...draft,
        taxId: "ABCD010101AB9",
        fiscalRegime: "605",
        fiscalUseCode: "D01",
      }),
    ).toBeNull();
    expect(
      getCustomerFiscalCompatibilityError({
        ...draft,
        fiscalRegime: "605",
        fiscalUseCode: "D01",
      }),
    ).toContain("no es compatible");
    expect(
      getCustomerFiscalCompatibilityError({
        ...draft,
        taxId: "XEXX010101000",
        fiscalRegime: "616",
        fiscalUseCode: "G03",
      }),
    ).toContain("no es compatible");
    expect(
      getCustomerFiscalCompatibilityError({
        ...draft,
        taxId: "XAXX010101000",
        fiscalRegime: "616",
        fiscalUseCode: "S01",
      }),
    ).toBeNull();
  });
});
