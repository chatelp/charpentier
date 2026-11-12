import { addToDictionary } from '@charpentier/schema';
import {
  applyCorrection,
  issueAtCursor,
  placedIssues,
  type PlacedIssue,
} from '../editor/language-check';
import type { WorkspaceContext } from '../workspace/workspace-context';
import type { CommandId } from './command-id';
import type { Command } from './registry';

type LanguageCommand = Command<WorkspaceContext> & { readonly id: CommandId };

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
    id: 'fixLanguage',
    scope: 'global',
    keybinding: 'Alt-Enter',
    isEnabled: (ctx) => issueHere(ctx) !== undefined,
    run: async (ctx) => {
      const issue = issueHere(ctx);
      if (issue) await fix(ctx, issue);
    },
  },
  {
    id: 'nextLanguageIssue',
    scope: 'global',
    keybinding: ["Mod-'"],
    isEnabled: (ctx) => ctx.editor !== null,
    run: (ctx) => {
      const editor = ctx.editor;
      if (!editor) return;
      const issues = placedIssues(editor.state);
      const after = issues.find((i) => i.pos.from > editor.state.selection.from) ?? issues[0];
      if (!after) {
        ctx.notify(ctx.t('language.noIssue'));
        return;
      }
      editor.chain().setTextSelection(after.pos.from).scrollIntoView().run();
      editor.view.focus();
    },
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
