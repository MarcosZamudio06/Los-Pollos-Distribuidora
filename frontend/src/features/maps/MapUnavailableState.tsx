import type { MapUnavailableReason } from "./types";

type Props = {
  reason: MapUnavailableReason;
  onRetry?: () => void;
  className?: string;
};

const copy: Record<
  MapUnavailableReason,
  { description: string; title: string }
> = {
  config: {
    title: "Mapa no disponible",
    description: "No se pudo cargar la configuración de mapas.",
  },
  disabled: {
    title: "Mapa no disponible",
    description: "La configuración de mapas no está habilitada para este entorno.",
  },
  glyphs: {
    title: "Mapa no disponible",
    description: "Las fuentes tipográficas del mapa no están disponibles.",
  },
  loading: {
    title: "Cargando mapa",
    description: "La vista cartográfica se está preparando.",
  },
  runtime: {
    title: "Mapa no disponible",
    description: "El mapa encontró un error inesperado.",
  },
  sprites: {
    title: "Mapa no disponible",
    description: "Los recursos visuales del mapa no están disponibles.",
  },
  style: {
    title: "Mapa no disponible",
    description: "El estilo cartográfico no pudo cargarse.",
  },
  tiles: {
    title: "Mapa no disponible",
    description: "Los mosaicos del mapa no están disponibles.",
  },
  webgl: {
    title: "Mapa no disponible",
    description: "Este navegador no pudo iniciar WebGL.",
  },
};

export function MapUnavailableState({ reason, onRetry, className }: Props) {
  const content = copy[reason];
  const isLoading = reason === "loading";
  const rootClassName = [
    "relative flex min-h-64 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-slate-950 px-6 py-10 text-center text-white",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      aria-live={isLoading ? "polite" : "assertive"}
      className={rootClassName}
      role={isLoading ? "status" : "alert"}
    >
      <div className="max-w-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
          Cartografía
        </p>
        <h2 className="text-lg font-semibold text-white">{content.title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          {content.description}
        </p>
        {onRetry && !isLoading ? (
          <button
            className="mt-5 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            onClick={onRetry}
            type="button"
          >
            Reintentar
          </button>
        ) : null}
      </div>
    </section>
  );
}
