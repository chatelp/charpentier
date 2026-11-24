/**
 * Every command says so on the window before it runs, whatever asked for it (a key, the
 * command line, a control): what the conformance tests, the end-to-end journeys and a
 * recorded session listen to, to know what the app understood (docs/PLAN.md 7.6).
 * A listener that cancels the event holds the command back.
 */
export const COMMAND_EVENT = 'charpentier:command';

export interface CommandAnnouncement {
  readonly id: string;
  readonly from: 'key' | 'palette' | 'control';
}

/** False when a listener held the command back. */
export function announceCommand(detail: CommandAnnouncement): boolean {
  return window.dispatchEvent(new CustomEvent(COMMAND_EVENT, { detail, cancelable: true }));
}
