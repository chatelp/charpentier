import type * as Y from 'yjs';
import { nowIso } from './ids';
import { ownerVersion } from './versions';

/**
 * A field of a module (docs/SPEC.md §7.1, §15.2) is stored in three slots of
 * its container map, each with a single kind of writer:
 *
 *   `<field>#value`     the author's value              written by the author only
 *   `<field>#proposal`  the agent's pending proposal    written by agents; cleared by the author
 *   `<field>#rejected`  proposals the author refused    written by the author only
 *
 * The status is derived: validated if there is an author value, else proposed
 * if there is a proposal, else rejected if proposals were refused. Because
 * the author's value and the agent's proposal never share a slot, no write and
 * no merge between devices can let an agent overwrite an author's decision.
 * « Contredite » is derived elsewhere, from open conflict signals (D-9).
 */

export type FieldValue =
  string | number | boolean | null | readonly FieldValue[] | { readonly [key: string]: FieldValue };

/**
 * Where an agent found support for a proposal: a passage of the text, the
 * author's words, or a reference text the author imported (never quoted).
 */
export type Evidence = SceneEvidence | InterviewEvidence | ReferenceEvidence;

/** A passage of a scene. */
export interface SceneEvidence {
  readonly sceneId: string;
  readonly variantId: string;
  /** Short excerpt of the passage. */
  readonly quote: string;
}

/** What the author said in the interview with the Compagnon (D-26). */
export interface InterviewEvidence {
  /** The author's message, in the mentor document's `interview` thread. */
  readonly messageId: string;
  /** Their words, verbatim. */
  readonly quote: string;
}

/**
 * A reference text the author imported (phase 6.4): only its title, since
 * nothing of the text itself is kept.
 */
export interface ReferenceEvidence {
  readonly reference: string;
}

/** The scene a piece of evidence comes from, if it comes from the text. */
export const evidenceSceneId = (evidence: Evidence): string | undefined =>
  'sceneId' in evidence ? evidence.sceneId : undefined;

export interface Proposal {
  readonly value: FieldValue;
  readonly agent: string;
  readonly at: string;
  readonly evidence: readonly Evidence[];
  readonly evidenceHash: string;
  /** The working version it was drawn from, outside Principale (DESIGN 1.20). */
  readonly version?: string;
}

export interface Rejection {
  readonly value: FieldValue;
  readonly evidenceHash: string;
  readonly at: string;
}

export type FieldStatus = 'proposed' | 'validated' | 'rejected';

export interface FieldState {
  readonly status: FieldStatus | undefined;
  /** The author's value, when validated. */
  readonly value?: FieldValue;
  readonly validatedAt?: string;
  readonly proposal?: Proposal;
  readonly rejected: readonly Rejection[];
}

const SEP = '#';
export const slot = {
  value: (field: string) => `${field}${SEP}value`,
  proposal: (field: string) => `${field}${SEP}proposal`,
  rejected: (field: string) => `${field}${SEP}rejected`,
} as const;

export const isProposalSlot = (key: string): boolean => key.endsWith(`${SEP}proposal`);

export function assertFieldKey(field: string): void {
  if (!field || field.includes(SEP) || field.startsWith('$'))
    throw new Error(`Invalid field key: ${field}`);
}

type Container = Y.Map<unknown>;

export function readField(container: Container, field: string): FieldState {
  const stored = container.get(slot.value(field)) as { value: FieldValue; at: string } | undefined;
  const proposal = container.get(slot.proposal(field)) as Proposal | undefined;
  const rejected = (container.get(slot.rejected(field)) as Rejection[] | undefined) ?? [];
  const status: FieldStatus | undefined = stored
    ? 'validated'
    : proposal
      ? 'proposed'
      : rejected.length > 0
        ? 'rejected'
        : undefined;
  return {
    status,
    ...(stored && { value: stored.value, validatedAt: stored.at }),
    ...(proposal && { proposal }),
    rejected,
  };
}

/** Field keys present in a container (any slot). */
export function fieldKeys(container: Container): string[] {
  const keys = new Set<string>();
  for (const key of container.keys()) {
    const i = key.lastIndexOf(SEP);
    if (i > 0) keys.add(key.slice(0, i));
  }
  return [...keys].sort();
}

// ─── Author operations (call inside an author transaction) ──────────────

export function authorSetField(container: Container, field: string, value: FieldValue): void {
  assertFieldKey(field);
  container.set(slot.value(field), { value, at: nowIso() });
  container.delete(slot.proposal(field));
}

export function authorClearField(container: Container, field: string): void {
  container.delete(slot.value(field));
}

export function authorAcceptProposal(container: Container, field: string): void {
  const { proposal } = readField(container, field);
  if (!proposal) throw new Error(`No proposal to accept for ${field}`);
  authorSetField(container, field, proposal.value);
}

export function authorRejectProposal(container: Container, field: string): void {
  const { proposal, rejected } = readField(container, field);
  if (!proposal) throw new Error(`No proposal to reject for ${field}`);
  container.set(slot.rejected(field), [
    ...rejected,
    { value: proposal.value, evidenceHash: proposal.evidenceHash, at: nowIso() },
  ]);
  container.delete(slot.proposal(field));
}

// ─── Agent operation (call inside an agent transaction) ─────────────────

export type ProposalResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'validated'; readonly validatedValue: FieldValue }
  | { readonly ok: false; readonly reason: 'rejected-before' }
  | { readonly ok: false; readonly reason: 'unchanged' };

/**
 * Records an agent proposal, unless the author has decided:
 * - a validated field is never touched (the caller raises a conflict signal
 *   instead when the text disagrees with it);
 * - a value the author rejected is not proposed again, whatever the evidence
 *   (a model that quotes another passage for the same value brings nothing
 *   new) and however it is spelled (`sameRejectedValue`).
 */
export function agentProposeField(
  container: Container,
  field: string,
  proposal: Omit<Proposal, 'evidenceHash' | 'at'>,
): ProposalResult {
  assertFieldKey(field);
  const state = readField(container, field);
  if (state.status === 'validated')
    return { ok: false, reason: 'validated', validatedValue: state.value ?? null };
  if (state.rejected.some((r) => sameRejectedValue(r.value, proposal.value)))
    return { ok: false, reason: 'rejected-before' };
  const evidenceHash = hashEvidence(proposal.evidence);
  if (
    state.proposal &&
    sameValue(state.proposal.value, proposal.value) &&
    state.proposal.evidenceHash === evidenceHash
  ) {
    return { ok: false, reason: 'unchanged' };
  }
  // Drawn from a working version: its provenance names it (« … · Fin à Nantes »).
  const version = container.doc ? ownerVersion(container.doc) : undefined;
  container.set(slot.proposal(field), {
    ...proposal,
    evidenceHash,
    at: nowIso(),
    ...(version && { version }),
  } satisfies Proposal);
  return { ok: true };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** JSON with sorted object keys, for value comparison and hashing. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export const sameValue = (a: FieldValue, b: FieldValue): boolean =>
  stableStringify(a) === stableStringify(b);

/** A value as a refusal remembers it: letters and digits only, case and punctuation aside. */
const loose = (value: FieldValue): FieldValue => {
  if (typeof value === 'string')
    return value
      .normalize('NFC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  if (Array.isArray(value)) return (value as readonly FieldValue[]).map(loose);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as { readonly [key: string]: FieldValue }).map(([k, v]) => [
        k,
        loose(v),
      ]),
    );
  return value;
};

/**
 * Whether a proposal says again what the author refused: the same value up
 * to case, spaces and punctuation (« Un polar. » and « un polar »). Accents
 * are kept: they change words (« pêcheur », « pécheur »).
 */
export const sameRejectedValue = (rejected: FieldValue, proposed: FieldValue): boolean =>
  sameValue(loose(rejected), loose(proposed));

/** FNV-1a 32-bit hash of the evidence, order-insensitive. */
export function hashEvidence(evidence: readonly Evidence[]): string {
  const text = evidence.map(stableStringify).sort().join('\n');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
