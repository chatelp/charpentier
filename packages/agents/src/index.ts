// Host-agnostic agents of the Compagnon: prompts, guardrails, orchestration.
// They talk to models only through the platform's LlmService.
export { UnusableAnswerError } from './answer';
export { compagnonChat, type ChatAnswer, type ChatContext, type ChatTurn } from './chat';
export {
  changeRatio,
  CUT_MARK,
  cutMarked,
  isBoundedCorrection,
  isOneSentence,
  MAX_CORRECTION_GROWTH,
  MAX_CORRECTION_LENGTH,
  MAX_CORRECTION_RATIO,
  MAX_EXAMPLE_LENGTH,
  MAX_REPLY_LENGTH,
  narrativeProseIn,
  narrativeSentencesIn,
  sentencesOf,
  type ProseOptions,
  type ProseViolation,
} from './guard';
export { chatAnswerSchema, compagnonSystemPrompt, type MentorLevel } from './prompts';
export { answerAuthor } from './conversation';
export {
  generateWithMemory,
  MAX_NOTE,
  memoryInstructions,
  projectMemory,
  type MemoryStore,
} from './memory';
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
  applyDeepWork,
  DEEP_AGENTS,
  DEEP_PRICES,
  deepWork,
  deepWorkSchemas,
  deepWorkSystemPrompt,
  estimateDeepWork,
  manuscriptOf,
  MAX_DEEP_REVIEW,
  MAX_DEEP_VALUE,
  type DeepWorkOutput,
  type DeepWorkResult,
} from './deep-work';
export {
  applyStyle,
  drawExtracts,
  echoes,
  echoIndex,
  estimateStyle,
  MAX_STYLE_CHOICE,
  measureStyle,
  readReference,
  splitChapters,
  STYLE_AGENT,
  STYLE_ECHO_WORDS,
  styleSchema,
  styleSystemPrompt,
  type ReferenceText,
  type StyleEstimate,
  type StyleMeasures,
  type StyleResult,
} from './style-reference';
export {
  atelierState,
  fileProposals,
  interviewSchema,
  interviewSystemPrompt,
  interviewTurn,
  INTERVIEW_FIELDS,
  MAX_INTERVIEW_VALUE,
  SECTION_SPECIALISTS,
  type InterviewResult,
} from './interview';
// The progress of the interview lives in the schema (the interface reads it too).
export { nextSection, sectionStates } from '@charpentier/schema';
export { AgentWorks, type AgentDocuments } from './works';
export {
  cleanPdfPages,
  fromEpub,
  fromMarkdown,
  MAX_REFERENCE_BYTES,
  parseReferenceFile,
  REFERENCE_EXTENSIONS,
  referenceFormat,
  UnreadableReferenceError,
  xhtmlToText,
  type ReferenceFormat,
} from './reference-file';
