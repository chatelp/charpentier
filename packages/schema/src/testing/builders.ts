import type { Node } from 'prosemirror-model';
import { sceneSchema } from '../prosemirror/scene-schema';

const { nodes, marks } = sceneSchema;

export type Inline = string | { italic: string } | 'BR' | { italicBreak: true };

export const t = (text: string) => sceneSchema.text(text);
export const i = (text: string) => sceneSchema.text(text, [marks.italic.create()]);

export function p(...content: Inline[]): Node {
  return nodes.paragraph.create(
    null,
    content.flatMap((c) => {
      if (c === 'BR') return [nodes.hardBreak.create()];
      if (typeof c === 'string') return c ? [t(c)] : [];
      if ('italicBreak' in c) return [nodes.hardBreak.create(null, null, [marks.italic.create()])];
      return c.italic ? [i(c.italic)] : [];
    }),
  );
}

export const quote = (...paragraphs: Node[]) => nodes.blockquote.create(null, paragraphs);
export const sceneBreak = () => nodes.sceneBreak.create();
export const doc = (...blocks: Node[]) => nodes.doc.create(null, blocks);
