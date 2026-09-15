/**
 * PurrSight — TAIL BEHAVIOUR CONTRACT
 * ---------------------------------------------------------------------------
 * A SEPARATE seam from the frozen Feline Grimace Scale contract in
 * `contract.ts`. That one is a validated clinical PAIN scale; this is a
 * playful, informational read of what a cat's TAIL is "saying" (position +
 * motion), grounded in common cat body-language references — NOT a medical
 * measurement. Keeping the two apart on purpose:
 *
 *   - contract.ts        face / pain / Feline Grimace Scale        (B owns)
 *   - tail-contract.ts   tail / behaviour / communication read     (this file)
 *
 * Unlike the FGS pipeline, tail behaviour is TEMPORAL — a thrashing tail and a
 * still one can share a single frame. So the input is an ORDERED list of
 * frames (one for a photo, several sampled across a short video) and the model
 * is told they are sequential.
 */

/* ===========================================================================
 * Tail states — the vocabulary the model must choose from
 * =========================================================================== */

export const TAIL_STATES = [
  'upright',
  'question_mark',
  'quiver',
  'wrapped',
  'neutral',
  'low',
  'tucked',
  'puffed',
  'swishing',
  'thrashing',
] as const;

export type TailState = (typeof TAIL_STATES)[number];

/**
 * Static, human-readable meaning for each state — the GENERIC body-language
 * interpretation. Lives in the contract so the UI and the pipeline agree on
 * the label/mood without the model having to (re)invent them. The model's own
 * per-cat, per-photo `interpretation` is layered on top of this.
 *
 * `emoji` is a lightweight visual only; the UI may ignore it.
 */
export const TAIL_STATE_META: Record<
  TailState,
  { label: string; mood: string; blurb: string; emoji: string }
> = {
  upright: {
    label: 'Tail held high',
    mood: 'Confident & friendly',
    blurb: 'A tail carried straight up usually signals a happy, confident cat that is pleased to see you.',
    emoji: '⬆️',
  },
  question_mark: {
    label: 'Question-mark curl',
    mood: 'Playful & curious',
    blurb: 'An upright tail with a hooked or curled tip is an invitation to play and a sign of a friendly mood.',
    emoji: '❓',
  },
  quiver: {
    label: 'Quivering tail',
    mood: 'Excited to see you',
    blurb: 'A tail held up and vibrating often means real excitement — a greeting reserved for favourite people.',
    emoji: '〰️',
  },
  wrapped: {
    label: 'Wrapped or curled',
    mood: 'Content & self-soothing',
    blurb: 'A tail wrapped around the body (or around you) reads as calm, content, and a little bit of “I’ve got this”.',
    emoji: '🌀',
  },
  neutral: {
    label: 'Relaxed & level',
    mood: 'Calm',
    blurb: 'A tail held roughly level and gently moving is a relaxed, at-ease cat going about its day.',
    emoji: '➡️',
  },
  low: {
    label: 'Tail held low',
    mood: 'Wary or unsure',
    blurb: 'A low-carried tail can mean the cat is uneasy or cautious — though some breeds simply hold their tails low.',
    emoji: '⬇️',
  },
  tucked: {
    label: 'Tucked away',
    mood: 'Anxious or scared',
    blurb: 'A tail tucked under the body or between the legs is a classic sign of fear, anxiety, or submission.',
    emoji: '🙈',
  },
  puffed: {
    label: 'Puffed up',
    mood: 'Startled or threatened',
    blurb: 'A bottle-brush, piloerect tail means the cat feels scared or threatened and is trying to look bigger.',
    emoji: '🎇',
  },
  swishing: {
    label: 'Slow swish',
    mood: 'Focused or mildly irritated',
    blurb: 'A slow, deliberate side-to-side swish signals intense focus (hunting mode) or the first hint of irritation.',
    emoji: '↔️',
  },
  thrashing: {
    label: 'Thrashing tail',
    mood: 'Agitated — give space',
    blurb: 'A fast whipping or thumping tail means agitation or overstimulation. This is a “please stop” from your cat.',
    emoji: '⚡',
  },
};

/* ===========================================================================
 * Motion + confidence
 * =========================================================================== */

/** How the tail is moving across the frames. 'unknown' for a single photo. */
export const TAIL_MOTIONS = ['still', 'slow', 'fast', 'unknown'] as const;
export type TailMotion = (typeof TAIL_MOTIONS)[number];

/** Coarse, honest confidence. We do NOT render a false-precision percentage. */
export type TailConfidence = 'low' | 'medium' | 'high';

/* ===========================================================================
 * Rejections — the model deliberately declining
 * =========================================================================== */

/** Reasons the MODEL can emit when it can't give a read. */
export const TAIL_MODEL_REJECTIONS = [
  'no_cat_detected',
  'tail_not_visible',
  'image_quality',
  'multiple_cats',
] as const;

export type TailRejectionReason = (typeof TAIL_MODEL_REJECTIONS)[number];

/* ===========================================================================
 * The A-side result shape (what the UI renders)
 * =========================================================================== */

export interface TailReading {
  state: TailState;
  /** From TAIL_STATE_META[state] — filled by the pipeline, not the model. */
  label: string;
  /** From TAIL_STATE_META[state]. */
  mood: string;
  /** Generic body-language meaning, from TAIL_STATE_META[state]. */
  blurb: string;
  motion: TailMotion;
  /** Concrete visual cues the model observed (e.g. "tip hooked forward"). */
  cues: string[];
  /** The model's per-cat, plain-language read of THIS clip/photo. */
  interpretation: string;
  confidence: TailConfidence;
}

export interface TailMeta {
  model: string;
  promptVersion: string;
  /** How many frames actually informed the read. */
  frames: number;
  source: 'photo' | 'video';
}

export type TailErrorKind =
  | 'timeout'
  | 'rate_limit'
  | 'bad_model_response'
  | 'upstream_unavailable'
  | 'internal';

export type TailResult =
  | { status: 'read'; reading: TailReading; meta: TailMeta }
  | {
      status: 'rejected';
      reason: TailRejectionReason;
      message: string;
      tips: string[];
    }
  | { status: 'error'; kind: TailErrorKind; message: string; retryable: boolean };

/* ===========================================================================
 * The A <-> pipeline seam
 * =========================================================================== */

/** Upper bound on frames sampled from a video. Keeps latency + cost sane. */
export const MAX_TAIL_FRAMES = 5;

export interface TailInput {
  /**
   * Ordered JPEG frames as base64 (NO data-URL prefix). One for a photo;
   * up to MAX_TAIL_FRAMES sampled across a short video, in time order.
   */
  frames: string[];
  /** Always 'image/jpeg' — frames are re-encoded client-side. */
  mimeType: string;
  source: 'photo' | 'video';
}

export type TailReadFn = (input: TailInput) => Promise<TailResult>;
