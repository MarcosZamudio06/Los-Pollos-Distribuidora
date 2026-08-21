import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  tone?: "error" | "info" | "success" | "warning";
  title: string;
};

const tones: Record<NonNullable<Props["tone"]>, string> = {
  error:
    "border-[rgba(157,45,36,0.30)] bg-[rgba(157,45,36,0.12)] text-white",
  info: "border-white/15 bg-white/10 text-white",
  success:
    "border-[rgba(112,193,117,0.35)] bg-[rgba(112,193,117,0.12)] text-white",
  warning:
    "border-[rgba(240,197,106,0.35)] bg-[rgba(240,197,106,0.12)] text-white",
};

export function DriverNavigationStatus({
  children,
  title,
  tone = "info",
}: Props) {
  return (
    <section
      aria-live="polite"
      className={`rounded-2xl border p-4 shadow-[0_16px_48px_rgba(0,0,0,0.16)] sm:p-5 ${tones[tone]}`}
      role="status"
    >
      <h2 className="text-base font-black tracking-[-0.02em] text-white">
        {title}
      </h2>
      <div className="mt-2 text-sm leading-6 text-white/75">{children}</div>
    </section>
  );
}
