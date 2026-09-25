import { useState, type CSSProperties } from "react";
import { Camera } from "lucide-react";

type LandingProductImageProps = {
  alt: string;
  aspectRatio: string;
  className?: string;
  label: string;
  priority?: boolean;
  src: string;
};

export function LandingProductImage({
  alt,
  aspectRatio,
  className = "",
  label,
  priority = false,
  src,
}: LandingProductImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const hasError = failedSrc === src;
  const hasImage = Boolean(src.trim()) && !hasError;

  return (
    <figure
      className={`landing-product-image ${className}`.trim()}
      style={{ aspectRatio } satisfies CSSProperties}
    >
      {hasImage ? (
        <img
          alt={alt}
          className="landing-product-image__media"
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          onError={() => setFailedSrc(src)}
          src={src}
        />
      ) : (
        <div
          aria-label={`${alt} — captura pendiente`}
          className="landing-image-placeholder"
          role="img"
        >
          <div className="landing-image-placeholder__grid" />
          <div className="landing-image-placeholder__mark">
            <Camera aria-hidden="true" size={21} strokeWidth={1.5} />
          </div>
          <span>{label}</span>
          <small>
            {hasError ? "No se pudo cargar la captura" : "Captura pendiente"}
          </small>
        </div>
      )}
    </figure>
  );
}
