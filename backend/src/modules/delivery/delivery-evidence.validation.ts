import { createHash } from 'node:crypto';
import { DeliveryEvidenceType } from '@prisma/client';

export const MAX_PHOTO_DATA_URL_LENGTH = 850_000;
export const MAX_PHOTO_SIZE_BYTES = 640_000;
export const MAX_PHOTO_DIMENSION = 4096;
export const MAX_CAPTURED_AT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_CAPTURED_AT_FUTURE_MS = 5 * 60 * 1000;

const PHOTO_DATA_URL_PATTERN =
  /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

export type DeliveryEvidenceValidationInput = {
  type: DeliveryEvidenceType;
  value: string;
  capturedAt: string;
};

export type DeliveryEvidenceMetadata = {
  source: 'data-url';
  width: number;
  height: number;
};

export type ValidatedDeliveryEvidence = {
  value: string;
  capturedAt: Date;
  mimeType: string | null;
  sha256: string | null;
  sizeBytes: number | null;
  metadata: DeliveryEvidenceMetadata | null;
  content: Buffer | null;
};

export type ParsedDeliveryPhoto = {
  value: string;
  mimeType: string;
  sha256: string;
  sizeBytes: number;
  metadata: DeliveryEvidenceMetadata;
  content: Buffer;
};

export function validateDeliveryEvidence(
  input: DeliveryEvidenceValidationInput,
  receivedAt = new Date(),
): ValidatedDeliveryEvidence {
  const value = input.value.trim();
  if (!value) {
    throw new Error('Evidence value is required');
  }

  const capturedAt = new Date(input.capturedAt);
  if (Number.isNaN(capturedAt.getTime())) {
    throw new Error('capturedAt must be a valid ISO date');
  }

  const capturedAtTime = capturedAt.getTime();
  const receivedAtTime = receivedAt.getTime();
  if (capturedAtTime > receivedAtTime + MAX_CAPTURED_AT_FUTURE_MS) {
    throw new Error('capturedAt cannot be more than 5 minutes in the future');
  }
  if (capturedAtTime < receivedAtTime - MAX_CAPTURED_AT_AGE_MS) {
    throw new Error('capturedAt cannot be older than 7 days');
  }

  if (input.type !== DeliveryEvidenceType.PHOTO) {
    return {
      value,
      capturedAt,
      mimeType: null,
      sha256: null,
      sizeBytes: null,
      metadata: null,
      content: null,
    };
  }

  const photo = parseDeliveryPhotoDataUrl(value);
  return {
    value: photo.value,
    capturedAt,
    mimeType: photo.mimeType,
    sha256: photo.sha256,
    sizeBytes: photo.sizeBytes,
    metadata: photo.metadata,
    content: photo.content,
  };
}

export function parseDeliveryPhotoDataUrl(value: string): ParsedDeliveryPhoto {
  const normalizedValue = value.trim();
  if (normalizedValue.length > MAX_PHOTO_DATA_URL_LENGTH) {
    throw new Error('PHOTO evidence exceeds the maximum data URL length');
  }

  const match = PHOTO_DATA_URL_PATTERN.exec(normalizedValue);
  if (!match) {
    throw new Error('PHOTO evidence must be a valid image data URL');
  }

  const declaredMimeType = normalizeMimeType(match[1]);
  const bytes = decodeBase64(match[2]);
  if (bytes.length > MAX_PHOTO_SIZE_BYTES) {
    throw new Error('PHOTO evidence exceeds the maximum binary size');
  }

  const actualMimeType = detectImageMimeType(bytes);
  if (!actualMimeType || actualMimeType !== declaredMimeType) {
    throw new Error(
      'PHOTO evidence MIME type does not match its binary content',
    );
  }

  const dimensions = readImageDimensions(bytes, actualMimeType);
  if (
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    dimensions.width > MAX_PHOTO_DIMENSION ||
    dimensions.height > MAX_PHOTO_DIMENSION
  ) {
    throw new Error(
      `PHOTO evidence dimensions must be between 1 and ${MAX_PHOTO_DIMENSION} pixels`,
    );
  }

  return {
    value: normalizedValue,
    mimeType: actualMimeType,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.length,
    metadata: {
      source: 'data-url',
      width: dimensions.width,
      height: dimensions.height,
    },
    content: bytes,
  };
}

function normalizeMimeType(mimeType: string) {
  return mimeType.toLowerCase() === 'image/jpg'
    ? 'image/jpeg'
    : mimeType.toLowerCase();
}

function decodeBase64(payload: string) {
  if (payload.length % 4 === 1) {
    throw new Error('PHOTO evidence contains invalid base64 data');
  }

  const bytes = Buffer.from(payload, 'base64');
  const normalizedPayload = payload.replace(/=+$/, '');
  const normalizedCanonical = bytes.toString('base64').replace(/=+$/, '');
  if (!bytes.length || normalizedPayload !== normalizedCanonical) {
    throw new Error('PHOTO evidence contains invalid base64 data');
  }
  return bytes;
}

function detectImageMimeType(bytes: Buffer) {
  if (
    bytes.length >= PNG_SIGNATURE.length &&
    bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function readImageDimensions(bytes: Buffer, mimeType: string) {
  switch (mimeType) {
    case 'image/png':
      return readPngDimensions(bytes);
    case 'image/jpeg':
      return readJpegDimensions(bytes);
    case 'image/webp':
      return readWebpDimensions(bytes);
    default:
      throw new Error('PHOTO evidence format is not supported');
  }
}

function readPngDimensions(bytes: Buffer) {
  if (bytes.length < 24 || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('PHOTO evidence PNG header is invalid');
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function readJpegDimensions(bytes: Buffer) {
  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;

    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segmentLength < 7) break;
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }

  throw new Error('PHOTO evidence JPEG header is invalid');
}

function readWebpDimensions(bytes: Buffer) {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = bytes.toString('ascii', offset, offset + 4);
    const chunkLength = bytes.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLength;
    if (dataEnd > bytes.length) break;

    if (chunkType === 'VP8X' && chunkLength >= 10) {
      return {
        width: 1 + bytes.readUIntLE(dataStart + 4, 3),
        height: 1 + bytes.readUIntLE(dataStart + 7, 3),
      };
    }
    if (chunkType === 'VP8L' && chunkLength >= 5 && bytes[dataStart] === 0x2f) {
      const bits =
        (bytes[dataStart + 1] |
          (bytes[dataStart + 2] << 8) |
          (bytes[dataStart + 3] << 16) |
          (bytes[dataStart + 4] << 24)) >>>
        0;
      return {
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >>> 14) & 0x3fff),
      };
    }
    if (chunkType === 'VP8 ') {
      for (let index = dataStart; index + 9 < dataEnd; index += 1) {
        if (
          bytes[index] === 0x9d &&
          bytes[index + 1] === 0x01 &&
          bytes[index + 2] === 0x2a
        ) {
          return {
            width: bytes.readUInt16LE(index + 3) & 0x3fff,
            height: bytes.readUInt16LE(index + 5) & 0x3fff,
          };
        }
      }
    }

    offset = dataEnd + (chunkLength % 2);
  }

  throw new Error('PHOTO evidence WebP header is invalid');
}
