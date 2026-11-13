/** Ids are random and URL-safe (nanoid, UUID). */
const ID = '[A-Za-z0-9_-]{1,64}';

/**
 * The Yjs documents of a Charpentier project (docs/SPEC.md §15.1): root,
 * scenes, their history, the mentor; and the library of an account.
 */
const DOCUMENT = new RegExp(
  `^(?:project:(${ID})(?:/scene:${ID}(?:/history)?|/mentor)?|library:(${ID}))$`,
);

export type DocumentOwner =
  | { readonly kind: 'project'; readonly projectId: string }
  | { readonly kind: 'library'; readonly userId: string };

/** What a document belongs to, or null for a name that is not a Charpentier document. */
export function documentOwner(name: string): DocumentOwner | null {
  const match = DOCUMENT.exec(name);
  if (!match) return null;
  if (match[1]) return { kind: 'project', projectId: match[1] };
  if (match[2]) return { kind: 'library', userId: match[2] };
  return null;
}
