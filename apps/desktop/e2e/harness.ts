import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { createSyncServer } from '@charpentier/server';
import { _electron as electron, type ElectronApplication } from 'playwright';

/**
 * What every end-to-end test of the built desktop app shares (docs/PLAN.md 7.6, layer 2): an
 * app started from nothing, in a library and a data folder of its own, and stand-ins for
 * what it reaches outside. `afterEach(cleanUp)` in each test file.
 */
export const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp: string[] = [];
export const apps: ElectronApplication[] = [];

export const servers: http.Server[] = [];
export const syncServers: ReturnType<typeof createSyncServer>[] = [];

export async function cleanUp(): Promise<void> {
  for (const app of apps.splice(0)) await app.close().catch(() => {});
  for (const server of servers.splice(0)) server.close();
  for (const server of syncServers.splice(0)) await server.destroy();
  for (const dir of temp.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
}

export function folders() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'charpentier-e2e-'));
  temp.push(root);
  return { library: path.join(root, 'Bibliothèque'), userData: path.join(root, 'data') };
}

export async function launch(
  dirs: ReturnType<typeof folders>,
  env: Record<string, string> = {},
  args: readonly string[] = [],
) {
  const app = await electron.launch({
    args: [appDir, ...args],
    env: {
      ...process.env,
      CHARPENTIER_LIBRARY: dirs.library,
      CHARPENTIER_USER_DATA: dirs.userData,
      // Linux CI has no keychain: the sync's token is kept anyway (never on a real system).
      CHARPENTIER_TEST_PLAIN_SECRETS: '1',
      ...env,
    },
  });
  apps.push(app);
  const window = await app.firstWindow();
  const editor = window.getByRole('textbox', { name: 'Texte de la scène' });
  await editor.waitFor();
  return { app, window, editor };
}

export interface SeenRequest {
  readonly headers: http.IncomingHttpHeaders;
  readonly body: {
    model?: string;
    system?: { text: string; cache_control?: unknown }[];
    output_config?: { effort?: string; format?: { type: string; schema: { properties: object } } };
  };
}

/**
 * A stand-in for Anthropic's Messages API (the SDK follows ANTHROPIC_BASE_URL):
 * answers a scene analysis or a chat turn with canned JSON, and records what
 * it was sent.
 */
export async function fakeAnthropic(answers: {
  analysis: object;
  chat: object;
  /** A chat turn stops after its first words until this says to go on. */
  hold?: () => Promise<void>;
}) {
  const seen: SeenRequest[] = [];
  /** Requests whose client went away before the end (« Arrêter »). */
  const aborted: SeenRequest[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
    req.on('end', () => {
      if (req.method === 'GET' && req.url?.startsWith('/v1/models/')) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ type: 'model', id: 'claude-opus-5-5', display_name: 'Opus' }));
        return;
      }
      const body = JSON.parse(raw || '{}') as SeenRequest['body'];
      const request = { headers: req.headers, body };
      seen.push(request);
      res.on('close', () => {
        if (!res.writableEnded) aborted.push(request);
      });
      const isAnalysis = 'characters' in (body.output_config?.format?.schema.properties ?? {});
      const text = JSON.stringify(isAnalysis ? answers.analysis : answers.chat);
      // Streamed, as the API does when asked to (the provider always asks).
      res.setHeader('content-type', 'text/event-stream');
      const send = (event: { readonly type: string } & Record<string, unknown>) =>
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      const words = (delta: string) =>
        send({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: delta },
        });
      send({
        type: 'message_start',
        message: {
          id: `msg_${seen.length}`,
          type: 'message',
          role: 'assistant',
          model: body.model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 1 },
        },
      });
      send({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
      words(text.slice(0, 5));
      void (async () => {
        if (!isAnalysis) await answers.hold?.();
        if (res.destroyed) return;
        words(text.slice(5));
        send({ type: 'content_block_stop', index: 0 });
        send({
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { output_tokens: 50 },
        });
        send({ type: 'message_stop' });
        res.end();
      })();
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, seen, aborted };
}
