import fs from 'node:fs';
import { Worker } from 'node:worker_threads';
import type { SpellQuery, SpellResponse } from './speller';

type Pending = { resolve: (words: readonly string[]) => void; reject: (error: Error) => void };

/**
 * The main process's handle on the spelling worker, started on first use.
 * Only French for now (the books are in French); other languages answer
 * « nothing misspelled ».
 */
export class SpellClient {
  #worker: Worker | undefined;
  #next = 0;
  readonly #pending = new Map<number, Pending>();

  constructor(
    private readonly workerPath: string,
    private readonly dictionary: { readonly aff: string; readonly dic: string },
  ) {}

  #start(): Worker {
    if (this.#worker) return this.#worker;
    const worker = new Worker(this.workerPath, {
      workerData: {
        aff: fs.readFileSync(this.dictionary.aff),
        dic: fs.readFileSync(this.dictionary.dic),
      },
    });
    worker.on('message', (response: SpellResponse) => {
      const pending = this.#pending.get(response.id);
      this.#pending.delete(response.id);
      if (!pending) return;
      if ('error' in response) pending.reject(new Error(response.error));
      else pending.resolve(response.result);
    });
    worker.on('error', (error: unknown) => {
      const failure = error instanceof Error ? error : new Error(String(error));
      for (const pending of this.#pending.values()) pending.reject(failure);
      this.#pending.clear();
      this.#worker = undefined;
    });
    this.#worker = worker;
    return worker;
  }

  #ask(request: SpellQuery): Promise<readonly string[]> {
    const id = ++this.#next;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#start().postMessage({ ...request, id });
    });
  }

  misspelled(words: readonly string[], language: string): Promise<readonly string[]> {
    if (!language.startsWith('fr') || words.length === 0) return Promise.resolve([]);
    return this.#ask({ type: 'misspelled', words });
  }

  suggest(word: string, language: string): Promise<readonly string[]> {
    if (!language.startsWith('fr')) return Promise.resolve([]);
    return this.#ask({ type: 'suggest', word });
  }

  async close(): Promise<void> {
    await this.#worker?.terminate();
    this.#worker = undefined;
  }
}
