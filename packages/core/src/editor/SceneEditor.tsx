import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type * as Y from 'yjs';
import type { LanguageCheck } from '../language/checker';
import type { SignalDecorationsOptions } from '../mentor/signal-decorations';
import { sceneEditorExtensions } from './extensions';
import './editor.css';

export interface SceneEditorProps {
  /** The active variant's fragment. */
  readonly fragment: Y.XmlFragment;
  /** BCP 47 language of the book (for hyphenation and spellcheck). */
  readonly language: string;
  /** Receives the editor once created, and null when it goes away. */
  readonly onEditor?: (editor: Editor | null) => void;
  /** Spelling and typography check; must be stable (the editor is rebuilt when it changes). */
  readonly languageCheck?: LanguageCheck | null;
  /** The Compagnon's remarks; must be stable. */
  readonly signals?: SignalDecorationsOptions;
}

/** The writing surface: one scene variant, nothing else. */
export function SceneEditor({
  fragment,
  language,
  onEditor,
  languageCheck,
  signals,
}: SceneEditorProps) {
  const { t } = useTranslation();
  const editor = useEditor(
    {
      extensions: sceneEditorExtensions({
        fragment,
        placeholder: t('editor.emptyScene'),
        languageCheck: languageCheck ?? null,
        ...(signals && { signals }),
      }),
      editorProps: {
        attributes: {
          class: 'ch-prose',
          lang: language,
          'aria-label': t('editor.ariaLabel'),
          'aria-multiline': 'true',
          role: 'textbox',
        },
      },
    },
    [fragment, language, languageCheck, signals],
  );
  useEffect(() => {
    onEditor?.(editor);
    return () => onEditor?.(null);
  }, [editor, onEditor]);

  return <EditorContent editor={editor} className="ch-editor" />;
}
