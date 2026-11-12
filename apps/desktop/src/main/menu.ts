import { Menu, type MenuItemConstructorOptions } from 'electron';

/**
 * A minimal menu: the system's own items and the clipboard (which needs an
 * Edit menu on macOS). Undo and redo are left to the editor (Yjs history),
 * and every other shortcut to the app's command registry.
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
