import {
  fragmentPlainText,
  getScene,
  listEntities,
  readProjectMeta,
  readSingleton,
  variantFragment,
  type FieldState,
} from '@charpentier/schema';
import type * as Y from 'yjs';

const valueOf = (state: FieldState | undefined): string | undefined => {
  const value = state?.status === 'validated' ? state.value : undefined;
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? value : JSON.stringify(value);
};

/**
 * What the author has validated in their sheets, as compact text for the
 * Compagnon (proposals and rejections are left out: they are not facts yet).
 */
export function sheetsSummary(root: Y.Doc): string {
  const lines: string[] = [];
  const meta = readSingleton(root, 'meta');
  for (const [field, state] of Object.entries(meta)) {
    const value = valueOf(state);
    if (value) lines.push(`meta.${field}: ${value}`);
  }
  const structure = valueOf(readSingleton(root, 'structure')['narrativeModel']);
  if (structure) lines.push(`structure.narrativeModel: ${structure}`);
  for (const module of ['characters', 'worldRules', 'clues', 'acts', 'arcs'] as const) {
    for (const entity of listEntities(root, module)) {
      if (entity.status !== 'validated') continue;
      const fields = Object.entries(entity.fields)
        .map(([field, state]) => [field, valueOf(state)] as const)
        .filter((entry): entry is readonly [string, string] => entry[1] !== undefined)
        .map(([field, value]) => `${field}: ${value}`);
      if (fields.length) lines.push(`${module} [${entity.id}] ${fields.join('; ')}`);
    }
  }
  return lines.join('\n');
}

/** The project title and a scene's active variant as plain text. */
export function sceneContext(
  root: Y.Doc,
  sceneDoc: Y.Doc | undefined,
  sceneId: string | undefined,
) {
  const scene = sceneId ? getScene(root, sceneId) : undefined;
  return {
    projectTitle: readProjectMeta(root)?.title ?? '',
    language: readProjectMeta(root)?.language ?? 'fr',
    ...(scene &&
      sceneDoc && {
        scene: {
          title: scene.title,
          text: fragmentPlainText(variantFragment(sceneDoc, scene.activeVariantId)),
        },
      }),
  };
}
