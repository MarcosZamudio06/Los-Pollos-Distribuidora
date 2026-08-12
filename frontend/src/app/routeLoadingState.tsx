import { Component, type ErrorInfo, type PropsWithChildren } from "react";

export function RouteLoadingFallback() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="flex min-h-[18rem] items-center justify-center bg-[var(--erp-background)] px-6 py-12 text-[var(--erp-foreground)]"
      role="status"
    >
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[var(--erp-charcoal)] p-8 text-center shadow-[var(--erp-shadow-elevated)]">
        <div
          aria-hidden="true"
          className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-white/15 border-t-[var(--erp-brand-gold)]"
        />
        <p className="mt-5 text-sm font-semibold text-white">
          Cargando módulo…
        </p>
        <p className="mt-2 text-sm leading-6 text-white/65">
          Preparando la vista solicitada.
        </p>
      </section>
    </main>
  );
}

type RouteLoadErrorBoundaryState = {
  hasError: boolean;
};

export class RouteLoadErrorBoundary extends Component<
  PropsWithChildren,
  RouteLoadErrorBoundaryState
> {
  state: RouteLoadErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): RouteLoadErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Route chunk failed to load", error, errorInfo);
  }

  private handleRetry = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--erp-background)] px-6 py-12 text-[var(--erp-foreground)]">
        <section
          aria-live="assertive"
          className="w-full max-w-lg rounded-2xl border border-[var(--erp-danger)]/30 bg-[var(--erp-charcoal)] p-8 text-center shadow-[var(--erp-shadow-elevated)]"
          role="alert"
        >
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--erp-brand-gold-soft)]">
            Carga interrumpida
          </p>
          <h1 className="mt-3 text-2xl font-black text-white">
            No se pudo cargar el módulo
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/70">
            Revisa tu conexión e intenta abrir la vista nuevamente.
          </p>
          <button
            className="mt-6 rounded-xl bg-[var(--erp-brand-gold)] px-5 py-3 text-sm font-black text-[var(--erp-charcoal)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--erp-brand-gold-soft)]"
            onClick={this.handleRetry}
            type="button"
          >
            Reintentar
          </button>
        </section>
      </main>
    );
  }
}
