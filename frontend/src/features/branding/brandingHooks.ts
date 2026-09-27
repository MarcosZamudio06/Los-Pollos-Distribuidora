import { useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth";
import { BrandingContext } from "./brandingContext";
import {
  brandingService,
  type UpdateBrandingPayload,
  type UploadBrandingLogoPayload,
} from "./brandingService";

export const BRANDING_QUERY_KEY = ["company-branding"] as const;

export const DEFAULT_BRANDING = {
  displayName: "ERP",
  shortName: null,
  logoUrl: null,
  logoMimeType: null,
  hasLogo: false,
  version: 0,
} as const;

export function useBranding() {
  const context = useContext(BrandingContext);
  if (!context) {
    throw new Error("useBranding must be used within BrandingProvider.");
  }
  return context;
}

export function useSaveBranding() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateBrandingPayload) =>
      brandingService.updateBranding(payload, accessToken),
    onSuccess: (branding) => {
      queryClient.setQueryData(BRANDING_QUERY_KEY, branding);
    },
  });
}

export function useUploadBrandingLogo() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UploadBrandingLogoPayload) =>
      brandingService.uploadLogo(payload, accessToken),
    onSuccess: (branding) => {
      queryClient.setQueryData(BRANDING_QUERY_KEY, branding);
    },
  });
}

export function useRemoveBrandingLogo() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (version: number) =>
      brandingService.removeLogo(version, accessToken),
    onSuccess: (branding) => {
      queryClient.setQueryData(BRANDING_QUERY_KEY, branding);
    },
  });
}
