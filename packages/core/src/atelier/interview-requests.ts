import type { AnswerResult } from '@charpentier/platform';
import type { InterviewMode, InterviewSection } from '@charpentier/schema';
import { requestAnswer } from '../mentor/answer-wait';
import type { WorkspaceContext } from '../workspace/workspace-context';

/**
 * One turn of the interview (D-26), the author's message already in the
 * thread; shared by its page and its commands. The wait is the Compagnon's
 * (`mentor/answer-wait`): the page shows it whoever asked.
 */
export function askInterview(
  ctx: Pick<WorkspaceContext, 'platform' | 'projectId'>,
  input: {
    readonly mode: InterviewMode;
    readonly skip?: readonly InterviewSection[];
    readonly section?: InterviewSection;
    readonly pass?: boolean;
  },
  /** The thread's last message, where its page knows it: the answer takes the wait's place. */
  after?: string,
): Promise<AnswerResult> {
  const { projectId } = ctx;
  return requestAnswer(
    ctx.platform.agents,
    projectId,
    'interview',
    () => ctx.platform.agents.interview({ projectId, ...input }),
    after,
  );
}
