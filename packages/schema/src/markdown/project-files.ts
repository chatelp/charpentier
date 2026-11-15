import type * as Y from 'yjs';
import { evidenceSceneId, type FieldState } from '../model/fields';
import { entityModules, listEntities, readSingleton, singletonModules } from '../model/modules';
import { readOutline } from '../model/manuscript';
import { variantFragment } from '../model/scene-content';
import { fragmentToSceneDoc } from '../model/scene-text-bridge';
import { serializeSceneMarkdown } from './serialize';
import { toYaml } from './yaml';

/**
 * A project as Markdown files (docs/SPEC.md §17, D-8): one `.md` per scene
 * (its active variant) in a folder per chapter, the modules as YAML. The
 * desktop's mirror writes them into a folder; the server's administration
 * puts them in an archive (docs/PLAN.md phase 4.6). Paths use `/`.
 */

export const MANUSCRIPT_DIR = 'manuscrit';
export const MODULES_DIR = 'modules';

const pad = (n: number) => String(n).padStart(2, '0');

/** `Le retour à Nantes` → `le-retour-a-nantes`. */
export function slug(title: string): string {
  return (
    title
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '') || 'sans-titre'
  );
}

/** A scene's file: its ids in the frontmatter (matched by them on import), then its text. */
export function sceneFile(sceneId: string, variantId: string, body: string): string {
  return [
    '---',
    '# Charpentier : identifiants de la scène, à ne pas modifier.',
    `scene: ${sceneId}`,
    `variant: ${variantId}`,
    '---',
    '',
    body,
  ].join('\n');
}

/** Where each live scene's file goes, in the manuscript's order. */
export function scenePaths(root: Y.Doc) {
  return readOutline(root).flatMap((chapter, ci) =>
    chapter.scenes.map((scene, si) => ({
      sceneId: scene.id,
      variantId: scene.activeVariantId,
      path: `${MANUSCRIPT_DIR}/${pad(ci + 1)}-${slug(chapter.title)}/${pad(si + 1)}-${slug(scene.title)}.md`,
    })),
  );
}

/** A scene's active variant, as the body of its file. */
export const sceneMarkdown = (sceneDoc: Y.Doc, variantId: string) =>
  serializeSceneMarkdown(fragmentToSceneDoc(variantFragment(sceneDoc, variantId)));

const MODULE_FILES: Record<string, string> = {
  meta: 'meta.yaml',
  characters: 'personnages.yaml',
  structure: 'structure.yaml',
  acts: 'structure.yaml',
  arcs: 'structure.yaml',
  worldRules: 'regles-du-monde.yaml',
  clues: 'indices.yaml',
};

function fieldForYaml(state: FieldState) {
  return {
    status: state.status ?? 'empty',
    ...(state.value !== undefined && { value: state.value }),
    ...(state.proposal && {
      proposal: state.proposal.value,
      // A scene's id, or `entretien` for what the author said in the interview (D-26).
      source: state.proposal.evidence.map((e) => evidenceSceneId(e) ?? 'entretien'),
    }),
  };
}

const MODULES_HEADER =
  '# Charpentier : modules du projet, en lecture seule (les modifications ici ne sont pas reprises).\n';

/** The modules' YAML files, by name (in `modules/`). */
export function moduleFiles(root: Y.Doc): Map<string, string> {
  const files = new Map<string, Record<string, unknown>>();
  const add = (module: string, value: unknown) => {
    const file = MODULE_FILES[module] ?? `${module}.yaml`;
    files.set(file, { ...(files.get(file) ?? {}), [module]: value });
  };
  for (const module of singletonModules) {
    add(
      module,
      Object.fromEntries(
        Object.entries(readSingleton(root, module)).map(([k, v]) => [k, fieldForYaml(v)]),
      ),
    );
  }
  for (const module of entityModules) {
    add(
      module,
      listEntities(root, module).map((e) => ({
        id: e.id,
        status: e.status,
        fields: Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k, fieldForYaml(v)])),
      })),
    );
  }
  return new Map([...files].map(([file, value]) => [file, MODULES_HEADER + toYaml(value)]));
}

/** Every file of the project: its scenes (those whose document is given) and its modules. */
export function projectFiles(
  root: Y.Doc,
  sceneDocs: ReadonlyMap<string, Y.Doc>,
): { readonly path: string; readonly content: string }[] {
  const files: { path: string; content: string }[] = [];
  for (const scene of scenePaths(root)) {
    const doc = sceneDocs.get(scene.sceneId);
    if (doc)
      files.push({
        path: scene.path,
        content: sceneFile(scene.sceneId, scene.variantId, sceneMarkdown(doc, scene.variantId)),
      });
  }
  for (const [file, content] of moduleFiles(root))
    files.push({ path: `${MODULES_DIR}/${file}`, content });
  return files;
}
