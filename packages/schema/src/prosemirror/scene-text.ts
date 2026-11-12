/**
 * Text a scene may contain. Control characters have no place in prose and
 * cannot all be written in Markdown, so they are normalized wherever text
 * enters a scene (Markdown import, and later paste in the editor):
 * line breaks become spaces (a real line break is a `hardBreak` node), tabs
 * are kept, every other control character is removed.
 */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu;

export function sanitizeSceneText(text: string): string {
  return text.replace(/\r\n|\r|\n/g, ' ').replace(FORBIDDEN_CONTROL, '');
}

export function isSanitizedSceneText(text: string): boolean {
  return sanitizeSceneText(text) === text;
}
