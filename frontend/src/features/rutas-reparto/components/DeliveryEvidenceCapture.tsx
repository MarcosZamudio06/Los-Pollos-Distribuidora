import { useState, type ChangeEvent, type FormEvent } from "react";
import { preparePhotoEvidence, isPhotoDataUrl } from "./deliveryEvidencePhoto";
import { useCreateDeliveryEvidence } from "../hooks";
import { evidenceTypeLabel } from "../labels";
import { mutationErrorMessage } from "../errorMessages";
import { toDateTimeLocalInput, toIsoDateTime } from "../dateTime";
import type { DeliveryOrder, EvidenceType } from "../types";
import {
  Field,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
  StatusMessage,
  TextInput,
} from "./RouteUi";

const evidenceTypes: EvidenceType[] = [
  "PHOTO",
  "SIGNATURE",
  "GEOLOCATION",
  "NOTE",
];

type Props = {
  onClose: () => void;
  order: DeliveryOrder;
  routeId: string;
};

export function DeliveryEvidenceCapture({ onClose, order, routeId }: Props) {
  const [type, setType] = useState<EvidenceType>("PHOTO");
  const [value, setValue] = useState("");
  const [photoFileName, setPhotoFileName] = useState("");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [capturedAt, setCapturedAt] = useState(toDateTimeLocalInput());
  const createEvidence = useCreateDeliveryEvidence(routeId);
  const canSubmit = Boolean(value.trim() && capturedAt);

  function handleTypeChange(nextType: EvidenceType) {
    setType(nextType);
    setValue("");
    setPhotoFileName("");
    setPhotoError(null);
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPhotoError(null);
    setPhotoFileName(file?.name ?? "");
    setValue("");

    if (!file) {
      return;
    }

    try {
      setValue(await preparePhotoEvidence(file));
    } catch (error) {
      setValue("");
      setPhotoFileName("");
      event.target.value = "";
      setPhotoError(
        error instanceof Error ? error.message : "No se pudo preparar la foto.",
      );
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    await createEvidence.mutateAsync({
      orderId: order.id,
      payload: {
        capturedAt: toIsoDateTime(capturedAt),
        type,
        value: value.trim(),
      },
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#1d2420]/55 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-title"
    >
      <form
        className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto border border-[#1d2420]/15 bg-white p-4 shadow-[0_30px_90px_rgba(29,36,32,0.30)] sm:max-h-[92vh] sm:p-6"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#1d2420]/10 pb-5 sm:gap-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2f6f73]">
              Evidencia
            </p>
            <h2
              className="mt-1 break-words text-[clamp(1.75rem,8vw,2.25rem)] font-black tracking-[-0.05em] sm:text-3xl"
              id="evidence-title"
            >
              Capturar evidencia
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#6f786f]">
              Venta {order.saleNumber ?? order.saleId ?? order.id}. Para marcar
              el pedido como entregado se requiere una foto; geolocalización,
              firma y nota son opcionales.
            </p>
          </div>
          <SecondaryButton className="w-auto shrink-0" onClick={onClose}>
            Cerrar
          </SecondaryButton>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Tipo de evidencia">
            <SelectInput
              onChange={(event) => handleTypeChange(event.target.value)}
              value={type}
            >
              {evidenceTypes.map((item) => (
                <option key={item} value={item}>
                  {evidenceTypeLabel(item)}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Fecha y hora de captura">
            <TextInput
              onChange={(event) => setCapturedAt(event.target.value)}
              required
              type="datetime-local"
              value={capturedAt}
            />
          </Field>
          {type === "PHOTO" ? (
            <Field
              label="Foto de entrega"
              hint="Selecciona una foto del dispositivo. Se comprime antes de enviarse para respetar el límite de la API."
            >
              <input
                accept="image/*"
                aria-label="Foto de entrega"
                capture="environment"
                className="h-10 w-full rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] px-3.5 py-2 text-sm text-[var(--erp-foreground)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--erp-info)] file:px-3 file:py-1 file:text-xs file:font-black file:text-white"
                onChange={(event) => void handlePhotoChange(event)}
                required
                type="file"
              />
              {photoFileName && (
                <span className="break-all text-xs font-semibold normal-case tracking-normal text-[var(--erp-info)]">
                  {photoFileName}
                </span>
              )}
              {value && isPhotoDataUrl(value) && (
                <img
                  alt="Vista previa de la evidencia fotográfica"
                  className="h-40 w-full rounded-xl border border-[color:var(--erp-border)] object-cover"
                  src={value}
                />
              )}
            </Field>
          ) : (
            <Field
              label="Referencia o valor"
              hint="Puede ser una referencia interna, URL, firma textual, coordenada o nota según el tipo."
            >
              <TextInput
                onChange={(event) => setValue(event.target.value)}
                placeholder="Referencia de evidencia"
                required
                value={value}
              />
            </Field>
          )}
        </div>

        {photoError && (
          <div className="mt-4">
            <StatusMessage tone="error">{photoError}</StatusMessage>
          </div>
        )}

        {createEvidence.error && (
          <div className="mt-4">
            <StatusMessage tone="error">
              {mutationErrorMessage(
                createEvidence.error,
                "No se pudo guardar la evidencia. Revisa permisos, ruta asignada y datos capturados.",
              )}
            </StatusMessage>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <SecondaryButton className="w-full sm:w-auto" onClick={onClose}>
            Cancelar
          </SecondaryButton>
          <PrimaryButton
            className="w-full sm:w-auto"
            disabled={!canSubmit || createEvidence.isPending}
            type="submit"
          >
            {createEvidence.isPending ? "Guardando..." : "Guardar evidencia"}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
