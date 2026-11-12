import * as Y from 'yjs';
import { isProposalSlot } from './fields';
import { names } from './ids';
import { isEntityModule, isSingletonModule } from './modules';
import { isAgentOrigin, type Origin } from './origins';

/**
 * Runtime check of the authorship rules (docs/SPEC.md §15.5), as a second
 * line of defence behind AgentWriter: after every transaction whose origin is
 * an agent, it inspects what changed and reports anything an agent may not
 * do. Install it on root and scene documents (in development and tests).
 */

export interface AuthorshipViolation {
  readonly origin: Origin;
  readonly docGuid: string;
  readonly location: string;
  readonly key: string | null;
  readonly reason: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyType = Y.AbstractType<any>;

export function watchAuthorship(
  doc: Y.Doc,
  onViolation: (v: AuthorshipViolation) => void,
): () => void {
  const handler = (tr: Y.Transaction) => {
    if (!isAgentOrigin(tr.origin)) return;
    for (const v of check(doc, tr)) onViolation(v);
  };
  doc.on('afterTransaction', handler);
  return () => doc.off('afterTransaction', handler);
}

function check(doc: Y.Doc, tr: Y.Transaction): AuthorshipViolation[] {
  const origin = tr.origin as Origin;
  const violations: AuthorshipViolation[] = [];
  const report = (location: string, key: string | null, reason: string) =>
    violations.push({ origin, docGuid: doc.guid, location, key, reason });

  const isRoot = /^project:[^/]+$/.test(doc.guid);
  for (const [type, keys] of tr.changed) {
    const top = topLevelName(doc, type as AnyType);
    if (!isRoot) {
      report(top, null, 'agents never write to scene or history documents');
      continue;
    }
    const depth = depthOf(type as AnyType);
    for (const key of keys) {
      const reason = ruleFor(top, depth, key, type as AnyType, tr);
      if (reason) report(top, key, reason);
    }
  }
  return violations;
}

/** Returns why the change is forbidden, or undefined when it is allowed. */
function ruleFor(
  top: string,
  depth: number,
  key: string | null,
  type: AnyType,
  tr: Y.Transaction,
): string | undefined {
  const moduleName = top.startsWith('module:') ? top.slice('module:'.length) : undefined;

  if (moduleName && isSingletonModule(moduleName) && depth === 0) {
    return key && isProposalSlot(key) ? undefined : 'agents may only write proposal slots';
  }
  if (moduleName && isEntityModule(moduleName)) {
    if (depth === 0) {
      const entity = key ? (type as Y.Map<unknown>).get(key) : undefined;
      return entity instanceof Y.Map && createdIn(entity, tr)
        ? undefined
        : 'agents may only add new entities';
    }
    if (depth === 1)
      return key && isProposalSlot(key) ? undefined : 'agents may only write proposal slots';
  }
  if (top === names.signals) {
    if (depth === 0) {
      const signal = key ? (type as Y.Map<unknown>).get(key) : undefined;
      return signal instanceof Y.Map && createdIn(signal, tr)
        ? undefined
        : 'agents may only add new signals';
    }
    if (depth === 1) {
      const signal = type as Y.Map<unknown>;
      const allowed = (key === 'state' && signal.get('state') === 'resolved') || key === 'closedAt';
      return allowed && signal.get('author') === 'mentor'
        ? undefined
        : 'agents may only resolve their own signals';
    }
  }
  return `agents may not write to ${top}`;
}

function topLevelName(doc: Y.Doc, type: AnyType): string {
  let root: AnyType = type;
  while (root._item && root._item.parent instanceof Y.AbstractType)
    root = root._item.parent as AnyType;
  for (const [name, shared] of doc.share) if (shared === root) return name;
  return '?';
}

function depthOf(type: AnyType): number {
  let depth = 0;
  let t: AnyType = type;
  while (t._item && t._item.parent instanceof Y.AbstractType) {
    t = t._item.parent as AnyType;
    depth++;
  }
  return depth;
}

/** True when the type was integrated by this very transaction. */
function createdIn(type: AnyType, tr: Y.Transaction): boolean {
  const item = type._item;
  if (!item) return false;
  return item.id.clock >= (tr.beforeState.get(item.id.client) ?? 0);
}
