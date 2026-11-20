import fs from 'node:fs/promises';
import path from 'node:path';
import {
  MAX_REFERENCE_BYTES,
  parseReferenceFile,
  referenceFormat,
  UnreadableReferenceError,
  type ReferenceFormat,
  type ReferenceText,
} from '@charpentier/agents';

// The parsing lives in @charpentier/agents, shared with the browser (phase 4.7 b).
export {
  cleanPdfPages,
  fromEpub,
  fromMarkdown,
  REFERENCE_EXTENSIONS,
  UnreadableReferenceError,
  xhtmlToText,
  type ReferenceFormat,
} from '@charpentier/agents';

/** A reference text read from a file on the disk (docs/PLAN.md phase 6.4). */
export async function readReferenceFile(
  file: string,
): Promise<ReferenceText & { format: ReferenceFormat }> {
  if (!referenceFormat(file)) throw new UnreadableReferenceError(file);
  const stat = await fs.stat(file);
  if (stat.size > MAX_REFERENCE_BYTES) throw new UnreadableReferenceError(file);
  const data = await fs.readFile(file);
  return parseReferenceFile(new Uint8Array(data), path.basename(file));
}
