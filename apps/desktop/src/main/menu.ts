import type { MenuModel } from '@charpentier/platform-desktop/shared';
import { toAccelerator } from '@charpentier/platform-desktop/main';
import { Menu, type MenuItemConstructorOptions } from 'electron';

/**
 * Until the interface sends its menu: the system's own items and the
 * clipboard (which needs an Edit menu on macOS).
 */
export function appMenu(): Menu {
  const mac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(mac ? [{ role: 'appMenu' as const }] : []),
    {
      role: 'editMenu',
      submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
    },
    {
      role: 'windowMenu',
      submenu: mac
        ? [{ role: 'minimize' }, { role: 'zoom' }, { role: 'togglefullscreen' }, { role: 'close' }]
        : [{ role: 'minimize' }, { role: 'close' }],
    },
  ];
  return Menu.buildFromTemplate(template);
}

/**
 * The full menu bar the interface builds from its command registry
 * (docs/DESIGN.md §4.8). The shortcuts are shown but not registered: the
 * interface handles the keys itself, the menu only sends the command chosen
 * with the mouse. The system's items (clipboard, window, application) keep
 * their own behaviour.
 */
export function commandMenu(model: MenuModel, run: (id: string) => void): Menu {
  const template = model.menus.map(({ label, entries }): MenuItemConstructorOptions => ({
    label,
    // The window menu also lists the open windows.
    ...(entries.some((e) => e.kind === 'role' && e.role === 'minimize') && {
      role: 'windowMenu' as const,
    }),
    submenu: entries.map((entry): MenuItemConstructorOptions => {
      switch (entry.kind) {
        case 'separator':
          return { type: 'separator' };
        case 'role':
          return { role: entry.role, label: entry.label };
        case 'command':
          return {
            label: entry.label,
            ...(entry.shortcut && {
              accelerator: toAccelerator(entry.shortcut),
              registerAccelerator: false,
            }),
            click: () => run(entry.id),
          };
      }
    }),
  }));
  return Menu.buildFromTemplate(template);
}
