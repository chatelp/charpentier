/**
 * Who performs a Yjs transaction (docs/SPEC.md §15.5). Every write to a
 * project document must pass one of these as the transaction origin.
 */
export type Origin =
  | { readonly kind: 'author' }
  | { readonly kind: 'agent'; readonly agent: string }
  | { readonly kind: 'mirror' }
  | { readonly kind: 'system' }
  | { readonly kind: 'migration' };

export const AUTHOR: Origin = Object.freeze({ kind: 'author' });
export const MIRROR: Origin = Object.freeze({ kind: 'mirror' });
export const SYSTEM: Origin = Object.freeze({ kind: 'system' });
export const MIGRATION: Origin = Object.freeze({ kind: 'migration' });

export function agentOrigin(agent: string): Origin {
  return Object.freeze({ kind: 'agent', agent });
}

export function isOrigin(value: unknown): value is Origin {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    ['author', 'agent', 'mirror', 'system', 'migration'].includes((value as { kind: string }).kind)
  );
}

export const isAgentOrigin = (value: unknown): boolean => isOrigin(value) && value.kind === 'agent';
