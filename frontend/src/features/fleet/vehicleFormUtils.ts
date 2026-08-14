import type {
  CreateVehiclePayload,
  UpdateVehiclePayload,
  Vehicle,
} from "./vehicleTypes";

export type VehicleFormDraft = {
  code: string;
  displayName: string;
  plateNumber: string;
  homeLocationId: string;
  isActive: boolean;
};

export type VehicleFormField =
  | "code"
  | "displayName"
  | "plateNumber"
  | "homeLocationId"
  | "isActive";

export type VehicleFormErrors = Partial<
  Record<Exclude<VehicleFormField, "isActive" | "homeLocationId">, string>
>;

const MULTIPLE_SPACES = /\s+/g;

export function collapseVehicleSpaces(value: string) {
  return value.replace(MULTIPLE_SPACES, " ").trim();
}

export function normalizeVehicleTextInput(value: string) {
  return collapseVehicleSpaces(value);
}

export function createVehicleFormDraft(
  vehicle?: Vehicle | null,
): VehicleFormDraft {
  return {
    code: collapseVehicleSpaces(vehicle?.code ?? ""),
    displayName: collapseVehicleSpaces(vehicle?.displayName ?? ""),
    plateNumber: collapseVehicleSpaces(vehicle?.plateNumber ?? ""),
    homeLocationId: vehicle?.homeLocationId ?? "",
    isActive: vehicle?.isActive ?? true,
  };
}

export function toCreateVehiclePayload(
  draft: VehicleFormDraft,
): CreateVehiclePayload {
  const payload: CreateVehiclePayload = {
    code: collapseVehicleSpaces(draft.code),
    displayName: collapseVehicleSpaces(draft.displayName),
  };
  const plateNumber = collapseVehicleSpaces(draft.plateNumber);
  const homeLocationId = draft.homeLocationId.trim();
  if (plateNumber) payload.plateNumber = plateNumber;
  if (homeLocationId) payload.homeLocationId = homeLocationId;
  return payload;
}

export function toUpdateVehiclePayload(
  draft: VehicleFormDraft,
  original?: VehicleFormDraft | Vehicle | null,
): UpdateVehiclePayload {
  const normalized = toCreateVehiclePayload(draft);
  const baseline = original
    ? toCreateVehiclePayload(createVehicleFormDraft(original as Vehicle))
    : null;
  const payload: UpdateVehiclePayload = {};

  if (normalized.code !== baseline?.code) payload.code = normalized.code;
  if (normalized.displayName !== baseline?.displayName) {
    payload.displayName = normalized.displayName;
  }
  if (normalized.plateNumber !== baseline?.plateNumber) {
    payload.plateNumber = normalized.plateNumber ?? null;
  }
  if (normalized.homeLocationId !== baseline?.homeLocationId) {
    payload.homeLocationId = normalized.homeLocationId ?? null;
  }
  const originalIsActive =
    original && "isActive" in original ? original.isActive : true;
  if (draft.isActive !== originalIsActive) payload.isActive = draft.isActive;

  return payload;
}

export function validateVehicleForm(
  draft: VehicleFormDraft,
): VehicleFormErrors {
  const errors: VehicleFormErrors = {};
  const code = collapseVehicleSpaces(draft.code);
  const displayName = collapseVehicleSpaces(draft.displayName);
  const plateNumber = collapseVehicleSpaces(draft.plateNumber);

  if (!code) errors.code = "El código de la unidad es obligatorio.";
  else if (code.length > 80)
    errors.code = "El código no puede superar 80 caracteres.";

  if (!displayName) {
    errors.displayName =
      "El nombre operativo de la unidad es obligatorio.";
  } else if (displayName.length > 160) {
    errors.displayName =
      "El nombre operativo no puede superar 160 caracteres.";
  }

  if (plateNumber.length > 40) {
    errors.plateNumber = "La placa no puede superar 40 caracteres.";
  }

  return errors;
}

export function hasVehicleFormErrors(errors: VehicleFormErrors) {
  return Object.values(errors).some(Boolean);
}
