export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
export const DEFAULT_HTTP_MAX_RESPONSE_BYTES = 1_000_000;
export const DEFAULT_LOOP_ITEM_LIMIT = 1_000;
// The minimal useful loop (trigger, loop, one body node, done, summary) uses
// 2N + 3 steps, so 4,998 is the largest cap that fits the default 10,000-step
// engine budget. Larger bodies still hit the step budget first.
export const MAX_LOOP_ITEM_LIMIT = 4_998;
