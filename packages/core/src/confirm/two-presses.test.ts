import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseKeybinding } from '../commands/keybinding';
import { TwoPresses, type TwoPressRequest } from './two-presses';

const key = (key: string) =>
  ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }) as KeyboardEvent;

describe('the two presses (DESIGN §4.7, rule 5)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const request = (
    id: string,
    ran: string[],
    where: 'inline' | 'status' = 'inline',
  ): TwoPressRequest => ({
    id,
    what: id,
    where,
    keys: [parseKeybinding('Backspace', 'Meta')],
    run: () => ran.push(id),
  });

  it('runs at the second press only, and counts down 3, 2, 1', () => {
    const presses = new TwoPresses();
    const ran: string[] = [];
    expect(presses.press(request('chapter', ran))).toBe(false);
    expect(ran).toEqual([]);
    expect(presses.armed()?.left).toBe(3);
    vi.advanceTimersByTime(1000);
    expect(presses.armed()?.left).toBe(2);
    vi.advanceTimersByTime(1000);
    expect(presses.armed()?.left).toBe(1);
    expect(presses.press(request('chapter', ran))).toBe(true);
    expect(ran).toEqual(['chapter']);
    expect(presses.armed()).toBeNull();
  });

  it('forgets after 3 s: nothing went, the next press asks again', () => {
    const presses = new TwoPresses();
    const ran: string[] = [];
    presses.press(request('chapter', ran));
    vi.advanceTimersByTime(3000);
    expect(presses.armed()).toBeNull();
    expect(presses.press(request('chapter', ran))).toBe(false);
    expect(ran).toEqual([]);
  });

  it('a press on another thing arms that one instead', () => {
    const presses = new TwoPresses();
    const ran: string[] = [];
    presses.press(request('a', ran));
    presses.press(request('b', ran));
    expect(presses.armed()?.id).toBe('b');
    expect(ran).toEqual([]);
  });

  it('Échap forgets; in the status line, any other key too, but not its own', () => {
    const presses = new TwoPresses();
    const ran: string[] = [];
    presses.press(request('menu', ran));
    presses.keyDown(key('ArrowDown'));
    expect(presses.armed()?.id).toBe('menu');
    presses.keyDown(key('Escape'));
    expect(presses.armed()).toBeNull();

    presses.press(request('line', ran, 'status'));
    presses.keyDown(key('Shift'));
    presses.keyDown(key('Backspace'));
    expect(presses.armed()?.id).toBe('line');
    presses.keyDown(key('a'));
    expect(presses.armed()).toBeNull();
    expect(ran).toEqual([]);
  });

  it('the status line button confirms what is armed', () => {
    const presses = new TwoPresses();
    const ran: string[] = [];
    expect(presses.confirm()).toBe(false);
    presses.press(request('line', ran, 'status'));
    expect(presses.confirm()).toBe(true);
    expect(ran).toEqual(['line']);
  });
});
