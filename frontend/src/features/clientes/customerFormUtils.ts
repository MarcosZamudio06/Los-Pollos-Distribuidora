import type { Customer, CustomerFormValues } from "./types";
import {
  CUSTOMER_FISCAL_PROFILE_FIELDS,
  isStructurallyValidFiscalRfc,
  isValidSatCfdiUseCode,
  isValidSatFiscalRegime,
  type CustomerFiscalProfileField,
} from "../../../../shared/fiscal-catalog";

export type CustomerFormDraft = Omit<
  CustomerFormValues,
  "creditLimit" | "creditDays" | "customerType" | "creditStatus"
> & {
  customerType: CustomerFormValues["customerType"] | "";
  creditLimit: string;
  creditDays: string;
  creditStatus: CustomerFormValues["creditStatus"] | "";
};

export type CustomerFormField =
  | "customerNumber"
  | "name"
  | "commercialName"
  | "phone"
  | "email"
  | "billingEmail"
  | "customerType"
  | "priceListId"
  | "creditLimit"
  | "creditDays"
  | "creditStatus"
  | "deliveryAddress"
  | "fiscalName"
  | "taxId"
  | "fiscalAddress"
  | "fiscalPostalCode"
  | "fiscalRegime"
  | "fiscalUseCode"
  | "address"
  | "requiresBilling";

export type CustomerFormErrors = Partial<Record<CustomerFormField, string>>;

const PHONE_DIGITS = 10;
const FISCAL_POSTAL_CODE_DIGITS = 5;
const CREDIT_DAYS_MAX = 365;
const CUSTOMER_NUMBER_ALLOWED = /[^A-Z0-9-]/g;
const MULTIPLE_SPACES = /\s+/g;
const INTEGER_ALLOWED = /\D/g;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MEXICAN_TEXT_REGEX = /^[\p{L}\p{N}\s.,#\-_/&()'"'´º°:;]+$/u;
const PRICE_LIST_REGEX = /^[A-Z0-9][A-Z0-9 _./-]*$/i;

export function collapseSpaces(value: string) {
  return value.replace(MULTIPLE_SPACES, " ").trim();
}

export function cleanCustomerNumber(value: string) {
  return value.toUpperCase().replace(CUSTOMER_NUMBER_ALLOWED, "");
}

export function cleanEmail(value: string) {
  return value.replace(/\s+/g, "").toLowerCase().trim();
}

export function cleanTaxId(value: string) {
  return value.toUpperCase().replace(/\s+/g, "").trim();
}

export function cleanFiscalPostalCode(value: string) {
  return cleanDigits(value).slice(0, FISCAL_POSTAL_CODE_DIGITS);
}

export function cleanFiscalCode(value: string) {
  return value.trim().toUpperCase();
}

export function cleanDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function formatMexicanPhone(value: string) {
  const digits = cleanDigits(value).slice(0, PHONE_DIGITS);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

export function normalizeCurrencyInput(value: string) {
  const digits = value.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!digits) return "";
  const [wholePart, fractionalPart = ""] = digits.split(".");
  const safeWhole = wholePart.replace(/-/g, "").replace(/^0+(?=\d)/, "") || "0";
  const safeFraction = fractionalPart.replace(/\D/g, "").slice(0, 2);
  return safeFraction ? `${safeWhole}.${safeFraction}` : safeWhole;
}

export function formatCurrencyDisplay(value: string) {
  const normalized = normalizeCurrencyInput(value);
  if (!normalized) return "";
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return "";
  return new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function parseCurrencyValue(value: string) {
  const normalized = normalizeCurrencyInput(value);
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

export function formatCreditDaysInput(value: string) {
  return value.replace(INTEGER_ALLOWED, "").slice(0, 3);
}

export function normalizeMexicanText(value: string) {
  return collapseSpaces(value);
}

export function toCustomerFormDraft(
  customer?: Customer | null,
): CustomerFormDraft {
  return {
    customerNumber: cleanCustomerNumber(customer?.customerNumber ?? ""),
    name: collapseSpaces(customer?.name ?? ""),
    commercialName: collapseSpaces(customer?.commercialName ?? ""),
    phone: cleanDigits(customer?.phone ?? "").slice(0, PHONE_DIGITS),
    email: cleanEmail(customer?.email ?? ""),
    billingEmail: cleanEmail(customer?.billingEmail ?? ""),
    address: collapseSpaces(customer?.address ?? ""),
    customerType: customer?.customerType ?? "RETAIL",
    priceListId: collapseSpaces(customer?.priceListId ?? ""),
    creditLimit:
      customer?.creditLimit == null
        ? ""
        : normalizeCurrencyInput(String(customer.creditLimit)),
    creditDays: customer?.creditDays == null ? "" : String(customer.creditDays),
    creditStatus:
      (customer?.creditStatus as
        CustomerFormValues["creditStatus"] | undefined) ?? "ACTIVE",
    requiresBilling: customer?.requiresBilling ?? false,
    deliveryAddress: collapseSpaces(customer?.deliveryAddress ?? ""),
    assignedRouteId: collapseSpaces(customer?.assignedRouteId ?? ""),
    commercialPolicyId: collapseSpaces(customer?.commercialPolicyId ?? ""),
    fiscalName: collapseSpaces(customer?.fiscalName ?? ""),
    taxId: cleanTaxId(customer?.taxId ?? ""),
    fiscalAddress: collapseSpaces(customer?.fiscalAddress ?? ""),
    fiscalPostalCode: cleanFiscalPostalCode(customer?.fiscalPostalCode ?? ""),
    fiscalRegime: cleanFiscalCode(customer?.fiscalRegime ?? ""),
    fiscalUseCode: cleanFiscalCode(customer?.fiscalUseCode ?? ""),
  };
}

export function toCustomerFormValues(
  draft: CustomerFormDraft,
): CustomerFormValues {
  return {
    customerNumber: cleanCustomerNumber(draft.customerNumber),
    name: collapseSpaces(draft.name),
    commercialName: collapseSpaces(draft.commercialName),
    phone: cleanDigits(draft.phone).slice(0, PHONE_DIGITS),
    email: cleanEmail(draft.email),
    billingEmail: cleanEmail(draft.billingEmail),
    address: collapseSpaces(draft.address),
    customerType: draft.customerType || "RETAIL",
    priceListId: collapseSpaces(draft.priceListId),
    creditLimit: parseCurrencyValue(draft.creditLimit),
    creditDays: draft.creditDays === "" ? null : Number(draft.creditDays),
    creditStatus: draft.creditStatus || "ACTIVE",
    requiresBilling: draft.requiresBilling,
    deliveryAddress: collapseSpaces(draft.deliveryAddress),
    assignedRouteId: collapseSpaces(draft.assignedRouteId),
    commercialPolicyId: collapseSpaces(draft.commercialPolicyId),
    fiscalName: collapseSpaces(draft.fiscalName),
    taxId: cleanTaxId(draft.taxId),
    fiscalAddress: collapseSpaces(draft.fiscalAddress),
    fiscalPostalCode: cleanFiscalPostalCode(draft.fiscalPostalCode),
    fiscalRegime: cleanFiscalCode(draft.fiscalRegime),
    fiscalUseCode: cleanFiscalCode(draft.fiscalUseCode),
  };
}

function isValidEmail(value: string) {
  return EMAIL_REGEX.test(value);
}

function isValidText(value: string) {
  return MEXICAN_TEXT_REGEX.test(value);
}

function isValidPriceListId(value: string) {
  return PRICE_LIST_REGEX.test(value);
}

function isValidCreditDays(value: string) {
  if (value === "") return false;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= CREDIT_DAYS_MAX;
}

function isValidMoney(value: string) {
  const parsed = parseCurrencyValue(value);
  return parsed !== null && parsed > 0;
}

function isValidPhone(value: string) {
  return value.length === PHONE_DIGITS;
}

function isAllowedText(value: string) {
  return value === "" || isValidText(value);
}

function isRequiredFiscalProfileField(
  field: CustomerFiscalProfileField,
  draft: CustomerFormDraft,
) {
  return (
    draft.requiresBilling && CUSTOMER_FISCAL_PROFILE_FIELDS.includes(field)
  );
}

function fiscalFieldRequiredMessage(field: CustomerFiscalProfileField) {
  const messages: Record<CustomerFiscalProfileField, string> = {
    fiscalName: "La razón social es obligatoria cuando requiere facturación.",
    taxId: "El RFC es obligatorio cuando requiere facturación.",
    fiscalPostalCode:
      "El código postal fiscal es obligatorio cuando requiere facturación.",
    fiscalRegime:
      "El régimen fiscal es obligatorio cuando requiere facturación.",
    fiscalUseCode: "El uso de CFDI es obligatorio cuando requiere facturación.",
    billingEmail:
      "El email de facturación es obligatorio cuando requiere facturación.",
  };
  return messages[field];
}

export function validateCustomerField(
  field: CustomerFormField,
  draft: CustomerFormDraft,
  canManageCommercialTerms: boolean,
) {
  switch (field) {
    case "customerNumber":
      return draft.customerNumber && !/^[-A-Z0-9]+$/i.test(draft.customerNumber)
        ? "El número interno solo permite letras, números y guiones."
        : null;
    case "name": {
      const value = collapseSpaces(draft.name);
      if (!value) return "El nombre del cliente es obligatorio.";
      if (value.length < 2 || value.length > 120)
        return "El nombre del cliente debe tener entre 2 y 120 caracteres.";
      return isAllowedText(value)
        ? null
        : "El nombre del cliente contiene caracteres no permitidos.";
    }
    case "commercialName": {
      const value = collapseSpaces(draft.commercialName);
      if (!value) return null;
      if (value.length < 2 || value.length > 120)
        return "El nombre comercial debe tener entre 2 y 120 caracteres.";
      return isAllowedText(value)
        ? null
        : "El nombre comercial contiene caracteres no permitidos.";
    }
    case "phone":
      if (!draft.phone) return null;
      return isValidPhone(cleanDigits(draft.phone))
        ? null
        : "El teléfono debe contener exactamente 10 dígitos de México.";
    case "email":
      if (!draft.email) return null;
      return isValidEmail(cleanEmail(draft.email))
        ? null
        : "El email debe tener un formato válido.";
    case "billingEmail":
      if (!draft.billingEmail) {
        return isRequiredFiscalProfileField("billingEmail", draft)
          ? fiscalFieldRequiredMessage("billingEmail")
          : null;
      }
      return isValidEmail(cleanEmail(draft.billingEmail))
        ? null
        : "El email de facturación debe tener un formato válido.";
    case "customerType":
      return draft.customerType ? null : "Selecciona un tipo de cliente.";
    case "priceListId": {
      const value = collapseSpaces(draft.priceListId);
      if (!value) return "La lista de precios es obligatoria.";
      return isValidPriceListId(value)
        ? null
        : "La lista de precios contiene un formato inválido.";
    }
    case "creditLimit":
      if (!canManageCommercialTerms) return null;
      if (!draft.creditLimit) return "El límite de crédito es obligatorio.";
      return isValidMoney(draft.creditLimit)
        ? null
        : "El límite de crédito debe ser un monto positivo.";
    case "creditDays":
      if (!canManageCommercialTerms) return null;
      if (!draft.creditDays) return "Los días de crédito son obligatorios.";
      return isValidCreditDays(draft.creditDays)
        ? null
        : "Los días de crédito deben ser un entero entre 0 y 365.";
    case "creditStatus":
      return canManageCommercialTerms && !draft.creditStatus
        ? "Selecciona un estado de crédito."
        : null;
    case "deliveryAddress": {
      const value = collapseSpaces(draft.deliveryAddress);
      if (!value) return null;
      if (value.length < 5 || value.length > 240)
        return "La dirección de entrega debe tener entre 5 y 240 caracteres.";
      return isAllowedText(value)
        ? null
        : "La dirección de entrega contiene caracteres no permitidos.";
    }
    case "fiscalName": {
      const value = collapseSpaces(draft.fiscalName);
      if (!value) {
        return isRequiredFiscalProfileField("fiscalName", draft)
          ? fiscalFieldRequiredMessage("fiscalName")
          : null;
      }
      if (value.length < 3 || value.length > 180)
        return "La razón social debe tener entre 3 y 180 caracteres.";
      return isAllowedText(value)
        ? null
        : "La razón social contiene caracteres no permitidos.";
    }
    case "taxId": {
      const value = cleanTaxId(draft.taxId);
      if (!value) {
        return isRequiredFiscalProfileField("taxId", draft)
          ? fiscalFieldRequiredMessage("taxId")
          : null;
      }
      if (!isStructurallyValidFiscalRfc(value))
        return "El RFC no tiene un formato válido para persona física o moral.";
      return null;
    }
    case "fiscalAddress": {
      const value = collapseSpaces(draft.fiscalAddress);
      if (!value) return null;
      if (value.length < 5 || value.length > 240)
        return "La dirección fiscal debe tener entre 5 y 240 caracteres.";
      return isAllowedText(value)
        ? null
        : "La dirección fiscal contiene caracteres no permitidos.";
    }
    case "fiscalPostalCode": {
      const value = cleanFiscalPostalCode(draft.fiscalPostalCode);
      if (!value) {
        return isRequiredFiscalProfileField("fiscalPostalCode", draft)
          ? fiscalFieldRequiredMessage("fiscalPostalCode")
          : null;
      }
      return /^\d{5}$/.test(value)
        ? null
        : "El código postal fiscal debe contener exactamente 5 dígitos.";
    }
    case "fiscalRegime": {
      const value = cleanFiscalCode(draft.fiscalRegime);
      if (!value) {
        return isRequiredFiscalProfileField("fiscalRegime", draft)
          ? fiscalFieldRequiredMessage("fiscalRegime")
          : null;
      }
      return isValidSatFiscalRegime(value)
        ? null
        : "Selecciona un régimen fiscal del catálogo SAT.";
    }
    case "fiscalUseCode": {
      const value = cleanFiscalCode(draft.fiscalUseCode);
      if (!value) {
        return isRequiredFiscalProfileField("fiscalUseCode", draft)
          ? fiscalFieldRequiredMessage("fiscalUseCode")
          : null;
      }
      return isValidSatCfdiUseCode(value)
        ? null
        : "Selecciona un uso de CFDI del catálogo SAT.";
    }
    case "address": {
      const value = collapseSpaces(draft.address);
      if (!value) return null;
      if (value.length < 5 || value.length > 240)
        return "La dirección debe tener entre 5 y 240 caracteres.";
      return isAllowedText(value)
        ? null
        : "La dirección contiene caracteres no permitidos.";
    }
    default:
      return null;
  }
}

export function validateCustomerForm(
  draft: CustomerFormDraft,
  canManageCommercialTerms: boolean,
) {
  const fields: CustomerFormField[] = [
    "customerNumber",
    "name",
    "commercialName",
    "phone",
    "email",
    "billingEmail",
    "customerType",
    "priceListId",
    "creditLimit",
    "creditDays",
    "creditStatus",
    "deliveryAddress",
    "fiscalName",
    "taxId",
    "fiscalAddress",
    "fiscalPostalCode",
    "fiscalRegime",
    "fiscalUseCode",
    "address",
  ];

  return fields.reduce<CustomerFormErrors>((accumulator, field) => {
    const error = validateCustomerField(field, draft, canManageCommercialTerms);
    if (error) accumulator[field] = error;
    return accumulator;
  }, {});
}

export function hasCustomerFormErrors(errors: CustomerFormErrors) {
  return Object.values(errors).some(Boolean);
}

export function firstCustomerFormErrorField(errors: CustomerFormErrors) {
  return (Object.keys(errors) as CustomerFormField[]).find((field) =>
    Boolean(errors[field]),
  );
}
