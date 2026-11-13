import type { AskResult } from '@charpentier/platform';
import type { InterviewMode, InterviewSection } from '@charpentier/schema';
import type { WorkspaceContext } from '../workspace/workspace-context';

/**
 * The interview's requests to the Compagnon (D-26), shared by its page and
 * its commands: which projects are waiting for an answer, and the last
 * problem, so that the page says « Le Compagnon réfléchit… » whoever asked.
 */
interface State {
  readonly waiting: number;
  readonly problem: AskResult | null;
}

const states = new Map<string, State>();
const listeners = new Set<() => void>();
const IDLE: State = { waiting: 0, problem: null };

const set = (projectId: string, change: (s: State) => State) => {
  states.set(projectId, change(states.get(projectId) ?? IDLE));
  for (const listener of listeners) listener();
};

export const interviewState = (projectId: string): State => states.get(projectId) ?? IDLE;

export function subscribeInterview(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** One turn of the interview, the author's message already in the thread. */
export async function askInterview(
  ctx: Pick<WorkspaceContext, 'platform' | 'projectId'>,
  input: {
    readonly mode: InterviewMode;
    readonly skip?: readonly InterviewSection[];
    readonly section?: InterviewSection;
    readonly pass?: boolean;
  },
): Promise<AskResult> {
  const { projectId } = ctx;
  set(projectId, (s) => ({ waiting: s.waiting + 1, problem: null }));
  const result = await ctx.platform.agents.interview({ projectId, ...input });
  set(projectId, (s) => ({
    waiting: Math.max(0, s.waiting - 1),
    problem: result === 'answered' ? null : result,
  }));
  return result;
}
