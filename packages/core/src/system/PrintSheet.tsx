import type { SystemService } from '@charpentier/platform';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { featureText } from '../features/feature';
import type { WorkspaceContext } from '../workspace/workspace-context';
import { Keys } from './controls';
import { buildPrintPage, type PrintScope } from './print-page';
import { systemUi, useSystemState } from './system-store';

/**
 * « Imprimer » (⊞P, docs/DESIGN.md §4.12): a slate sheet in the middle of
 * the page: what (this scene, this chapter, the whole manuscript), which
 * printer, how many copies; « Imprimer ⏎ ».
 */
export function PrintSheet({
  ctx,
  system,
  scope: initialScope,
}: {
  readonly ctx: WorkspaceContext;
  readonly system: SystemService;
  readonly scope: PrintScope;
}) {
  const { t } = useTranslation();
  const p = (key: string, options?: Readonly<Record<string, unknown>>) =>
    featureText(t)(`system.print.${key}`, options);
  const state = useSystemState(system);
  const printers = state.printers;
  const [scope, setScope] = useState<PrintScope>(initialScope);
  const [printer, setPrinter] = useState(
    () => printers.find((x) => x.isDefault)?.name ?? printers[0]?.name ?? '',
  );
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState(false);
  const sheet = useRef<HTMLFormElement>(null);
  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, []);

  const close = () => {
    systemUi.print(null);
    if (ctx.editor && !ctx.editor.isDestroyed) ctx.editor.view.focus();
  };

  const submit = async () => {
    if (!printer || busy) return;
    setBusy(true);
    const { page, title } = await buildPrintPage(ctx, scope);
    try {
      await system.print({ printer, copies, title });
    } finally {
      page.remove();
      setBusy(false);
    }
    close();
  };

  return createPortal(
    <div
      className="ch-print-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <form
        ref={sheet}
        className="ch-tool ch-raised ch-print-sheet"
        role="dialog"
        aria-label={p('title')}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            close();
          } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
            e.preventDefault();
            void submit();
          }
        }}
      >
        <h2 className="ch-print-title">{p('title')}</h2>
        <div className="ch-print-row">
          <span className="ch-label">{p('what')}</span>
          <Keys<PrintScope>
            options={[
              { value: 'scene', label: p('scene') },
              { value: 'chapter', label: p('chapter') },
              { value: 'manuscript', label: p('manuscript') },
            ]}
            value={scope}
            label={p('what')}
            onChange={setScope}
          />
        </div>
        <div className="ch-print-row">
          <span className="ch-label">{p('printer')}</span>
          {printers.length ? (
            <Keys<string>
              options={printers.map((x) => ({ value: x.name, label: x.name }))}
              value={printer}
              label={p('printer')}
              onChange={setPrinter}
            />
          ) : (
            <span className="ch-print-none">{p('noPrinter')}</span>
          )}
        </div>
        <div className="ch-print-row">
          <span className="ch-label">{p('copies')}</span>
          <input
            type="number"
            className="ch-print-copies"
            aria-label={p('copies')}
            min={1}
            max={99}
            value={copies}
            onChange={(e) => setCopies(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
          />
        </div>
        <p className="ch-print-actions">
          <button type="submit" className="ch-btn" disabled={busy || !printer}>
            {busy ? p('busy') : p('print')} <kbd>{p('enterKey')}</kbd>
          </button>
          <button type="button" className="ch-btn" onClick={close}>
            {p('cancel')} <kbd>{p('escapeKey')}</kbd>
          </button>
        </p>
      </form>
    </div>,
    document.body,
  );
}
