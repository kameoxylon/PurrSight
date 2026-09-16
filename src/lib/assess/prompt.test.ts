/**
 * prompt.ts claims, in its own header, that SYSTEM_PROMPT is "PORTED VERBATIM"
 * from docs/PROMPT-V<n>.md. Nothing enforced that, so the two could drift and
 * the doc would quietly stop describing what we actually send to the model —
 * which matters more than usual here, because `meta.promptVersion` is a
 * measurement label and the doc is what a reader checks it against.
 *
 * These tests make the claim checkable.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  PROMPT_VERSION,
  PROMPT_VERSION_FEWSHOT,
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_FEWSHOT,
} from './prompt';

const SPEC_PATH = join(process.cwd(), 'docs', `PROMPT-${PROMPT_VERSION.toUpperCase()}.md`);
const SPEC_PATH_FEWSHOT = join(
  process.cwd(),
  'docs',
  `PROMPT-${PROMPT_VERSION_FEWSHOT.toUpperCase()}.md`,
);

/** The first ```text fence under the "## System prompt" heading. */
function specSystemPrompt(path = SPEC_PATH): string {
  const md = readFileSync(path, 'utf8');
  const section = md.split(/^## System prompt\s*$/m)[1];
  expect(section, `no "## System prompt" heading in ${path}`).toBeDefined();

  const fence = section.match(/```text\r?\n([\s\S]*?)```/);
  expect(fence, `no \`\`\`text block under "## System prompt" in ${path}`).not.toBeNull();

  // Normalise line endings only. Any other difference is a real drift and
  // should fail: the whitespace alignment of the action-unit block is part of
  // what the model reads.
  return fence![1].replace(/\r\n/g, '\n').replace(/\n$/, '');
}

describe('prompt spec', () => {
  it('names a spec file that exists', () => {
    expect(() => readFileSync(SPEC_PATH, 'utf8')).not.toThrow();
  });

  it('SYSTEM_PROMPT is verbatim from the spec', () => {
    expect(SYSTEM_PROMPT.replace(/\r\n/g, '\n')).toBe(specSystemPrompt());
  });

  it('PROMPT_VERSION matches the version the spec file is named for', () => {
    expect(PROMPT_VERSION).toMatch(/^v\d+(\.\d+)?$/);
    expect(SPEC_PATH).toContain(PROMPT_VERSION.toUpperCase());
  });
});

describe('prompt content invariants', () => {
  // v0.2's whole point. Regressing either of these silently un-does the
  // revision while leaving the version label claiming otherwise.
  it('states the muzzle intermediate on the shape axis, not only as "mild tension"', () => {
    const muzzle = SYSTEM_PROMPT.match(/- muzzle:[\s\S]*?(?=\n- whiskers:)/)?.[0] ?? '';
    expect(muzzle).toContain('mild tension');
    expect(muzzle).toMatch(/flatten/i);
    expect(muzzle).toMatch(/not a 0/);
  });

  it('does not describe both whisker levels 0 and 1 with a bare "curved"', () => {
    const whiskers = SYSTEM_PROMPT.match(/- whiskers:[\s\S]*?(?=\n- head:)/)?.[0] ?? '';
    const zero = whiskers.match(/0 ([^\n]*)/)?.[1] ?? '';
    const one = whiskers.match(/1 ([\s\S]*?)(?=\n\s+2 )/)?.[1] ?? '';

    // Level 0 is anchored on the relaxed droop; level 1 on its absence. The
    // failure this guards against is the two reading as the same description.
    expect(zero).toMatch(/relaxed|droop|rest/i);
    expect(one).toMatch(/droop|straight/i);
    expect(zero).not.toBe(one);
  });

  it('forbids inferring whiskers from the surrounding face', () => {
    // Guards the observed occlusion hallucination: whiskers scored 1 on a
    // painted-over region. Whiskers has the worst specificity of the five AUs,
    // so an inferred whisker score is a false-positive source.
    expect(SYSTEM_PROMPT).toMatch(/Do not infer whisker position/);
  });

  it('keeps the 1-vs-null distinction ahead of the whiskers null carve-out', () => {
    // Order is load-bearing: the general rule has to land before the exception.
    const divider = SYSTEM_PROMPT.indexOf('THESE TWO CASES ARE DIFFERENT');
    const carveOut = SYSTEM_PROMPT.indexOf('Score whiskers only from whiskers');
    expect(divider).toBeGreaterThan(-1);
    expect(carveOut).toBeGreaterThan(divider);
  });

  it('still carries the published score-2 anchors', () => {
    expect(SYSTEM_PROMPT).toMatch(/less than 50% of the eye's width/);
    expect(SYSTEM_PROMPT).toMatch(/standing on end \(spiked\)/);
    expect(SYSTEM_PROMPT).toMatch(/elliptical shape/);
    expect(SYSTEM_PROMPT).toMatch(/chin toward\n\s+the chest/);
  });
});

/* ---------------------------------------------------------------------------
 * v0.3 — the rubric plus visual reference anchors.
 *
 * Without these, the only thing distinguishing v0.3 from v0.2 would be a
 * version string, and the label would be unfalsifiable: a regression that
 * dropped the anchors entirely would still report promptVersion v0.3.
 * ------------------------------------------------------------------------ */
describe('prompt v0.3 (few-shot)', () => {
  it('is verbatim from its own spec', () => {
    expect(SYSTEM_PROMPT_FEWSHOT.replace(/\r\n/g, '\n')).toBe(specSystemPrompt(SPEC_PATH_FEWSHOT));
  });

  it('tells the model the drawings are not the subject', () => {
    // The failure mode this change introduces: 16 cats in context, one to
    // score. Scoring a reference drawing instead would be silent and wrong.
    expect(SYSTEM_PROMPT_FEWSHOT).toMatch(/NOT\nTHE ANIMAL YOU ARE ASSESSING/);
    expect(SYSTEM_PROMPT_FEWSHOT).toMatch(/Assess ONLY the final photograph/);
  });

  it('states the anchor count and ordering the code actually sends', () => {
    // fewshot.ts emits 5 action units x 3 levels, ordered by AU then severity.
    // If either side changes without the other, the model is told one thing
    // and shown another.
    expect(SYSTEM_PROMPT_FEWSHOT).toMatch(/15 reference drawings/);
    expect(SYSTEM_PROMPT_FEWSHOT).toMatch(
      /ears 0, 1, 2, then eyes 0, 1, 2, then muzzle 0, 1, 2, then whiskers 0, 1, 2,\s*\n?\s*then head 0, 1, 2/,
    );
  });

  it('directs attention at the intermediate level, which is the hypothesis', () => {
    expect(SYSTEM_PROMPT_FEWSHOT).toMatch(/middle drawing/);
    expect(SYSTEM_PROMPT_FEWSHOT).toMatch(/is a 1, not a 0/);
  });

  it('keeps the rubric identical to v0.2 so the delta is attributable', () => {
    // Everything from the action-unit block onward must match v0.2 exactly.
    // If the rubric drifts too, an observed change cannot be attributed to the
    // anchors rather than to rewording.
    const from = (s: string) => s.slice(s.indexOf('Score each of 5 action units'));
    const v02 = from(SYSTEM_PROMPT);
    const v03 = from(SYSTEM_PROMPT_FEWSHOT);

    // v0.3 scopes the rejection sentence to the final photograph; that clause
    // is the only permitted divergence in the shared region.
    const normalise = (s: string) =>
      s.replace(/If (there is no cat|the final photograph has no cat)[\s\S]*$/, '<<rejection>>');
    expect(normalise(v03)).toBe(normalise(v02));
  });
});
