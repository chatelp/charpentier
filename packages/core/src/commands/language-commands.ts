import { addToDictionary, setMentorLevel } from '@charpentier/schema';
import {
  applyCorrection,
  issueAtCursor,
  placedIssues,
  type PlacedIssue,
} from '../editor/language-check';
import { placedSignals, signalAtCursor } from '../mentor/signal-decorations';
import type { WorkspaceContext } from '../workspace/workspace-context';
import type { CommandId } from './command-id';
import type { Command } from './registry';

type LanguageCommand = Command<WorkspaceContext> & { readonly id: CommandId };

const signalHere = (ctx: WorkspaceContext) =>
  ctx.editor && !ctx.editor.isDestroyed ? signalAtCursor(ctx.editor.state) : undefined;

const issueHere = (ctx: WorkspaceContext) =>
  ctx.editor && !ctx.editor.isDestroyed ? issueAtCursor(ctx.editor.state) : undefined;

async function fix(ctx: WorkspaceContext, issue: PlacedIssue) {
  const editor = ctx.editor;
  if (!editor) return;
  if (issue.kind === 'typography') {
    applyCorrection(editor.view, issue, issue.replacement ?? '');
    return;
  }
  const word = issue.rule;
  const suggestions = (await ctx.platform.spellcheck?.suggest(word, ctx.language)) ?? [];
  ctx.openPalette({
    kind: 'pick',
    placeholder: ctx.t('language.fixWord', { word }),
    items: [
      ...suggestions.map((s) => ({ id: `use:${s}`, label: s })),
      { id: 'dictionary', label: ctx.t('language.addToDictionary', { word }) },
    ],
    onPick: (id) => {
      if (id === 'dictionary') {
        addToDictionary(ctx.root, word);
        editor.commands.refreshLanguageCheck();
        ctx.notify(ctx.t('language.added', { word }));
      } else {
        // The text may have moved: find the issue again where it was.
        const again = placedIssues(editor.state).find(
          (i) => i.rule === word && i.pos.from === issue.pos.from,
        );
        if (again) applyCorrection(editor.view, again, id.slice('use:'.length));
      }
      editor.view.focus();
    },
  });
}

/** Spelling and typography (docs/SPEC.md §8): every correction is the author's choice. */
export const languageCommands: readonly LanguageCommand[] = [
  {
    // ⌥⏎ (docs/DESIGN.md §5.3): the correction under the cursor, else the remark's note.
    id: 'passageAction',
    scope: 'global',
    keybinding: 'Alt-Enter',
    isEnabled: (ctx) => issueHere(ctx) !== undefined || signalHere(ctx) !== undefined,
    run: async (ctx) => {
      const issue = issueHere(ctx);
      if (issue) {
        await fix(ctx, issue);
        return;
      }
      const signal = signalHere(ctx);
      if (signal) ctx.openSignalNote(signal.signal.id);
    },
  },
  {
    id: 'nextRemark',
    scope: 'global',
    keybinding: ["Mod-'"],
    isEnabled: (ctx) => ctx.editor !== null,
    run: (ctx) => {
      const editor = ctx.editor;
      if (!editor) return;
      const starts = [
        ...placedIssues(editor.state).map((i) => i.pos.from),
        ...placedSignals(editor.state).map((p) => p.from),
      ].sort((a, b) => a - b);
      const after = starts.find((p) => p > editor.state.selection.from) ?? starts[0];
      if (after === undefined) {
        ctx.notify(ctx.t('language.noIssue'));
        return;
      }
      editor.chain().setTextSelection(after).scrollIntoView().run();
      editor.view.focus();
    },
  },
  {
    id: 'setApiKey',
    scope: 'global',
    isEnabled: (ctx) => ctx.platform.agents.status() !== 'disabled',
    run: (ctx) =>
      ctx.openPalette({
        kind: 'input',
        placeholder: ctx.t('mentor.apiKeyPlaceholder'),
        initial: '',
        secret: true,
        onSubmit: (key) => {
          if (!key.trim()) return;
          ctx.notify(ctx.t('mentor.apiKeyChecking'));
          void ctx.platform.agents
            .setApiKey(key)
            .then((result) => ctx.notify(ctx.t(`mentor.apiKey.${result}`)));
        },
      }),
  },
  {
    id: 'forgetApiKey',
    scope: 'global',
    isEnabled: (ctx) => {
      const status = ctx.platform.agents.status();
      return status === 'available' || status === 'offline';
    },
    run: async (ctx) => {
      await ctx.platform.agents.forgetApiKey();
      ctx.notify(ctx.t('mentor.apiKeyForgotten'));
    },
  },
  {
    id: 'toggleMentorPanel',
    scope: 'global',
    // ⌘L where the host allows it; a browser keeps ⌘L for its address bar.
    keybinding: ['Mod-l', 'Mod-Alt-l'],
    run: (ctx) => ctx.toggleMentorPanel('points'),
  },
  {
    id: 'moreHelp',
    scope: 'global',
    isEnabled: (ctx) => ctx.mentorLevel < 4,
    run: (ctx) => {
      const level = (ctx.mentorLevel + 1) as 1 | 2 | 3 | 4;
      setMentorLevel(ctx.root, level);
      ctx.notify(ctx.t('mentor.level.changed', { name: ctx.t(`mentor.level.name.${level}`) }));
    },
  },
  {
    id: 'lessHelp',
    scope: 'global',
    isEnabled: (ctx) => ctx.mentorLevel > 1,
    run: (ctx) => {
      const level = (ctx.mentorLevel - 1) as 1 | 2 | 3 | 4;
      setMentorLevel(ctx.root, level);
      ctx.notify(ctx.t('mentor.level.changed', { name: ctx.t(`mentor.level.name.${level}`) }));
    },
  },
  {
    id: 'analyzeScene',
    scope: 'global',
    // ⌘⇧A (docs/DESIGN.md §5.3); a browser may keep it for searching its tabs.
    keybinding: ['Mod-Shift-a', 'Mod-Alt-Shift-a'],
    isEnabled: (ctx) => ctx.platform.agents.status() !== 'disabled',
    run: (ctx) => {
      ctx.notify(ctx.t('mentor.analysing'));
      ctx.analyze([ctx.sceneId], false);
    },
  },
  {
    id: 'analyzeChapter',
    scope: 'global',
    isEnabled: (ctx) => ctx.platform.agents.status() !== 'disabled',
    run: (ctx) => {
      const chapter = ctx.outline.find((c) => c.scenes.some((s) => s.id === ctx.sceneId));
      ctx.notify(ctx.t('mentor.analysing'));
      ctx.analyze(chapter?.scenes.map((s) => s.id) ?? [], false);
    },
  },
  {
    id: 'analyzeManuscript',
    scope: 'global',
    isEnabled: (ctx) => ctx.platform.agents.status() !== 'disabled',
    run: (ctx) => {
      ctx.notify(ctx.t('mentor.analysing'));
      ctx.analyze(
        ctx.outline.flatMap((c) => c.scenes.map((s) => s.id)),
        false,
      );
    },
  },
  {
    id: 'toggleLightModel',
    scope: 'global',
    isEnabled: (ctx) => ctx.platform.agents.status() !== 'disabled',
    run: async (ctx) => {
      const next = (await ctx.platform.agents.lightModel()) === 'haiku' ? 'opus' : 'haiku';
      await ctx.platform.agents.setLightModel(next);
      ctx.notify(ctx.t(`mentor.lightModel.${next}`));
    },
  },
  {
    id: 'talkToMentor',
    scope: 'global',
    isEnabled: (ctx) => ctx.platform.agents.status() !== 'disabled',
    run: (ctx) => ctx.toggleMentorPanel('conversation'),
  },
  {
    id: 'fixAllTypography',
    scope: 'global',
    isEnabled: (ctx) => ctx.editor !== null,
    run: (ctx) => {
      const editor = ctx.editor;
      if (!editor) return;
      const issues = placedIssues(editor.state).filter((i) => i.kind === 'typography');
      const tr = editor.state.tr;
      for (const issue of [...issues].reverse())
        tr.insertText(issue.replacement ?? '', issue.pos.from, issue.pos.to);
      if (issues.length) editor.view.dispatch(tr);
      ctx.notify(ctx.t('language.fixedTypography', { count: issues.length }));
    },
  },
  {
    id: 'fixAllSpelling',
    scope: 'global',
    isEnabled: (ctx) => ctx.editor !== null && ctx.platform.spellcheck !== null,
    run: async (ctx) => {
      const editor = ctx.editor;
      const spellcheck = ctx.platform.spellcheck;
      if (!editor || !spellcheck) return;
      const doc = editor.state.doc;
      const issues = placedIssues(editor.state).filter((i) => i.kind === 'spelling');
      const firsts = await Promise.all(
        issues.map(async (i) => (await spellcheck.suggest(i.rule, ctx.language))[0]),
      );
      if (editor.state.doc !== doc) return; // Typed meanwhile: nothing applied.
      const tr = editor.state.tr;
      let count = 0;
      for (let i = issues.length - 1; i >= 0; i--) {
        const issue = issues[i];
        const first = firsts[i];
        if (!issue || !first) continue;
        tr.insertText(first, issue.pos.from, issue.pos.to);
        count++;
      }
      if (count) editor.view.dispatch(tr);
      ctx.notify(ctx.t('language.fixedSpelling', { count }));
    },
  },
];
