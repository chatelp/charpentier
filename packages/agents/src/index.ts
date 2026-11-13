// Host-agnostic agents of the Compagnon: prompts, guardrails, orchestration.
// They talk to models only through the platform's LlmService.
export { compagnonChat, type ChatAnswer, type ChatContext, type ChatTurn } from './chat';
export {
  changeRatio,
  isOneSentence,
  MAX_CORRECTION_RATIO,
  MAX_EXAMPLE_LENGTH,
  narrativeProseIn,
  sentencesOf,
  type ProseViolation,
} from './guard';
export { chatAnswerSchema, compagnonSystemPrompt, type MentorLevel } from './prompts';
export { answerAuthor } from './conversation';
export { sceneContext, sheetsSummary } from './context';
export {
  analysisSchema,
  analyzeScene,
  applyAnalysis,
  remarkKindsFor,
  type AnalysisResult,
} from './analysis';
export { chapterReviewKey, reviewChapter } from './review';
export {
  atelierState,
  fileProposals,
  interviewSchema,
  interviewSystemPrompt,
  interviewTurn,
  INTERVIEW_FIELDS,
  MAX_INTERVIEW_VALUE,
  nextSection,
  SECTION_SPECIALISTS,
  sectionStates,
  type InterviewResult,
} from './interview';
