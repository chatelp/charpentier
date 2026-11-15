import type { DeepWorkEstimate, DeepWorkOutcome, Platform } from '@charpentier/platform';
import { listEntities, workKey, type WorkRef } from '@charpentier/schema';
import { useCallback, useRef, useState } from 'react';
import type * as Y from 'yjs';

/**
 * The Compagnon's background work (D-27, docs/DESIGN.md §4.5): one at a
 * time per project, confirmed in place with its cost, followed in the
 * Atelier and the footer. Held by the workspace, so that it survives the
 * Atelier (the author may write meanwhile).
 */
export interface WorkState {
  /** Asked, waiting for « Lancer »: its estimate (undefined while computing, null: nothing to read). */
  readonly confirm?: {
    readonly ref: WorkRef;
    readonly estimate: DeepWorkEstimate | null | undefined;
  };
  readonly running?: { readonly ref: WorkRef; readonly startedAt: number };
  /** How the last works ended, by work, until asked again. */
  readonly ended: ReadonlyMap<string, { readonly outcome: DeepWorkOutcome; readonly ms: number }>;
}

export interface BackgroundWork {
  readonly state: WorkState;
  /** Opens the confirmation of a work (its block shows it). */
  ask(ref: WorkRef): void;
  cancel(ref?: WorkRef): void;
  launch(): void;
  stop(): void;
}

export const sameWork = (a: WorkRef | undefined, b: WorkRef | undefined) =>
  !!a && !!b && workKey(a) === workKey(b);

/** The name of a work's character (« Hélène Varenne »), or ''. */
export function workName(root: Y.Doc, ref: WorkRef): string {
  if (ref.task !== 'character') return '';
  const state = listEntities(root, 'characters').find((c) => c.id === ref.characterId)?.fields[
    'name'
  ];
  const value = state?.value ?? state?.proposal?.value;
  return typeof value === 'string' ? value : '';
}

export function useBackgroundWork(
  platform: Platform,
  projectId: string,
  /** The work has ended (the footer says where its bilan is). */
  onEnd: (ref: WorkRef, outcome: DeepWorkOutcome) => void,
): BackgroundWork {
  const [state, setState] = useState<WorkState>({ ended: new Map() });
  const latest = useRef(state);
  latest.current = state;
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  const ask = useCallback(
    (ref: WorkRef) => {
      if (latest.current.running) return;
      const ended = new Map(latest.current.ended);
      ended.delete(workKey(ref));
      setState({ ended, confirm: { ref, estimate: undefined } });
      void platform.agents
        .estimateDeepWork({
          projectId,
          task: ref.task,
          ...(ref.characterId !== undefined && { characterId: ref.characterId }),
        })
        .then((estimate) =>
          setState((s) =>
            sameWork(s.confirm?.ref, ref) ? { ...s, confirm: { ref, estimate } } : s,
          ),
        );
    },
    [platform, projectId],
  );

  const cancel = useCallback((ref?: WorkRef) => {
    setState((s) => {
      if (!s.confirm || (ref && !sameWork(s.confirm.ref, ref))) return s;
      return { ended: s.ended, ...(s.running && { running: s.running }) };
    });
  }, []);

  const launch = useCallback(() => {
    const confirm = latest.current.confirm;
    if (!confirm || !confirm.estimate || latest.current.running) return;
    const { ref } = confirm;
    const startedAt = Date.now();
    setState((s) => ({ ended: s.ended, running: { ref, startedAt } }));
    void platform.agents
      .deepWork({
        projectId,
        task: ref.task,
        ...(ref.characterId !== undefined && { characterId: ref.characterId }),
      })
      .catch((): DeepWorkOutcome => 'failed')
      .then((outcome) => {
        setState((s) => {
          const ended = new Map(s.ended);
          ended.set(workKey(ref), { outcome, ms: Date.now() - startedAt });
          return { ended };
        });
        onEndRef.current(ref, outcome);
      });
  }, [platform, projectId]);

  const stop = useCallback(() => {
    void platform.agents.stopDeepWork({ projectId });
  }, [platform, projectId]);

  return { state, ask, cancel, launch, stop };
}
