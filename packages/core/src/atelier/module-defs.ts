import {
  fieldChoices,
  type EntityModule,
  type ModuleName,
  type SingletonModule,
} from '@charpentier/schema';

/**
 * How the Atelier lays out each module (docs/SPEC.md §5.3–5.6, docs/DESIGN.md
 * §4.5). Labels come from `atelier.*` in the catalogue, keyed by these names.
 */
export type FieldKind =
  /** Free text, several lines (Shift+Enter for a new line). */
  | 'text'
  /** A short value on one line. */
  | 'line'
  /** One value among `options`. */
  | 'choice'
  /** Scenes of the manuscript (ids). */
  | 'scenes'
  /** From which scene: `{ fromSceneId }` (who knows a clue). */
  | 'scene';

export interface FieldDef {
  readonly key: string;
  readonly kind: FieldKind;
  readonly options?: readonly string[];
}

export interface SectionDef {
  readonly key: string;
  readonly wide?: boolean;
  readonly fields: readonly FieldDef[];
}

interface BaseModuleDef {
  readonly sections: readonly SectionDef[];
}

export interface SingletonModuleDef extends BaseModuleDef {
  readonly name: SingletonModule;
  readonly kind: 'singleton';
}

export interface EntityModuleDef extends BaseModuleDef {
  readonly name: EntityModule;
  readonly kind: 'entity';
  /** Field naming the entity in lists. */
  readonly titleField: string;
  /** Field shown under the title in lists, if any. */
  readonly subtitleField?: string;
}

export type ModuleDef = SingletonModuleDef | EntityModuleDef;

const text = (key: string): FieldDef => ({ key, kind: 'text' });
const line = (key: string): FieldDef => ({ key, kind: 'line' });
const scenes = (key: string): FieldDef => ({ key, kind: 'scenes' });

export const NARRATIVE_MODELS = fieldChoices.structure.narrativeModel;
export const CLUE_KINDS = fieldChoices.clues.kind;
export const ARC_KINDS = fieldChoices.arcs.kind;
export const STYLE_CATEGORIES = fieldChoices.style.category;

export const metaDef: SingletonModuleDef = {
  name: 'meta',
  kind: 'singleton',
  sections: [
    { key: 'story', wide: true, fields: [text('pitch'), text('summary'), text('intention')] },
    {
      key: 'shape',
      wide: true,
      fields: [line('themes'), line('tone'), line('genres'), line('audience')],
    },
  ],
};

export const charactersDef: EntityModuleDef = {
  name: 'characters',
  kind: 'entity',
  titleField: 'name',
  subtitleField: 'occupation',
  sections: [
    {
      key: 'identity',
      fields: [
        line('name'),
        line('age'),
        text('appearance'),
        line('occupation'),
        line('residence'),
      ],
    },
    {
      key: 'psychology',
      fields: [text('desire'), text('fear'), text('wound'), text('contradiction'), text('secret')],
    },
    { key: 'voice', fields: [text('voice')] },
    { key: 'relations', fields: [text('relations')] },
    { key: 'arc', wide: true, fields: [text('arc')] },
  ],
};

export const structureDef: SingletonModuleDef = {
  name: 'structure',
  kind: 'singleton',
  sections: [
    {
      key: 'model',
      wide: true,
      fields: [{ key: 'narrativeModel', kind: 'choice', options: NARRATIVE_MODELS }],
    },
  ],
};

export const actsDef: EntityModuleDef = {
  name: 'acts',
  kind: 'entity',
  titleField: 'title',
  sections: [
    { key: 'act', wide: true, fields: [line('title'), text('summary'), scenes('sceneIds')] },
  ],
};

export const arcsDef: EntityModuleDef = {
  name: 'arcs',
  kind: 'entity',
  titleField: 'title',
  subtitleField: 'kind',
  sections: [
    {
      key: 'arc',
      wide: true,
      fields: [
        line('title'),
        { key: 'kind', kind: 'choice', options: ARC_KINDS },
        text('summary'),
        scenes('sceneIds'),
      ],
    },
  ],
};

export const worldRulesDef: EntityModuleDef = {
  name: 'worldRules',
  kind: 'entity',
  titleField: 'title',
  sections: [
    { key: 'rule', wide: true, fields: [line('title'), text('statement'), text('consequences')] },
  ],
};

export const cluesDef: EntityModuleDef = {
  name: 'clues',
  kind: 'entity',
  titleField: 'title',
  subtitleField: 'kind',
  sections: [
    {
      key: 'clue',
      wide: true,
      fields: [
        { key: 'kind', kind: 'choice', options: CLUE_KINDS },
        line('title'),
        text('description'),
      ],
    },
    {
      key: 'path',
      wide: true,
      fields: [scenes('plantedIn'), scenes('appearsIn'), scenes('resolvedIn')],
    },
  ],
};

/** Style et voix (phase 6.4): the choices drawn from reference texts, or entered by hand. */
export const styleDef: EntityModuleDef = {
  name: 'style',
  kind: 'entity',
  titleField: 'choice',
  subtitleField: 'category',
  sections: [
    {
      key: 'choice',
      wide: true,
      fields: [
        { key: 'category', kind: 'choice', options: STYLE_CATEGORIES },
        text('choice'),
        line('measure'),
        line('source'),
      ],
    },
  ],
};

/** The Atelier's rail, in order (⌘1…6). Structure gathers acts and arcs. */
export const ATELIER_MODULES = [
  'meta',
  'characters',
  'structure',
  'worldRules',
  'clues',
  'style',
] as const;
export type AtelierModule = (typeof ATELIER_MODULES)[number];

export const moduleDefs: Readonly<Record<ModuleName, ModuleDef>> = {
  meta: metaDef,
  characters: charactersDef,
  structure: structureDef,
  acts: actsDef,
  arcs: arcsDef,
  worldRules: worldRulesDef,
  clues: cluesDef,
  style: styleDef,
};
