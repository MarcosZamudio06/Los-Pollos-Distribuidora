import { describe, expect, it } from "vitest";
import {
  buildTerminalCutoverCsv,
  getTerminalCutoverSummary,
  isLegacyTerminal,
} from "../terminalCutover";

const terminals = [
  {
    id: "legacy-1",
    operationalLocationId: "loc-1",
    code: "C01",
    name: "Caja 01",
    deviceId: "legacy:abc",
    isActive: true,
  },
  {
    id: "terminal-2",
    operationalLocationId: "loc-1",
    code: "C02",
    name: "Caja 02",
    deviceId: "browser-2",
    isActive: true,
  },
  {
    id: "legacy-3",
    operationalLocationId: "loc-2",
    code: "C03",
    name: "Caja, Norte",
    deviceId: "legacy:def",
    isActive: false,
  },
];

describe("terminal cutover", () => {
  it("identifies migrated terminals and reports completion", () => {
    expect(isLegacyTerminal(terminals[0])).toBe(true);
    expect(isLegacyTerminal(terminals[1])).toBe(false);
    expect(getTerminalCutoverSummary(terminals)).toEqual({
      total: 3,
      linked: 1,
      pending: 2,
      completionPercentage: 33,
    });
  });

  it("exports a CSV inventory with escaped operational values", () => {
    const csv = buildTerminalCutoverCsv(
      terminals,
      new Map([
        ["loc-1", "Matriz"],
        ["loc-2", "Sucursal Norte"],
      ]),
    );

    expect(csv).toContain("terminalId,location,code,name,status,deviceId");
    expect(csv).toContain("legacy-1,Matriz,C01,Caja 01,PENDING,legacy:abc");
    expect(csv).toContain(
      'legacy-3,Sucursal Norte,C03,"Caja, Norte",PENDING,legacy:def',
    );
  });
});
