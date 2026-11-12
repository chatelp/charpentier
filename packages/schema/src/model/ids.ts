/** Random, stable identifiers (never indexes). */
export const newId = (): string => crypto.randomUUID();

export const nowIso = (): string => new Date().toISOString();

/** Guids of the Yjs documents of a project (docs/SPEC.md §15.1). */
export const guids = {
  project: (projectId: string) => `project:${projectId}`,
  scene: (projectId: string, sceneId: string) => `project:${projectId}/scene:${sceneId}`,
  sceneHistory: (projectId: string, sceneId: string) =>
    `project:${projectId}/scene:${sceneId}/history`,
  mentor: (projectId: string) => `project:${projectId}/mentor`,
} as const;

/**
 * Names of the top-level shared types. Top-level types are used for anything
 * that two replicas could create concurrently: Yjs merges same-named
 * top-level types, whereas two nested types created under the same map key
 * would overwrite each other.
 */
export const names = {
  meta: 'meta',
  chapters: 'chapters',
  scenes: 'scenes',
  signals: 'signals',
  module: (module: string) => `module:${module}`,
  variant: (variantId: string) => `variant:${variantId}`,
  checkpoints: 'checkpoints',
} as const;
