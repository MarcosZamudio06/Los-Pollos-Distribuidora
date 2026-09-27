import { useCallback, useEffect, useMemo, type PropsWithChildren } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BrandingContext } from "./brandingContext";
import { BRANDING_QUERY_KEY, DEFAULT_BRANDING } from "./brandingHooks";
import { brandingService, type BrandingImageMimeType } from "./brandingService";

const FAVICON_FALLBACK = "/favicon.svg";
const SUPPORTED_FAVICON_MIME_TYPES = new Set<BrandingImageMimeType>([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function BrandingProvider({ children }: PropsWithChildren) {
  const query = useQuery({
    queryKey: BRANDING_QUERY_KEY,
    queryFn: brandingService.getBranding,
    retry: false,
    staleTime: 60_000,
    refetchInterval: 240_000,
  });
  const queryClient = useQueryClient();
  const branding = query.data ?? DEFAULT_BRANDING;

  useEffect(() => {
    const displayName = branding.displayName.trim() || DEFAULT_BRANDING.displayName;
    document.title = displayName;

    let favicon = document.querySelector<HTMLLinkElement>("#app-favicon");
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.id = "app-favicon";
      favicon.rel = "icon";
      document.head.append(favicon);
    }

    const hasCompatibleLogo =
      Boolean(branding.logoUrl) &&
      Boolean(branding.logoMimeType) &&
      SUPPORTED_FAVICON_MIME_TYPES.has(
        branding.logoMimeType as BrandingImageMimeType,
      );
    favicon.href = hasCompatibleLogo
      ? (branding.logoUrl as string)
      : FAVICON_FALLBACK;
    favicon.type = hasCompatibleLogo
      ? (branding.logoMimeType as BrandingImageMimeType)
      : "image/svg+xml";
  }, [branding.displayName, branding.logoMimeType, branding.logoUrl]);

  const refresh = useCallback(async () => {
    await queryClient.refetchQueries({
      queryKey: BRANDING_QUERY_KEY,
      exact: true,
    });
  }, [queryClient]);
  const value = useMemo(
    () => ({
      branding,
      isLoading: query.isLoading,
      error: query.error,
      refresh,
    }),
    [branding, query.error, query.isLoading, refresh],
  );

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}
