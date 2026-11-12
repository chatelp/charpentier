import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { appendParagraph } from '../testing/yjs';
import { anchoredText, anchorForQuote } from './anchors';
import { variantFragment } from './scene-content';

describe('anchors', () => {
  it('anchors a quoted passage and follows it through edits around it', () => {
    const sceneDoc = new Y.Doc();
    const fragment = variantFragment(sceneDoc, 'v1');
    appendParagraph(fragment, 'Il pleuvait sur Nantes.');
    appendParagraph(fragment, 'Hélène avait les yeux verts, comme sa mère.');
    const anchor = anchorForQuote(sceneDoc, 's1', 'v1', 'les yeux  verts');
    expect(anchor).toBeDefined();
    if (!anchor) return;
    expect(anchoredText(sceneDoc, anchor)).toBe('les yeux verts');

    // The author rewrites around the passage.
    const text = (fragment.get(1) as Y.XmlElement).get(0) as Y.XmlText;
    text.insert(0, 'Ce soir-là, ');
    text.insert(text.length, ' Elle ne dormait pas.');
    expect(anchoredText(sceneDoc, anchor)).toBe('les yeux verts');
    expect(anchorForQuote(sceneDoc, 's1', 'v1', 'des yeux gris')).toBeUndefined();
  });

  it('matches typographic apostrophes in quotes from a model', () => {
    const sceneDoc = new Y.Doc();
    appendParagraph(variantFragment(sceneDoc, 'v1'), 'Elle regardait l’Odyssée.');
    const anchor = anchorForQuote(sceneDoc, 's1', 'v1', "l'Odyssée");
    expect(anchor && anchoredText(sceneDoc, anchor)).toBe('l’Odyssée');
  });
});
