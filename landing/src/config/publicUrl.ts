/** Public build-time values only. Never place provider credentials in VITE_* variables. */
export function publicUrl(value: string | undefined) {
  try {
    const url = new URL(value?.trim() || "");
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password ||
      host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host.startsWith("[") || !host.includes(".") || host.endsWith(".internal") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return "";
    return url.href;
  } catch { return ""; }
}
