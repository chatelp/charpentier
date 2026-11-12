import type * as Y from 'yjs';
import { names, nowIso } from './ids';
import { AUTHOR, SYSTEM, type Origin } from './origins';

export const SCHEMA_VERSION = 1;

export type ProjectKind = 'novel' | 'short-story';

export interface ProjectMeta {
  readonly id: string;
  readonly title: string;
  readonly kind: ProjectKind;
  /** BCP 47 language of the book, e.g. `fr`. */
  readonly language: string;
  readonly schemaVersion: number;
  readonly createdAt: string;
}

const metaMap = (doc: Y.Doc) => doc.getMap<unknown>(names.meta);

/** Initializes a project's root document. Idempotent. */
export function initProject(
  doc: Y.Doc,
  input: { id: string; title: string; kind: ProjectKind; language?: string },
  origin: Origin = SYSTEM,
): void {
  const meta = metaMap(doc);
  if (meta.has('id')) return;
  doc.transact(() => {
    meta.set('id', input.id);
    meta.set('title', input.title);
    meta.set('kind', input.kind);
    meta.set('language', input.language ?? 'fr');
    meta.set('schemaVersion', SCHEMA_VERSION);
    meta.set('createdAt', nowIso());
  }, origin);
}

/** The Compagnon's intervention level (D-19): 1 Discret … 4 Tuteur; 3 by default. */
export type MentorLevel = 1 | 2 | 3 | 4;

export function readMentorLevel(doc: Y.Doc): MentorLevel {
  const level = metaMap(doc).get('mentorLevel');
  return level === 1 || level === 2 || level === 3 || level === 4 ? level : 3;
}

export function setMentorLevel(doc: Y.Doc, level: MentorLevel, origin: Origin = AUTHOR): void {
  doc.transact(() => metaMap(doc).set('mentorLevel', level), origin);
}

export function readProjectMeta(doc: Y.Doc): ProjectMeta | undefined {
  const meta = metaMap(doc);
  const id = meta.get('id');
  if (typeof id !== 'string') return undefined;
  return {
    id,
    title: String(meta.get('title') ?? ''),
    kind: meta.get('kind') === 'short-story' ? 'short-story' : 'novel',
    language: String(meta.get('language') ?? 'fr'),
    schemaVersion: Number(meta.get('schemaVersion') ?? SCHEMA_VERSION),
    createdAt: String(meta.get('createdAt') ?? ''),
  };
}

export function renameProject(doc: Y.Doc, title: string, origin: Origin = AUTHOR): void {
  doc.transact(() => metaMap(doc).set('title', title), origin);
}
