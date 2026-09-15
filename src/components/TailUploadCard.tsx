'use client';

import { useCallback, useRef, useState } from 'react';
import { prepareImage, UnsupportedImageError } from '@/lib/prepare-image';
import { extractFrames, UnsupportedVideoError } from '@/lib/extract-frames';
import { MAX_TAIL_FRAMES } from '@/lib/tail-contract';

/** One prepared frame plus its preview URL. */
interface Frame {
  blob: Blob;
  previewUrl: string;
}

/**
 * Tail upload surface. Accepts a photo OR a short video. A video is decoded in
 * the browser and sampled into a few JPEG frames (tail behaviour is temporal,
 * so several frames capture motion). A photo becomes a single frame.
 */
export default function TailUploadCard({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (frames: Blob[], source: 'photo' | 'video') => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [source, setSource] = useState<'photo' | 'video'>('photo');
  const [preparing, setPreparing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearFrames = useCallback((next: Frame[]) => {
    setFrames((old) => {
      for (const f of old) URL.revokeObjectURL(f.previewUrl);
      return next;
    });
  }, []);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError(null);
      setPreparing(true);
      try {
        if (file.type.startsWith('video/')) {
          const extracted = await extractFrames(file, MAX_TAIL_FRAMES);
          setSource('video');
          clearFrames(extracted.map((e) => ({ blob: e.blob, previewUrl: e.previewUrl })));
        } else {
          const prepared = await prepareImage(file);
          setSource('photo');
          clearFrames([{ blob: prepared.blob, previewUrl: prepared.previewUrl }]);
        }
      } catch (e) {
        const msg =
          e instanceof UnsupportedImageError || e instanceof UnsupportedVideoError
            ? e.message
            : 'That file could not be read. Please try a JPEG/PNG photo or an MP4/MOV video.';
        setError(msg);
        clearFrames([]);
      } finally {
        setPreparing(false);
      }
    },
    [clearFrames],
  );

  const reset = () => {
    clearFrames([]);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const hasFrames = frames.length > 0;

  return (
    <div className="mx-auto max-w-xl">
      {!hasFrames ? (
        <>
          <button
            type="button"
            disabled={disabled || preparing}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            className={`flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition ${
              dragOver ? 'border-brand bg-brand/5' : 'border-line bg-card hover:bg-surface-2'
            } disabled:opacity-60`}
          >
            <span className="text-5xl" aria-hidden>
              🐈
            </span>
            <span className="text-lg font-semibold text-ink">
              {preparing ? 'Reading your file…' : 'Upload a photo or video of your cat'}
            </span>
            <span className="text-xs text-faint">
              Photo (JPEG, PNG, WebP) or a short video (MP4, MOV, WebM) · the whole tail in frame works
              best
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-card p-4">
            <p className="mb-3 text-center text-xs font-medium text-muted">
              {source === 'video'
                ? `${frames.length} frame${frames.length > 1 ? 's' : ''} captured from your video`
                : 'Your photo'}
            </p>
            <div
              className={
                source === 'video'
                  ? 'flex gap-2 overflow-x-auto pb-1'
                  : 'mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-surface-2'
              }
            >
              {frames.map((f, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={f.previewUrl}
                  src={f.previewUrl}
                  alt={source === 'video' ? `Frame ${i + 1}` : 'Your cat'}
                  className={
                    source === 'video'
                      ? 'h-24 w-24 flex-none rounded-lg border border-line object-cover'
                      : 'h-full w-full object-cover'
                  }
                />
              ))}
            </div>
          </div>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSubmit(frames.map((f) => f.blob), source)}
              className="rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-hover disabled:opacity-60"
            >
              Read the tail
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={reset}
              className="rounded-full border border-line bg-card px-6 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2 disabled:opacity-60"
            >
              Choose another
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
