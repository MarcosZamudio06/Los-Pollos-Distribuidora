import { useState, type CSSProperties } from "react";
type LandingProductImageProps = {
  alt: string;
  aspectRatio: string;
  className?: string;
  /** Kept for legacy call sites; visitor-facing placeholder text is intentionally suppressed. */
  label?: string;
  mobileSrc?: string;
  mobileWidth?: number;
  mobileHeight?: number;
  priority?: boolean;
  src: string;
  width?: number;
  height?: number;
};

export function LandingProductImage({
  alt,
  aspectRatio,
  className = "",
  mobileSrc,
  mobileWidth = 602,
  mobileHeight = 360,
  priority = false,
  src,
  width = 1680,
  height = 560,
}: LandingProductImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const hasError = failedSrc === src;
  const hasImage = Boolean(src.trim()) && !hasError;

  return (
    <figure
      className={`landing-product-image ${className}`.trim()}
      style={{ "--landing-image-aspect": aspectRatio } as CSSProperties}
    >
      {hasImage ? (
        <picture>
          {mobileSrc && (
            <source
              height={mobileHeight}
              media="(max-width: 767px)"
              srcSet={mobileSrc}
              width={mobileWidth}
            />
          )}
          <img
            alt={alt}
            className="landing-product-image__media"
            decoding="async"
            fetchPriority={priority ? "high" : "auto"}
            height={height}
            loading={priority ? "eager" : "lazy"}
            onError={() => setFailedSrc(src)}
            src={src}
            width={width}
          />
        </picture>
      ) : (
        <div
          aria-label={`${alt} — captura no disponible`}
          className="landing-image-fallback"
          role="img"
        >
          <p>No se pudo cargar esta captura. Consulta la descripción del módulo.</p>
        </div>
      )}
    </figure>
  );
}
