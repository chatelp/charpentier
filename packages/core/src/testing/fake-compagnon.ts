import type {
  AgentsService,
  AnswerPhase,
  AnswerPhaseEvent,
  AnswerResult,
} from '@charpentier/platform';

/**
 * A Compagnon played by a test, available: what is asked of him (`ask`,
 * `interview`) waits until the test tells its phase, ends it (`end`) or the
 * author stops it. `tellsPhases` and `canStop` false: a host that cannot.
 */
export function createFakeCompagnon(
  options: {
    readonly tellsPhases?: boolean;
    readonly canStop?: boolean;
    readonly overrides?: Partial<AgentsService>;
  } = {},
) {
  const listeners = new Set<(event: AnswerPhaseEvent) => void>();
  const waiting = new Set<{
    readonly projectId: string;
    resolve(result: AnswerResult): void;
  }>();
  const asked: {
    readonly kind: 'chat' | 'interview';
    readonly input: { readonly projectId: string };
  }[] = [];

  const wait = (kind: 'chat' | 'interview', input: { readonly projectId: string }) => {
    asked.push({ kind, input });
    return new Promise<AnswerResult>((resolve) => {
      const entry = {
        projectId: input.projectId,
        resolve: (result: AnswerResult) => {
          waiting.delete(entry);
          resolve(result);
        },
      };
      waiting.add(entry);
    });
  };

  const agents: AgentsService = {
    status: () => 'available',
    onStatusChange: () => () => {},
    setApiKey: async () => 'saved',
    forgetApiKey: async () => {},
    ask: (input) => wait('chat', input),
    interview: (input) => wait('interview', input),
    analyze: async () => 'answered',
    reviewChapter: async () => 'answered',
    estimateDeepWork: async () => null,
    deepWork: async () => 'unavailable',
    stopDeepWork: async () => {},
    chooseReference: async () => 'cancelled',
    readReference: async () => 'empty',
    dropReference: async () => {},
    lightModel: async () => 'opus',
    setLightModel: async () => {},
    ...(options.tellsPhases !== false && {
      onAnswerPhase: (listener: (event: AnswerPhaseEvent) => void) => {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
    }),
    ...(options.canStop !== false && {
      stopAnswer: async ({ projectId }: { readonly projectId: string }) => {
        for (const entry of [...waiting])
          if (entry.projectId === projectId) entry.resolve('stopped');
      },
    }),
    ...options.overrides,
  };

  return {
    agents,
    asked,
    /** The engine's word on every answer in progress. */
    phase(phase: AnswerPhase | null) {
      for (const { projectId } of waiting)
        for (const listener of listeners) listener({ projectId, phase });
    },
    /** Ends what waits (write the answer in the mentor document first, as the agent does). */
    end(result: AnswerResult = 'answered') {
      for (const entry of [...waiting]) entry.resolve(result);
    },
  };
}
