import { ApiClientError } from "@/lib/api";

export function getRemediationErrorDetails(error: unknown): string[] {
  if (
    !(error instanceof ApiClientError) ||
    typeof error.payload !== "object" ||
    !error.payload ||
    !Array.isArray(error.payload.findings)
  )
    return [];
  return error.payload.findings
    .map((finding) => finding.message)
    .filter(Boolean);
}
