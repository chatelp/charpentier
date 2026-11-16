import type {
  DeepWorkEstimate,
  DeepWorkOutcome,
  Platform,
  ReferenceChoice,
  ReferenceRefusal,
} from '@charpentier/platform';
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
    /** A reference text (`style`, phase 6.4): the file chosen, or why it will not do. */
    readonly reference?: ReferenceChoice;
    readonly refused?: ReferenceRefusal;
  };
  readonly running?: {
    readonly ref: WorkRef;
    readonly startedAt: number;
    /** The book being read (`style`). */
    readonly reference?: ReferenceChoice;
  };
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

/** A reference text's figures, in the shape of a work's estimate. */
const referenceEstimate = (choice: ReferenceChoice): DeepWorkEstimate => ({
  scenes: choice.passages,
  words: choice.words,
  inputTokens: choice.inputTokens,
  outputTokens: choice.outputTokens,
  usd: choice.usd,
  usdMax: choice.usdMax,
  seconds: choice.seconds,
});

export function useBackgroundWork(
  platform: Platform,
  projectId: string,
  /** The work has ended (the footer says where its bilan is). */
  onEnd: (ref: WorkRef, outcome: DeepWorkOutcome, reference?: ReferenceChoice) => void,
  /** A reference text is about to be read: the author's message that gives it. */
  onReference?: (choice: ReferenceChoice) => void,
): BackgroundWork {
  const [state, setState] = useState<WorkState>({ ended: new Map() });
  const latest = useRef(state);
  latest.current = state;
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const onReferenceRef = useRef(onReference);
  onReferenceRef.current = onReference;

  /** A chosen text the author leaves is let go by the host. */
  const drop = useCallback(
    (reference: ReferenceChoice | undefined) => {
      if (reference) void platform.agents.dropReference({ token: reference.token });
    },
    [platform],
  );

  const ask = useCallback(
    (ref: WorkRef) => {
      if (latest.current.running) return;
      drop(latest.current.confirm?.reference);
      const ended = new Map(latest.current.ended);
      ended.delete(workKey(ref));
      setState({ ended, confirm: { ref, estimate: undefined } });
      if (ref.task === 'style') {
        // The system's file dialog, then the text read and its cost (« Lecture du fichier… »).
        void platform.agents
          .chooseReference({ projectId })
          .catch(() => ({ refused: 'unreadable' }) as const)
          .then((result) =>
            setState((s) => {
              if (!sameWork(s.confirm?.ref, ref)) {
                if (typeof result !== 'string' && !('refused' in result)) drop(result);
                return s;
              }
              if (result === 'cancelled') return { ended: s.ended };
              if ('refused' in result)
                return { ...s, confirm: { ref, estimate: null, refused: result } };
              return {
                ...s,
                confirm: { ref, estimate: referenceEstimate(result), reference: result },
              };
            }),
          );
        return;
      }
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
    [platform, projectId, drop],
  );

  const cancel = useCallback(
    (ref?: WorkRef) => {
      const confirm = latest.current.confirm;
      if (!confirm || (ref && !sameWork(confirm.ref, ref))) return;
      drop(confirm.reference);
      setState((s) =>
        s.confirm === confirm ? { ended: s.ended, ...(s.running && { running: s.running }) } : s,
      );
    },
    [drop],
  );

  const launch = useCallback(() => {
    const confirm = latest.current.confirm;
    if (!confirm || !confirm.estimate || latest.current.running) return;
    const { ref, reference } = confirm;
    const startedAt = Date.now();
    setState((s) => ({
      ended: s.ended,
      running: { ref, startedAt, ...(reference && { reference }) },
    }));
    if (reference) onReferenceRef.current?.(reference);
    const run: Promise<DeepWorkOutcome> = reference
      ? platform.agents.readReference({ projectId, token: reference.token })
      : ref.task === 'style'
        ? Promise.resolve('empty')
        : platform.agents.deepWork({
            projectId,
            task: ref.task,
            ...(ref.characterId !== undefined && { characterId: ref.characterId }),
          });
    void run
      .catch((): DeepWorkOutcome => 'failed')
      .then((outcome) => {
        setState((s) => {
          const ended = new Map(s.ended);
          ended.set(workKey(ref), { outcome, ms: Date.now() - startedAt });
          return { ended };
        });
        onEndRef.current(ref, outcome, reference);
      });
  }, [platform, projectId]);

  const stop = useCallback(() => {
    void platform.agents.stopDeepWork({ projectId });
  }, [platform, projectId]);

  return { state, ask, cancel, launch, stop };
}
