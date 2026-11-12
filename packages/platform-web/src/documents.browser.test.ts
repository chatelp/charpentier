import { describe, expect, it } from 'vitest';
import { IndexedDbDocumentService } from './documents';

describe('IndexedDbDocumentService (real IndexedDB)', () => {
  it('keeps every edit across a reload', async () => {
    const guid = `project:${crypto.randomUUID()}`;
    const first = await new IndexedDbDocumentService().open(guid);
    await first.whenLoaded;
    first.doc.getText('t').insert(0, 'Il pleuvait sur Brest.');
    await first.close();

    // A new service instance stands for a reloaded page.
    const second = await new IndexedDbDocumentService().open(guid);
    await second.whenLoaded;
    expect(second.doc.getText('t').toString()).toBe('Il pleuvait sur Brest.');
    await second.close();
  });

  it('shares one replica between handles and keeps it until the last is closed', async () => {
    const service = new IndexedDbDocumentService();
    const guid = `project:${crypto.randomUUID()}`;
    const a = await service.open(guid);
    const b = await service.open(guid);
    expect(a.doc).toBe(b.doc);
    await a.close();
    await a.close(); // closing twice is harmless
    b.doc.getText('t').insert(0, 'encore ouvert');
    await b.close();
    const c = await service.open(guid);
    await c.whenLoaded;
    expect(c.doc).not.toBe(a.doc);
    expect(c.doc.getText('t').toString()).toBe('encore ouvert');
    await c.close();
  });
});
