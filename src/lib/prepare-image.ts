/**
 * Client-side image preparation. Runs in the browser before upload.
 *
 * Why: phone photos are 4–12 MB. Downscaling the longest edge to ~1024px on a
 * <canvas> before upload cuts latency and token cost substantially (PLAN,
 * Phase 1). We also catch the iPhone .heic case, which many browsers cannot
 * decode in a canvas, and surface a friendly message instead of dying silently.
 */

export const MAX_EDGE = 1024;
export const OUTPUT_MIME = 'image/jpeg';
export const OUTPUT_QUALITY = 0.9;

export class UnsupportedImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedImageError';
  }
}

export interface PreparedImage {
  /** Downscaled JPEG ready to POST. */
  blob: Blob;
  /** Object URL for previewing the prepared image. Caller must revokeObjectURL. */
  previewUrl: string;
  width: number;
  height: number;
}

function looksLikeHeic(file: File): boolean {
  const t = file.type.toLowerCase();
  if (t === 'image/heic' || t === 'image/heif') return true;
  return /\.(heic|heif)$/i.test(file.name);
}

/**
 * Decode, downscale, and re-encode an image file to a JPEG blob.
 * Throws UnsupportedImageError for HEIC/HEIF or any file the browser can't decode.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (looksLikeHeic(file)) {
    throw new UnsupportedImageError(
      'This looks like an iPhone HEIC photo, which browsers can’t read directly. Please upload a JPEG or PNG (in iPhone: Settings → Camera → Formats → Most Compatible, or share the photo which converts it).',
    );
  }

  const bitmap = await decode(file);
  const { width, height } = scaledSize(bitmap.width, bitmap.height);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new UnsupportedImageError('Your browser could not process this image. Try a different one.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, OUTPUT_MIME, OUTPUT_QUALITY),
  );
  if (!blob) throw new UnsupportedImageError('Your browser could not process this image. Try a different one.');

  return { blob, previewUrl: URL.createObjectURL(blob), width, height };
}

function scaledSize(w: number, h: number): { width: number; height: number } {
  const longest = Math.max(w, h);
  if (longest <= MAX_EDGE) return { width: w, height: h };
  const scale = MAX_EDGE / longest;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/** Prefer createImageBitmap; fall back to <img> for older browsers. */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> */
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new UnsupportedImageError('That image could not be read. Please upload a JPEG or PNG.'));
    };
    img.src = url;
  });
}
