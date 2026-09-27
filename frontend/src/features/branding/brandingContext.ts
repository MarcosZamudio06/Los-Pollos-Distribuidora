import { createContext } from "react";
import type { BrandingSnapshot } from "./brandingService";

export type BrandingContextValue = {
  branding: BrandingSnapshot;
  isLoading: boolean;
  error: unknown;
  refresh: () => Promise<void>;
};

export const BrandingContext = createContext<BrandingContextValue | null>(null);
