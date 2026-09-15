/**
 * Tests for the downloadable PDF report.
 *
 * The point of generating from the Assessment object rather than screenshotting
 * the DOM is that the text stays real text. These assertions check exactly
 * that: phrases are searchable in the produced bytes, which is what makes them
 * selectable and extractable in a reader.
 */
import { describe, expect, it } from 'vitest';
import { inflateSync } from 'zlib';
import { buildResultPdf } from './download-pdf';
import { fixtureHealthy, fixturePainful, fixturePartial } from './fixtures';
import type { Assessment } from './contract';

const healthy = (fixtureHealthy as Extract<typeof fixtureHealthy, { status: 'assessed' }>)
  .assessment;
const painful = (fixturePainful as Extract<typeof fixturePainful, { status: 'assessed' }>)
  .assessment;
const partial = (fixturePartial as Extract<typeof fixturePartial, { status: 'assessed' }>)
  .assessment;

function asText(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}

/**
 * PDF content streams are Flate-compressed, which is transparent to readers
 * but not to a raw byte search — so inflate them before inspecting.
 */
function inflateStreams(bytes: Uint8Array): string[] {
  const buf = Buffer.from(bytes);
  const out: string[] = [];
  const START = Buffer.from('stream');
  const END = Buffer.from('endstream');
  let pos = 0;

  while (pos < buf.length) {
    const idx = buf.indexOf(START, pos);
    if (idx === -1) break;
    // "endstream" contains "stream"; skip those or every scan stops at page one.
    if (idx >= 3 && buf.subarray(idx - 3, idx).toString('latin1') === 'end') {
      pos = idx + START.length;
      continue;
    }
    let start = idx + START.length;
    if (buf[start] === 0x0d) start += 1;
    if (buf[start] === 0x0a) start += 1;
    const end = buf.indexOf(END, start);
    if (end === -1) break;
    try {
      out.push(inflateSync(buf.subarray(start, end)).toString('latin1'));
    } catch {
      out.push(buf.subarray(start, end).toString('latin1'));
    }
    pos = end + END.length;
  }
  return out;
}

/**
 * Recover the drawn strings. pdf-lib writes standard-font text as hex strings
 * (`<48656C6C6F> Tj`), which is what a reader decodes when you select or search
 * the document — so decoding them here mirrors real extraction.
 */
function extractDrawnText(bytes: Uint8Array): string {
  const content = inflateStreams(bytes).join('\n');
  const pieces: string[] = [];

  for (const match of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
    pieces.push(Buffer.from(match[1], 'hex').toString('latin1'));
  }
  for (const match of content.matchAll(/\(((?:\\.|[^()\\])*)\)\s*Tj/g)) {
    pieces.push(match[1]);
  }
  return pieces.join(' ');
}

/**
 * Recover where each string was drawn, by tracking the `Tf` (font + size) and
 * `Tm` (position) operators that precede each `Tj`. Used to prove body text and
 * the footer occupy disjoint vertical bands.
 */
function extractPlacedText(bytes: Uint8Array): { size: number; y: number }[][] {
  return inflateStreams(bytes)
    .map((content) => {
      const placed: { size: number; y: number }[] = [];
      let size = 0;
      let y = 0;
      for (const line of content.split('\n')) {
        const tf = line.match(/\/\S+\s+([0-9.]+)\s+Tf/);
        if (tf) size = Number(tf[1]);
        const tm = line.match(/1 0 0 1 ([0-9.-]+) ([0-9.-]+) Tm/);
        if (tm) y = Number(tm[2]);
        if (/Tj/.test(line) && size > 0) placed.push({ size, y });
      }
      return placed;
    })
    .filter((placed) => placed.length > 0);
}

describe('buildResultPdf', () => {
  it('produces a valid PDF', async () => {
    const bytes = await buildResultPdf(healthy);
    expect(asText(bytes).startsWith('%PDF-')).toBe(true);
    expect(asText(bytes)).toContain('%%EOF');
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it('writes selectable text, not a rasterised image', async () => {
    const bytes = await buildResultPdf(healthy);
    const raw = asText(bytes);
    const content = inflateStreams(bytes).join('\n');

    // A screenshot-in-a-PDF would carry an image XObject and no text operators.
    expect(raw).not.toContain('/Subtype /Image');
    expect(raw).toContain('/Type /Font');
    expect(content).toMatch(/BT\s/);
    expect(content).toMatch(/Tj/);
  });

  it('makes the recommendation searchable', async () => {
    const bytes = await buildResultPdf(healthy);
    const drawn = extractDrawnText(bytes);

    // Match on a distinctive run of words rather than the whole string, since
    // long paragraphs are wrapped across several drawn lines.
    const firstWords = healthy.recommendation.split(' ').slice(0, 4).join(' ');
    expect(drawn).toContain(firstWords);
  });

  it('includes every action unit label and the section headings', async () => {
    const bytes = await buildResultPdf(painful);
    const drawn = extractDrawnText(bytes);

    for (const au of painful.actionUnits) {
      expect(drawn).toContain(au.label);
    }
    expect(drawn).toContain('Facial features we looked at');
    expect(drawn).toContain('What we recommend');
    expect(drawn).toContain('Score');
  });

  it('omits the find-a-vet link, which is meaningless on paper', async () => {
    const bytes = await buildResultPdf(painful);
    const drawn = extractDrawnText(bytes);

    expect(drawn).not.toContain('Find a vet near me');
    expect(asText(bytes)).not.toContain('google.com/maps');
    // The advice itself must survive - only the tap target goes.
    expect(drawn).toContain('veterinarian');
  });

  it('carries the disclaimer on the report', async () => {
    const drawn = extractDrawnText(await buildResultPdf(healthy));
    expect(drawn).toContain('not a diagnostic tool');
  });

  it('renders caveats under "Things to keep in mind"', async () => {
    const drawn = extractDrawnText(await buildResultPdf(painful));
    expect(painful.caveats.length).toBeGreaterThan(0);
    expect(drawn).toContain('Things to keep in mind');
  });

  it('handles an assessment with unscorable action units', async () => {
    const drawn = extractDrawnText(await buildResultPdf(partial));
    expect(partial.actionUnits.some((au) => au.score === null)).toBe(true);
    expect(drawn).toContain('Not assessable');
  });

  it('strips characters the standard PDF fonts cannot encode', async () => {
    // Free-form model output can contain anything; pdf-lib throws on
    // unencodable characters rather than skipping them.
    const spicy: Assessment = {
      ...healthy,
      recommendation: '🚨 Watch closely — 症状 café naïve ✓ then re-check 🐈',
      actionUnits: healthy.actionUnits.map((au) => ({
        ...au,
        evidence: `${au.evidence} 🌑🐾 ✨`,
      })),
    };

    const bytes = await buildResultPdf(spicy);
    const drawn = extractDrawnText(bytes);

    expect(drawn).toContain('Watch closely');
    // Latin-1 text survives; emoji and other scripts are dropped.
    expect(drawn).toContain('caf');
    expect(drawn).not.toContain('症');
  });

  it('paginates rather than overflowing when content is long', async () => {
    const wordy: Assessment = {
      ...painful,
      recommendation: 'Monitor your cat closely for changes in behaviour. '.repeat(60),
      actionUnits: painful.actionUnits.map((au) => ({
        ...au,
        evidence: `${au.evidence} `.repeat(25),
      })),
    };

    const bytes = await buildResultPdf(wordy);
    const pageCount = (asText(bytes).match(/\/Type \/Page[^s]/g) ?? []).length;
    expect(pageCount).toBeGreaterThan(1);
  });

  it('carries the full pain banner when the score is above threshold', async () => {
    const drawn = extractDrawnText(await buildResultPdf(painful));

    expect(painful.aboveThreshold).toBe(true);
    expect(drawn).toContain('This score suggests your cat may be in pain');
    // Regression: the body used to lose the words that shared a wrapped line
    // with the heading, so the sentence began mid-clause at "study recommended".
    expect(drawn).toContain(
      'The signs here are above the threshold where the original study recommended pain ' +
        'relief. If this matches how your cat is behaving, please contact a veterinarian.',
    );
  });

  it('never lets body text run into the footer', async () => {
    const crowded: Assessment = {
      ...painful,
      recommendation: 'Monitor your cat closely for changes in behaviour. '.repeat(60),
      actionUnits: painful.actionUnits.map((au) => ({
        ...au,
        evidence: `${au.evidence} `.repeat(25),
      })),
    };

    const pages = extractPlacedText(await buildResultPdf(crowded));
    expect(pages.length).toBeGreaterThan(1);

    for (const placed of pages) {
      // 7.5pt is used only by the footer; everything larger is body copy.
      const footer = placed.filter((t) => t.size === 7.5 && t.y < 200);
      const body = placed.filter((t) => t.size !== 7.5);
      if (footer.length === 0 || body.length === 0) continue;

      const footerTop = Math.max(...footer.map((t) => t.y));
      const bodyBottom = Math.min(...body.map((t) => t.y));
      expect(bodyBottom).toBeGreaterThan(footerTop);
    }
  });
});
