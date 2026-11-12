import type { LlmService } from '@charpentier/platform';
import {
  addChatMessage,
  agentOrigin,
  hashEvidence,
  readMentorLevel,
  readOutline,
} from '@charpentier/schema';
import type * as Y from 'yjs';
import { compagnonChat } from './chat';
import { sceneContext, sheetsSummary } from './context';

/** What the Compagnon is asked: the request stays out of the conversation the author sees. */
const REVIEW_REQUEST = `I have just finished this chapter. Give me your review of it as a whole: first what works, then the one or two things most worth working on (stakes, character arcs, rhythm, point of view, clues planted or left hanging), each with its why, and end with one question to carry into the next chapter. You may quote my words briefly to point at passages. Do not rewrite anything.`;

/** Title of the review in the conversation, by language (the UI's catalogue is not reachable here). */
const HEADING: Record<string, (title: string) => string> = {
  fr: (title) => `Bilan du chapitre « ${title} »`,
  en: (title) => `Review of the chapter “${title}”`,
};

/** Key of a chapter's last review in the mentor document's `analyses` map. */
export const chapterReviewKey = (chapterId: string) => `chapter:${chapterId}`;

/**
 * The review at the end of a chapter (D-19, level 4; on demand at every
 * level): the Compagnon reads the whole chapter and leaves its review in the
 * conversation, under the same guardrails as any answer (it never writes the
 * novel). `automatic` skips a chapter unchanged since its last review.
 */
export async function reviewChapter(input: {
  readonly llm: LlmService;
  readonly root: Y.Doc;
  readonly mentorDoc: Y.Doc;
  /** The chapter's scene documents, by scene id. */
  readonly sceneDocs: ReadonlyMap<string, Y.Doc>;
  readonly chapterId: string;
  readonly automatic: boolean;
  readonly signal?: AbortSignal;
}): Promise<'answered' | 'nothing-to-review'> {
  const { root, mentorDoc, chapterId } = input;
  const chapter = readOutline(root).find((c) => c.id === chapterId);
  if (!chapter) return 'nothing-to-review';
  const scenes = chapter.scenes
    .map((s) => sceneContext(root, input.sceneDocs.get(s.id), s.id).scene)
    .filter((s): s is { title: string; text: string } => !!s?.text.trim());
  if (scenes.length === 0) return 'nothing-to-review';

  const text = scenes.map((s) => `## ${s.title}\n\n${s.text}`).join('\n\n');
  const digest = hashEvidence([{ sceneId: chapterId, variantId: '', quote: text }]);
  const analyses = mentorDoc.getMap<string>('analyses');
  if (input.automatic && analyses.get(chapterReviewKey(chapterId)) === digest)
    return 'nothing-to-review';

  const { language, projectTitle } = sceneContext(root, undefined, undefined);
  const answer = await compagnonChat(
    input.llm,
    {
      language,
      projectTitle,
      level: readMentorLevel(root),
      sheets: sheetsSummary(root),
      scene: { title: chapter.title, text },
    },
    [{ role: 'author', text: REVIEW_REQUEST }],
    input.signal,
  );
  const heading = (HEADING[language.slice(0, 2)] ?? HEADING['fr'] ?? String)(chapter.title);
  mentorDoc.transact(() => {
    addChatMessage(
      mentorDoc,
      {
        role: 'compagnon',
        text: `${heading}\n\n${answer.reply}`,
        ...(answer.example !== undefined && { example: answer.example }),
      },
      agentOrigin('chapter-review'),
    );
    analyses.set(chapterReviewKey(chapterId), digest);
  }, agentOrigin('chapter-review'));
  return 'answered';
}
