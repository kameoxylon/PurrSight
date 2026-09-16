/**
 * PurrSight — eval harness.
 * ---------------------------------------------------------------------------
 * Runs every case in cases.json through the real assessImage pipeline and
 * reports what happened. Run with: npm run eval
 *
 * WHAT THIS IS FOR
 * Two questions, and only two: does the model stay quiet on comfortable cats
 * (over-scoring), and does it refuse junk input (gating). It cannot measure
 * sensitivity — see `about.whatThisCannotMeasure` in cases.json, and say that
 * to judges rather than quoting an accuracy number we have not earned.
 *
 * RESULTS ARE CACHED ON DISK, keyed by image bytes + prompt version + model.
 * A full pass is ~34 assessments x 3 samples ~= 102 billed calls (~$0.50 cold,
 * docs/MODEL-ACCESS.md), and the PROMPT-V0.1 verification checklist asks for
 * repeated passes. Without a cache the harness is too expensive to iterate on,
 * which in practice means it gets run once and then never again.
 *
 *   npm run eval              use the cache where possible
 *   npm run eval -- --fresh   ignore the cache and re-bill everything
 *   npm run eval -- --repeat 3  run each case 3x (checklist step 1)
 *   npm run eval -- --only tabby  filter case ids by substring
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ACTION_UNITS, ANALGESIA_THRESHOLD, type ActionUnitId } from '../src/lib/contract';
import type { AssessResult } from '../src/lib/contract';
// Safe to import statically: image-dimensions has no imports of its own, so it
// cannot pull in the env-reading provider client ahead of the env bootstrap.
import { MIN_IMAGE_EDGE, readImageDimensions } from '../src/lib/assess/image-dimensions';
import { resolveFgsSource, type FgsSource } from './fgs-source';

/* ===========================================================================
 * Env. Next.js loads .env.local automatically; a standalone tsx script does
 * not, so the credentials the client needs would simply be missing.
 * ======================================================================== */
for (const file of ['.env.local', '.env']) {
  const path = join(process.cwd(), file);
  if (!existsSync(path)) continue;
  try {
    process.loadEnvFile(path);
  } catch {
    // Older Node, or a file it refuses to parse. Fall back to a minimal
    // KEY=VALUE reader rather than failing the whole run.
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const key = m[1];
      if (process.env[key] !== undefined) continue;
      process.env[key] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const ROOT = process.cwd();
const EVAL_DIR = join(ROOT, 'eval');
const IMAGES_DIR = join(EVAL_DIR, 'images');
const CACHE_DIR = join(EVAL_DIR, '.cache');

/* ===========================================================================
 * Case definitions
 * ======================================================================== */

type Mode = 'assert' | 'observe';

interface Expectation {
  status?: 'assessed' | 'rejected';
  aboveThreshold?: boolean;
  rejectionReason?: string | string[];
  nullAus?: ActionUnitId[];
  /** Per-AU floor. Used by the FGS probe: a level-2 reference must not score 0. */
  auMin?: Partial<Record<ActionUnitId, number>>;
  /** Per-AU ceiling. A level-0 reference must not score 2. */
  auMax?: Partial<Record<ActionUnitId, number>>;
}

interface Case {
  id: string;
  file: string;
  group: string;
  mode: Mode;
  expect?: Expectation;
  note?: string;
  /** Resolved at load time; FGS cases live outside the repo. */
  baseDir?: string;
}

interface CasesFile {
  about: unknown;
  cases: Case[];
}

/* ===========================================================================
 * CLI
 * ======================================================================== */

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
function option(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

const FRESH = flag('fresh');
const ONLY = option('only');
const REPEAT = Math.max(1, Number(option('repeat') ?? 1) || 1);
/** Assessments in flight. Each is already 3 parallel calls internally. */
const CONCURRENCY = Math.max(1, Number(option('concurrency') ?? 3) || 3);

/* ===========================================================================
 * Cache
 * ======================================================================== */

/**
 * Fingerprint of the assessment pipeline's own source.
 *
 * WHY THIS IS IN THE CACHE KEY: promptVersion covers prompt changes, but not
 * changes to gating, scoring or aggregation. Without this, adding the
 * minimum-dimension gate would have gone unnoticed — every tiny96 case would
 * have kept serving its cached pre-gate "assessed" result and the eval would
 * have reported a fix that never ran. A stale pass is worse than no result.
 *
 * Hashing the sources means any pipeline edit invalidates automatically, with
 * nothing to remember to bump. Tests are excluded: they cannot change output.
 */
function pipelineFingerprint(): string {
  const dir = join(ROOT, 'src', 'lib', 'assess');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .sort();

  const h = createHash('sha256');
  for (const f of files) {
    h.update(f).update('\0').update(readFileSync(join(dir, f))).update('\0');
  }
  h.update(readFileSync(join(ROOT, 'src', 'lib', 'contract.ts')));
  return h.digest('hex').slice(0, 12);
}

const PIPELINE_FINGERPRINT = pipelineFingerprint();

function cacheKey(bytes: Buffer, promptVersion: string, model: string, run: number): string {
  return createHash('sha256')
    .update(bytes)
    .update('\0')
    .update(promptVersion)
    .update('\0')
    .update(model)
    .update('\0')
    .update(PIPELINE_FINGERPRINT)
    .update('\0')
    .update(String(run))
    .digest('hex')
    .slice(0, 32);
}

function readCache(key: string): AssessResult | null {
  const path = join(CACHE_DIR, `${key}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as AssessResult;
  } catch {
    return null;
  }
}

function writeCache(key: string, result: AssessResult) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify(result, null, 2));
}

/* ===========================================================================
 * Running
 * ======================================================================== */

interface Outcome {
  case: Case;
  run: number;
  result: AssessResult;
  cached: boolean;
  /** True when the pre-model size gate handled it, so no model call was billed. */
  gated?: boolean;
}

function mimeFor(file: string): string {
  if (/\.png$/i.test(file)) return 'image/png';
  if (/\.webp$/i.test(file)) return 'image/webp';
  return 'image/jpeg';
}

async function runCase(
  c: Case,
  run: number,
  assessImage: (i: { imageBase64: string; mimeType: string }) => Promise<AssessResult>,
  promptVersion: string,
  model: string,
): Promise<Outcome> {
  const path = join(c.baseDir ?? IMAGES_DIR, c.file);
  const bytes = readFileSync(path);
  const key = cacheKey(bytes, promptVersion, model, run);

  if (!FRESH) {
    const hit = readCache(key);
    if (hit) return { case: c, run, result: hit, cached: true };
  }

  const result = await assessImage({
    imageBase64: bytes.toString('base64'),
    mimeType: mimeFor(c.file),
  });

  // Did the pre-model size gate handle this? Determined from the image itself,
  // not from the rejection reason: the model ALSO emits image_quality for blur
  // and darkness, and those calls really were billed.
  const d = readImageDimensions(new Uint8Array(bytes));
  const gated = d !== null && Math.min(d.width, d.height) < MIN_IMAGE_EDGE;

  // Never cache a transient failure — a rate limit or a dead endpoint would
  // otherwise be frozen in as if it were a finding about the model.
  if (result.status !== 'error' || !result.retryable) {
    writeCache(key, result);
  }
  return { case: c, run, result, cached: false, gated };
}

/** Bounded worker pool; assessImage already fans out 3 calls internally. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/* ===========================================================================
 * Checking
 * ======================================================================== */

type Verdict = 'pass' | 'fail' | 'observed' | 'error';

function check(c: Case, r: AssessResult): { verdict: Verdict; detail: string } {
  if (r.status === 'error') {
    return { verdict: 'error', detail: `${r.kind}: ${r.message}` };
  }

  const auVector =
    r.status === 'assessed'
      ? ' ' +
        r.assessment.actionUnits
          .map((au) => `${au.id.slice(0, 2)}:${au.score ?? '-'}`)
          .join(' ')
      : '';

  const summary =
    r.status === 'rejected'
      ? `rejected/${r.reason}`
      : // The FGS probe is about individual AU values, not the total, so show them.
        `${r.assessment.normalizedScore.toFixed(2)} ${r.assessment.band}` +
        (c.group === 'fgs-sensitivity' ? auVector : '');

  if (c.mode === 'observe' || !c.expect) {
    return { verdict: 'observed', detail: summary };
  }

  const e = c.expect;
  const problems: string[] = [];

  if (e.status && r.status !== e.status) {
    problems.push(`expected ${e.status}, got ${r.status}`);
  }

  if (r.status === 'rejected' && e.rejectionReason) {
    const allowed = Array.isArray(e.rejectionReason) ? e.rejectionReason : [e.rejectionReason];
    if (!allowed.includes(r.reason)) {
      problems.push(`reason ${r.reason} not in [${allowed.join(', ')}]`);
    }
  }

  if (r.status === 'assessed') {
    const a = r.assessment;
    if (e.aboveThreshold !== undefined && a.aboveThreshold !== e.aboveThreshold) {
      problems.push(
        `aboveThreshold ${a.aboveThreshold} (normalized ${a.normalizedScore.toFixed(2)} vs ${ANALGESIA_THRESHOLD})`,
      );
    }
    if (e.nullAus) {
      for (const id of e.nullAus) {
        const au = a.actionUnits.find((x) => x.id === id);
        if (au && au.score !== null) {
          problems.push(`${id} scored ${au.score}, expected null (occluded)`);
        }
      }
    }

    // Tolerant per-AU bounds for the FGS reference probe. Exact-match would
    // flap on documented run-to-run variance; what these catch is inversion.
    for (const [id, min] of Object.entries(e.auMin ?? {})) {
      const au = a.actionUnits.find((x) => x.id === id);
      if (!au) continue;
      if (au.score === null) problems.push(`${id} was null, expected >= ${min}`);
      else if (au.score < min) problems.push(`${id} scored ${au.score}, expected >= ${min}`);
    }
    for (const [id, max] of Object.entries(e.auMax ?? {})) {
      const au = a.actionUnits.find((x) => x.id === id);
      if (!au) continue;
      if (au.score === null) problems.push(`${id} was null, expected <= ${max}`);
      else if (au.score > max) problems.push(`${id} scored ${au.score}, expected <= ${max}`);
    }
  }

  return problems.length === 0
    ? { verdict: 'pass', detail: summary }
    : { verdict: 'fail', detail: `${summary} — ${problems.join('; ')}` };
}

/* ===========================================================================
 * Reporting
 * ======================================================================== */

const ICON: Record<Verdict, string> = {
  pass: 'PASS',
  fail: 'FAIL',
  observed: ' -- ',
  error: 'ERR ',
};

function reportAus(outcomes: Outcome[]) {
  // Per-AU score distribution and null rate. This is the table the
  // PROMPT-V0.1 verification checklist (steps 1-4) actually needs, and the
  // reason the checklist could not be run before the harness existed.
  const assessed = outcomes.filter((o) => o.result.status === 'assessed');
  if (assessed.length === 0) return;

  console.log(`\nPer-AU distribution across ${assessed.length} assessed run(s)`);
  console.log(`  ${'AU'.padEnd(10)} ${'0'.padStart(5)} ${'1'.padStart(5)} ${'2'.padStart(5)} ${'null'.padStart(6)}  null rate`);

  for (const id of ACTION_UNITS) {
    const counts = { 0: 0, 1: 0, 2: 0, null: 0 };
    for (const o of assessed) {
      if (o.result.status !== 'assessed') continue;
      const au = o.result.assessment.actionUnits.find((x) => x.id === id);
      if (!au) continue;
      if (au.score === null) counts.null++;
      else counts[au.score]++;
    }
    const total = counts[0] + counts[1] + counts[2] + counts.null;
    const rate = total === 0 ? 0 : counts.null / total;
    console.log(
      `  ${id.padEnd(10)} ${String(counts[0]).padStart(5)} ${String(counts[1]).padStart(5)} ` +
        `${String(counts[2]).padStart(5)} ${String(counts.null).padStart(6)}  ${(rate * 100).toFixed(0)}%`,
    );
  }
}

function reportGroups(rows: { c: Case; verdict: Verdict }[]) {
  const groups = [...new Set(rows.map((r) => r.c.group))];
  console.log('\nBy group');
  for (const g of groups) {
    const inGroup = rows.filter((r) => r.c.group === g);
    const asserted = inGroup.filter((r) => r.c.mode === 'assert');
    const passed = asserted.filter((r) => r.verdict === 'pass').length;
    const errored = inGroup.filter((r) => r.verdict === 'error').length;
    const scope = asserted.length > 0 ? `${passed}/${asserted.length} asserted passed` : 'observation only';
    console.log(`  ${g.padEnd(14)} ${String(inGroup.length).padStart(3)} run(s)  ${scope}${errored ? `, ${errored} errored` : ''}`);
  }
}

/* ===========================================================================
 * Main
 * ======================================================================== */

async function main() {
  const casesFile = JSON.parse(readFileSync(join(EVAL_DIR, 'cases.json'), 'utf8')) as CasesFile;
  let cases = casesFile.cases.map((c) => ({ ...c, baseDir: IMAGES_DIR }));

  // Optional second set: the official FGS per-AU reference photographs. They
  // are (c) Universite de Montreal and this repo is public, so they are never
  // committed — they are resolved at run time from a local folder or a private
  // blob container. See eval/fgs-source.ts.
  const fgsCasesPath = join(EVAL_DIR, 'cases-fgs.json');
  let fgs: FgsSource | null = null;
  try {
    fgs = await resolveFgsSource(CACHE_DIR);
  } catch (err) {
    console.error(`\n${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  if (fgs && existsSync(fgsCasesPath)) {
    const fgsFile = JSON.parse(readFileSync(fgsCasesPath, 'utf8')) as CasesFile;
    cases = cases.concat(fgsFile.cases.map((c) => ({ ...c, baseDir: fgs!.dir })));
    console.log(`Including ${fgsFile.cases.length} FGS reference cases from ${fgs.origin}`);
  } else if (!fgs) {
    console.log(
      'No FGS reference source — skipping the FGS sensitivity probe.\n' +
        'Set FGS_REFERENCE_DIR (local folder) or FGS_REFERENCE_ACCOUNT (private blob).',
    );
  }

  if (ONLY) cases = cases.filter((c) => c.id.includes(ONLY));

  // A case pointing at a missing file is a broken eval, not a model finding.
  const missing = cases.filter((c) => !existsSync(join(c.baseDir ?? IMAGES_DIR, c.file)));
  if (missing.length > 0) {
    console.error(`\n${missing.length} case(s) reference missing images:`);
    for (const c of missing) console.error(`  ${c.id} -> ${join(c.baseDir ?? IMAGES_DIR, c.file)}`);
    console.error('\nRun `npx tsx eval/gen-corpus.ts` to regenerate the generated corpus.');
    process.exit(1);
  }

  // Images on disk that no case covers. Silently ignoring them would mean a
  // photo the user dropped in never actually gets run.
  const covered = new Set(casesFile.cases.map((c) => c.file));
  const orphans = existsSync(IMAGES_DIR)
    ? readdirSync(IMAGES_DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && !covered.has(f))
    : [];

  // Imported late and dynamically: the module builds a provider client from
  // env at import time, so it must not load before .env.local is applied.
  const { assessImage } = await import('../src/lib/assess/index');
  const { activePrompt } = await import('../src/lib/assess/prompt');
  const PROMPT_VERSION = activePrompt().version;
  const { getModelName } = await import('../src/lib/assess/client');

  let model: string;
  try {
    model = getModelName();
  } catch (err) {
    console.error(`\nCould not resolve the model from env: ${(err as Error).message}`);
    console.error('Check .env.local against .env.example (see docs/LOCAL-SETUP.md).');
    process.exit(1);
  }

  const jobs = cases.flatMap((c) => Array.from({ length: REPEAT }, (_, i) => ({ c, run: i })));

  console.log(
    `\nPurrSight eval — ${cases.length} case(s) x ${REPEAT} run(s) = ${jobs.length} assessment(s)`,
  );
  // Record the sampling regime, not just the model. Some models refuse
  // temperature 0 and force their own default, which makes cross-sample
  // agreement mean something different — see samplingParamsFor in client.ts.
  const { samplingParamsFor } = await import('../src/lib/assess/client');
  const temp = samplingParamsFor(model).temperature;
  const tempLabel = temp === undefined ? 'model default (not 0)' : String(temp);
  console.log(
    `prompt ${PROMPT_VERSION} · model ${model} · temperature ${tempLabel} · concurrency ${CONCURRENCY}${FRESH ? ' · CACHE BYPASSED' : ''}`,
  );

  const started = Date.now();
  const outcomes = await pool(jobs, CONCURRENCY, (j) =>
    runCase(j.c, j.run, assessImage, PROMPT_VERSION, model),
  );
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const rows = outcomes.map((o) => ({ ...o, ...check(o.case, o.result) }));

  console.log('\nResults');
  let lastGroup = '';
  for (const row of rows) {
    if (row.case.group !== lastGroup) {
      console.log(`\n  [${row.case.group}]`);
      lastGroup = row.case.group;
    }
    const tag = REPEAT > 1 ? `#${row.run + 1}` : '';
    console.log(
      `  ${ICON[row.verdict]} ${row.case.id.padEnd(22)}${tag.padEnd(4)}${row.cached ? 'c ' : '  '}${row.detail}`,
    );
  }

  reportGroups(rows.map((r) => ({ c: r.case, verdict: r.verdict })));
  reportAus(outcomes);

  const asserted = rows.filter((r) => r.case.mode === 'assert');
  const failed = asserted.filter((r) => r.verdict === 'fail');
  const errored = rows.filter((r) => r.verdict === 'error');
  const fresh = outcomes.filter((o) => !o.cached).length;

  console.log(
    `\n${asserted.length - failed.length}/${asserted.length} asserted case-runs passed · ` +
      `${rows.length - asserted.length} observed · ${errored.length} errored`,
  );
  // "fresh" is not the same as "billed": a case rejected by the pre-model gate
  // runs fresh but never reaches the model, so claiming it as spend would
  // overstate the cost of a pass.
  const gated = outcomes.filter((o) => !o.cached && o.gated).length;
  const billed = fresh - gated;
  const gatedNote = gated > 0 ? `, ${gated} gated before the model at no cost` : '';
  console.log(
    `${billed} model assessment(s)${gatedNote}, ${outcomes.length - fresh} from cache · ${elapsed}s`,
  );

  if (orphans.length > 0) {
    console.log(`\n${orphans.length} image(s) in eval/images/ have no case in cases.json:`);
    for (const f of orphans) console.log(`  ${f}`);
    console.log('Add them to cases.json so they actually get run.');
  }

  // Reminder rather than a result. The number above is a pass rate on gating
  // and over-scoring; it is not an accuracy figure, and there is no sensitivity
  // number here at all.
  // This footer is the one line most likely to be pasted into a slide, so it
  // must track what actually ran. The generated corpus alone cannot speak to
  // sensitivity; the FGS reference set can, but only weakly and only per-AU.
  const ranFgs = cases.some((c) => c.group === 'fgs-sensitivity');
  if (ranFgs) {
    console.log(
      '\nGenerated corpus: over-scoring and gating only.' +
        '\nFGS reference cases: a WEAK directional sensitivity probe. Those images are' +
        '\npublished FGS training material and are likely in the model training data, so a' +
        '\ncorrect score may be recall. Do not report this as accuracy on real painful cats.',
    );
  } else {
    console.log('\nThis set measures over-scoring and gating only. It cannot measure sensitivity.');
    console.log(
      'Set FGS_REFERENCE_DIR or FGS_REFERENCE_ACCOUNT to also run the per-AU FGS reference probe.',
    );
  }

  if (errored.length > 0 || failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
