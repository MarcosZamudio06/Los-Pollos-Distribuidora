import { useState } from "react";
import { Building2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { useBranding } from "./brandingHooks";

type BrandingLogoProps = {
  className?: string;
};

export function BrandingLogo({ className }: BrandingLogoProps) {
  const { branding } = useBranding();
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const logoUrl = branding.logoUrl;

  if (logoUrl && failedLogoUrl !== logoUrl) {
    return (
      <img
        alt={branding.displayName}
        className={cn("h-full w-full object-contain", className)}
        onError={() => setFailedLogoUrl(logoUrl)}
        src={logoUrl}
      />
    );
  }

  return (
    <div
      aria-label={branding.displayName}
      className={cn(
        "grid h-full w-full place-items-center rounded-xl bg-white/10 text-white",
        className,
      )}
      role="img"
    >
      <Building2 aria-hidden="true" className="h-1/2 w-1/2" strokeWidth={1.7} />
    </div>
  );
}
