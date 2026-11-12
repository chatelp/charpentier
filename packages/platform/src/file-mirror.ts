/**
 * Read-only view of the Markdown mirror (docs/SPEC.md §17). The mirror itself
 * runs inside the host (Electron main process); core only shows its state.
 */
export interface FileMirrorService {
  /** Absolute location of the project's folder, for display only. */
  projectLocation(projectId: string): Promise<string>;
  /** Opens the project's folder in the OS file manager. */
  revealProject(projectId: string): Promise<void>;
  onStatus(listener: (status: FileMirrorStatus) => void): Unsubscribe;
}

export type FileMirrorStatus =
  | { readonly state: 'idle' }
  | { readonly state: 'writing' }
  | { readonly state: 'error'; readonly message: string };

export type Unsubscribe = () => void;
