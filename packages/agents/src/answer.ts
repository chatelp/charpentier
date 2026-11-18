import type { LlmResponse } from '@charpentier/platform';

/**
 * The model's answer cannot be used: cut short at the output limit, or not
 * the JSON asked for. A technical failure, not a refusal: nothing is filed
 * and nothing is said in the Compagnon's name; the host reports `failed`.
 */
export class UnusableAnswerError extends Error {
  constructor(readonly reason: 'truncated' | 'unreadable') {
    super(
      reason === 'truncated'
        ? 'The model’s answer was cut short (output limit)'
        : 'The model’s answer could not be read',
    );
    this.name = 'UnusableAnswerError';
  }
}

/**
 * The JSON of an answer, whole: an answer cut short is never read (what
 * parses of it by chance would be filed as if it were complete).
 */
export function answerJson<T>(response: LlmResponse): T {
  if (response.truncated) throw new UnusableAnswerError('truncated');
  let value: unknown;
  try {
    value = JSON.parse(response.text);
  } catch {
    throw new UnusableAnswerError('unreadable');
  }
  if (value === null || typeof value !== 'object') throw new UnusableAnswerError('unreadable');
  return value as T;
}
