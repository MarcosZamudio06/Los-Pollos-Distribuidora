import { describe, expect, it } from "vitest";
import {
  collapseVehicleSpaces,
  createVehicleFormDraft,
  toCreateVehiclePayload,
  toUpdateVehiclePayload,
  validateVehicleForm,
  type VehicleFormDraft,
} from "../vehicleFormUtils";

const validDraft: VehicleFormDraft = {
  code: "UNIDAD-01",
  displayName: "Reparto Centro",
  plateNumber: "ABC-123",
  homeLocationId: "location-1",
  isActive: true,
};

describe("vehicle form utilities", () => {
  it("trims and collapses repeated spaces only when text is normalized", () => {
    expect(collapseVehicleSpaces("   Reparto   Centro   ")).toBe(
      "Reparto Centro",
    );
  });

  it("creates a new active vehicle draft", () => {
    expect(createVehicleFormDraft()).toEqual({
      code: "",
      displayName: "",
      plateNumber: "",
      homeLocationId: "",
      isActive: true,
    });
  });

  it("maps a create draft and omits optional blank identifiers", () => {
    expect(
      toCreateVehiclePayload({
        ...validDraft,
        homeLocationId: "",
        plateNumber: "",
      }),
    ).toEqual({
      code: "UNIDAD-01",
      displayName: "Reparto Centro",
    });
  });

  it("maps only changed fields and sends null to clear optional values", () => {
    expect(
      toUpdateVehiclePayload(
        {
          ...validDraft,
          homeLocationId: "",
          isActive: false,
          plateNumber: "",
        },
        validDraft,
      ),
    ).toEqual({
      homeLocationId: null,
      isActive: false,
      plateNumber: null,
    });
  });

  it("requires code and display name", () => {
    const errors = validateVehicleForm({
      ...validDraft,
      code: "   ",
      displayName: "",
    });

    expect(errors.code).toBe("El código de la unidad es obligatorio.");
    expect(errors.displayName).toBe(
      "El nombre operativo de la unidad es obligatorio.",
    );
  });

  it("enforces backend field limits", () => {
    const errors = validateVehicleForm({
      ...validDraft,
      code: "x".repeat(81),
      displayName: "x".repeat(161),
      plateNumber: "x".repeat(41),
    });

    expect(errors.code).toBe("El código no puede superar 80 caracteres.");
    expect(errors.displayName).toBe(
      "El nombre operativo no puede superar 160 caracteres.",
    );
    expect(errors.plateNumber).toBe("La placa no puede superar 40 caracteres.");
  });
});
