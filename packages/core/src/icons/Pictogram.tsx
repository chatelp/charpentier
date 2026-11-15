import type { ReactNode } from 'react';
import { CloseButton } from './CloseButton';
import './icons.css';

/**
 * The eight engraved pictograms (docs/design/pictos, docs/DESIGN.md §4.11):
 * 24 × 24, a 1.5 px stroke in the current colour. Never alone: always next
 * to their label, so they are hidden from assistive technologies.
 */
const DRAWINGS = {
  compagnon: (
    <>
      <circle cx="12" cy="5" r="1.7" />
      <path d="M11.3 6.6 6 20M12.7 6.6 18 20M8.3 14.5h7.4" />
    </>
  ),
  manuscrit: (
    <path d="M4 5.5c3-1 6-.8 8 1 2-1.8 5-2 8-1V18c-3-1-6-.8-8 1-2-1.8-5-2-8-1zM12 6.5V19" />
  ),
  meta: <path d="M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h5" />,
  entretien: <path d="M4 5h16v11H10l-4 4v-4H4zM8 9.5h8M8 12.5h5" />,
  personnages: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1-5 4-7 7-7s6 2 7 7" />
    </>
  ),
  structure: <path d="M3 18h18M4 18 12 6l8 12M12 6v12M8 12l4 6M16 12l-4 6" />,
  regles: <path d="M7 3h10M12 3v10M9 13h6l-3 7z" />,
  indices: (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="m15 15 5 5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type PictogramName = keyof typeof DRAWINGS;

export function Pictogram({ name, size }: { readonly name: PictogramName; readonly size: number }) {
  return (
    <svg
      className="ch-picto"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {DRAWINGS[name]}
    </svg>
  );
}

/** A pictogram in its medallion: raised, or engraved when its place is the active one. */
export function Medallion({
  name,
  size,
  active = false,
  mentor = false,
}: {
  readonly name: PictogramName;
  /** 46 at the head of the interview, 34 in a panel title, 30 in the Atelier's rail. */
  readonly size: 46 | 34 | 30;
  readonly active?: boolean;
  readonly mentor?: boolean;
}) {
  return (
    <span
      className={`ch-medallion${active ? ' is-active' : ''}${mentor ? ' is-mentor' : ''}`}
      style={{ width: size, height: size }}
    >
      <Pictogram name={name} size={size === 46 ? 24 : size === 34 ? 19 : 17} />
    </span>
  );
}

/** The initial of an entry, without its article (« Le technicien » gives T). */
export function initialOf(title: string): string {
  const words = title.trim().split(/\s+/);
  const article = /^(le|la|les|un|une|des|du|de|l[’'].*|d[’'].*)$/i;
  const first = words.find((w, i) => i === words.length - 1 || !article.test(w)) ?? '';
  const elided = /^[ld][’']/i.exec(first) ? first.slice(2) : first;
  return elided.charAt(0).toUpperCase();
}

/** The monogram of an entry: its initial in a raised disc (docs/DESIGN.md §4.11). */
export function Monogram({
  title,
  size,
  state = 'rest',
}: {
  readonly title: string;
  readonly size: 30 | 62;
  readonly state?: 'rest' | 'active' | 'proposed';
}) {
  return (
    <span className={`ch-monogram is-${state}${size === 62 ? ' is-large' : ''}`} aria-hidden="true">
      {initialOf(title)}
    </span>
  );
}

/**
 * A panel's engraved title (docs/DESIGN.md §4.11): medallion, title, its
 * context, and the close cross at the end (§4.8). The name never breaks: the
 * context shortens first.
 */
export function PanelTitle({
  picto,
  name,
  context,
  variant,
  onClose,
}: {
  readonly picto: PictogramName;
  readonly name: string;
  readonly context: string;
  readonly variant: 'mentor' | 'manuscript';
  readonly onClose?: () => void;
}) {
  return (
    <div className="ch-panel-title">
      <Medallion name={picto} size={34} mentor={variant === 'mentor'} />
      <p className={`ch-panel-title-name is-${variant}`}>{name}</p>
      <span className="ch-panel-title-context">{context}</span>
      {onClose && <CloseButton purpose="panel" onClose={onClose} />}
    </div>
  );
}
