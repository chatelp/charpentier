import type * as Y from 'yjs';
import type { Evidence, FieldValue, ProposalResult } from './fields';
import { names } from './ids';
import {
  proposeEntityWithFields,
  proposeFieldValue,
  type EntityModule,
  type FieldRef,
} from './modules';
import { agentOrigin } from './origins';
import { addSignal, resolveMentorSignal, type NewSignal } from './signals';

/**
 * The only way agents write to a project (docs/SPEC.md §15.5, §18).
 *
 * It is bound to the project's root document and offers no access to scene
 * documents: agents cannot write the manuscript. It can only propose (never
 * validate, reject or overwrite), raise signals and resolve its own open
 * signals. Every write carries the `agent:<name>` origin, which
 * `watchAuthorship` checks.
 */
export interface AgentWriter {
  readonly agent: string;
  proposeField(
    ref: FieldRef,
    value: FieldValue,
    evidence: readonly Evidence[],
  ): ProposalResult | { readonly ok: false; readonly reason: 'entity-rejected' };
  proposeEntity(
    module: EntityModule,
    fields: Readonly<Record<string, FieldValue>>,
    evidence: readonly Evidence[],
  ): string;
  raiseSignal(signal: Omit<NewSignal, 'author' | 'source'>): string;
  resolveOwnSignal(signalId: string): boolean;
}

export function createAgentWriter(rootDoc: Y.Doc, agent: string): AgentWriter {
  if (!/^project:[^/]+$/.test(rootDoc.guid)) {
    throw new Error(`Agents may only write to a project's root document, not ${rootDoc.guid}`);
  }
  if (!rootDoc.getMap(names.meta).has('id')) throw new Error('Project is not initialized');
  if (!/^[a-z][a-z0-9-]*$/.test(agent)) throw new Error(`Invalid agent name: ${agent}`);
  const origin = agentOrigin(agent);

  return {
    agent,
    proposeField: (ref, value, evidence) =>
      proposeFieldValue(rootDoc, ref, { value, agent, evidence }, origin),
    proposeEntity: (module, fields, evidence) =>
      proposeEntityWithFields(rootDoc, module, { agent, fields, evidence }, origin),
    raiseSignal: (signal) =>
      addSignal(rootDoc, { ...signal, author: 'mentor', source: agent }, origin),
    resolveOwnSignal: (signalId) => resolveMentorSignal(rootDoc, signalId, origin),
  };
}
