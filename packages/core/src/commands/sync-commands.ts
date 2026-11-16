import type { WorkspaceContext } from '../workspace/workspace-context';
import type { CommandId } from './command-id';
import type { Command } from './registry';

type SyncCommand = Command<WorkspaceContext> & { readonly id: CommandId };

const signedIn = (ctx: WorkspaceContext) =>
  ctx.platform.sync !== null && ctx.platform.sync.status() !== 'off';

/**
 * Sync with the author's server (step 4.4, D-21), from the command line:
 * the server's address, the e-mail, the password (never shown), one after
 * the other. Signing out stops the sync; the projects stay on the device.
 */
export const syncCommands: readonly SyncCommand[] = [
  {
    id: 'syncSignIn',
    scope: 'global',
    isEnabled: (ctx) => ctx.platform.sync !== null,
    run: async (ctx) => {
      const sync = ctx.platform.sync;
      if (!sync) return;
      const account = await sync.account();
      const askAccount = (server: string) =>
        ctx.openPalette({
          kind: 'input',
          placeholder: ctx.t('sync.emailPrompt'),
          initial: account?.email ?? '',
          onSubmit: (email) => {
            if (!email.includes('@')) return ctx.notify(ctx.t('sync.badEmail'));
            ctx.openPalette({
              kind: 'input',
              placeholder: ctx.t('sync.passwordPrompt'),
              initial: '',
              secret: true,
              onSubmit: (password) => {
                if (!password) return;
                ctx.notify(ctx.t('sync.signingIn'));
                void sync
                  .signIn({ server, email: email.trim(), password })
                  .then((result) => ctx.notify(ctx.t(`sync.signIn.${result}`)));
              },
            });
          },
        });
      // The app in a browser syncs with the server that served it: no address to ask.
      if (sync.server) return askAccount(sync.server);
      ctx.openPalette({
        kind: 'input',
        placeholder: ctx.t('sync.serverPrompt'),
        initial: account?.server ?? 'https://',
        onSubmit: (server) => {
          if (!/^https?:\/\/\S+$/.test(server.trim())) return ctx.notify(ctx.t('sync.badServer'));
          askAccount(server.trim());
        },
      });
    },
  },
  {
    id: 'syncSignOut',
    scope: 'global',
    isEnabled: signedIn,
    run: async (ctx) => {
      await ctx.platform.sync?.signOut();
      ctx.notify(ctx.t('sync.signedOut'));
    },
  },
  {
    id: 'syncDevices',
    scope: 'global',
    isEnabled: signedIn,
    run: async (ctx) => {
      const sync = ctx.platform.sync;
      if (!sync) return;
      const devices = await sync.devices();
      if (!devices) return ctx.notify(ctx.t('sync.unreachable'));
      const date = (iso: string) =>
        new Intl.DateTimeFormat(ctx.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(iso),
        );
      ctx.openPalette({
        kind: 'pick',
        placeholder: ctx.t('sync.devicesPrompt'),
        items: devices.map((d) => ({
          id: d.id,
          label: d.device || ctx.t('sync.unnamedDevice'),
          detail: d.current
            ? ctx.t('sync.thisDevice')
            : ctx.t('sync.lastSeen', { date: date(d.lastSeenAt) }),
        })),
        onPick: (id) => {
          // This device signs out with « Se déconnecter du serveur ».
          if (devices.find((d) => d.id === id)?.current)
            return ctx.notify(ctx.t('sync.useSignOut'));
          void sync
            .revokeDevice(id)
            .then((done) => ctx.notify(ctx.t(done ? 'sync.deviceRevoked' : 'sync.unreachable')));
        },
      });
    },
  },
];
