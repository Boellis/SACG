/** The model behind the admin assistant. */
export const MODEL = 'claude-opus-5-5';
/** Thinking is always adaptive on this model; effort is the depth control. */
export const EFFORT = 'medium';
/** Room for adaptive thinking plus the reply, kept under the non-streaming timeout. */
export const MAX_TOKENS = 16000;
/** Beta for `fallbacks: 'default'`: a policy decline is retried server-side on Anthropic's recommended model. */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Assistant turns (one admin message each) per admin per garden day. */
export const DAILY_TURN_LIMIT = 60;
/** Longest message an admin may send in one turn. */
export const MAX_MESSAGE_CHARS = 20000;
/** Most model calls in one turn (each tool round is one call). */
export const MAX_TOOL_ITERATIONS = 10;
/** A thread with this many stored messages takes no new turns. */
export const MAX_THREAD_MESSAGES = 200;

/** Secret Manager path of the Anthropic API key, read at runtime by the functions service account. */
export const SECRET_NAME = 'projects/sacg-garden-app/secrets/ANTHROPIC_API_KEY/versions/latest';

export const ASSISTANT_THREADS = 'assistantThreads';
export const ASSISTANT_USAGE = 'assistantUsage';
