import {
  addChatMessage,
  addInterviewMessage,
  agentOrigin,
  chatMessages,
  guids,
  interviewMessages,
  listEntities,
} from '@charpentier/schema';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { hostPrimary, startApp } from '../conformance/app-under-test';
import { formatBinding } from '../commands/keybinding';
import '../styles/base.css';
import { createFakeCompagnon } from '../testing/fake-compagnon';
import { isAnswerWaiting, waitClock } from './answer-wait';

const realNow = waitClock.now;
// Wide enough for the panel beside the text and the Atelier, as on the author's screen.
beforeEach(() => page.viewport(1440, 900));
afterEach(() => {
  cleanup();
  waitClock.now = realNow;
});

const mod = hostPrimary === 'Meta' ? 'Meta' : 'Control';
const chord = (keys: string) => `{${mod}>}${keys}{/${mod}}`;
const stopKey = formatBinding('Mod-.', hostPrimary);

/** Moves the wait's clock forward (the block looks at it four times a second). */
function fakeClock() {
  let now = 1_000_000;
  waitClock.now = () => now;
  return {
    advance: (ms: number) => {
      now += ms;
    },
  };
}

async function start(options: Parameters<typeof createFakeCompagnon>[0] = {}) {
  const compagnon = createFakeCompagnon(options);
  const app = await startApp({ platform: { agents: compagnon.agents } });
  await waitFor(() => expect(document.activeElement).toBe(app.editor));
  const projectId = () => String(app.prefs.get('lastProjectId'));
  const mentor = () => app.docs.get(guids.mentor(projectId())) ?? new Y.Doc();
  return { ...app, compagnon, projectId, mentor };
}

async function openConversation() {
  await userEvent.keyboard(chord('k'));
  await userEvent.keyboard('parler au compagnon{Enter}');
  const field = await screen.findByRole('textbox', { name: 'Votre question au Compagnon' });
  await waitFor(() => expect(document.activeElement).toBe(field));
  return field as HTMLTextAreaElement;
}

async function openInterview() {
  await userEvent.keyboard(chord('0'));
  const field = await screen.findByRole('textbox', { name: /^Parlez de votre projet/ });
  await waitFor(() => expect(document.activeElement).toBe(field));
  return field as HTMLTextAreaElement;
}

const block = () => screen.getByRole('status', { name: 'Le Compagnon réfléchit…' });
const noBlock = () => screen.queryByRole('status', { name: 'Le Compagnon réfléchit…' });
const footer = () => document.querySelector('.ch-panel-hint, .ch-interview-hint')?.textContent;

describe('while the Compagnon prepares his answer, in the panel (DESIGN 1.34)', () => {
  it('shows the block where the answer will come, and follows the engine, never a timer', async () => {
    const { compagnon, mentor } = await start();
    const field = await openConversation();
    await userEvent.keyboard('Que veut Hélène ?{Enter}');

    // Where the answer will come: the last thing of the thread, after the author's message.
    const log = screen.getByRole('log');
    await waitFor(() => expect(block().textContent).toBe('Il réfléchit…'));
    const wait = block().closest('.ch-wait');
    expect(wait).toBe(log.lastElementChild);
    expect(wait?.previousElementSibling?.textContent).toContain('Que veut Hélène ?');
    expect(wait?.querySelector('.ch-wait-who')?.textContent).toBe('Le Compagnon');
    expect(wait?.querySelector('.ch-wait-dot')).not.toBeNull();
    expect(wait?.closest('.ch-wait')?.classList.contains('is-panel')).toBe(true);

    // Not a word more until the engine says one.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(block().textContent).toBe('Il réfléchit…');
    compagnon.phase('writing');
    await waitFor(() => expect(block().textContent).toBe('Il écrit sa réponse…'));
    // The guardrails: shown only once they last over half a second.
    compagnon.phase('reviewing');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(block().textContent).toBe('Il écrit sa réponse…');
    await waitFor(() => expect(block().textContent).toBe('Il relit sa réponse…'), {
      timeout: 2000,
    });

    // The answer takes its place: never both at once, in the thread's order.
    addChatMessage(
      mentor(),
      { role: 'compagnon', text: 'Que cherche-t-elle au port ?' },
      agentOrigin('chat'),
    );
    await waitFor(() => expect(within(log).getByText('Que cherche-t-elle au port ?')).toBeTruthy());
    expect(noBlock()).toBeNull();
    const turn = within(log).getByText('Que cherche-t-elle au port ?').closest('.ch-turn');
    expect(turn).toBe(log.lastElementChild);
    compagnon.end();
    await waitFor(() => expect(field.disabled).toBe(false));
    expect(noBlock()).toBeNull();
  });

  it('keeps the field for the author’s next message: ⏎ waits, and the footer says so', async () => {
    const { compagnon, mentor } = await start();
    const field = await openConversation();
    const before = footer();
    expect(before).toMatch(/^⏎ envoyer · /);
    await userEvent.keyboard('Que veut Hélène ?{Enter}');
    await waitFor(() => expect(noBlock()).not.toBeNull());
    expect(footer()).toMatch(/^⏎ quand il aura répondu · /);

    await userEvent.keyboard('Et son frère ?{Enter}');
    expect(field.value).toBe('Et son frère ?');
    expect(chatMessages(mentor()).map((m) => m.text)).toEqual(['Que veut Hélène ?']);
    expect(compagnon.asked).toHaveLength(1);

    // The draft goes by hand, once he answered, never by itself.
    compagnon.end();
    await waitFor(() => expect(footer()).toBe(before));
    expect(field.value).toBe('Et son frère ?');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(compagnon.asked).toHaveLength(2));
    expect(field.value).toBe('');
    expect(chatMessages(mentor()).map((m) => m.text)).toEqual([
      'Que veut Hélène ?',
      'Et son frère ?',
    ]);
    compagnon.end();
  });

  it('shows the time after 3 s, and a line after 30 s with « Arrêter »', async () => {
    const clock = fakeClock();
    const { compagnon } = await start();
    await openConversation();
    await userEvent.keyboard('Que veut Hélène ?{Enter}');
    await waitFor(() => expect(noBlock()).not.toBeNull());
    const wait = () => document.querySelector('.ch-wait');
    expect(wait()?.querySelector('.ch-wait-time')).toBeNull();
    clock.advance(2500);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(wait()?.querySelector('.ch-wait-time')).toBeNull();
    clock.advance(1000);
    await waitFor(() => expect(wait()?.querySelector('.ch-wait-time')?.textContent).toBe('0:03'));
    // The time is never read out.
    expect(wait()?.querySelector('.ch-wait-time')?.getAttribute('aria-hidden')).toBe('true');
    expect(wait()?.querySelector('.ch-wait-long')).toBeNull();
    // « Arrêter » is there from the start, at the mouse.
    const stop = screen.getByRole('button', { name: /^Arrêter/ });
    expect(stop.textContent).toBe(`Arrêter${stopKey}`);

    clock.advance(26_500);
    await waitFor(() => expect(wait()?.querySelector('.ch-wait-long')).not.toBeNull());
    expect(wait()?.querySelector('.ch-wait-time')?.textContent).toBe('0:30');
    expect(wait()?.querySelector('.ch-wait-long')?.textContent).toContain(
      'C’est plus long que d’habitude.',
    );
    expect(
      within(wait()?.querySelector('.ch-wait-long') as HTMLElement).getByRole('button', {
        name: /^Arrêter/,
      }),
    ).toBeTruthy();
    compagnon.end();
    await waitFor(() => expect(noBlock()).toBeNull());
  });

  it('« Arrêter » removes the block; the message stays, to be sent again', async () => {
    const { compagnon, mentor } = await start();
    await openConversation();
    await userEvent.keyboard('Que veut Hélène ?{Enter}');
    await waitFor(() => expect(noBlock()).not.toBeNull());
    const log = screen.getByRole('log');
    await userEvent.hover(block());
    await userEvent.click(screen.getByRole('button', { name: /^Arrêter/ }));
    await waitFor(() => expect(noBlock()).toBeNull());

    // Under the author's message, « Envoyer à nouveau »; no problem is said.
    const again = within(log).getByRole('button', { name: 'Envoyer à nouveau' });
    expect(again.closest('.ch-wait-again')).toBe(log.lastElementChild);
    expect(again.closest('.ch-wait-again')?.previousElementSibling?.textContent).toContain(
      'Que veut Hélène ?',
    );
    expect(log.querySelector('.ch-transcript-problem')).toBeNull();
    expect(chatMessages(mentor()).map((m) => m.role)).toEqual(['author']);

    // Sent again: the same message, not a second one.
    await userEvent.click(again);
    await waitFor(() => expect(noBlock()).not.toBeNull());
    expect(within(log).queryByRole('button', { name: 'Envoyer à nouveau' })).toBeNull();
    expect(compagnon.asked).toHaveLength(2);
    expect(chatMessages(mentor()).map((m) => m.role)).toEqual(['author']);
    compagnon.end();
    await waitFor(() => expect(noBlock()).toBeNull());
  });

  it('is stopped by the keyboard, from the text as from the field', async () => {
    const { editor } = await start();
    const field = await openConversation();
    await userEvent.keyboard('Que veut Hélène ?{Enter}');
    await waitFor(() => expect(noBlock()).not.toBeNull());
    await userEvent.keyboard(chord('.'));
    await waitFor(() => expect(noBlock()).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer à nouveau' }));
    await waitFor(() => expect(noBlock()).not.toBeNull());
    // From the text, the panel open beside it.
    editor.focus();
    await userEvent.keyboard(chord('.'));
    await waitFor(() => expect(noBlock()).toBeNull());
    // Nothing waits any more: the command line does not offer it.
    field.blur();
    await userEvent.keyboard(chord('k'));
    await screen.findByRole('dialog', { name: 'Ligne de commande' });
    await userEvent.keyboard('arrêter la réponse');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(screen.queryByText('Arrêter la réponse du Compagnon')).toBeNull();
  });

  it('is stopped by the author’s own keyboard: on AZERTY the dot carries Shift', async () => {
    await start();
    const field = await openConversation();
    await userEvent.keyboard('Que veut Hélène ?{Enter}');
    await waitFor(() => expect(noBlock()).not.toBeNull());
    field.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: '.',
        code: 'Comma',
        shiftKey: true,
        metaKey: mod === 'Meta',
        ctrlKey: mod === 'Control',
        bubbles: true,
        cancelable: true,
      }),
    );
    await waitFor(() => expect(noBlock()).toBeNull());
  });

  it('leaves its key to a field’s draft in the Atelier, which cancels', async () => {
    const { compagnon, docs, projectId } = await start();
    await openConversation();
    await userEvent.keyboard('Que veut Hélène ?{Enter}');
    await waitFor(() => expect(noBlock()).not.toBeNull());
    await userEvent.keyboard(chord('k'));
    await userEvent.keyboard('nouveau personnage{Enter}');
    await screen.findByRole('dialog', { name: 'Ligne de commande' });
    await userEvent.keyboard('Hélène Varenne{Enter}');
    const root = docs.get(guids.project(projectId())) as Y.Doc;
    await waitFor(() => expect(listEntities(root, 'characters')).toHaveLength(1));
    // A field of the sheet, its draft open.
    const value = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('.ch-atelier .ch-fv');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    await userEvent.click(value);
    const draft = await waitFor(() => {
      const found = document.querySelector<HTMLTextAreaElement>('.ch-fv-input');
      expect(found).not.toBeNull();
      return found as HTMLTextAreaElement;
    });
    await waitFor(() => expect(document.activeElement).toBe(draft));
    await userEvent.keyboard('un brouillon');
    await userEvent.keyboard(chord('.'));
    await waitFor(() => expect(document.querySelector('.ch-fv-input')).toBeNull());
    // The draft was cancelled, and the answer still comes.
    expect(document.querySelector('.ch-atelier')?.textContent).not.toContain('un brouillon');
    expect(isAnswerWaiting(compagnon.agents, projectId())).toBe(true);
    compagnon.end();
  });

  it('« Arrêter » and « Envoyer à nouveau » are reached by the keyboard, and give the field back', async () => {
    await start();
    const field = await openConversation();
    await userEvent.keyboard('Que veut Hélène ?{Enter}');
    await waitFor(() => expect(noBlock()).not.toBeNull());
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    const stop = screen.getByRole('button', { name: /^Arrêter/ });
    expect(document.activeElement).toBe(stop);
    // Focused, it is seen.
    await waitFor(() => expect(getComputedStyle(stop).opacity).toBe('1'));
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(noBlock()).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(field));
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Envoyer à nouveau' }));
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(noBlock()).not.toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(field));
  });

  it('says a problem once: the panel opened again does not repeat it', async () => {
    const { compagnon } = await start();
    await openConversation();
    await userEvent.keyboard('Que veut Hélène ?{Enter}');
    await waitFor(() => expect(noBlock()).not.toBeNull());
    compagnon.end('offline');
    const problem = /^Pas de réseau/;
    await screen.findByText(problem);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('log')).toBeNull());
    await openConversation();
    expect(screen.queryByText(problem)).toBeNull();
  });

  it('on a host that cannot stop nor tell the phase, offers neither and keeps « Il réfléchit… »', async () => {
    const { compagnon } = await start({ tellsPhases: false, canStop: false });
    await openConversation();
    await userEvent.keyboard('Que veut Hélène ?{Enter}');
    await waitFor(() => expect(block().textContent).toBe('Il réfléchit…'));
    compagnon.phase('writing');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(block().textContent).toBe('Il réfléchit…');
    expect(screen.queryByRole('button', { name: /^Arrêter/ })).toBeNull();
    compagnon.end();
  });

  it('breathes on the console’s key while the panel is closed, in place of its count', async () => {
    const { compagnon } = await start();
    await openConversation();
    await userEvent.keyboard('Que veut Hélène ?{Enter}');
    await waitFor(() => expect(noBlock()).not.toBeNull());
    const key = () => document.querySelector('.ch-console .ch-console-key.is-mentor');
    // The panel is open: the block says it, not the key.
    expect(key()?.querySelector('.ch-console-breath')).toBeNull();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('log')).toBeNull());
    await waitFor(() => expect(key()?.querySelector('.ch-console-breath')).not.toBeNull());
    expect(key()?.querySelector('.ch-console-count')).toBeNull();
    const dot = key()?.querySelector('.ch-console-breath') as HTMLElement;
    expect(getComputedStyle(dot).animationName).toBe('ch-breathe');

    // The panel opened again still shows the wait: it did not start over.
    await userEvent.keyboard(chord('l'));
    await screen.findByRole('tab', { name: /Conversation/ });
    expect(key()?.querySelector('.ch-console-breath')).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: /Conversation/ }));
    await waitFor(() => expect(noBlock()).not.toBeNull());
    await userEvent.keyboard('{Escape}');
    compagnon.end();
    await waitFor(() => expect(key()?.querySelector('.ch-console-breath')).toBeNull());
  });

  it('holds still while the author types, and breathes again at the pause', async () => {
    await start();
    await openConversation();
    await userEvent.keyboard('Que veut Hélène ?{Enter}');
    await waitFor(() => expect(noBlock()).not.toBeNull());
    const dot = () => document.querySelector<HTMLElement>('.ch-wait-dot');
    expect(getComputedStyle(dot() as HTMLElement).animationName).toBe('ch-breathe');
    await userEvent.keyboard('Et son');
    await waitFor(() => expect(getComputedStyle(dot() as HTMLElement).animationName).toBe('none'));
    expect(getComputedStyle(dot() as HTMLElement).opacity).toBe('0.7');
    await waitFor(
      () => expect(getComputedStyle(dot() as HTMLElement).animationName).toBe('ch-breathe'),
      { timeout: 5000 },
    );
  });
});

describe('the pastille, when nothing may move (DESIGN 1.34, §3.4)', () => {
  const style = (selector: string) =>
    getComputedStyle(document.querySelector<HTMLElement>(selector) as HTMLElement);

  it('holds still while the author writes in the text, the panel open or closed', async () => {
    const { editor } = await start();
    await openConversation();
    await userEvent.keyboard('Que veut Hélène ?{Enter}');
    await waitFor(() => expect(noBlock()).not.toBeNull());
    editor.focus();
    await userEvent.keyboard('Il pleuvait');
    await waitFor(() => expect(style('.ch-wait-dot').animationName).toBe('none'));
    expect(style('.ch-wait-dot').opacity).toBe('0.7');
    await userEvent.click(screen.getByRole('button', { name: 'Fermer le panneau' }));
    await waitFor(() => expect(document.querySelector('.ch-console-breath')).not.toBeNull());
    editor.focus();
    await userEvent.keyboard(' sur Nantes');
    await waitFor(() => expect(style('.ch-console-breath').animationName).toBe('none'));
    expect(style('.ch-console-breath').opacity).toBe('0.7');
  });

  it('holds still with « Réduire les animations »: the words and the time are enough', async () => {
    const { prefs } = await start();
    await userEvent.keyboard(chord('k'));
    await userEvent.keyboard('réduire les animations{Enter}');
    await waitFor(() => expect(document.documentElement.dataset['motion']).toBe('reduced'));
    expect(prefs.size).toBeGreaterThan(0);
    await openConversation();
    await userEvent.keyboard('Que veut Hélène ?{Enter}');
    await waitFor(() => expect(noBlock()).not.toBeNull());
    expect(style('.ch-wait-dot').animationName).toBe('none');
    expect(style('.ch-wait-dot').opacity).toBe('0.7');
    expect(block().textContent).toBe('Il réfléchit…');
    delete document.documentElement.dataset['motion'];
  });
});

describe('while the Compagnon prepares his answer, in the interview (DESIGN 1.34)', () => {
  it('shows the block on the page, then the answer in its place', async () => {
    const { compagnon, mentor } = await start();
    await openInterview();
    await userEvent.keyboard('Hélène est batelière.{Enter}');
    await waitFor(() => expect(block().textContent).toBe('Il réfléchit…'));
    const log = screen.getByRole('log');
    const wait = block().closest('.ch-wait');
    expect(wait).toBe(log.lastElementChild);
    expect(wait?.classList.contains('is-page')).toBe(true);
    expect(wait?.previousElementSibling?.className).toContain('ch-interview-author');
    expect(footer()).toMatch(/^⏎ quand il aura répondu · /);
    compagnon.phase('writing');
    await waitFor(() => expect(block().textContent).toBe('Il écrit sa réponse…'));

    addInterviewMessage(
      mentor(),
      { role: 'compagnon', text: 'Je note : batelière.', mode: 'free' },
      agentOrigin('interview'),
    );
    await waitFor(() => expect(noBlock()).toBeNull());
    expect(log.lastElementChild?.textContent).toContain('Je note : batelière.');
    compagnon.end();
    await waitFor(() => expect(footer()).toMatch(/^⏎ envoyer · /));
  });

  it('sends a stopped guided answer again on the section it was for', async () => {
    const { compagnon, mentor } = await start();
    await openInterview();
    await userEvent.keyboard(chord('{Shift>}m{/Shift}'));
    await waitFor(() => expect(compagnon.asked).toHaveLength(1));
    addInterviewMessage(
      mentor(),
      {
        role: 'compagnon',
        text: '',
        mode: 'guided',
        section: 'worldRules',
        question: 'Que peut la Loire ?',
      },
      agentOrigin('interview'),
    );
    compagnon.end();
    await screen.findByText('Que peut la Loire ?');
    const field = await screen.findByRole('textbox', { name: 'Votre réponse…' });
    field.focus();
    await userEvent.keyboard('Elle emporte tout.{Enter}');
    await waitFor(() => expect(compagnon.asked).toHaveLength(2));
    await userEvent.keyboard(chord('.'));
    await userEvent.click(await screen.findByRole('button', { name: 'Envoyer à nouveau' }));
    await waitFor(() => expect(compagnon.asked).toHaveLength(3));
    expect(compagnon.asked[1]?.input).toMatchObject({ mode: 'guided', section: 'worldRules' });
    expect(compagnon.asked[2]?.input).toEqual(compagnon.asked[1]?.input);
    compagnon.end();
  });

  it('stops with the keyboard, then sends the same message again', async () => {
    const { compagnon, mentor } = await start();
    await openInterview();
    await userEvent.keyboard('Hélène est batelière.{Enter}');
    await waitFor(() => expect(noBlock()).not.toBeNull());
    await userEvent.keyboard(chord('.'));
    await waitFor(() => expect(noBlock()).toBeNull());
    expect(interviewMessages(mentor()).map((m) => m.role)).toEqual(['author']);
    const log = screen.getByRole('log');
    await userEvent.click(within(log).getByRole('button', { name: 'Envoyer à nouveau' }));
    await waitFor(() => expect(noBlock()).not.toBeNull());
    expect(compagnon.asked.map((a) => a.kind)).toEqual(['interview', 'interview']);
    expect(interviewMessages(mentor()).map((m) => m.role)).toEqual(['author']);
    compagnon.end();
  });
});
