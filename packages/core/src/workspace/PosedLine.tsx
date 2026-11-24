import type { ReactNode } from 'react';

/**
 * A phrase whose name alone is cut when room is short (docs/DESIGN.md §4.7 « La ligne posée »):
 * the verb, the counts and the « » around it stay whole.
 */
export function CutPhrase({
  text,
  name,
}: {
  readonly text: string;
  /** The name in it, as it stands between its « ». */
  readonly name?: string | undefined;
}) {
  const quoted = name ? `«\u00a0${name}\u00a0»` : '';
  const at = quoted ? text.indexOf(quoted) : -1;
  if (!name || at < 0) return <span className="ch-posed-text">{text}</span>;
  return (
    <span className="ch-posed-text">
      <span>{text.slice(0, at + 2)}</span>
      <span className="ch-posed-name">{name}</span>
      <span>{text.slice(at + 2 + name.length)}</span>
    </span>
  );
}

/**
 * The state line that carries a button (docs/DESIGN.md §4.7, 1.43): above the foot, on its
 * right, on one line, over the page's text, which does not move. Its place is always there, so
 * that what comes in it is read (`said`: the phrase whole; what shows is the plate).
 */
export function PosedLine({
  said,
  children,
}: {
  readonly said: string;
  readonly children?: ReactNode;
}) {
  return (
    <div className="ch-footer-posed">
      <span role="status" aria-live="polite" className="ch-visually-hidden">
        {said}
      </span>
      {children}
    </div>
  );
}
