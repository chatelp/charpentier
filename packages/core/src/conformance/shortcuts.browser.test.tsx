import { cleanup, waitFor } from '@testing-library/react';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import type { Chord, PrimaryModifier } from '../commands/keybinding';
import { createWorkspaceRegistry } from '../commands/workspace-commands';
import '../styles/base.css';
import { listenToCommands, startApp } from './app-under-test';

afterEach(cleanup);

/** The chord as a real keyboard presses it. */
function press(chord: Chord): string {
  const mods = [
    chord.meta && 'Meta',
    chord.ctrl && 'Control',
    chord.alt && 'Alt',
    chord.shift && 'Shift',
  ].filter((m): m is string => Boolean(m));
  const key = chord.key.length === 1 ? chord.key.replace(/[{[]/g, '$&$&') : `{${chord.key}}`;
  return `${mods.map((m) => `{${m}>}`).join('')}${key}${mods
    .reverse()
    .map((m) => `{/${m}}`)
    .join('')}`;
}

/**
 * Commands a new project cannot run yet, whatever the key: there is nothing for them to act
 * on. Anything else that shows a shortcut and does not answer it is a defect.
 */
const NOTHING_TO_ACT_ON: Readonly<Record<string, string>> = {
  interviewOtherSection: 'only in the guided interview',
  passageAction: 'needs a remark or a correction under the cursor',
  analyzeScene: 'needs a Compagnon (the test platform has none)',
};

// DESIGN §5.0, rule 10: a shortcut the app shows is one that works where it is shown. The
// Mac's keys (⌘) and the others' (Ctrl, the web on a PC and the X250) are both pressed here,
// whatever machine runs the test.
describe.each<PrimaryModifier>(['Meta', 'Control'])('shortcuts shown, with %s', (primary) => {
  it('reach their command when pressed in the text', async () => {
    const registry = createWorkspaceRegistry(primary, []);
    const { editor } = await startApp({ primary });
    await waitFor(() => expect(document.activeElement).toBe(editor));
    const commands = listenToCommands(true);
    const silent: string[] = [];
    for (const id of registry.ids()) {
      const chord = registry.chord(id);
      // The editor binds its own keys (italic, undo…): its tests press them.
      if (!chord || registry.get(id)?.scope !== 'global') continue;
      commands.take();
      await userEvent.keyboard(press(chord));
      const heard = commands.take().map((c) => c.id);
      if (!heard.includes(id)) silent.push(id);
    }
    commands.stop();
    expect(silent).toEqual(Object.keys(NOTHING_TO_ACT_ON));
  });
});
