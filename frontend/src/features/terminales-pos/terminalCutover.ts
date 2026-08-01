export type TerminalCutoverRecord = {
  id: string;
  operationalLocationId: string;
  code: string;
  name: string;
  deviceId: string;
  isActive: boolean;
};

export function isLegacyTerminal(
  terminal: Pick<TerminalCutoverRecord, "deviceId">,
) {
  return terminal.deviceId.startsWith("legacy:");
}

export function getTerminalCutoverSummary(terminals: TerminalCutoverRecord[]) {
  const pending = terminals.filter(isLegacyTerminal).length;
  const linked = terminals.length - pending;
  return {
    total: terminals.length,
    linked,
    pending,
    completionPercentage:
      terminals.length === 0
        ? 100
        : Math.round((linked / terminals.length) * 100),
  };
}

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function buildTerminalCutoverCsv(
  terminals: TerminalCutoverRecord[],
  locationNames: Map<string, string>,
) {
  const header = [
    "terminalId",
    "location",
    "code",
    "name",
    "status",
    "deviceId",
  ];
  const rows = terminals.map((terminal) => [
    terminal.id,
    locationNames.get(terminal.operationalLocationId) ??
      terminal.operationalLocationId,
    terminal.code,
    terminal.name,
    isLegacyTerminal(terminal) ? "PENDING" : "LINKED",
    terminal.deviceId,
  ]);
  return [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
