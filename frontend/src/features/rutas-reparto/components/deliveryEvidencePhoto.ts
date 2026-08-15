const MAX_PHOTO_DATA_URL_LENGTH = 850_000;
const MAX_PHOTO_DIMENSION = 1280;
const PHOTO_QUALITIES = [0.82, 0.68, 0.52] as const;
const PHOTO_DATA_URL_PATTERN = /^data:image\/(?:jpeg|jpg|png|webp);base64,/i;

function readAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("No se pudo convertir la imagen."));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onerror = () =>
      reject(new Error("El formato de la imagen no es compatible."));
    image.onload = () => resolve(image);
    image.src = dataUrl;
  });
}

function validatePhotoDataUrl(dataUrl: string) {
  if (!PHOTO_DATA_URL_PATTERN.test(dataUrl)) {
    throw new Error("La evidencia debe ser una imagen.");
  }
  if (dataUrl.length > MAX_PHOTO_DATA_URL_LENGTH) {
    throw new Error("La foto es demasiado grande. Selecciona otra imagen.");
  }
  return dataUrl;
}

async function canvasDataUrl(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<string | null> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  return blob ? readAsDataUrl(blob) : null;
}

export async function preparePhotoEvidence(file: File) {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    throw new Error("Selecciona una foto JPG, PNG o WebP.");
  }

  const originalDataUrl = await readAsDataUrl(file);

  if (typeof document === "undefined" || typeof Image === "undefined") {
    return validatePhotoDataUrl(originalDataUrl);
  }

  let image: HTMLImageElement;
  try {
    image = await loadImage(originalDataUrl);
  } catch {
    throw new Error("No se pudo procesar la foto. Usa JPG, PNG o WebP.");
  }

  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(longestSide, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext("2d");
  if (!context) return validatePhotoDataUrl(originalDataUrl);

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const quality of PHOTO_QUALITIES) {
    const compressedDataUrl = await canvasDataUrl(canvas, quality);
    if (
      compressedDataUrl &&
      compressedDataUrl.length <= MAX_PHOTO_DATA_URL_LENGTH
    ) {
      return compressedDataUrl;
    }
  }

  throw new Error("La foto es demasiado grande. Selecciona otra imagen.");
}

export function isPhotoDataUrl(value?: string | null) {
  return Boolean(value && PHOTO_DATA_URL_PATTERN.test(value));
}
