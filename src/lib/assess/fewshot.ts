/**
 * PurrSight — FGS visual reference anchors (few-shot).
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS. Prompt v0.2 rewrote the level-1 action unit descriptors in
 * prose to stop the model collapsing level 1 to 0. It did not work, and neither
 * gpt-5.1 nor gpt-5.4 fixed it either (docs/MODEL-COMPARISON.md). Human raters
 * do not learn the intermediate level from words — they learn it from the
 * scale's reference images. This module supplies those images.
 *
 * ⚠️ LICENCE. The FGS reference material is © Université de Montréal, all
 * rights reserved. **No FGS image is committed to this repository, ever** — it
 * is public. Images are resolved at run time from a directory outside the repo,
 * and .gitignore covers the cache location. Do not "simplify" this by checking
 * them in.
 *
 * WHICH IMAGES. The `_guide` line drawings only, never the `_sample1`
 * photographs. That split is load-bearing, not arbitrary: the 15 photographs
 * are the eval's only sensitivity probe (eval/cases-fgs.json). Using them as
 * anchors would mean testing the model on examples it had just been shown, and
 * would destroy the one measurement that tells us whether any of this works.
 * Line drawings in, photographs held out.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { ACTION_UNITS, type ActionUnitId } from '../contract';

/** Filename stem used by the published reference set -> our action unit id. */
const FILE_STEM_TO_AU: Record<string, ActionUnitId> = {
  earposition: 'ears',
  orbitaltightening: 'eyes',
  muzzletension: 'muzzle',
  whiskersposition: 'whiskers',
  headposition: 'head',
};

/** The published level names, in ascending severity. */
const LEVELS = ['absent_0', 'moderatelypresent_1', 'markedlypresent_2'] as const;

export interface Anchor {
  au: ActionUnitId;
  score: 0 | 1 | 2;
  dataUrl: string;
}

/**
 * Where the reference images live. Kept as a plain directory read so `src/`
 * gains no new production dependency: whoever runs the app is responsible for
 * putting the files there. The eval harness already syncs them from the private
 * container into eval/.cache/fgs, which is the default.
 */
function anchorDir(): string | null {
  const explicit = process.env.FGS_FEWSHOT_DIR ?? process.env.FGS_REFERENCE_DIR;
  if (explicit && existsSync(explicit)) return explicit;

  const cached = join(process.cwd(), 'eval', '.cache', 'fgs');
  return existsSync(cached) ? cached : null;
}

/** Few-shot is opt-in. Off reproduces the v0.2 request exactly. */
export function fewShotEnabled(): boolean {
  const v = (process.env.FGS_FEWSHOT ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

let cached: Anchor[] | null = null;
let attempted = false;

/**
 * Loads the 15 guide images once and holds them in module scope. Re-reading
 * and re-encoding ~500 KB on every assessment would add latency for nothing;
 * the images never change.
 *
 * Returns null when the anchors are unavailable. Callers MUST fail open and
 * fall back to the no-anchor request rather than failing the assessment — a
 * missing reference directory is an operator problem, not a reason to refuse
 * to look at someone's cat.
 */
export function loadAnchors(): Anchor[] | null {
  if (attempted) return cached;
  attempted = true;

  const dir = anchorDir();
  if (!dir) return null;

  const present = new Set(readdirSync(dir));
  const out: Anchor[] = [];

  // Ordered by action unit, then ascending severity, so the anchor block reads
  // in the same order as the rubric in the system prompt.
  for (const au of ACTION_UNITS) {
    const stem = Object.keys(FILE_STEM_TO_AU).find((k) => FILE_STEM_TO_AU[k] === au);
    if (!stem) continue;

    for (const level of LEVELS) {
      const file = `${stem}_${level}_guide.png`;
      if (!present.has(file)) return null; // partial sets would teach a skewed scale
      const bytes = readFileSync(join(dir, file));
      out.push({
        au,
        score: Number(level.slice(-1)) as 0 | 1 | 2,
        dataUrl: `data:image/png;base64,${bytes.toString('base64')}`,
      });
    }
  }

  if (out.length !== ACTION_UNITS.length * LEVELS.length) return null;
  cached = out;
  return cached;
}

/** Test seam: forget the module-scope cache. */
export function resetAnchorCache(): void {
  cached = null;
  attempted = false;
}
