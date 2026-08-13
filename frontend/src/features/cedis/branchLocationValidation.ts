import { ApiClientError } from "../../lib/api";
import type { CreateBranchLocationPayload } from "./types";

export type BranchLocationFormValues = {
  name: string;
  code: string;
  parentId: string;
  address: string;
  latitude: string;
  longitude: string;
};

export type BranchLocationField = keyof BranchLocationFormValues | "coordinates";
export type BranchLocationValidationErrors = Partial<
  Record<BranchLocationField, string>
>;

export const emptyBranchLocationFormValues: BranchLocationFormValues = {
  name: "",
  code: "",
  parentId: "",
  address: "",
  latitude: "",
  longitude: "",
};

function parseCoordinate(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function validateBranchLocation(
  values: BranchLocationFormValues,
): BranchLocationValidationErrors {
  const errors: BranchLocationValidationErrors = {};
  const name = values.name.trim();
  const parentId = values.parentId.trim();
  const latitude = parseCoordinate(values.latitude);
  const longitude = parseCoordinate(values.longitude);
  const hasLatitude = values.latitude.trim().length > 0;
  const hasLongitude = values.longitude.trim().length > 0;

  if (!name) {
    errors.name = "El nombre de la sucursal es obligatorio.";
  }

  if (!parentId) {
    errors.parentId = "Selecciona un CEDIS activo.";
  }

  if (hasLatitude !== hasLongitude) {
    errors.coordinates = "Latitud y longitud deben capturarse juntas.";
    return errors;
  }

  if (!hasLatitude && !hasLongitude) return errors;

  if (Number.isNaN(latitude) || latitude === null || latitude < -90 || latitude > 90) {
    errors.latitude = "La latitud debe estar entre -90 y 90.";
  }

  if (
    Number.isNaN(longitude) ||
    longitude === null ||
    longitude < -180 ||
    longitude > 180
  ) {
    errors.longitude = "La longitud debe estar entre -180 y 180.";
  }

  return errors;
}

export function buildCreateBranchLocationPayload(
  values: BranchLocationFormValues,
): CreateBranchLocationPayload {
  const payload: CreateBranchLocationPayload = {
    name: values.name.trim(),
    type: "BRANCH",
    parentId: values.parentId.trim(),
  };
  const code = values.code.trim();
  const address = values.address.trim();
  const latitude = parseCoordinate(values.latitude);
  const longitude = parseCoordinate(values.longitude);

  if (code) payload.code = code;
  if (address) payload.address = address;
  if (latitude !== null && longitude !== null) {
    payload.latitude = latitude;
    payload.longitude = longitude;
  }

  return payload;
}

function errorStatus(error: unknown) {
  if (error instanceof ApiClientError) return error.statusCode;
  if (error && typeof error === "object" && "statusCode" in error) {
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    return typeof statusCode === "number" ? statusCode : null;
  }

  return null;
}

export function getBranchLocationSubmitError(error: unknown) {
  switch (errorStatus(error)) {
    case 400:
      return "Revisa el nombre, la jerarquía y las coordenadas de la sucursal.";
    case 403:
      return "No tienes permiso para crear sucursales.";
    case 404:
      return "El CEDIS seleccionado ya no está disponible.";
    case 409:
      return "El código de sucursal ya está registrado.";
    default:
      return "No se pudo crear la sucursal. Intenta de nuevo.";
  }
}
