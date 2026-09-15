/**
 * Image dimension probe — reads width/height from the file header only.
 *
 * Why this exists: the eval found that 96px images sail through the gate and
 * come back scored. `tabby-tiny96` returned 0.40 "likely" — above the analgesia
 * threshold — from an image in which no human could judge muzzle tension. A
 * confident verdict on an unreadable image is the worst output this app can
 * produce, so it has to be stopped before the model is ever asked.
 *
 * Why not just ask the model: it demonstrably doesn't refuse. All three tiny96
 * cases were assessed rather than rejected, with 3/3 agreement. This is a
 * mechanical property of the input and belongs in code.
 *
 * Why hand-rolled instead of sharp: sharp is only a transitive Next.js
 * dependency, not one we declare, and it carries platform-specific binaries
 * that have already caused a Linux deploy problem once. Reading a handful of
 * header bytes needs no decoder and no dependency.
 *
 * Only the formats the route already allows are handled: JPEG, PNG, WebP.
 */

/**
 * Minimum acceptable length for the SHORTER edge, in pixels.
 *
 * Chosen from measurement, not taste. The eval ladder (3 cats x 5 sizes,
 * eval/cases.json group `resolution-boundary`) gives score against short edge:
 *
 *   short edge | tabby | grey | calico
 *   -----------|-------|------|--------------------
 *   640/960/720|  0.20 | 0.00 | baseline
 *   256/384/288|  0.20 | 0.00 | 0.00
 *   149/224/168|  0.20 | 0.00 | 0.10   (drifting)
 *   107/160/120|  0.20 | 0.00 | self-rejected
 *    64/ 96/ 72|  0.40 | 0.00 | 0.20   (BOTH WRONG)
 *
 * Confidently wrong output appears only at a short edge of 72 or less, where
 * the tabby DOUBLED to 0.40 and crossed the analgesia threshold. 200 sits well
 * clear of that, and above the 168 where the calico first started drifting.
 *
 * The ceiling on this number is what real uploads look like. The client
 * downscales the LONG edge to 1024 and never upscales, so an ordinary 4:3 phone
 * photo arrives at 1024x768 and a 16:9 one at 1024x576. Both are far above 200,
 * so this gate should never fire on a genuine photo — only on a thumbnail, an
 * avatar crop, or a deliberately degraded input.
 */
export const MIN_IMAGE_EDGE = 200;

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Parse width/height from an image header.
 *
 * Returns null when the header cannot be read. Callers MUST fail open on null:
 * the MIME type is already validated upstream, so an unreadable header is far
 * more likely to be a format quirk than an attack, and refusing a real photo is
 * a worse outcome than letting one odd file through to the model.
 */
export function readImageDimensions(bytes: Uint8Array): ImageDimensions | null {
  return readPng(bytes) ?? readJpeg(bytes) ?? readWebp(bytes);
}

function u16be(b: Uint8Array, i: number): number {
  return (b[i] << 8) | b[i + 1];
}

function u32be(b: Uint8Array, i: number): number {
  // >>> 0 keeps this unsigned; << 24 alone would sign-extend.
  return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
}

function ascii(b: Uint8Array, i: number, len: number): string {
  let s = '';
  for (let k = 0; k < len; k++) s += String.fromCharCode(b[i + k]);
  return s;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readPng(b: Uint8Array): ImageDimensions | null {
  if (b.length < 24) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (b[i] !== PNG_SIGNATURE[i]) return null;
  }
  // IHDR must be the first chunk, so width/height sit at a fixed offset.
  if (ascii(b, 12, 4) !== 'IHDR') return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function readJpeg(b: Uint8Array): ImageDimensions | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;

  let i = 2;
  while (i < b.length - 9) {
    if (b[i] !== 0xff) {
      i++; // resync past padding or entropy-coded bytes
      continue;
    }
    const marker = b[i + 1];

    // Standalone markers: no length field, so don't try to skip one.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // EOI / start of scan

    const length = u16be(b, i + 2);
    if (length < 2) return null;

    // SOF0..SOF15 carry the frame size. C4 (DHT), C8 (JPG) and CC (DAC) share
    // the range but are not frame headers.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 9 > b.length) return null;
      return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
    }

    i += 2 + length;
  }
  return null;
}

function readWebp(b: Uint8Array): ImageDimensions | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;

  const chunk = ascii(b, 12, 4);

  if (chunk === 'VP8 ') {
    // Lossy. 3-byte start code, then 14-bit width and height, little-endian.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return {
      width: (b[26] | (b[27] << 8)) & 0x3fff,
      height: (b[28] | (b[29] << 8)) & 0x3fff,
    };
  }

  if (chunk === 'VP8L') {
    // Lossless. After the 0x2f signature, 14 bits of width-1 then 14 of height-1.
    if (b[20] !== 0x2f) return null;
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
    };
  }

  if (chunk === 'VP8X') {
    // Extended. Canvas size as two 24-bit little-endian values, each minus 1.
    const w = b[24] | (b[25] << 8) | (b[26] << 16);
    const h = b[27] | (b[28] << 8) | (b[29] << 16);
    return { width: w + 1, height: h + 1 };
  }

  return null;
}
