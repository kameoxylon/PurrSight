/**
 * Tail pipeline — MODEL CLIENT.
 *
 * Self-contained provider wiring (azure | openai | github) so the tail feature
 * never imports from the FGS pipeline (lib/assess is B-owned). Env var NAMES
 * are the same ones documented in .env.example, so a single Azure OpenAI
 * resource + `az login` / managed identity serves both features.
 *
 * One call, multiple frames, strict structured output. Failures are values.
 */
import { AzureOpenAI, OpenAI } from 'openai';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import type { TailErrorKind, TailInput } from '../tail-contract';
import { TAIL_SYSTEM_PROMPT, TAIL_USER_PROMPT } from './prompt';
import { TAIL_JSON_SCHEMA, parseTailResponse, type ValidatedTail } from './schema';

const AZURE_SCOPE = 'https://cognitiveservices.azure.com/.default';
const GITHUB_MODELS_ENDPOINT = 'https://models.inference.ai.azure.com';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 700;

interface ResolvedClient {
  client: OpenAI;
  model: string;
}

let cached: ResolvedClient | null = null;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

function resolveClient(): ResolvedClient {
  if (cached) return cached;
  const provider = (process.env.MODEL_PROVIDER ?? 'azure').toLowerCase();

  if (provider === 'azure') {
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const deployment = required('AZURE_OPENAI_DEPLOYMENT');
    cached = {
      model: deployment,
      client: new AzureOpenAI({
        endpoint: required('AZURE_OPENAI_ENDPOINT'),
        deployment,
        apiVersion: required('AZURE_OPENAI_API_VERSION'),
        // Managed identity preferred (prod + `az login` locally); key is the fallback.
        ...(apiKey
          ? { apiKey }
          : {
              azureADTokenProvider: getBearerTokenProvider(
                new DefaultAzureCredential(),
                AZURE_SCOPE,
              ),
            }),
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

export function getTailModelName(): string {
  try {
    return resolveClient().model;
  } catch {
    return 'unknown';
  }
}

/** Test seam. */
export function resetTailClientCache(): void {
  cached = null;
}

export function getTailTimeoutMs(): number {
  const parsed = Number(process.env.TAIL_TIMEOUT_MS ?? process.env.ASSESS_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

export type TailRunOutcome =
  | { ok: true; value: ValidatedTail }
  | { ok: false; kind: TailErrorKind; detail: string };

function classify(err: unknown): { kind: TailErrorKind; detail: string } {
  const detail = err instanceof Error ? err.message : String(err);
  if (err instanceof OpenAI.APIUserAbortError || err instanceof OpenAI.APIConnectionTimeoutError) {
    return { kind: 'timeout', detail };
  }
  if (err instanceof OpenAI.RateLimitError) return { kind: 'rate_limit', detail };
  if (err instanceof OpenAI.APIConnectionError) return { kind: 'upstream_unavailable', detail };
  if (err instanceof OpenAI.APIError) {
    const status = err.status ?? 0;
    if (status === 429) return { kind: 'rate_limit', detail };
    if (status >= 500) return { kind: 'upstream_unavailable', detail };
    return { kind: 'internal', detail };
  }
  return { kind: 'internal', detail };
}

function buildContent(input: TailInput): ChatCompletionContentPart[] {
  const parts: ChatCompletionContentPart[] = [{ type: 'text', text: TAIL_USER_PROMPT }];
  for (const frame of input.frames) {
    parts.push({
      type: 'image_url',
      image_url: {
        url: `data:${input.mimeType};base64,${frame}`,
        // Tail position/puffiness is a coarse, whole-limb cue — 'low' (512px)
        // is plenty and keeps a multi-frame call fast and cheap.
        detail: 'low',
      },
    });
  }
  return parts;
}

/** One structured call. Returns a value on success OR a classified failure. */
export async function runTailRead(input: TailInput): Promise<TailRunOutcome> {
  let resolved: ResolvedClient;
  try {
    resolved = resolveClient();
  } catch (err) {
    return { ok: false, kind: 'internal', detail: err instanceof Error ? err.message : String(err) };
  }

  try {
    const completion = await resolved.client.chat.completions.create(
      {
        model: resolved.model,
        temperature: 0,
        max_tokens: MAX_OUTPUT_TOKENS,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'tail_reading', strict: true, schema: TAIL_JSON_SCHEMA },
        },
        messages: [
          { role: 'system', content: TAIL_SYSTEM_PROMPT },
          { role: 'user', content: buildContent(input) },
        ],
      },
      { timeout: getTailTimeoutMs() },
    );

    const choice = completion.choices[0];
    if (choice?.finish_reason === 'length') {
      return { ok: false, kind: 'bad_model_response', detail: 'response truncated' };
    }
    if (choice?.finish_reason === 'content_filter') {
      return { ok: false, kind: 'bad_model_response', detail: 'blocked by content filter' };
    }
    const text = choice?.message?.content;
    if (!text) return { ok: false, kind: 'bad_model_response', detail: 'empty message' };

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, kind: 'bad_model_response', detail: 'response was not valid JSON' };
    }
    const parsed = parseTailResponse(json);
    if (!parsed.ok) return { ok: false, kind: 'bad_model_response', detail: parsed.error };

    return { ok: true, value: parsed.value };
  } catch (err) {
    return { ok: false, ...classify(err) };
  }
}
