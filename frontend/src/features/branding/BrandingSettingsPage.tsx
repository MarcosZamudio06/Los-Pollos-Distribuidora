import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Button, Input } from "../../components/ui";
import { BrandingLogo } from "./BrandingLogo";
import {
  useBranding,
  useRemoveBrandingLogo,
  useSaveBranding,
  useUploadBrandingLogo,
} from "./brandingHooks";
import type { BrandingImageMimeType } from "./brandingService";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set<BrandingImageMimeType>([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

type Notice = { kind: "error" | "success"; message: string };
type SelectedLogo = { file: File; previewUrl: string };
type BrandingDraft = {
  version: number;
  displayName: string;
  shortName: string;
};

export function BrandingSettingsPage() {
  const { branding, error: brandingError, isLoading, refresh } = useBranding();
  const saveBranding = useSaveBranding();
  const uploadLogo = useUploadBrandingLogo();
  const removeLogo = useRemoveBrandingLogo();
  const [draft, setDraft] = useState<BrandingDraft>(() => ({
    version: branding.version,
    displayName: branding.displayName,
    shortName: branding.shortName ?? "",
  }));
  const [selectedLogo, setSelectedLogo] = useState<SelectedLogo | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const draftIsCurrent = draft.version === branding.version;
  const displayName = draftIsCurrent ? draft.displayName : branding.displayName;
  const shortName = draftIsCurrent ? draft.shortName : branding.shortName ?? "";

  useEffect(() => {
    if (selectedLogo) {
      return () => URL.revokeObjectURL(selectedLogo.previewUrl);
    }
  }, [selectedLogo]);

  const trimmedDisplayName = displayName.trim();
  const trimmedShortName = shortName.trim();
  const hasNameChanges =
    trimmedDisplayName !== branding.displayName ||
    (trimmedShortName || null) !== branding.shortName;
  const isSaving =
    saveBranding.isPending || uploadLogo.isPending || removeLogo.isPending;
  const canSave = Boolean(trimmedDisplayName) &&
    (hasNameChanges || selectedLogo !== null);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    if (!trimmedDisplayName) {
      setNotice({
        kind: "error",
        message: "Escribe un nombre para el ERP.",
      });
      return;
    }

    try {
      let version = branding.version;
      if (hasNameChanges) {
        const savedBranding = await saveBranding.mutateAsync({
          displayName: trimmedDisplayName,
          shortName: trimmedShortName || null,
          version: branding.version,
        });
        version = savedBranding.version;
      }
      if (selectedLogo) {
        await uploadLogo.mutateAsync({
          file: selectedLogo.file,
          version,
        });
      }

      setSelectedLogo(null);
      setNotice({
        kind: "success",
        message: "La identidad del ERP se guardó correctamente.",
      });
    } catch {
      setNotice({
        kind: "error",
        message:
          "No se pudieron completar los cambios. Revisa los datos e inténtalo de nuevo.",
      });
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }
    if (!ALLOWED_LOGO_TYPES.has(file.type as BrandingImageMimeType)) {
      setSelectedLogo(null);
      setNotice({
        kind: "error",
        message: "El logo debe ser un archivo PNG, JPEG o WebP.",
      });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setSelectedLogo(null);
      setNotice({
        kind: "error",
        message: "El logo debe pesar 5 MB o menos.",
      });
      return;
    }
    setNotice(null);
    setSelectedLogo({ file, previewUrl: URL.createObjectURL(file) });
  }

  async function handleRemoveLogo() {
    setNotice(null);
    try {
      await removeLogo.mutateAsync(branding.version);
      setSelectedLogo(null);
      setNotice({ kind: "success", message: "El logo se eliminó." });
    } catch {
      setNotice({
        kind: "error",
        message: "No se pudo eliminar el logo. Inténtalo de nuevo.",
      });
    }
  }

  return (
    <main
      aria-busy={isLoading || isSaving}
      className="min-h-screen bg-[var(--erp-background)] px-4 py-5 text-[var(--erp-foreground)] sm:px-6 lg:px-8"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[var(--erp-graphite)] px-6 py-7 text-white shadow-[var(--erp-shadow-elevated)] sm:px-8 sm:py-9">
          <div className="pointer-events-none absolute -right-8 -top-20 h-64 w-64 rounded-full bg-[rgba(214,155,45,0.18)] blur-3xl" />
          <div className="relative">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--erp-brand-gold-soft)]">
              Administración
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white sm:text-4xl">
              Identidad del ERP
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
              Define el nombre y el logo que identifican esta instalación.
            </p>
          </div>
        </header>

        {Boolean(brandingError) && (
          <div
            className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
            role="alert"
          >
            <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="flex-1">
              <p className="font-bold">No se pudo cargar la identidad guardada.</p>
              <p className="mt-1">
                Se muestra el nombre neutral ERP mientras se restablece el servicio.
              </p>
            </div>
            <Button onClick={() => void refresh()} size="sm" variant="outline">
              Reintentar
            </Button>
          </div>
        )}

        {isLoading && (
          <p className="text-sm text-[var(--erp-muted-foreground)]" role="status">
            Cargando identidad guardada…
          </p>
        )}

        {notice && (
          <div
            className={
              notice.kind === "success"
                ? "flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
                : "flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
            }
            role={notice.kind === "error" ? "alert" : "status"}
          >
            {notice.kind === "success" ? (
              <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0" />
            ) : (
              <AlertCircle aria-hidden="true" className="h-5 w-5 shrink-0" />
            )}
            <span>{notice.message}</span>
          </div>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <section className="overflow-hidden rounded-[1.75rem] border border-[color:var(--erp-border)] bg-white shadow-[var(--erp-shadow-elevated)]">
            <div className="bg-[var(--erp-graphite)] px-6 py-4 text-white">
              <h2 className="text-lg font-black tracking-[-0.02em] text-white">
                Nombre y logo
              </h2>
              <p className="mt-1 text-sm text-white/65">
                Esta identidad se carga desde la base de datos de esta instalación.
              </p>
            </div>

            <form className="grid gap-6 p-6" onSubmit={handleSave}>
              <label className="grid gap-2 text-sm font-bold" htmlFor="branding-name">
                Nombre del ERP / empresa
                <Input
                  autoComplete="organization"
                  disabled={isSaving}
                  id="branding-name"
                  maxLength={80}
                  onChange={(event) =>
                    setDraft({
                      version: branding.version,
                      displayName: event.target.value,
                      shortName,
                    })
                  }
                  required
                  value={displayName}
                />
                <span className="text-xs font-normal text-[var(--erp-muted-foreground)]">
                  De 1 a 80 caracteres.
                </span>
              </label>

              <label className="grid gap-2 text-sm font-bold" htmlFor="branding-short-name">
                Nombre corto
                <Input
                  disabled={isSaving}
                  id="branding-short-name"
                  maxLength={32}
                  onChange={(event) =>
                    setDraft({
                      version: branding.version,
                      displayName,
                      shortName: event.target.value,
                    })
                  }
                  value={shortName}
                />
                <span className="text-xs font-normal text-[var(--erp-muted-foreground)]">
                  Opcional, hasta 32 caracteres.
                </span>
              </label>

              <div className="grid gap-3">
                <span className="text-sm font-bold">Logo</span>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[color:var(--erp-border)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--erp-foreground)] transition hover:bg-[var(--erp-surface-muted)] focus-within:ring-4 focus-within:ring-[var(--erp-brand-gold)]">
                    <ImagePlus aria-hidden="true" className="h-4 w-4" />
                    {selectedLogo ? "Cambiar archivo" : "Cargar logo"}
                    <input
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      disabled={isSaving}
                      onChange={handleFileChange}
                      type="file"
                    />
                  </label>
                  {selectedLogo && (
                    <Button
                      disabled={isSaving}
                      onClick={() => setSelectedLogo(null)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <X aria-hidden="true" className="mr-2 h-4 w-4" />
                      Quitar archivo seleccionado
                    </Button>
                  )}
                  {branding.hasLogo && (
                    <Button
                      disabled={isSaving}
                      onClick={() => void handleRemoveLogo()}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {removeLogo.isPending ? (
                        <LoaderCircle
                          aria-hidden="true"
                          className="mr-2 h-4 w-4 animate-spin"
                        />
                      ) : (
                        <Trash2 aria-hidden="true" className="mr-2 h-4 w-4" />
                      )}
                      Eliminar logo
                    </Button>
                  )}
                </div>
                <p className="text-xs leading-5 text-[var(--erp-muted-foreground)]">
                  PNG, JPEG o WebP. Tamaño máximo: 5 MB. El logo se guarda en
                  Object Storage.
                </p>
                {selectedLogo && (
                  <p className="text-xs font-semibold text-[var(--erp-foreground)]">
                    Archivo seleccionado: {selectedLogo.file.name}
                  </p>
                )}
              </div>

              <div className="flex justify-end border-t border-[color:var(--erp-border)] pt-5">
                <Button disabled={!canSave || isSaving} type="submit">
                  {isSaving ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="mr-2 h-4 w-4 animate-spin"
                    />
                  ) : (
                    <Save aria-hidden="true" className="mr-2 h-4 w-4" />
                  )}
                  Guardar cambios
                </Button>
              </div>
            </form>
          </section>

          <section className="overflow-hidden rounded-[1.75rem] border border-[color:var(--erp-border)] bg-white shadow-[var(--erp-shadow-elevated)]">
            <div className="bg-[var(--erp-graphite)] px-6 py-4 text-white">
              <h2 className="text-lg font-black tracking-[-0.02em] text-white">
                Vista previa
              </h2>
              <p className="mt-1 text-sm text-white/65">
                Así se verá en el acceso y la navegación.
              </p>
            </div>
            <div className="p-6">
              <div className="rounded-3xl bg-[var(--erp-charcoal)] p-5 text-white">
                <div className="flex items-center gap-4">
                  <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/15 bg-white/10 p-2">
                    {selectedLogo?.previewUrl ? (
                      <img
                        alt={trimmedDisplayName || "ERP"}
                        className="h-full w-full object-contain"
                        src={selectedLogo.previewUrl}
                      />
                    ) : (
                      <BrandingLogo className="rounded-xl" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-black text-white">
                      {trimmedDisplayName || "ERP"}
                    </p>
                    <p className="mt-1 truncate text-xs font-bold uppercase tracking-[0.16em] text-[var(--erp-brand-gold-soft)]">
                      {trimmedShortName || "ERP"}
                    </p>
                  </div>
                </div>
                <div className="mt-5 border-t border-white/10 pt-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/45">
                    Aplicación operativa
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-white">
                    {trimmedDisplayName || "ERP"}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs leading-5 text-[var(--erp-muted-foreground)]">
                Si la consulta falla, el sistema conserva un placeholder genérico
                y el acceso permanece disponible.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
