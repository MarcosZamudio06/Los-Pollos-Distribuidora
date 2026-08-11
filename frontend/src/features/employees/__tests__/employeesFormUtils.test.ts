import { describe, expect, it, vi } from "vitest";
import {
  locationsForEmployeeRole,
  validateEmployeeForm,
  type EmployeeFormDraft,
} from "../employeesFormUtils";

const validDraft: EmployeeFormDraft = {
  name: "Ana Pérez",
  email: "ana.perez@example.com",
  phone: "2291234567",
  roleId: "role-1",
  operationalLocationId: "location-1",
  cedisLocationId: "cedis-1",
};

describe("employee form validation", () => {
  it("includes CEDIS and branches for WAREHOUSE employees", () => {
    const locations = locationsForEmployeeRole(
      [
        { id: "cedis-1", type: "DISTRIBUTION_CENTER" },
        { id: "branch-alvarado", type: "BRANCH" },
        { id: "branch-veracruz", type: "BRANCH" },
      ],
      [{ id: "role-warehouse", name: "WAREHOUSE" }],
      "role-warehouse",
    );

    expect(locations.map((location) => location.id)).toEqual([
      "cedis-1",
      "branch-alvarado",
      "branch-veracruz",
    ]);
  });

  it("includes CEDIS as a primary location for SELLER employees", () => {
    const locations = locationsForEmployeeRole(
      [
        { id: "cedis-1", type: "DISTRIBUTION_CENTER" },
        { id: "branch-1", type: "BRANCH" },
      ],
      [{ id: "role-seller", name: "SELLER" }],
      "role-seller",
    );

    expect(locations.map((location) => location.id)).toEqual([
      "cedis-1",
      "branch-1",
    ]);
  });

  it("accepts a valid name, email and ten-character phone", () => {
    expect(validateEmployeeForm(validDraft)).toEqual({});
  });

  it("allows an optional CEDIS assignment without replacing the primary location", () => {
    expect(
      validateEmployeeForm({
        ...validDraft,
        operationalLocationId: "branch-1",
        cedisLocationId: "cedis-1",
      }),
    ).toEqual({});
  });

  it("requires a role and operational location", () => {
    expect(
      validateEmployeeForm({ ...validDraft, roleId: "" }).roleId,
    ).toContain("rol");
    expect(
      validateEmployeeForm({ ...validDraft, operationalLocationId: "" })
        .operationalLocationId,
    ).toContain("ubicación");
  });

  it("rejects names longer than 300 characters", () => {
    expect(
      validateEmployeeForm({ ...validDraft, name: "a".repeat(301) }).name,
    ).toContain("300");
  });

  it("requires a valid email format", () => {
    expect(
      validateEmployeeForm({ ...validDraft, email: "" }).email,
    ).toBeTruthy();
    expect(
      validateEmployeeForm({ ...validDraft, email: "not-an-email" }).email,
    ).toContain("válido");
  });

  it("prevents submit when required values are empty or malformed", () => {
    const submit = vi.fn();
    const invalidDraft = {
      ...validDraft,
      name: "",
      email: "invalid",
      phone: "123",
    };
    if (Object.keys(validateEmployeeForm(invalidDraft)).length === 0) submit();
    expect(submit).not.toHaveBeenCalled();
  });

  it("requires the phone to have exactly ten characters", () => {
    expect(
      validateEmployeeForm({ ...validDraft, phone: "123456789" }).phone,
    ).toContain("10");
    expect(
      validateEmployeeForm({ ...validDraft, phone: "12345678901" }).phone,
    ).toContain("10");
  });
});
