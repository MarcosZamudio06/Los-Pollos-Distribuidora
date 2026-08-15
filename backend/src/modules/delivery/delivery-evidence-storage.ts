import { randomUUID } from 'node:crypto';

const MIME_TYPE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function deliveryEvidenceExtension(mimeType: string) {
  return MIME_TYPE_EXTENSIONS[mimeType] ?? 'bin';
}

export function buildDeliveryEvidenceStorageKey(input: {
  deliveryOrderId: string;
  capturedAt: Date;
  mimeType: string;
  evidenceId?: string;
}) {
  const year = input.capturedAt.getUTCFullYear();
  const month = String(input.capturedAt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(input.capturedAt.getUTCDate()).padStart(2, '0');
  const evidenceId = input.evidenceId ?? randomUUID();

  return `evidence/${year}/${month}/${day}/${input.deliveryOrderId}/${evidenceId}.${deliveryEvidenceExtension(input.mimeType)}`;
}
