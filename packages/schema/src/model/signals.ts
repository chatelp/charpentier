import * as Y from 'yjs';
import { names, newId, nowIso } from './ids';
import { readFieldRef, type FieldRef } from './modules';
import { AUTHOR, type Origin } from './origins';

/**
 * Mentor signals (docs/SPEC.md §15.3), in the root document's top-level map
 * `signals`. Text anchors are Yjs relative positions (as JSON) into one
 * variant of one scene, so they follow the text through concurrent edits.
 */

export type SignalKind = 'language' | 'conflict' | 'craft' | 'clue' | 'external-edit';
export type SignalState = 'open' | 'resolved' | 'dismissed';

/** JSON form of a `Y.RelativePosition` (see `Y.relativePositionToJSON`). */
export type RelativePositionJson = Readonly<Record<string, unknown>>;

export interface TextAnchor {
  readonly sceneId: string;
  readonly variantId: string;
  readonly start: RelativePositionJson;
  readonly end: RelativePositionJson;
}

export interface Signal {
  readonly id: string;
  readonly kind: SignalKind;
  readonly state: SignalState;
  /** `mentor`, or a person id for human annotations later. */
  readonly author: string;
  /** A few words naming the remark (« Les yeux d'Hélène »). */
  readonly title?: string;
  readonly message: string;
  /** The craft principle behind the remark (principle n°5). */
  readonly principle?: string;
  readonly textAnchor?: TextAnchor;
  readonly fieldRef?: FieldRef;
  readonly suggestion?: { readonly kind: 'correction' | 'example'; readonly text: string };
  /**
   * Identity of the remark across analyses (kind, passage, sheet field):
   * the same remark is not raised twice, and never again once dismissed.
   */
  readonly fingerprint?: string;
  readonly createdAt: string;
  readonly closedAt?: string;
}

export type NewSignal = Omit<Signal, 'id' | 'state' | 'createdAt' | 'closedAt'>;

type YMap = Y.Map<unknown>;
const signalsMap = (doc: Y.Doc) => doc.getMap<YMap>(names.signals);

function toSignal(id: string, m: YMap): Signal {
  return { id, ...(m.toJSON() as Omit<Signal, 'id'>) };
}

export function listSignals(
  doc: Y.Doc,
  filter: { state?: SignalState; sceneId?: string } = {},
): Signal[] {
  return [...signalsMap(doc).entries()]
    .map(([id, m]) => toSignal(id, m))
    .filter((s) => filter.state === undefined || s.state === filter.state)
    .filter((s) => filter.sceneId === undefined || s.textAnchor?.sceneId === filter.sceneId)
    .sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1,
    );
}

/** Low-level creation, used by AgentWriter and by the host (e.g. external edits). */
export function addSignal(doc: Y.Doc, input: NewSignal, origin: Origin): string {
  const id = newId();
  doc.transact(() => {
    const signal = new Y.Map<unknown>();
    signalsMap(doc).set(id, signal);
    for (const [key, value] of Object.entries(input))
      if (value !== undefined) signal.set(key, value);
    signal.set('state', 'open' satisfies SignalState);
    signal.set('createdAt', nowIso());
  }, origin);
  return id;
}

function setState(doc: Y.Doc, signalId: string, state: SignalState, origin: Origin): void {
  doc.transact(() => {
    const signal = signalsMap(doc).get(signalId);
    if (!signal) throw new Error(`Unknown signal: ${signalId}`);
    signal.set('state', state);
    if (state === 'open') signal.delete('closedAt');
    else signal.set('closedAt', nowIso());
  }, origin);
}

/** The author has dealt with it (fixed the text or updated the sheet). */
export const resolveSignal = (doc: Y.Doc, id: string, origin: Origin = AUTHOR) =>
  setState(doc, id, 'resolved', origin);
/** The author chose to ignore it. Agents never reopen a dismissed signal. */
export const dismissSignal = (doc: Y.Doc, id: string, origin: Origin = AUTHOR) =>
  setState(doc, id, 'dismissed', origin);
export const reopenSignal = (doc: Y.Doc, id: string, origin: Origin = AUTHOR) =>
  setState(doc, id, 'open', origin);

/** Internal: lets AgentWriter mark its own open signal as resolved. */
export function resolveMentorSignal(doc: Y.Doc, signalId: string, origin: Origin): boolean {
  const signal = signalsMap(doc).get(signalId);
  if (!signal || signal.get('author') !== 'mentor' || signal.get('state') !== 'open') return false;
  setState(doc, signalId, 'resolved', origin);
  return true;
}

const sameRef = (a: FieldRef, b: FieldRef) =>
  a.module === b.module &&
  a.field === b.field &&
  ('entityId' in a ? a.entityId : undefined) === ('entityId' in b ? b.entityId : undefined);

/**
 * « Contredite » (D-9): a validated field targeted by at least one open
 * conflict signal. Derived, never stored, so resolving the conflict cannot
 * cost the field its validation.
 */
export function isContradicted(doc: Y.Doc, ref: FieldRef): boolean {
  if (readFieldRef(doc, ref).status !== 'validated') return false;
  return listSignals(doc, { state: 'open' }).some(
    (s) => s.kind === 'conflict' && s.fieldRef && sameRef(s.fieldRef, ref),
  );
}

export type DisplayStatus = 'proposed' | 'validated' | 'rejected' | 'contradicted';

/** The status shown to the author, « contredite » included. */
export function displayStatus(doc: Y.Doc, ref: FieldRef): DisplayStatus | undefined {
  const { status } = readFieldRef(doc, ref);
  return status === 'validated' && isContradicted(doc, ref) ? 'contradicted' : status;
}
