/**
 * Client-side keyframe extraction for the tail feature.
 *
 * gpt-4.1 vision takes images, not video — and uploading a raw phone clip to a
 * Free-tier App Service (10 MB route cap) is unreliable. So we decode the video
 * IN THE BROWSER, sample a handful of frames across it, downscale + JPEG-encode
 * each on a <canvas>, and upload those. Reuses the exact approach in
 * prepare-image.ts, just seeked to several timestamps.
 */
import { MAX_EDGE, OUTPUT_MIME, OUTPUT_QUALITY } from './prepare-image';

export class UnsupportedVideoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedVideoError';
  }
}

export interface ExtractedFrame {
  blob: Blob;
  /** Object URL for previewing; caller must revokeObjectURL. */
  previewUrl: string;
}

const DEFAULT_FRAME_COUNT = 5;

function scaledSize(w: number, h: number): { width: number; height: number } {
  const longest = Math.max(w, h);
  if (longest <= MAX_EDGE) return { width: w, height: h };
  const scale = MAX_EDGE / longest;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/**
 * Decode a video file and return up to `count` frames sampled evenly across
 * the middle ~90% of its duration (skipping the very start/end, which are
 * often black or blurred).
 */
export async function extractFrames(
  file: File,
  count = DEFAULT_FRAME_COUNT,
): Promise<ExtractedFrame[]> {
  if (!file.type.startsWith('video/')) {
    throw new UnsupportedVideoError('That doesn’t look like a video file. Please upload an MP4, MOV, or WebM.');
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await waitFor(video, 'loadedmetadata', 'We couldn’t read that video. Try a different format (MP4/MOV/WebM).');

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new UnsupportedVideoError('That video appears to be empty or unreadable.');
    }

    const { width, height } = scaledSize(video.videoWidth, video.videoHeight);
    if (!width || !height) {
      throw new UnsupportedVideoError('That video has no visible picture we can read.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new UnsupportedVideoError('Your browser could not process this video.');

    const timestamps = frameTimestamps(duration, count);
    const frames: ExtractedFrame[] = [];

    for (const t of timestamps) {
      await seek(video, t);
      ctx.drawImage(video, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, OUTPUT_MIME, OUTPUT_QUALITY),
      );
      if (blob) frames.push({ blob, previewUrl: URL.createObjectURL(blob) });
    }

    if (frames.length === 0) {
      throw new UnsupportedVideoError('We couldn’t capture any frames from that video.');
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}

/** Even samples across the middle 90% of the clip. */
function frameTimestamps(duration: number, count: number): number[] {
  const start = duration * 0.05;
  const end = duration * 0.95;
  if (count <= 1) return [(start + end) / 2];
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, i) => start + i * step);
}

function waitFor(el: HTMLMediaElement, event: string, errMsg: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new UnsupportedVideoError(errMsg));
    };
    const cleanup = () => {
      el.removeEventListener(event, onOk);
      el.removeEventListener('error', onErr);
    };
    el.addEventListener(event, onOk, { once: true });
    el.addEventListener('error', onErr, { once: true });
  });
}

/** Seek to a timestamp and resolve once the frame at that time is ready. */
function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new UnsupportedVideoError('We hit an error while reading the video.'));
    };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onErr, { once: true });
    video.currentTime = Math.min(time, Math.max(0, video.duration - 0.01));
  });
}
