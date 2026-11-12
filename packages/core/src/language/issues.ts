/** A language issue found in one block of text (offsets are UTF-16, in that text). */
export interface LanguageIssue {
  readonly from: number;
  readonly to: number;
  readonly kind: 'spelling' | 'typography';
  /** Rule id (typography) or the misspelled word (spelling). */
  readonly rule: string;
  /** The replacement for typography; spelling suggestions are fetched on demand. */
  readonly replacement?: string;
}
