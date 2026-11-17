import { readProjectMeta } from '@charpentier/schema';
import type * as Y from 'yjs';
import { useDocSnapshot } from '../hooks/use-doc-snapshot';

/**
 * The macOS title bar merged with the background (docs/DESIGN.md §4.1): it
 * leaves room for the traffic lights and lets the window be dragged. In the
 * workspace, the novel's title button sits in its slot, after the traffic
 * lights (§4.8, 1.19); elsewhere (the library), the project's title is
 * centred in vermilion small caps.
 */
export function TitleBar({
  root,
  slot,
}: {
  readonly root: Y.Doc | undefined;
  /** Receives the slot where the workspace puts the novel's button; none: the centred title. */
  readonly slot?: ((element: HTMLDivElement | null) => void) | undefined;
}) {
  return (
    <div className="ch-titlebar">
      {slot ? (
        <div ref={slot} className="ch-titlebar-slot" />
      ) : (
        root && <ProjectTitle root={root} />
      )}
    </div>
  );
}

function ProjectTitle({ root }: { readonly root: Y.Doc }) {
  const meta = useDocSnapshot(root, readProjectMeta);
  return <span className="ch-titlebar-title">{meta?.title}</span>;
}
