// Worker thread holding the dictionary: loading it takes seconds and hundreds
// of megabytes, which must not block the main process.
import { parentPort, workerData } from 'node:worker_threads';
import { createSpeller, type SpellRequest, type SpellResponse } from './speller';

const { aff, dic } = workerData as { aff: Uint8Array; dic: Uint8Array };
const speller = createSpeller(aff, dic);

parentPort?.on('message', (request: SpellRequest) => {
  let response: SpellResponse;
  try {
    response = {
      id: request.id,
      result:
        request.type === 'misspelled'
          ? speller.misspelled(request.words)
          : speller.suggest(request.word),
    };
  } catch (error) {
    response = { id: request.id, error: String(error) };
  }
  parentPort?.postMessage(response);
});
