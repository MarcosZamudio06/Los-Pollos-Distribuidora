export const SAT_GLOBAL_PERIODICITIES = ["01", "02", "03", "04", "05"] as const;

export const SAT_GLOBAL_MONTHS = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
] as const;

export type SatGlobalPeriodicity = (typeof SAT_GLOBAL_PERIODICITIES)[number];
export type SatGlobalMonths = (typeof SAT_GLOBAL_MONTHS)[number];

export interface CfdiGlobalInformation {
  periodicity: SatGlobalPeriodicity;
  months: SatGlobalMonths;
  year: number;
}

export const SAT_GLOBAL_PERIODICITY_OPTIONS = [
  { code: "01", label: "Daily" },
  { code: "02", label: "Weekly" },
  { code: "03", label: "Fortnightly" },
  { code: "04", label: "Monthly" },
  { code: "05", label: "Bimonthly" },
] as const;

export function isSatGlobalPeriodicity(
  value: string,
): value is SatGlobalPeriodicity {
  return SAT_GLOBAL_PERIODICITIES.includes(value as SatGlobalPeriodicity);
}

export function isSatGlobalMonths(value: string): value is SatGlobalMonths {
  return SAT_GLOBAL_MONTHS.includes(value as SatGlobalMonths);
}

export function isGlobalMonthsCoherent(
  periodicity: SatGlobalPeriodicity,
  months: SatGlobalMonths,
): boolean {
  const numeric = Number(months);
  return periodicity === "05"
    ? numeric >= 13 && numeric <= 18
    : numeric >= 1 && numeric <= 12;
}
