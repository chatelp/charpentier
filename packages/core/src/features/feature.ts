import type { Platform } from '@charpentier/platform';
import type { i18n, TFunction } from 'i18next';
import type { ComponentType } from 'react';
import type { Command } from '../commands/registry';
import type { UiLanguage } from '../i18n/i18n';
import type { PickItem } from '../palette/palette-request';
import type { WorkspaceContext } from '../workspace/workspace-context';

/**
 * A feature (docs/SPEC.md D-24, docs/PLAN.md phase 5.1): a module compiled
 * with the app that declares what it brings, and when it is active. The core
 * reads these contributions where it used to wire things by hand: the top of
 * the window, the footer, the settings, the menu, the command line. Nothing
 * is loaded at run time: the host passes its features to `App`.
 */
export interface Feature {
  /** Unique, in camelCase: also the root of its texts (`<id>.…`). */
  readonly id: string;
  /** Whether it is active on this host (a service it needs is there). Active when absent. */
  isActive?(platform: Platform): boolean;
  /**
   * Its texts, by UI language, merged into the catalogue. Command titles go
   * under `commands.<command id>` (every command has one), the rest under
   * `<feature id>.…`. Never a key of the core.
   */
  readonly texts: Readonly<Partial<Record<UiLanguage, TextTree>>>;
  /** Commands, with their shortcuts: in the command line, the shortcuts, the menu. */
  readonly commands?: readonly Command<WorkspaceContext>[];
  /** Where its commands go in the application menu. */
  readonly menu?: readonly FeatureMenu[];
  /** A band at the top of the window, full width, above everything (the X250's system line). */
  readonly topZone?: TopZone;
  /** States at the right of the footer, before « Aa ». */
  readonly footer?: readonly FooterItem[];
  /** Sections of the settings view. */
  readonly settings?: readonly SettingsSection[];
  /** How the settings view looks when this feature brings them: its title (text key) and the rail's material. */
  readonly settingsLook?: {
    readonly title: string;
    readonly material: 'system';
    /** Drawn before the title (the system's square). */
    readonly icon?: ComponentType;
    /** Text key of the keys hint at the foot of the rail. */
    readonly hint?: string;
  };
  /** Full-frame views, like the Atelier (the X250's monitor). */
  readonly views?: readonly FeatureView[];
  /**
   * A page over everything but the bands at the top (the X250's lock, its
   * first start). Meanwhile the rest is inert and no shortcut reaches it.
   */
  readonly cover?: FeatureCover;
  /** Searches of the command line under a prefix of their own (`:` for the system). */
  readonly prefixes?: readonly CommandPrefix[];
}

export interface TextTree {
  readonly [key: string]: string | TextTree;
}

export interface FeatureMenu {
  /** A menu of the core (`file`, `view`…: appended after a separator) or a new one. */
  readonly menu: string;
  /** Text key of a new menu's name (inserted before « Fenêtre »). */
  readonly label?: string;
  /** Command ids, `-` for a separator. */
  readonly items: readonly string[];
}

export interface TopZone {
  /** Its height in CSS pixels: the rest of the window starts below it. */
  readonly height: number;
  readonly component: ComponentType<TopZoneProps>;
}

export interface TopZoneProps {
  /** The open project's workspace; null in the library of projects. */
  readonly ctx: WorkspaceContext | null;
}

export interface FooterItem {
  readonly id: string;
  readonly component: ComponentType<WorkspaceProps>;
}

export interface WorkspaceProps {
  readonly ctx: WorkspaceContext;
}

export interface SettingsSection {
  readonly id: string;
  /** Text key of its name, in the rail and as its title. */
  readonly label: string;
  /** Its current value, at the right of its line in the rail. */
  readonly value?: ComponentType<WorkspaceProps>;
  /** The sentence under the section's title. */
  readonly intro?: ComponentType<WorkspaceProps>;
  readonly component: ComponentType<WorkspaceProps>;
}

export interface FeatureCover {
  /** Whether it covers the app now. */
  active(platform: Platform): boolean;
  /** Tells when `active` may have changed. */
  subscribe(platform: Platform, onChange: () => void): () => void;
  readonly component: ComponentType;
}

export interface FeatureView {
  readonly id: string;
  /** Text key of its name (its landmark for screen readers). */
  readonly label: string;
  readonly component: ComponentType<FeatureViewProps>;
  /**
   * The view draws its own close cross (docs/DESIGN.md §4.8, the monitor in its
   * header); otherwise the core puts one in the frame's top-right corner.
   */
  readonly ownClose?: boolean;
}

export interface FeatureViewProps extends WorkspaceProps {
  /** False while the command line or the drawer is over it. */
  readonly active: boolean;
  /** Back to the text. */
  onClose(): void;
}

export interface CommandPrefix {
  /** One character, typed first in the command line. */
  readonly prefix: string;
  /** Text key of the group's name. */
  readonly label: string;
  /** What the line offers for the text typed after the prefix (`lum 40`). */
  search(ctx: WorkspaceContext, query: string): readonly PickItem[];
  onPick(ctx: WorkspaceContext, id: string, query: string): void;
}

/** Prefixes of the core's command line: commands, sheets, scenes. */
const CORE_PREFIXES = ['>', '@', '#'];

/** A feature's text, from a key its own catalogue holds (not typed against the core's). */
export const featureText = (t: TFunction) =>
  t as unknown as (key: string, options?: Readonly<Record<string, unknown>>) => string;

const lookup = (tree: TextTree | undefined, key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as TextTree | undefined)?.[part], tree);

/**
 * Checks what features declare against each other and against the core:
 * one owner per id, prefix and text, a title for every command and name.
 * Throws at start-up: a mistake here is a programming error.
 */
export function checkFeatures(features: readonly Feature[], coreTexts: TextTree): void {
  const taken = new Map<string, string>();
  const claim = (kind: string, key: string, owner: string) => {
    const previous = taken.get(`${kind}:${key}`);
    if (previous) throw new Error(`${kind} ${key} of ${owner} is already declared by ${previous}`);
    taken.set(`${kind}:${key}`, owner);
  };
  for (const prefix of CORE_PREFIXES) claim('Prefix', prefix, 'the core');
  for (const feature of features) {
    const { id } = feature;
    claim('Feature', id, id);
    if (coreTexts[id] !== undefined) throw new Error(`Feature ${id} shadows the core's texts`);
    const fr = feature.texts.fr;
    const needText = (key: string) => {
      if (typeof lookup(fr, key) !== 'string') throw new Error(`Feature ${id} has no text ${key}`);
    };
    for (const [root, tree] of Object.entries(fr ?? {}))
      if (root === 'commands') {
        for (const key of Object.keys(tree as TextTree))
          if (lookup(coreTexts, `commands.${key}`) !== undefined)
            throw new Error(`Feature ${id} redefines the core's text commands.${key}`);
      } else if (root !== id) throw new Error(`Feature ${id} has texts outside ${id}.…`);
    for (const command of feature.commands ?? []) needText(`commands.${command.id}`);
    for (const menu of feature.menu ?? []) if (menu.label) needText(menu.label);
    if (feature.settingsLook) needText(feature.settingsLook.title);
    if (feature.settingsLook?.hint) needText(feature.settingsLook.hint);
    for (const section of feature.settings ?? []) {
      claim('Settings section', section.id, id);
      needText(section.label);
    }
    for (const view of feature.views ?? []) {
      claim('View', view.id, id);
      needText(view.label);
    }
    for (const item of feature.footer ?? []) claim('Footer item', item.id, id);
    for (const prefix of feature.prefixes ?? []) {
      if ([...prefix.prefix].length !== 1)
        throw new Error(`Prefix ${prefix.prefix} of ${id} must be one character`);
      claim('Prefix', prefix.prefix, id);
      needText(prefix.label);
    }
    if (feature.topZone && !(feature.topZone.height > 0))
      throw new Error(`Top zone of ${id} needs a height`);
  }
}

/** The features this host runs, after checking them all. */
export function activeFeatures(
  features: readonly Feature[],
  platform: Platform,
  coreTexts: TextTree,
): readonly Feature[] {
  checkFeatures(features, coreTexts);
  return features.filter((f) => f.isActive?.(platform) ?? true);
}

/** Merges the features' texts into the catalogue (once per instance and feature). */
export function installFeatureTexts(instance: i18n, features: readonly Feature[]): void {
  for (const feature of features)
    for (const [language, tree] of Object.entries(feature.texts))
      if (tree && !instance.hasResourceBundle(language, `feature:${feature.id}`)) {
        instance.addResourceBundle(language, 'translation', tree, true, false);
        // Marks it as done (the namespace itself is never read).
        instance.addResourceBundle(language, `feature:${feature.id}`, {});
      }
}

/** Sum of the top zones' heights: where the rest of the window starts. */
export const topZonesHeight = (features: readonly Feature[]): number =>
  features.reduce((sum, f) => sum + (f.topZone?.height ?? 0), 0);
