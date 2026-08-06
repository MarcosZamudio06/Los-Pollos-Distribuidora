export type EmployeeFormDraft = {
  name: string;
  email: string;
  phone: string;
  roleId: string;
  operationalLocationId: string;
};

export type EmployeeFormErrors = Partial<
  Record<
    "name" | "email" | "phone" | "roleId" | "operationalLocationId",
    string
  >
>;

type EmployeeRoleOption = { id: string; name: string };
type EmployeeLocationOption = { type: string };

const allLocationTypes = new Set([
  "BRANCH",
  "WAREHOUSE",
  "DISTRIBUTION_CENTER",
  "MIXED",
  "EXTERNAL_POINT_OF_SALE",
]);
const warehouseLocationTypes = new Set([
  "BRANCH",
  "WAREHOUSE",
  "DISTRIBUTION_CENTER",
  "MIXED",
]);
const sellerLocationTypes = new Set([
  "BRANCH",
  "MIXED",
  "EXTERNAL_POINT_OF_SALE",
]);

export function locationsForEmployeeRole<T extends EmployeeLocationOption>(
  locations: T[],
  roles: EmployeeRoleOption[],
  roleId: string,
) {
  const selectedRole = roles.find((role) => role.id === roleId)?.name;
  const allowedTypes =
    selectedRole === "WAREHOUSE"
      ? warehouseLocationTypes
      : selectedRole === "ADMIN"
        ? allLocationTypes
        : sellerLocationTypes;

  return locations.filter((location) => allowedTypes.has(location.type));
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmployeeForm(
  draft: EmployeeFormDraft,
): EmployeeFormErrors {
  const errors: EmployeeFormErrors = {};
  const name = draft.name.trim();
  const email = draft.email.trim();
  const phone = draft.phone.trim();

  if (!name) errors.name = "El nombre es obligatorio.";
  else if (name.length > 300)
    errors.name = "El nombre no puede exceder 300 caracteres.";

  if (!email) errors.email = "El correo electrónico es obligatorio.";
  else if (!emailPattern.test(email))
    errors.email = "Ingresa un correo electrónico válido.";

  if (!phone) errors.phone = "El teléfono es obligatorio.";
  else if (phone.length !== 10)
    errors.phone = "El teléfono debe tener exactamente 10 caracteres.";

  if (!draft.roleId) errors.roleId = "Selecciona un rol.";
  if (!draft.operationalLocationId)
    errors.operationalLocationId = "Selecciona un punto de venta.";

  return errors;
}
