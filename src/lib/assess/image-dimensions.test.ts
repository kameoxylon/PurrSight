/**
 * Tests for the image dimension probe.
 *
 * The JPEG cases read REAL files out of eval/images/ rather than synthetic
 * headers. Those are the exact images the eval runs, including the tiny96 ones
 * that exposed the gate hole, so if the parser disagrees with them the gate is
 * wrong about the only inputs we have evidence for.
 *
 * PNG and WebP are built by hand: the repo has no committed fixtures in those
 * formats, and the header layouts are small enough to state exactly.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readImageDimensions } from './image-dimensions';

const IMAGES = join(process.cwd(), 'eval', 'images');

function image(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(IMAGES, name)));
}

describe('readImageDimensions — JPEG, against real eval corpus files', () => {
  it('reads a full-size baseline', () => {
    const d = readImageDimensions(image('tabby-baseline.jpg'));
    expect(d).not.toBeNull();
    // The corpus caps the long edge at the app's MAX_EDGE but never upscales,
    // so this is 960 rather than 1024 — the source photo was already smaller.
    expect(Math.max(d!.width, d!.height)).toBe(960);
    expect(Math.min(d!.width, d!.height)).toBeGreaterThan(200);
  });

  it('reads the 384px case the pipeline handles correctly', () => {
    expect(readImageDimensions(image('tabby-small384.jpg'))?.width).toBe(384);
  });

  it('reads the 96px case that slipped through the gate', () => {
    const d = readImageDimensions(image('tabby-tiny96.jpg'));
    expect(d?.width).toBe(96);
    // The whole point of the gate: this must be distinguishable from 384.
    expect(d!.width).toBeLessThan(384);
  });

  it('reads every JPEG in the corpus without returning null', () => {
    for (const name of ['grey-tiny96.jpg', 'calico-tiny96.jpg', 'grey-baseline.jpg']) {
      const d = readImageDimensions(image(name));
      expect(d, name).not.toBeNull();
      expect(d!.width, name).toBeGreaterThan(0);
      expect(d!.height, name).toBeGreaterThan(0);
    }
  });
});

describe('readImageDimensions — PNG', () => {
  function png(width: number, height: number): Uint8Array {
    const b = new Uint8Array(24);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    b.set([0, 0, 0, 13], 8); // IHDR length
    b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
    new DataView(b.buffer).setUint32(16, width);
    new DataView(b.buffer).setUint32(20, height);
    return b;
  }

  it('reads IHDR width and height', () => {
    expect(readImageDimensions(png(300, 370))).toEqual({ width: 300, height: 370 });
  });

  it('handles dimensions above the signed 16-bit range', () => {
    expect(readImageDimensions(png(40000, 30000))).toEqual({ width: 40000, height: 30000 });
  });

  it('rejects a PNG signature without IHDR first', () => {
    const b = png(100, 100);
    b.set([0x49, 0x44, 0x41, 0x54], 12); // "IDAT"
    expect(readImageDimensions(b)).toBeNull();
  });
});

describe('readImageDimensions — WebP', () => {
  function riff(chunk: string, payload: number[]): Uint8Array {
    const b = new Uint8Array(Math.max(30, 12 + 4 + payload.length));
    const put = (s: string, at: number) => {
      for (let i = 0; i < s.length; i++) b[at + i] = s.charCodeAt(i);
    };
    put('RIFF', 0);
    put('WEBP', 8);
    put(chunk, 12);
    b.set(payload, 16);
    return b;
  }

  it('reads a lossy VP8 header', () => {
    // Payload starts at 16; the start code sits at 23.
    const p = new Array(20).fill(0);
    p[7] = 0x9d;
    p[8] = 0x01;
    p[9] = 0x2a;
    p[10] = 320 & 0xff;
    p[11] = 320 >> 8;
    p[12] = 240 & 0xff;
    p[13] = 240 >> 8;
    expect(readImageDimensions(riff('VP8 ', p))).toEqual({ width: 320, height: 240 });
  });

  it('reads a lossless VP8L header', () => {
    const p = new Array(20).fill(0);
    p[4] = 0x2f; // signature at absolute offset 20
    const bits = (640 - 1) | ((480 - 1) << 14);
    p[5] = bits & 0xff;
    p[6] = (bits >>> 8) & 0xff;
    p[7] = (bits >>> 16) & 0xff;
    p[8] = (bits >>> 24) & 0xff;
    expect(readImageDimensions(riff('VP8L', p))).toEqual({ width: 640, height: 480 });
  });

  it('reads an extended VP8X canvas size', () => {
    const p = new Array(20).fill(0);
    const w = 1024 - 1;
    const h = 768 - 1;
    p[8] = w & 0xff; // absolute offset 24
    p[9] = (w >> 8) & 0xff;
    p[10] = (w >> 16) & 0xff;
    p[11] = h & 0xff;
    p[12] = (h >> 8) & 0xff;
    p[13] = (h >> 16) & 0xff;
    expect(readImageDimensions(riff('VP8X', p))).toEqual({ width: 1024, height: 768 });
  });
});

describe('readImageDimensions — unreadable input returns null so callers fail open', () => {
  it('returns null for empty input', () => {
    expect(readImageDimensions(new Uint8Array(0))).toBeNull();
  });

  it('returns null for non-image bytes', () => {
    expect(readImageDimensions(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
  });

  it('returns null for a truncated JPEG with no frame header', () => {
    expect(readImageDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBeNull();
  });

  it('does not loop forever on a JPEG whose segments never terminate', () => {
    const b = new Uint8Array(4096).fill(0xff);
    b[0] = 0xff;
    b[1] = 0xd8;
    expect(readImageDimensions(b)).toBeNull();
  });
});
