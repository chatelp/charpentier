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
export async function fakeAnthropic(answers: { analysis: object; chat: object }) {
  const seen: SeenRequest[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.method === 'GET' && req.url?.startsWith('/v1/models/')) {
        res.end(JSON.stringify({ type: 'model', id: 'claude-opus-5-5', display_name: 'Opus' }));
        return;
      }
      const body = JSON.parse(raw || '{}') as SeenRequest['body'];
      seen.push({ headers: req.headers, body });
      const isAnalysis = 'characters' in (body.output_config?.format?.schema.properties ?? {});
      res.end(
        JSON.stringify({
          id: `msg_${seen.length}`,
          type: 'message',
          role: 'assistant',
          model: body.model,
          content: [
            { type: 'text', text: JSON.stringify(isAnalysis ? answers.analysis : answers.chat) },
          ],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      );
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, seen };
}
