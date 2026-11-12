import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { filterByQuery } from '../commands/registry';
import type { PaletteRequest, PickItem } from './palette-request';
import './palette.css';

export interface PaletteCommand extends PickItem {
  run(): void;
}

export interface CommandPaletteProps {
  readonly request: PaletteRequest;
  /** Available commands, for `kind: 'commands'`. */
  readonly commands: readonly PaletteCommand[];
  readonly onClose: () => void;
}

/**
 * Keyboard-first palette: search commands, pick an item (a scene, a chapter…)
 * or type a value (a title). ↑↓ to move, ↵ to choose, Échap to leave.
 */
export function CommandPalette({ request, commands, onClose }: CommandPaletteProps) {
  const { t } = useTranslation();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(request.kind === 'input' ? request.initial : '');
  const [active, setActive] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const items: readonly PickItem[] =
    request.kind === 'commands' ? commands : request.kind === 'pick' ? request.items : [];
  const filtered =
    request.kind === 'input'
      ? []
      : filterByQuery(items, query, (i) => `${i.label} ${i.detail ?? ''}`);
  const activeIndex = Math.min(active, Math.max(filtered.length - 1, 0));
  const optionId = (i: number) => `${listId}-${i}`;

  useEffect(() => {
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
  });

  const choose = (item: PickItem | undefined) => {
    if (!item) return;
    onClose();
    if (request.kind === 'commands') commands.find((c) => c.id === item.id)?.run();
    else if (request.kind === 'pick') request.onPick(item.id);
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
        } else choose(filtered[activeIndex]);
        break;
      case 'ArrowDown':
        event.preventDefault();
        setActive(filtered.length ? (activeIndex + 1) % filtered.length : 0);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive(filtered.length ? (activeIndex - 1 + filtered.length) % filtered.length : 0);
        break;
    }
  };

  const placeholder =
    request.kind === 'commands' ? t('palette.searchCommands') : request.placeholder;
  const emptyText =
    request.kind === 'pick' && request.empty && items.length === 0
      ? request.empty
      : t('palette.noResults');

  return (
    <div className="ch-palette-backdrop" onMouseDown={onClose}>
      <div
        className="ch-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.label')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="ch-palette-input"
          value={query}
          placeholder={placeholder}
          aria-label={placeholder}
          spellCheck={false}
          {...(request.kind !== 'input' && {
            role: 'combobox',
            'aria-expanded': true,
            'aria-controls': listId,
            'aria-activedescendant': filtered.length ? optionId(activeIndex) : undefined,
          })}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        {request.kind !== 'input' && (
          <ul className="ch-palette-list" id={listId} role="listbox" aria-label={placeholder}>
            {filtered.map((item, i) => (
              <li
                key={item.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === activeIndex}
                className="ch-palette-item"
                onMouseMove={() => setActive(i)}
                onClick={() => choose(item)}
              >
                <span className="ch-palette-label">{item.label}</span>
                {item.detail && <span className="ch-palette-detail">{item.detail}</span>}
                {item.shortcut && <kbd className="ch-palette-shortcut">{item.shortcut}</kbd>}
              </li>
            ))}
            {filtered.length === 0 && <li className="ch-palette-empty">{emptyText}</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
