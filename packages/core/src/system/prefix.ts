import type { SystemService } from '@charpentier/platform';
import { featureText, type CommandPrefix } from '../features/feature';
import type { PickItem } from '../palette/palette-request';
import type { WorkspaceContext } from '../workspace/workspace-context';
import { MONITOR_VIEW, systemUi, type Segment } from './system-store';

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

/** The words of `:` (docs/DESIGN.md §4.12), without argument: the panel of their segment. */
const WORDS = [
  'lum',
  'vol',
  'muet',
  'wifi',
  'bt',
  'nuit',
  'veille',
  'eteindre',
  'redemarrer',
  'usb',
  'journal',
  'reglages',
  'moniteur',
  'verrou',
  'imprimer',
] as const;
type Word = (typeof WORDS)[number];

const PANEL: Partial<Record<Word, Segment>> = {
  lum: 'lum',
  vol: 'vol',
  wifi: 'wifi',
  bt: 'bt',
  nuit: 'lum',
  eteindre: 'systeme',
  redemarrer: 'systeme',
  usb: 'usb',
  journal: 'message',
};

const YES = new Set(['oui', 'on', '1']);
const NO = new Set(['non', 'off', '0']);

const system = (ctx: WorkspaceContext) => ctx.platform.system as SystemService;

/** `:lum 40` → the word and its argument. */
function parse(query: string): { word: string; arg: string } {
  const [word = '', ...rest] = query.trim().split(/\s+/);
  return { word: fold(word), arg: rest.join(' ') };
}

function label(ctx: WorkspaceContext, word: Word, arg: string): string {
  const text = featureText(ctx.t);
  const k = (key: string, options?: Readonly<Record<string, unknown>>) =>
    text(`system.prefixAction.${key}`, options);
  switch (word) {
    case 'lum':
    case 'vol':
      return arg ? k(word, { value: arg }) : text(`system.panel.${word}`);
    case 'wifi':
      return arg ? k('wifi', { value: arg }) : k('wifiPanel');
    case 'imprimer':
      return arg ? k('imprimer', { value: arg }) : k('imprimerPanel');
    case 'bt':
    case 'nuit':
      return arg ? k(word, { value: arg }) : k(word, { value: '' }).trim();
    default:
      return k(word);
  }
}

/**
 * The `:` prefix of the command line: the system, with an optional argument
 * (`:lum 40`, `:wifi Maison-5G`, `:wifi non`, `:veille`…).
 */
export const systemPrefix: CommandPrefix = {
  prefix: ':',
  label: 'system.prefix',
  search(ctx, query): readonly PickItem[] {
    const { word, arg } = parse(query);
    const matches = WORDS.filter(
      (w) =>
        w.startsWith(word) &&
        (w !== 'moniteur' || !!system(ctx).monitor) &&
        (w !== 'verrou' || system(ctx).state().lock.hasCode) &&
        (w !== 'imprimer' || system(ctx).state().printers.length > 0),
    );
    if (word && matches.length === 0)
      return [{ id: '', label: featureText(ctx.t)('system.prefixAction.unknown', { word }) }];
    return matches.map((w) => ({
      id: w,
      label: label(ctx, w, w === word ? arg : ''),
      detail: `:${w}${w === word && arg ? ` ${arg}` : ''}`,
    }));
  },
  onPick(ctx, id, query) {
    if (!id) return;
    const word = id as Word;
    const { word: typed, arg } = parse(query);
    const value = typed === word ? arg : '';
    const sys = system(ctx);
    const number = Number.parseInt(value, 10);
    const flag = YES.has(fold(value)) ? true : NO.has(fold(value)) ? false : null;
    switch (word) {
      case 'lum':
        if (Number.isFinite(number)) return void sys.setBrightness(number);
        break;
      case 'vol':
        if (Number.isFinite(number)) return void sys.setVolume(number);
        break;
      case 'muet':
        return void sys.setMuted(!sys.state().muted);
      case 'wifi':
        if (flag !== null) return void sys.setWifi(flag);
        if (value) {
          const network = sys.state().wifi.networks.find((n) => fold(n.ssid) === fold(value));
          if (network && (!network.secure || network.known))
            return void sys.connectWifi(network.ssid);
        }
        break;
      case 'bt':
        if (flag !== null) return void sys.setBluetooth(flag);
        break;
      case 'nuit': {
        const mode =
          fold(value) === 'auto' ? 'auto' : flag === true ? 'on' : flag === false ? 'off' : null;
        if (mode) return void sys.setNightMode(mode);
        break;
      }
      case 'veille':
        return void sys.suspend();
      case 'reglages':
        return ctx.openSettings();
      case 'moniteur':
        return ctx.openView(MONITOR_VIEW);
      case 'verrou':
        return void sys.lock();
      case 'imprimer': {
        // `:imprimer scène`, `:imprimer chapitre`, `:imprimer manuscrit`.
        const what = fold(value);
        return systemUi.print(
          what.startsWith('chap') ? 'chapter' : what.startsWith('manu') ? 'manuscript' : 'scene',
        );
      }
      default:
        break;
    }
    const panel = PANEL[word];
    if (panel) systemUi.open(panel);
  },
};
