import { readProjectMeta } from '@charpentier/schema';
import type * as Y from 'yjs';
import { useDocSnapshot } from '../hooks/use-doc-snapshot';

/**
 * The macOS title bar merged with the background (docs/DESIGN.md §4.1): it
 * leaves room for the traffic lights, lets the window be dragged, and shows
 * the project's title in vermilion small caps.
 */
export function TitleBar({ root }: { readonly root: Y.Doc | undefined }) {
  return <div className="ch-titlebar">{root && <ProjectTitle root={root} />}</div>;
}

function ProjectTitle({ root }: { readonly root: Y.Doc }) {
  const meta = useDocSnapshot(root, readProjectMeta);
  return <span className="ch-titlebar-title">{meta?.title}</span>;
}
