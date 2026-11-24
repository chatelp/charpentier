import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useHostWords } from '../app/host-words';
import { matchesCharacter } from '../commands/keybinding';
import { filterByQuery } from '../commands/registry';
import {
  ariaKeyShortcut,
  isInert,
  type MenuAnchor,
  type MenuEntry,
  type ThingMenu,
} from './thing-menu';
import './menu.css';

/** Air kept between the sheet and the window's edge, and between the sheet and its « ⋯ ». */
const EDGE = 8;
const GAP = 4;
/** A list of choices longer than this filters as the author types (docs/DESIGN.md §4.7). */
const FILTER_FROM = 7;

const ENABLED_ITEMS = '[role="menuitem"]:not([aria-disabled="true"])';

/**
 * The menu the workspace holds open, as long as its thing is there: it closes by itself when
 * the thing leaves (trashed from another device) or when its line does (its panel closed).
 */
export function ThingMenuHost({
  menu,
  line,
  onGone,
  ...sheet
}: Omit<Parameters<typeof ThingMenuSheet>[0], 'menu'> & {
  readonly menu: ThingMenu | null;
  readonly line: HTMLElement | null;
  onGone(): void;
}) {
  useEffect(() => {
    if (!menu || line?.isConnected === false) onGone();
  });
  return menu ? <ThingMenuSheet menu={menu} {...sheet} /> : null;
}

/**
 * The sheet of a thing's menu (docs/DESIGN.md §4.7): a raised sheet under the
 * « ⋯ » or at the pointer, turned upward when room is short. ↑ ↓ walk the
 * entries (the inert ones are skipped), ⏎ chooses, the key shown acts
 * directly, Échap closes and gives the focus back to the line, a click
 * elsewhere closes. An entry with choices replaces the content by its list.
 *
 * While it is open the menu holds the keyboard and the mouse: what is around
 * it is inert, so a click elsewhere closes the menu and does nothing more.
 */
export function ThingMenuSheet({
  menu,
  anchor,
  surface,
  onClose,
  onChoose,
}: {
  readonly menu: ThingMenu;
  readonly anchor: MenuAnchor;
  readonly surface: 'tool' | 'page';
  /** Closed without a choice (Échap, a click elsewhere): the thing's line has the focus again. */
  onClose(): void;
  /** An entry or a choice was chosen: the menu closes, then it runs. */
  onChoose(run: () => void): void;
}) {
  const { t } = useTranslation();
  const host = useHostWords();
  const sheet = useRef<HTMLDivElement>(null);
  // The entry whose choices replace the content, and what the author typed to filter them.
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // The entry to light when the list of choices gives the content back.
  const backTo = useRef<string | null>(null);

  const entries = menu.groups.flatMap((g) => g.entries);
  const parent = entries.find((e) => e.id === openId && e.choices && !isInert(e));
  const filterable = (parent?.choices?.length ?? 0) > FILTER_FROM;
  const choices =
    parent?.choices && filterable
      ? filterByQuery(parent.choices, query, (c) => c.label)
      : parent?.choices;

  // Under the « ⋯ », right-aligned on it, or at the pointer; upward when room is short.
  useLayoutEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const room = window.innerHeight - EDGE;
    // Where the sheet hangs: under the button (a little air between them), or at the pointer.
    const button = anchor.kind === 'button' ? anchor.element.getBoundingClientRect() : null;
    const left = button ? button.right - width : anchor.kind === 'point' ? anchor.x : 0;
    const below = button ? button.bottom + GAP : anchor.kind === 'point' ? anchor.y : 0;
    const over = (button ? button.top - GAP : below) - height;
    const above = below + height > room && over >= EDGE;
    const top = above ? over : below;
    el.style.left = `${Math.max(EDGE, Math.min(left, window.innerWidth - width - EDGE))}px`;
    el.style.top = `${Math.max(EDGE, Math.min(top, room - height))}px`;
    el.dataset['placement'] = above ? 'above' : 'below';
  });

  // The focus stays in the sheet: on the first entry at opening, on the first
  // choice of a list, on the entry a list came from when it gives the content back.
  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const back = backTo.current;
    backTo.current = null;
    const from = back ? el.querySelector<HTMLElement>(`[data-entry="${CSS.escape(back)}"]`) : null;
    if (from) return from.focus();
    if (el.contains(document.activeElement) && document.activeElement !== el) return;
    (
      el.querySelector<HTMLElement>(`${ENABLED_ITEMS}:not(.ch-menu-back)`) ??
      el.querySelector<HTMLElement>(ENABLED_ITEMS) ??
      el
    ).focus();
  });

  // What is around the sheet is inert while it is open, and is not once it has closed: the
  // line can take the focus back at once.
  const release = useRef(() => {});
  useLayoutEffect(() => {
    const el = sheet.current;
    const around = [...(el?.parentElement?.children ?? [])].filter(
      (other): other is HTMLElement => other instanceof HTMLElement && other !== el && !other.inert,
    );
    for (const other of around) other.inert = true;
    release.current = () => {
      for (const other of around) other.inert = false;
      release.current = () => {};
    };
    return () => release.current();
  }, []);
  const leave = () => {
    release.current();
    onClose();
  };
  const choose = (run: () => void) => {
    release.current();
    onChoose(run);
  };

  const closing = useRef(leave);
  useLayoutEffect(() => {
    closing.current = leave;
  });
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (sheet.current?.contains(event.target as Node)) return;
      // The click closes the menu and is spent: the focus stays for the line to take back.
      event.preventDefault();
      closing.current();
    };
    const away = () => closing.current();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('resize', away);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', away);
    };
  }, []);

  const activate = (entry: MenuEntry) => {
    if (isInert(entry)) return;
    if (entry.choices) {
      setQuery('');
      setOpenId(entry.id);
    } else if (entry.keepOpen) entry.run?.();
    else if (entry.run) choose(entry.run);
  };
  const back = () => {
    backTo.current = openId;
    setOpenId(null);
  };

  const move = (step: 1 | -1 | 'first' | 'last') => {
    const items = [...(sheet.current?.querySelectorAll<HTMLElement>(ENABLED_ITEMS) ?? [])];
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next =
      step === 'first'
        ? 0
        : step === 'last'
          ? items.length - 1
          : index < 0
            ? 0
            : (index + step + items.length) % items.length;
    items[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // The menu holds the keyboard: no key goes on to the list under it.
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    const handled = () => event.preventDefault();
    const plain = !event.metaKey && !event.ctrlKey && !event.altKey;
    const key = event.key;
    if (plain && !event.shiftKey && key === 'ArrowDown') return (handled(), move(1));
    if (plain && !event.shiftKey && key === 'ArrowUp') return (handled(), move(-1));
    if (plain && key === 'Home') return (handled(), move('first'));
    if (plain && key === 'End') return (handled(), move('last'));
    if (plain && key === 'Escape') return (handled(), leave());
    // Tab leaves a menu: it closes, the line has the focus again.
    if (key === 'Tab') return (handled(), leave());
    if (plain && (key === 'Enter' || (key === ' ' && !(parent && query)))) {
      handled();
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && sheet.current?.contains(focused)) focused.click();
      return;
    }
    if (parent) {
      if (plain && key === 'ArrowLeft') return (handled(), back());
      if (!filterable || !plain) return;
      if (key === 'Backspace') return (handled(), setQuery(query.slice(0, -1)));
      if (key.length === 1) return (handled(), setQuery(query + key));
      return;
    }
    // The key shown acts directly (⏎ is the focused entry's, above).
    const hit = entries.find(
      (e) =>
        !isInert(e) &&
        e.keys?.some(
          (chord) => chord.key !== 'Enter' && matchesCharacter(chord, event.nativeEvent),
        ),
    );
    if (hit) {
      handled();
      activate(hit);
    }
  };

  const head = t('thingMenu.head', menu.head);
  return (
    <div
      ref={sheet}
      className={`ch-menu${surface === 'tool' ? ' ch-tool' : ''}`}
      role="menu"
      aria-label={head}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      // The browser's own menu never shows on the menu of a thing either.
      onContextMenu={(event) => event.preventDefault()}
    >
      {parent && choices ? (
        <>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="ch-menu-item ch-menu-back"
            aria-keyshortcuts="ArrowLeft"
            onClick={back}
            onMouseMove={(event) => event.currentTarget.focus()}
          >
            <span className="ch-menu-label">{t('thingMenu.back')}</span>
            <kbd aria-hidden="true">{host.key('ArrowLeft')}</kbd>
          </button>
          <div className="ch-menu-group" role="group" aria-label={parent.label}>
            {filterable && query && (
              <p className="ch-menu-filter" aria-live="polite">
                {query}
              </p>
            )}
            {choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="ch-menu-item"
                onClick={() => choose(choice.run)}
                onMouseMove={(event) => event.currentTarget.focus()}
              >
                <span className="ch-menu-label">{choice.label}</span>
                {choice.detail && <span className="ch-menu-detail">{choice.detail}</span>}
              </button>
            ))}
            {choices.length === 0 && (
              <p className="ch-menu-filter">{parent?.empty ?? t('thingMenu.noMatch')}</p>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="ch-menu-head ch-label" aria-hidden="true">
            {head}
          </p>
          {menu.groups.map((group) => (
            <div
              key={group.id}
              className="ch-menu-group"
              role={group.title ? 'group' : 'none'}
              aria-label={group.title}
            >
              {group.title && (
                <p className="ch-menu-title ch-label" aria-hidden="true">
                  {group.title}
                </p>
              )}
              {group.entries.map((entry) => {
                const inert = isInert(entry);
                const shown = entry.keys?.[0];
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    data-entry={entry.id}
                    data-command={inert ? undefined : entry.command}
                    className={`ch-menu-item${entry.lit ? ' is-lit' : ''}`}
                    aria-disabled={inert || undefined}
                    aria-haspopup={!inert && entry.choices ? 'menu' : undefined}
                    aria-keyshortcuts={
                      !inert && entry.shortcut && shown ? ariaKeyShortcut(shown) : undefined
                    }
                    title={entry.disabled}
                    onClick={() => activate(entry)}
                    onMouseMove={inert ? undefined : (event) => event.currentTarget.focus()}
                  >
                    <span className="ch-menu-label">{entry.label}</span>
                    {!inert && entry.shortcut && <kbd aria-hidden="true">{entry.shortcut}</kbd>}
                    {entry.countdown && (
                      <span className="ch-menu-detail ch-menu-countdown">{entry.countdown}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
