import type { ComponentPropsWithoutRef } from "react";
import s from "../styles/landing.module.css";

type Props = ComponentPropsWithoutRef<"a"> & { tone?: "primary" | "secondary" };

export function LandingButton({ tone = "primary", className = "", ...props }: Props) {
  return <a className={`${s.button} ${tone === "primary" ? s.primary : s.secondary} ${className}`} {...props} />;
}
