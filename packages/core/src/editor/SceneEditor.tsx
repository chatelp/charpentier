import { EditorContent, useEditor } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import type * as Y from 'yjs';
import { sceneEditorExtensions } from './extensions';
import './editor.css';

export interface SceneEditorProps {
  /** The active variant's fragment. */
  readonly fragment: Y.XmlFragment;
  /** BCP 47 language of the book (for hyphenation and spellcheck). */
  readonly language: string;
}

/** The writing surface: one scene variant, nothing else. */
export function SceneEditor({ fragment, language }: SceneEditorProps) {
  const { t } = useTranslation();
  const editor = useEditor(
    {
      extensions: sceneEditorExtensions({ fragment, placeholder: t('editor.emptyScene') }),
      autofocus: 'end',
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
    [fragment, language],
  );
  return <EditorContent editor={editor} className="ch-editor" />;
}
