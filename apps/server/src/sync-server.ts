import type { IncomingMessage, ServerResponse } from 'node:http';
import { Database as DatabaseExtension } from '@hocuspocus/extension-database';
import { Server } from '@hocuspocus/server';
import { claimProject, sessionFor } from './accounts';
import { createAdmin } from './admin/routes';
import { DEFAULT_ADMIN_NETWORKS, networkList } from './admin/network';
import { loadDocument, storeDocument, type Database } from './database';
import { documentOwner } from './document-names';
import { cookieToken, COOKIE_TOKEN, handleApi, LoginLimiter, sameOrigin, send } from './http-api';
import { createWebApp } from './web-app';
import { CompagnonKeys, type CreateLlm } from './compagnon';
import { handleInstaller } from './installer';
import { handleCache } from './nix-cache';
import { handleNetboot, type NetbootOptions } from './netboot';
import { handleUpdates } from './updates';

export interface SyncServerOptions {
  readonly db: Database;
  readonly port?: number;
  readonly address?: string;
  /** Where the X250's binary cache keeps its files (D-31); without it, no cache. */
  readonly cacheDir?: string | null;
  /** The network boot of the X250 (phase 5.9 ter); without a secret, none. */
  readonly netboot?: NetbootOptions;
  /** The built app for the browser (phase 4.7 a); without it, none. */
  readonly webDir?: string | null;
  /** For tests: the model of the browser's Compagnon, played without the network. */
  readonly createLlm?: CreateLlm;
  /** The administration page (phase 4.6). */
  readonly admin?: {
    /** CIDRs allowed to reach /admin (default: the home network and Tailscale). */
    readonly networks?: readonly string[];
    /** The backups folder, mounted read-only. */
    readonly backupsDir?: string | null;
    readonly timeZone?: string;
    readonly now?: () => Date;
  };
}

/** What the backups page shows to restore (infra/README.md « Restaurer une sauvegarde »). */
const RESTORE_COMMAND =
  "docker compose stop server db && docker run --rm -v charpentier_db:/data -v <dossier des sauvegardes>:/archive alpine sh -c 'rm -rf /data/* && tar -xzf /archive/<fichier>.tar.gz -C /data --strip-components=2' && docker compose start db server";

/** What a connection is, once its token has been checked. */
export interface ConnectionContext {
  readonly userId: string;
  readonly sessionId: string;
}

/**
 * The sync server (docs/SPEC.md §14, step 4): Hocuspocus relays the Yjs
 * updates of each document between the devices of an account and keeps its
 * state in Postgres. A connection needs a live device session (D-21), and
 * only reaches the account's own documents: its library, and the projects it
 * owns (the first account to open a project claims it).
 */
export function createSyncServer(options: SyncServerOptions): Server<ConnectionContext> {
  const { db } = options;
  const cacheDir = options.cacheDir ?? null;
  const netboot = options.netboot ?? { secret: null, macs: [] };
  const limiter = new LoginLimiter();
  const compagnon = new CompagnonKeys(db, options.createLlm);
  const web = createWebApp(options.webDir ?? null);
  const admin = createAdmin(db, {
    networks: networkList(options.admin?.networks ?? DEFAULT_ADMIN_NETWORKS),
    backupsDir: options.admin?.backupsDir ?? null,
    timeZone: options.admin?.timeZone ?? 'Europe/Paris',
    restoreCommand: RESTORE_COMMAND,
    // A revoked device stops syncing at once: its connections are closed (it cannot come back).
    cutOff: (sessionIds) => {
      compagnon.forgetSessions(sessionIds);
      for (const document of server.hocuspocus.documents.values())
        for (const connection of document.getConnections())
          if (sessionIds.includes(connection.context.sessionId)) connection.close();
    },
    ...(options.admin?.now && { now: options.admin.now }),
  });
  const server: Server<ConnectionContext> = new Server<ConnectionContext>({
    ...(options.port !== undefined && { port: options.port }),
    ...(options.address !== undefined && { address: options.address }),
    quiet: true,
    // Save a document 2 s after its last change, and at least every 10 s while it changes.
    debounce: 2000,
    maxDebounce: 10_000,
    extensions: [
      new DatabaseExtension({
        fetch: ({ documentName }) => loadDocument(db, documentName),
        store: ({ documentName, state }) => storeDocument(db, documentName, state),
      }),
    ],
    async onAuthenticate({ documentName, token, requestHeaders }): Promise<ConnectionContext> {
      const owner = documentOwner(documentName);
      if (!owner) throw new Error('Unknown document');
      // The browser (phase 4.7 a) sends no token: its cookie, from the app's own pages only.
      const fromCookie =
        token === COOKIE_TOKEN &&
        sameOrigin({
          origin: requestHeaders.get('origin'),
          host: requestHeaders.get('host'),
          site: requestHeaders.get('sec-fetch-site'),
        });
      const session = await sessionFor(
        db,
        fromCookie ? cookieToken(requestHeaders.get('cookie')) : token,
      );
      if (!session) throw new Error('Not signed in');
      const allowed =
        owner.kind === 'library'
          ? owner.userId === session.userId
          : await claimProject(db, owner.projectId, session.userId);
      if (!allowed) throw new Error('Not this account’s document');
      return session;
    },
    async onRequest({ request, response }) {
      // Hocuspocus rethrows what a hook throws, outside any handler: an error
      // escaping from here would be an unhandled rejection, which ends the
      // process. So nothing escapes: a failure is logged and answered.
      let answered: boolean;
      try {
        answered = await answer(request, response);
      } catch (error) {
        // Not the URL: a path may carry a secret (the network boot's).
        console.error('[http]', request.method, error);
        if (response.headersSent) response.destroy();
        else send(response, 500, { error: 'server' });
        answered = true;
      }
      // The API answers, then the rejection (without an error) stops Hocuspocus's own answer.
      if (answered) return Promise.reject();
    },
  });

  /** Answers a request of the server's own routes; false leaves it to Hocuspocus. */
  async function answer(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    // A request target no handler could parse (`//`): each of them builds this URL.
    if (!URL.canParse(request.url ?? '/', 'http://localhost')) {
      send(response, 400, { error: 'path' });
      return true;
    }
    return (
      (await handleCache(db, cacheDir, request, response)) ||
      (await handleUpdates(db, cacheDir, request, response)) ||
      (await handleInstaller(db, cacheDir, request, response)) ||
      (await handleNetboot(db, cacheDir, netboot, request, response)) ||
      (await admin.handle(request, response)) ||
      (await handleApi(db, limiter, request, response, compagnon)) ||
      (await web.handle(request, response))
    );
  }
  return server;
}
