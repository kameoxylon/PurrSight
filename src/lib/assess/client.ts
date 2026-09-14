/**
 * PurrSight — MODEL CLIENT (one sample, one call)
 * ---------------------------------------------------------------------------
 * The only file that talks to a model provider. Everything above it
 * (index.ts) deals in parsed, validated results; everything below it
 * (scoring.ts) is pure arithmetic. That boundary is deliberate: the ensemble
 * and the vote rules stay testable offline.
 *
 * Responsibilities:
 *   1. Build a provider client from env (azure | openai | github) — names come
 *      from .env.example, which is the source of truth for env var NAMES.
 *   2. Make ONE scored call with temperature 0 and strict structured output.
 *   3. Validate the payload (schema.ts) and RETRY ONCE on a parse failure.
 *   4. Translate every failure into an AssessErrorKind. Never throw.
 *
 * TIMEOUT BUDGET: ASSESS_TIMEOUT_MS is the budget for the WHOLE sample,
 * retry included — not per attempt. A retry borrows what is left. Without
 * this, one bad sample could burn 2x the timeout and blow the demo's latency.
 */
import { AzureOpenAI, OpenAI } from 'openai';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import type { AssessErrorKind, AssessInput } from '../contract';
import { SYSTEM_PROMPT, USER_PROMPT } from './prompt';
import {
  EMPTY_USAGE,
  addUsage,
  estimateCostUsd,
  formatUsd,
  type TokenUsage,
} from './pricing';
import { FGS_JSON_SCHEMA, parseModelResponse, type ValidatedResponse } from './schema';

/**
 * Outcome of a SINGLE sample. Failures are values, never exceptions.
 *
 * `usage` is reported on BOTH branches: a response that failed validation was
 * still generated and still billed, and the retry bills again. Dropping it on
 * failure would understate cost exactly when cost is highest.
 */
export type RunOutcome =
  | { ok: true; value: ValidatedResponse; usage: TokenUsage }
  | { ok: false; kind: AssessErrorKind; detail: string; usage: TokenUsage };

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_OUTPUT_TOKENS = 1_000;

/**
 * Don't start a retry that cannot plausibly finish. A call takes 5-7s
 * (docs/MODEL-ACCESS.md), so with less than this left, fail now and let the
 * OTHER samples in the ensemble carry the assessment.
 */
const MIN_RETRY_BUDGET_MS = 6_000;

const AZURE_SCOPE = 'https://cognitiveservices.azure.com/.default';
const GITHUB_MODELS_ENDPOINT = 'https://models.inference.ai.azure.com';

/* ===========================================================================
 * Provider wiring
 * ======================================================================== */

interface ResolvedClient {
  client: OpenAI;
  /** Deployment (Azure) or model name. Recorded in meta.model. */
  model: string;
}

let cached: ResolvedClient | null = null;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set (see .env.example)`);
  }
  return value;
}

/**
 * Built once and reused. On Azure the token provider refreshes its own token,
 * so caching the client does not pin a stale credential.
 */
function resolveClient(): ResolvedClient {
  if (cached) return cached;

  const provider = (process.env.MODEL_PROVIDER ?? 'azure').toLowerCase();

  if (provider === 'azure') {
    const endpoint = required('AZURE_OPENAI_ENDPOINT');
    const deployment = required('AZURE_OPENAI_DEPLOYMENT');
    const apiVersion = required('AZURE_OPENAI_API_VERSION');
    const apiKey = process.env.AZURE_OPENAI_API_KEY;

    cached = {
      model: deployment,
      client: new AzureOpenAI({
        endpoint,
        deployment,
        apiVersion,
        // Managed identity is preferred; a key is the documented fallback.
        // `az login` satisfies DefaultAzureCredential locally.
        ...(apiKey
          ? { apiKey }
          : {
              azureADTokenProvider: getBearerTokenProvider(
                new DefaultAzureCredential(),
                AZURE_SCOPE,
              ),
            }),
        // Transport retries are OFF on purpose: the 3-sample ensemble already
        // absorbs a single failed call, and a hidden retry would silently eat
        // the timeout budget.
        maxRetries: 0,
      }),
    };
    return cached;
  }

  if (provider === 'openai') {
    cached = {
      model: process.env.OPENAI_MODEL ?? 'gpt-4.1',
      client: new OpenAI({ apiKey: required('OPENAI_API_KEY'), maxRetries: 0 }),
    };
    return cached;
  }

  if (provider === 'github') {
    cached = {
      model: process.env.GITHUB_MODELS_MODEL ?? 'gpt-4.1',
      client: new OpenAI({
        apiKey: required('GITHUB_MODELS_TOKEN'),
        baseURL: GITHUB_MODELS_ENDPOINT,
        maxRetries: 0,
      }),
    };
    return cached;
  }

  throw new Error(`MODEL_PROVIDER '${provider}' is not one of: azure, openai, github`);
}

/** The model identifier to record in `meta.model`. Never throws. */
export function getModelName(): string {
  try {
    return resolveClient().model;
  } catch {
    return 'unknown';
  }
}

/** Test seam: forget the cached client so env changes take effect. */
export function resetClientCache(): void {
  cached = null;
}

export function getTimeoutMs(): number {
  const parsed = Number(process.env.ASSESS_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

/* ===========================================================================
 * Error translation
 * ======================================================================== */

/**
 * Collapse anything a provider can throw into the five kinds A's route knows
 * how to render. Provider detail stays in `detail` (server logs only) and
 * never reaches the user — contract.ts: "Never leak provider/internal detail".
 */
function classify(err: unknown): { kind: AssessErrorKind; detail: string } {
  const detail = err instanceof Error ? err.message : String(err);

  if (err instanceof OpenAI.APIUserAbortError || err instanceof OpenAI.APIConnectionTimeoutError) {
    return { kind: 'timeout', detail };
  }
  if (err instanceof OpenAI.RateLimitError) {
    return { kind: 'rate_limit', detail };
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return { kind: 'upstream_unavailable', detail };
  }
  if (err instanceof OpenAI.APIError) {
    const status = err.status ?? 0;
    if (status === 429) return { kind: 'rate_limit', detail };
    if (status >= 500) return { kind: 'upstream_unavailable', detail };
    // 4xx means WE built a bad request (bad key, bad deployment, oversized
    // image). Not retryable, and not the model's fault.
    return { kind: 'internal', detail };
  }
  return { kind: 'internal', detail };
}

/* ===========================================================================
 * One sample
 * ======================================================================== */

function buildContent(input: AssessInput): ChatCompletionContentPart[] {
  return [
    { type: 'text', text: USER_PROMPT },
    {
      type: 'image_url',
      image_url: {
        url: `data:${input.mimeType};base64,${input.imageBase64}`,
        // FGS reads sub-features like whisker angle and orbital tightening.
        // 'low' downsamples to 512px and destroys exactly those cues.
        detail: 'high',
      },
    },
  ];
}

interface RawCall {
  text: string;
  finishReason: string;
  usage: TokenUsage;
}

async function callOnce(
  { client, model }: ResolvedClient,
  input: AssessInput,
  timeoutMs: number,
): Promise<RawCall> {
  const completion = await client.chat.completions.create(
    {
      model,
      // Deterministic by design: the ensemble's disagreement must come from
      // genuine model uncertainty, not from sampling noise we injected.
      temperature: 0,
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'fgs_assessment', strict: true, schema: FGS_JSON_SCHEMA },
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildContent(input) },
      ],
    },
    { timeout: timeoutMs },
  );

  const choice = completion.choices[0];
  const usage: TokenUsage = {
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    cachedTokens: completion.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
  };

  if (choice?.finish_reason === 'length') {
    // Truncated JSON parses as garbage; say why rather than blaming the schema.
    throw new ParseFailure(`response truncated at ${MAX_OUTPUT_TOKENS} tokens`, usage);
  }
  if (choice?.finish_reason === 'content_filter') {
    throw new ParseFailure('response blocked by content filter', usage);
  }

  const text = choice?.message?.content;
  if (!text) {
    throw new ParseFailure('model returned an empty message', usage);
  }

  return { text, finishReason: choice?.finish_reason ?? 'unknown', usage };
}

/** A recoverable "the model said something unusable" — worth one retry. */
class ParseFailure extends Error {
  constructor(
    message: string,
    /** Billed even though the response was unusable. */
    readonly usage: TokenUsage = EMPTY_USAGE,
  ) {
    super(message);
  }
}

function validate(text: string): ValidatedResponse {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ParseFailure('response was not valid JSON');
  }

  const parsed = parseModelResponse(json);
  if (!parsed.ok) {
    throw new ParseFailure(parsed.error);
  }
  return parsed.value;
}

/**
 * Run ONE sample. Retries exactly once, and only when the model produced
 * something unusable — never on a transport error, which the ensemble and the
 * user's retry button already cover.
 *
 * `sampleId` only tags log lines. Three samples run concurrently, so without
 * it the interleaved output cannot be attributed to a specific call.
 */
export async function runSingleAssessment(
  input: AssessInput,
  sampleId = 'sample',
): Promise<RunOutcome> {
  const deadline = Date.now() + getTimeoutMs();
  const remaining = () => deadline - Date.now();

  let resolved: ResolvedClient;
  try {
    resolved = resolveClient();
  } catch (err) {
    // Misconfiguration, not a model failure. Retrying cannot help.
    return {
      ok: false,
      kind: 'internal',
      detail: err instanceof Error ? err.message : String(err),
      usage: EMPTY_USAGE,
    };
  }

  let lastParseError = '';
  // Accumulated across attempts: a retry bills a second time.
  let billed: TokenUsage = EMPTY_USAGE;

  for (let attempt = 0; attempt < 2; attempt++) {
    const budget = remaining();
    if (budget <= 0) {
      return {
        ok: false,
        kind: 'timeout',
        detail: lastParseError || 'budget exhausted before the call completed',
        usage: billed,
      };
    }

    const startedAt = Date.now();
    let raw: RawCall | undefined;
    try {
      raw = await callOnce(resolved, input, budget);
      const value = validate(raw.text);
      billed = addUsage(billed, raw.usage);

      const cached = raw.usage.cachedTokens > 0 ? ` (${raw.usage.cachedTokens} cached)` : '';
      console.info(
        `[assess] ${sampleId}${attempt > 0 ? ' (retry)' : ''} ok in ${Date.now() - startedAt}ms ` +
          `| finish=${raw.finishReason} ` +
          `tokens=${raw.usage.promptTokens}in${cached}/${raw.usage.completionTokens}out ` +
          `~${formatUsd(estimateCostUsd(raw.usage))} | ${describe(value)}`,
      );
      return { ok: true, value, usage: billed };
    } catch (err) {
      if (!(err instanceof ParseFailure)) {
        return { ok: false, ...classify(err), usage: billed };
      }
      // The unusable response was still generated, so it was still billed.
      billed = addUsage(billed, raw?.usage ?? err.usage);
      lastParseError = err.message;
      console.warn(
        `[assess] ${sampleId} unusable response after ${Date.now() - startedAt}ms: ${err.message}`,
      );
      if (remaining() < MIN_RETRY_BUDGET_MS) break;
    }
  }

  return { ok: false, kind: 'bad_model_response', detail: lastParseError, usage: billed };
}

/** One-line summary of a single run, before any voting has happened. */
function describe(value: ValidatedResponse): string {
  if (value.status === 'rejected') return `rejected:${value.rejectionReason}`;
  return value.actionUnits.map((au) => `${au.id}=${au.score ?? 'null'}`).join(' ');
}
