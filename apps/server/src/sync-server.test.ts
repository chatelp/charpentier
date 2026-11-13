import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { revokeSession } from './accounts';
import { documentOwner } from './document-names';
import { account, cleanUp, connect, freshDatabase, startServer, text } from './testing';

afterEach(cleanUp);

describe('sync server', () => {
  it('relays the edits of one device to another', async () => {
    const db = await freshDatabase();
    const { ws } = await startServer(db);
    const { token } = await account(db);
    const a = connect(ws, 'project:p1/scene:s1', token);
    const b = connect(ws, 'project:p1/scene:s1', token);
    expect(await Promise.all([a.synced, b.synced])).toEqual([true, true]);
    a.doc.getText('t').insert(0, 'Il pleuvait sur Nantes.');
    await expect.poll(() => text(b.doc), { timeout: 5000 }).toBe('Il pleuvait sur Nantes.');
  });

  it('merges what two devices wrote apart', async () => {
    const db = await freshDatabase();
    const { ws } = await startServer(db);
    const { token } = await account(db);
    // Each device writes before connecting (offline), then both connect.
    const docA = new Y.Doc();
    docA.getText('t').insert(0, 'Hélène entra. ');
    const docB = new Y.Doc();
    docB.getText('t').insert(0, 'Il pleuvait. ');
    const a = connect(ws, 'project:p1/scene:s1', token, docA);
    const b = connect(ws, 'project:p1/scene:s1', token, docB);
    await Promise.all([a.synced, b.synced]);
    await expect
      .poll(() => [text(a.doc), text(b.doc)], { timeout: 8000 })
      .toSatisfy(([x, y]) => x === y);
    expect(text(a.doc)).toContain('Hélène entra.');
    expect(text(a.doc)).toContain('Il pleuvait.');
  });

  it('keeps the documents in Postgres across a restart', async () => {
    const db = await freshDatabase();
    const first = await startServer(db);
    const { token } = await account(db);
    const a = connect(first.ws, 'project:p1', token);
    await a.synced;
    a.doc.getText('t').insert(0, 'Les serres');
    // The server has it once the device has no unacknowledged change left.
    await expect.poll(() => a.provider.hasUnsyncedChanges).toBe(false);
    a.provider.destroy();
    // Destroying the server stores what is still pending.
    await first.stop();

    const second = await startServer(db);
    const b = connect(second.ws, 'project:p1', token);
    await b.synced;
    expect(text(b.doc)).toBe('Les serres');
  });
});

describe('who may open what (D-21)', () => {
  it('refuses a connection without a valid session', async () => {
    const db = await freshDatabase();
    const { ws } = await startServer(db);
    const { token, userId, sessionId } = await account(db);
    expect(await connect(ws, 'project:p1', 'not-a-token').synced).toBe(false);
    await revokeSession(db, userId, sessionId);
    expect(await connect(ws, 'project:p1', token).synced).toBe(false);
  });

  it('keeps each account to its own projects and library', async () => {
    const db = await freshDatabase();
    const { ws } = await startServer(db);
    const helene = await account(db, 'helene@example.org');
    const paul = await account(db, 'paul@example.org');
    // Hélène's project: hers once she opened it.
    expect(await connect(ws, 'project:p1', helene.token).synced).toBe(true);
    expect(await connect(ws, 'project:p1/scene:s1', paul.token).synced).toBe(false);
    expect(await connect(ws, `library:${helene.userId}`, helene.token).synced).toBe(true);
    expect(await connect(ws, `library:${helene.userId}`, paul.token).synced).toBe(false);
  });

  it('serves only Charpentier documents', async () => {
    const db = await freshDatabase();
    const { ws } = await startServer(db);
    const { token } = await account(db);
    expect(await connect(ws, 'anything-else', token).synced).toBe(false);
  });
});

describe('document names', () => {
  it('knows which project or account a document belongs to', () => {
    expect(documentOwner('project:abc')).toEqual({ kind: 'project', projectId: 'abc' });
    expect(documentOwner('project:abc/scene:s-1/history')).toEqual({
      kind: 'project',
      projectId: 'abc',
    });
    expect(documentOwner('project:abc/mentor')).toEqual({ kind: 'project', projectId: 'abc' });
    expect(documentOwner('library:u1')).toEqual({ kind: 'library', userId: 'u1' });
    for (const bad of ['project:', 'project:a/other', 'library', '../etc', 'project:a b'])
      expect(documentOwner(bad)).toBeNull();
  });
});
