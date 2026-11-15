import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { filterByQuery } from '../commands/registry';
import { matchRanges } from './highlight';
import type { PaletteRequest, PaletteScope, PickItem } from './palette-request';
import './palette.css';
import { CloseButton } from '../icons/CloseButton';

export interface PaletteCommand extends PickItem {
  run(): void;
}

export interface CommandPaletteProps {
  readonly request: PaletteRequest;
  /** Available commands, for `kind: 'commands'`. */
  readonly commands: readonly PaletteCommand[];
  /** Other searches of the command line, by prefix: `#` scenes… (`>` is the commands). */
  readonly scopes?: Readonly<Record<string, PaletteScope>>;
  /**
   * With nothing typed: the commands used last, then the most useful ones,
   * before all the others (docs/DESIGN.md §4.6), so that a beginner sees what exists.
   */
  readonly recent?: readonly string[];
  readonly suggested?: readonly string[];
  readonly onClose: () => void;
}

const COMMANDS_PREFIX = '>';
/** Typing freely: at most this many results of each kind. */
const MIXED_LIMIT = 5;

interface Section {
  readonly key: string;
  readonly label?: string;
  /** Symbol of the kind of result: › commands, @ sheets, # scenes. */
  readonly icon?: string;
  readonly items: readonly PickItem[];
  pick(item: PickItem): void;
}

function Highlighted({ text, query }: { readonly text: string; readonly query: string }) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of matchRanges(text, query)) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(<mark key={start}>{text.slice(start, end)}</mark>);
    at = end;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

/**
 * The command line (docs/DESIGN.md §4.6), at the bottom of the window:
 * search commands (or, with a prefix, scenes…), pick an item, or type a value
 * (a title). ↑↓ to move, ↵ to choose, Échap to go back to the text.
 */
export function CommandPalette({
  request,
  commands,
  scopes = {},
  recent = [],
  suggested = [],
  onClose,
}: CommandPaletteProps) {
  const { t } = useTranslation();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(
    request.kind === 'input'
      ? request.initial
      : request.kind === 'commands'
        ? (request.query ?? '')
        : '',
  );
  const [active, setActive] = useState(0);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    // A prefilled prefix is kept, the cursor after it; a value to edit is selected.
    if (request.kind === 'input') input.select();
    else input.setSelectionRange(input.value.length, input.value.length);
  }, [request.kind]);

  const prefix = request.kind === 'commands' ? query.charAt(0) : '';
  const scope = request.kind === 'commands' ? scopes[prefix] : undefined;
  const search =
    request.kind === 'commands' && (scope || prefix === COMMANDS_PREFIX) ? query.slice(1) : query;
  const match = (items: readonly PickItem[]) =>
    filterByQuery(items, search, (i) => `${i.label} ${i.detail ?? ''}`);

  // What the line shows: one search (a prefix, a pick list) or, typing freely,
  // commands, sheets and scenes together (docs/DESIGN.md §4.6).
  const sections: Section[] = (() => {
    if (request.kind === 'input') return [];
    if (request.kind === 'pick')
      return [
        { key: 'pick', items: match(request.items), pick: (item) => request.onPick(item.id) },
      ];
    const runCommand = (item: PickItem) => commands.find((c) => c.id === item.id)?.run();
    if (scope)
      return [
        {
          key: prefix,
          label: scope.label,
          icon: prefix,
          items: scope.search ? scope.search(search) : match(scope.items),
          pick: (item) => scope.onPick(item.id, search),
        },
      ];
    const commandSection: Section = {
      key: COMMANDS_PREFIX,
      label: t('palette.commandsGroup'),
      icon: '›',
      items: match(commands),
      pick: runCommand,
    };
    if (prefix === COMMANDS_PREFIX) return [commandSection];
    if (!search.trim()) {
      const byId = (ids: readonly string[]) =>
        ids.flatMap((id) => commands.filter((c) => c.id === id));
      const recentItems = byId(recent);
      const suggestedItems = byId(suggested).filter((c) => !recent.includes(c.id));
      return [
        { ...commandSection, key: 'recent', label: t('palette.recentGroup'), items: recentItems },
        {
          ...commandSection,
          key: 'suggested',
          label: t('palette.suggestedGroup'),
          items: suggestedItems,
        },
        { ...commandSection, label: t('palette.allCommandsGroup') },
      ].filter((section) => section.items.length > 0);
    }
    return [
      { ...commandSection, items: commandSection.items.slice(0, MIXED_LIMIT) },
      ...Object.entries(scopes)
        .filter(([, s]) => !s.search)
        .map(([key, s]) => ({
          key,
          label: s.label,
          icon: key,
          items: match(s.items).slice(0, MIXED_LIMIT),
          pick: (item: PickItem) => s.onPick(item.id, search),
        })),
    ].filter((section) => section.items.length > 0);
  })();
  const flat = sections.flatMap((section) => section.items.map((item) => ({ item, section })));
  const activeIndex = Math.min(active, Math.max(flat.length - 1, 0));
  const optionId = (i: number) => `${listId}-${i}`;

  useEffect(() => {
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
  });

  const choose = (entry: (typeof flat)[number] | undefined) => {
    if (!entry) return;
    onClose();
    entry.section.pick(entry.item);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        onClose();
        break;
      case 'Enter':
        event.preventDefault();
        if (request.kind === 'input') {
          onClose();
          request.onSubmit(query);
        } else choose(flat[activeIndex]);
        break;
      case 'ArrowDown':
        event.preventDefault();
        setActive(flat.length ? (activeIndex + 1) % flat.length : 0);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive(flat.length ? (activeIndex - 1 + flat.length) % flat.length : 0);
        break;
    }
  };

  const placeholder =
    request.kind === 'commands' ? t('palette.searchCommands') : request.placeholder;
  const emptyText =
    request.kind === 'pick' && request.empty && request.items.length === 0
      ? request.empty
      : t('palette.noResults');
  const showHint = request.kind === 'commands' && Object.keys(scopes).length > 0;

  return (
    <div className="ch-cmd-backdrop" onMouseDown={onClose}>
      <div
        className="ch-cmdbar ch-tool"
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.label')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ch-cmd-field">
          <span className="ch-cmd-prompt" aria-hidden="true">
            ›
          </span>
          <input
            ref={inputRef}
            className="ch-cmd-input"
            type={request.kind === 'input' && request.secret ? 'password' : 'text'}
            autoComplete="off"
            value={query}
            placeholder={placeholder}
            aria-label={placeholder}
            spellCheck={false}
            {...(request.kind !== 'input' && {
              role: 'combobox',
              'aria-expanded': true,
              'aria-controls': listId,
              'aria-activedescendant': flat.length ? optionId(activeIndex) : undefined,
            })}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          {showHint && <span className="ch-cmd-hint">{t('palette.prefixHint')}</span>}
          <CloseButton purpose="commandLine" onClose={onClose} />
        </div>
        {request.kind !== 'input' && (
          <div className="ch-cmd-results ch-raised ch-tool">
            <ul className="ch-cmd-list" id={listId} role="listbox" aria-label={placeholder}>
              {sections.map((section) => (
                <li key={section.key} role="presentation">
                  {section.label && (
                    <p className="ch-cmd-group ch-label" aria-hidden="true">
                      {section.label}
                    </p>
                  )}
                  <ul role="presentation" className="ch-cmd-list">
                    {section.items.map((item) => {
                      const i = flat.findIndex((e) => e.item === item && e.section === section);
                      return (
                        <li
                          key={item.id}
                          id={optionId(i)}
                          role="option"
                          aria-selected={i === activeIndex}
                          className="ch-cmd-item"
                          onMouseMove={() => setActive(i)}
                          onClick={() => choose(flat[i])}
                        >
                          {section.icon && (
                            <span className="ch-cmd-icon" aria-hidden="true">
                              {section.icon}
                            </span>
                          )}
                          <span className="ch-cmd-label">
                            <Highlighted text={item.label} query={search} />
                          </span>
                          {item.detail && <span className="ch-cmd-detail">{item.detail}</span>}
                          {item.shortcut && <kbd className="ch-cmd-shortcut">{item.shortcut}</kbd>}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
              {flat.length === 0 && <li className="ch-cmd-empty">{emptyText}</li>}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
