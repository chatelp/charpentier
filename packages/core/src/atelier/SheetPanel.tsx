import type { KeyboardEvent } from 'react';
import { useMemo, useRef } from 'react';
import { usePanelEntry } from '../workspace/panel-entry';
import { useTranslation } from 'react-i18next';
import { useDocSnapshot } from '../hooks/use-doc-snapshot';
import type { WorkspaceContext } from '../workspace/workspace-context';
import { readAtelier, sceneNumbers, shownValue, type SheetTarget } from './atelier-data';
import { Sheet } from './Atelier';
import { moduleDefs } from './module-defs';
import './atelier.css';
import { CloseButton } from '../icons/CloseButton';
import { useHostWords } from '../app/host-words';

export interface SheetPanelProps {
  readonly ctx: WorkspaceContext;
  readonly target: SheetTarget;
  readonly active: boolean;
  readonly onOpenInAtelier: () => void;
  readonly onClose: () => void;
}

/**
 * A sheet beside the text (docs/DESIGN.md §4.5 « fiche en volet »), in one
 * column: ↑↓ through the fields, ↵ to edit, ⌘⏎ opens it in the Atelier,
 * Échap goes back to the text.
 */
export function SheetPanel({ ctx, target, active, onOpenInAtelier, onClose }: SheetPanelProps) {
  const { t } = useTranslation();
  const data = useDocSnapshot(ctx.root, readAtelier);
  const numbers = useMemo(() => sceneNumbers(ctx.outline), [ctx.outline]);
  const panel = useRef<HTMLElement>(null);
  const host = useHostWords();
  const def = moduleDefs[target.module];
  const entity =
    target.entityId !== undefined && def.kind === 'entity'
      ? data.entities[def.name].find((e) => e.id === target.entityId)
      : undefined;
  const title =
    def.kind === 'entity'
      ? String(
          shownValue(entity?.fields[def.titleField] ?? { status: undefined, rejected: [] }) ?? '',
        )
      : (data.project?.title ?? '');

  // The first field takes the focus when the author opens the sheet, not when
  // it reopens with the project or when the command line closes.
  usePanelEntry(ctx.panelEntry, active, () =>
    panel.current?.querySelector<HTMLElement>('[data-field-value]')?.focus(),
  );

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onOpenInAtelier();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (
      event.key === 'X' &&
      event.shiftKey &&
      !(event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement)
    ) {
      // ⇧X: show or hide the rejections, as in the Atelier.
      event.preventDefault();
      ctx.updatePrefs((p) => ({ showRejected: !p.showRejected }));
    } else if (
      (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
      event.target instanceof HTMLElement &&
      event.target.hasAttribute('data-field-value')
    ) {
      event.preventDefault();
      const fields = [
        ...(panel.current?.querySelectorAll<HTMLElement>('[data-field-value]') ?? []),
      ];
      const index = fields.indexOf(event.target);
      fields[
        Math.max(0, Math.min(fields.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))
      ]?.focus();
    }
  };

  return (
    <aside
      ref={panel}
      className="ch-mentor-panel ch-raised ch-volet ch-tool"
      aria-label={t('atelier.sheetPanel')}
      onKeyDown={onKeyDown}
    >
      <div className="ch-volet-body">
        <Sheet
          ctx={ctx}
          data={data}
          target={target}
          title={title || t(`atelier.untitled.${target.module as 'characters'}`)}
          sceneNumber={(id) => numbers.get(id)}
          onShowPassage={(sceneId) => {
            ctx.openScene(sceneId);
            onClose();
          }}
        />
      </div>
      <p className="ch-panel-hint">
        {t('atelier.sheetPanelHint', {
          newline: host.key('Shift-Enter'),
          open: host.key('Mod-Enter'),
        })}
      </p>
      <CloseButton purpose="panel" onClose={onClose} corner />
    </aside>
  );
}
