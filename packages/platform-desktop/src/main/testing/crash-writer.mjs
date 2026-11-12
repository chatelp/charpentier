// Child process of the crash test: writes edits through DocFile and reports
// each one on stdout, until the parent kills it with SIGKILL.
import * as Y from 'yjs';
import { DocFile } from '../doc-file.ts';

const dir = process.argv[2];
const file = new DocFile(dir, { compactAfterBytes: 2000 });
const doc = new Y.Doc();
file.load(doc, 'load');
doc.on('update', (update, origin) => {
  if (origin === 'load') return;
  file.append(update);
  if (file.shouldCompact) file.compact(doc);
});
const text = doc.getText('t');
let n = 0;
setInterval(() => {
  n += 1;
  text.insert(text.length, `${n};`);
  process.stdout.write(`${n}\n`);
}, 2);
