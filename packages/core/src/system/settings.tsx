import {
  batteryLevel,
  hasBattery,
  type BluetoothDevice,
  type SystemService,
  type SystemSettings,
} from '@charpentier/platform';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '../app/platform-context';
import { featureText, type SettingsSection, type WorkspaceProps } from '../features/feature';
import { Gauge, Keys, Slider } from './controls';
import { postSoon } from './panels';
import { useSystemState } from './system-store';

/**
 * The twelve sections of the system's settings (docs/DESIGN.md §4.12), on
 * the page with the app's ordinary components: titles, small-caps groups,
 * lines of label, help and control.
 */
function useSettings() {
  const platform = usePlatform();
  const system = platform.system as SystemService;
  const state = useSystemState(system);
  const { t, i18n } = useTranslation();
  const text = featureText(t);
  const s = (key: string, options?: Readonly<Record<string, unknown>>) =>
    text(`system.settings.${key}`, options);
  const set =
    <K extends keyof SystemSettings>(key: K) =>
    (value: SystemSettings[K]) =>
      void system.setSetting(key, value);
  const yesNo = [
    { value: true, label: s('on') },
    { value: false, label: s('off') },
  ];
  return { system, state, s, text, set, yesNo, language: i18n.language };
}

function Group({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="ch-set-group">
      <h4 className="ch-label ch-set-title">{title}</h4>
      {children}
    </section>
  );
}

function Row({
  label,
  help,
  chosen = false,
  children,
}: {
  readonly label: ReactNode;
  readonly help?: ReactNode;
  /** A choice that stays (the network joined): sunk. */
  readonly chosen?: boolean;
  readonly children?: ReactNode;
}) {
  return (
    <div className={`ch-set-row${chosen ? ' is-chosen' : ''}`}>
      <div className="ch-set-text">
        <p className="ch-set-label">{label}</p>
        {help && <p className="ch-set-help">{help}</p>}
      </div>
      {children && <div className="ch-set-control">{children}</div>}
    </div>
  );
}

function Network() {
  const { system, state, s, yesNo } = useSettings();
  return (
    <>
      <Group title={s('groups.wifi')}>
        <Row label={s('rows.wifi')}>
          <Keys
            options={yesNo}
            value={state.wifi.enabled}
            label={s('rows.wifi')}
            onChange={(on) => void system.setWifi(on)}
          />
        </Row>
      </Group>
      {state.wifi.enabled && (
        <Group title={s('groups.networks')}>
          {state.wifi.networks.map((n) => (
            <Row
              key={n.ssid}
              label={n.ssid}
              chosen={n.ssid === state.wifi.connected}
              help={[
                n.ssid === state.wifi.connected && s('rows.connected'),
                n.secure && s('rows.secure'),
                n.portal && s('rows.portal'),
              ]
                .filter(Boolean)
                .join(' · ')}
            >
              {n.ssid !== state.wifi.connected && (
                <button
                  type="button"
                  className="ch-btn"
                  onClick={() => void system.connectWifi(n.ssid)}
                >
                  {s('rows.connect')}
                </button>
              )}
              {n.known && (
                <button
                  type="button"
                  className="ch-btn"
                  onClick={() => void system.forgetWifi(n.ssid)}
                >
                  {s('rows.forget')}
                </button>
              )}
            </Row>
          ))}
        </Group>
      )}
      <Group title={s('groups.ethernet')}>
        <Row label={s('rows.ethernet')} help={s('rows.ethernetHelp')}>
          <span className="ch-set-value">
            {state.ethernet.connected ? s('rows.ethernetOn') : s('rows.ethernetOff')}
          </span>
        </Row>
      </Group>
    </>
  );
}

function Bluetooth() {
  const { system, state, s, yesNo } = useSettings();
  // Pairing (phase 5.7): a search of a few seconds, then the devices found.
  const [found, setFound] = useState<readonly BluetoothDevice[] | null>(null);
  const [busy, setBusy] = useState<'scan' | string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const scan = async () => {
    setBusy('scan');
    setMessage(null);
    setFound(await system.scanBluetooth());
    setBusy(null);
  };
  const pair = async (id: string) => {
    setBusy(id);
    const result = await system.pairBluetooth(id);
    setBusy(null);
    if (result === 'paired') setFound((list) => list?.filter((d) => d.id !== id) ?? null);
    else setMessage(s('rows.pairFailed'));
  };
  return (
    <Group title={s('groups.devices')}>
      <Row label={s('rows.bluetooth')}>
        <Keys
          options={yesNo}
          value={state.bluetooth.enabled}
          label={s('rows.bluetooth')}
          onChange={(on) => void system.setBluetooth(on)}
        />
      </Row>
      {state.bluetooth.devices.map((d) => (
        <Row key={d.id} label={d.name} help={d.connected ? s('rows.connected') : undefined}>
          <button
            type="button"
            className="ch-btn"
            onClick={() => void system.forgetBluetooth(d.id)}
          >
            {s('rows.forget')}
          </button>
        </Row>
      ))}
      <Row label={s('rows.pair')} help={s('rows.pairHelp')}>
        <button
          type="button"
          className="ch-btn"
          disabled={busy !== null}
          onClick={() => void scan()}
        >
          {s(busy === 'scan' ? 'rows.searching' : 'rows.search')}
        </button>
      </Row>
      {found?.length === 0 && <p className="ch-set-help">{s('rows.nothingFound')}</p>}
      {found?.map((d) => (
        <Row key={d.id} label={d.name}>
          <button
            type="button"
            className="ch-btn"
            disabled={busy !== null}
            onClick={() => void pair(d.id)}
          >
            {s(busy === d.id ? 'rows.pairing' : 'rows.pairThis')}
          </button>
        </Row>
      ))}
      {message && (
        <p className="ch-set-help" role="status">
          {message}
        </p>
      )}
    </Group>
  );
}

function Display() {
  const { system, state, s, text, set } = useSettings();
  return (
    <>
      <Group title={s('groups.brightness')}>
        <Row label={s('rows.brightness')}>
          <Slider
            value={state.brightness}
            min={5}
            label={s('rows.brightness')}
            onChange={(v) => {
              void system.setBrightness(v);
              postSoon(system, 'lum', text('system.messages.brightness', { value: v }));
            }}
          />
        </Row>
      </Group>
      <Group title={s('groups.night')}>
        <Row label={s('rows.night')} help={s('rows.nightHelp')}>
          <Keys
            options={[
              { value: 'auto', label: s('rows.auto') },
              { value: 'on', label: s('on') },
              { value: 'off', label: s('off') },
            ]}
            value={state.night.mode}
            label={s('rows.night')}
            onChange={(mode) => void system.setNightMode(mode)}
          />
        </Row>
        <Row label={s('rows.nightWarmth')} help={s('rows.nightWarmthHelp')}>
          <Keys
            options={[
              { value: 4600 as const, label: s('values.warmthLight') },
              { value: 4000 as const, label: s('values.warmthMedium') },
              { value: 3400 as const, label: s('values.warmthStrong') },
            ]}
            value={state.settings.nightWarmth}
            label={s('rows.nightWarmth')}
            onChange={set('nightWarmth')}
          />
        </Row>
      </Group>
      <Group title={s('groups.external')}>
        <Row label={s('rows.external')} help={s('rows.externalHelp')}>
          <span className="ch-set-value">{state.externalScreen ?? s('values.none')}</span>
        </Row>
        <Row label={s('rows.externalScale')}>
          <Keys
            options={[100, 125, 150].map((v) => ({
              value: v as 100 | 125 | 150,
              label: text('system.seg.percent', { value: v }),
            }))}
            value={state.settings.externalScale}
            label={s('rows.externalScale')}
            onChange={set('externalScale')}
          />
        </Row>
      </Group>
    </>
  );
}

function Sound({ ctx }: WorkspaceProps) {
  const { system, state, s, yesNo } = useSettings();
  return (
    <>
      <Group title={s('groups.volume')}>
        <Row label={s('rows.volume')}>
          <Slider
            value={state.volume}
            label={s('rows.volume')}
            onChange={(v) => void system.setVolume(v)}
          />
        </Row>
        <Row label={s('rows.mute')}>
          <Keys
            options={yesNo}
            value={state.muted}
            label={s('rows.mute')}
            onChange={(m) => void system.setMuted(m)}
          />
        </Row>
      </Group>
      <Group title={s('groups.appSounds')}>
        <Row label={s('rows.uiSounds')}>
          <Keys
            options={yesNo}
            value={ctx.prefs.uiSounds}
            label={s('rows.uiSounds')}
            onChange={(on) => ctx.updatePrefs({ uiSounds: on })}
          />
        </Row>
        <Row label={s('rows.typingSounds')}>
          <Keys
            options={yesNo}
            value={ctx.prefs.typingSounds}
            label={s('rows.typingSounds')}
            onChange={(on) => ctx.updatePrefs({ typingSounds: on })}
          />
        </Row>
      </Group>
    </>
  );
}

function Power() {
  const { state, s, set } = useSettings();
  return (
    <>
      {hasBattery(state) && (
        <Group title={s('groups.batteries')}>
          {state.power.batteries.map((b) => (
            <Row
              key={b.name}
              label={s('rows.battery', { name: b.name })}
              help={s('rows.batteryHelp', { wear: 100 - b.health })}
            >
              <Gauge value={b.level} />
              <span className="ch-set-value">{b.level} %</span>
            </Row>
          ))}
        </Group>
      )}
      <Group title={s('groups.delays')}>
        <Row label={s('rows.screenOff')}>
          <Keys
            options={[
              { value: 5, label: '5 min' },
              { value: 15, label: '15 min' },
              { value: null, label: s('rows.askNever') },
            ]}
            value={state.settings.screenOffAfter}
            label={s('rows.screenOff')}
            onChange={set('screenOffAfter')}
          />
        </Row>
        <Row label={s('rows.sleepAfter')} help={s('rows.lidHelp')}>
          <Keys
            options={[
              { value: 15, label: '15 min' },
              { value: 30, label: '30 min' },
              { value: null, label: s('rows.askNever') },
            ]}
            value={state.settings.sleepAfter}
            label={s('rows.sleepAfter')}
            onChange={set('sleepAfter')}
          />
        </Row>
        <Row label={s('rows.lowBattery')}>
          <Keys
            options={[
              { value: 10, label: '10 %' },
              { value: 15, label: '15 %' },
              { value: 20, label: '20 %' },
            ]}
            value={state.settings.lowBattery}
            label={s('rows.lowBattery')}
            onChange={set('lowBattery')}
          />
        </Row>
      </Group>
    </>
  );
}

function Lock() {
  const { system, state, s, set } = useSettings();
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const hasCode = state.lock.hasCode;
  const apply = async (next: string | null) => {
    const result = await system.setLockCode(next, hasCode ? current : undefined);
    if (result === 'ok') {
      setEditing(false);
      setCurrent('');
      setCode('');
      setMessage(s(next === null ? 'rows.codeRemoved' : 'rows.codeSaved'));
    } else setMessage(s(result === 'wrong' ? 'rows.codeWrong' : 'rows.codeInvalid'));
  };
  return (
    <Group title={s('groups.code')}>
      <Row
        label={s('rows.code')}
        help={s('rows.codeHelp', { encrypted: state.device.diskEncrypted ? s('on') : s('off') })}
      >
        <span className="ch-set-value">{s(hasCode ? 'rows.codeSet' : 'rows.codeNone')}</span>
        <button
          type="button"
          className="ch-btn"
          onClick={() => {
            setEditing((e) => !e);
            setMessage(null);
          }}
        >
          {s(hasCode ? 'rows.codeChange' : 'rows.codeChoose')}
        </button>
      </Row>
      {editing && (
        <form
          className="ch-set-row ch-set-code"
          onSubmit={(e) => {
            e.preventDefault();
            void apply(code);
          }}
        >
          {hasCode && (
            <input
              type="password"
              className="ch-set-input"
              aria-label={s('rows.codeCurrent')}
              placeholder={s('rows.codeCurrent')}
              autoComplete="off"
              maxLength={8}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          )}
          <input
            type="password"
            className="ch-set-input"
            aria-label={s('rows.codeNew')}
            placeholder={s('rows.codeNew')}
            autoComplete="off"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="submit" className="ch-btn">
            {s(hasCode ? 'rows.codeChange' : 'rows.codeChoose')}
          </button>
          {hasCode && (
            <button type="button" className="ch-btn" onClick={() => void apply(null)}>
              {s('rows.codeRemove')}
            </button>
          )}
        </form>
      )}
      {message && (
        <p className="ch-set-help" role="status">
          {message}
        </p>
      )}
      <Row label={s('rows.askCode')}>
        <Keys
          options={[
            { value: 'wake', label: s('rows.askWake') },
            { value: 'after15', label: s('rows.askAfter15') },
            { value: 'never', label: s('rows.askNever') },
          ]}
          value={state.settings.askCode}
          label={s('rows.askCode')}
          onChange={set('askCode')}
        />
      </Row>
      {hasCode && (
        <Row label={s('rows.lockNow')}>
          <button type="button" className="ch-btn" onClick={() => void system.lock()}>
            {s('rows.lockNow')}
          </button>
        </Row>
      )}
    </Group>
  );
}

function Keyboard() {
  const { state, s, set, yesNo } = useSettings();
  return (
    <>
      <Group title={s('groups.layout')}>
        <Row label={s('rows.layout')}>
          <Keys
            options={[
              { value: 'azerty', label: 'AZERTY' },
              { value: 'bepo', label: 'BÉPO' },
              { value: 'qwerty', label: 'QWERTY' },
            ]}
            value={state.settings.keyboardLayout}
            label={s('rows.layout')}
            onChange={set('keyboardLayout')}
          />
        </Row>
      </Group>
      <Group title={s('groups.touchpad')}>
        {(['touchpad', 'touchpadWhileTyping', 'tapToClick', 'naturalScrolling'] as const).map(
          (key) => (
            <Row key={key} label={s(`rows.${key}`)}>
              <Keys
                options={yesNo}
                value={state.settings[key]}
                label={s(`rows.${key}`)}
                onChange={set(key)}
              />
            </Row>
          ),
        )}
      </Group>
    </>
  );
}

function Printing() {
  const { state, s, set } = useSettings();
  return (
    <>
      <Group title={s('groups.printers')}>
        {state.printers.map((p) => (
          <Row
            key={p.name}
            label={p.name}
            help={p.isDefault ? s('rows.printerDefault') : undefined}
          />
        ))}
        <p className="ch-set-help">{s('rows.printersHelp')}</p>
      </Group>
      <Group title={s('groups.paper')}>
        <Row label={s('rows.paper')}>
          <Keys
            options={[
              { value: 'a4', label: 'A4' },
              { value: 'letter', label: s('rows.letter') },
            ]}
            value={state.settings.paperSize}
            label={s('rows.paper')}
            onChange={set('paperSize')}
          />
        </Row>
      </Group>
    </>
  );
}

function Usb() {
  const { system, state, s, text } = useSettings();
  return (
    <Group title={s('groups.key')}>
      {state.usb ? (
        <Row label={s('rows.usbKey', { name: state.usb.name })}>
          <button type="button" className="ch-btn" onClick={() => void system.copyToUsb()}>
            {text('system.panel.copy')}
          </button>
          <button type="button" className="ch-btn" onClick={() => void system.ejectUsb()}>
            {text('system.panel.eject')}
          </button>
        </Row>
      ) : (
        <p className="ch-set-help">{s('rows.usbNone')}</p>
      )}
    </Group>
  );
}

function DateTime() {
  const { state, s, set, yesNo } = useSettings();
  return (
    <Group title={s('groups.clock')}>
      <Row label={s('rows.timeZone')}>
        <span className="ch-set-value">{state.timeZone}</span>
      </Row>
      <Row label={s('rows.autoTime')}>
        <Keys
          options={yesNo}
          value={state.settings.autoTime}
          label={s('rows.autoTime')}
          onChange={set('autoTime')}
        />
      </Row>
      <Row label={s('rows.clock24')}>
        <Keys
          options={yesNo}
          value={state.settings.clock24}
          label={s('rows.clock24')}
          onChange={set('clock24')}
        />
      </Row>
    </Group>
  );
}

function SystemLineSettings() {
  const { state, s, set, yesNo } = useSettings();
  return (
    <Group title={s('groups.segments')}>
      <Row label={s('rows.showCpu')} help={s('rows.showCpuHelp')}>
        <Keys
          options={yesNo}
          value={state.settings.showCpu}
          label={s('rows.showCpu')}
          onChange={set('showCpu')}
        />
      </Row>
    </Group>
  );
}

function About() {
  const { state, s, language } = useSettings();
  const date = new Intl.DateTimeFormat(language, { dateStyle: 'long' }).format(
    new Date(state.device.installedAt),
  );
  return (
    <>
      <Group title={s('groups.charpentier')}>
        <Row label={s('rows.appVersion')} help={s('rows.installedAt', { date })}>
          <span className="ch-set-value">{state.device.appVersion}</span>
        </Row>
      </Group>
      <Group title={s('groups.os')}>
        <Row
          label={s('rows.osVersion')}
          help={s('rows.generation', { value: state.device.generation })}
        >
          <span className="ch-set-value">{state.device.osVersion}</span>
        </Row>
      </Group>
      <Group title={s('groups.device')}>
        <Row label={s('rows.storage')}>
          <span className="ch-set-value">
            {s('rows.storageValue', {
              used: state.device.storage.used,
              total: state.device.storage.total,
            })}
          </span>
        </Row>
        <Row label={s('rows.licenses')} help={s('rows.licensesHelp')} />
      </Group>
    </>
  );
}

/** The sentence under a section's title. */
function intro(key: string) {
  return function Intro() {
    return <>{useSettings().s(`intro.${key}`)}</>;
  };
}

function PowerIntro() {
  const { state, s } = useSettings();
  const level = batteryLevel(state);
  const { remaining } = state.power;
  return (
    <>
      {!hasBattery(state)
        ? s('intro.powerMains')
        : state.power.charging || remaining === null
          ? s('intro.powerCharging', { level })
          : s('intro.power', {
              level,
              time: `${Math.floor(remaining / 60)} h ${String(remaining % 60).padStart(2, '0')}`,
            })}
    </>
  );
}

function DateIntro() {
  const { state, language } = useSettings();
  return (
    <>
      {new Intl.DateTimeFormat(language, {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: state.timeZone,
      }).format(new Date())}
    </>
  );
}

function AboutIntro() {
  const { state, s } = useSettings();
  return <>{s('intro.about', { model: state.device.model.split(' · ')[0] })}</>;
}

/** A section's current value, at the right of its line in the rail. */
function value(read: (state: ReturnType<typeof useSettings>) => string) {
  return function Value() {
    return <>{read(useSettings())}</>;
  };
}

export const systemSettingsSections: readonly SettingsSection[] = [
  {
    id: 'network',
    label: 'system.settings.network',
    intro: intro('network'),
    value: value(({ state, s }) => (state.wifi.enabled ? (state.wifi.connected ?? '–') : s('off'))),
    component: Network,
  },
  {
    id: 'bluetooth',
    label: 'system.settings.bluetooth',
    intro: intro('bluetooth'),
    value: value(({ state, s }) => (state.bluetooth.enabled ? s('on') : s('off'))),
    component: Bluetooth,
  },
  {
    id: 'display',
    label: 'system.settings.display',
    intro: intro('display'),
    value: value(({ state }) => `${state.brightness} %`),
    component: Display,
  },
  {
    id: 'sound',
    label: 'system.settings.sound',
    intro: intro('sound'),
    value: value(({ state, s }) => (state.muted ? s('rows.mute') : `${state.volume} %`)),
    component: Sound,
  },
  {
    id: 'power',
    label: 'system.settings.power',
    intro: PowerIntro,
    value: value(({ state }) => (hasBattery(state) ? `${batteryLevel(state)} %` : '')),
    component: Power,
  },
  { id: 'lock', label: 'system.settings.lock', intro: intro('lock'), component: Lock },
  {
    id: 'keyboard',
    label: 'system.settings.keyboard',
    value: value(({ state }) => state.settings.keyboardLayout.toUpperCase()),
    component: Keyboard,
  },
  {
    id: 'printing',
    label: 'system.settings.printing',
    intro: intro('printing'),
    component: Printing,
  },
  {
    id: 'usb',
    label: 'system.settings.usb',
    intro: intro('usb'),
    value: value(({ state }) => state.usb?.name ?? '–'),
    component: Usb,
  },
  { id: 'datetime', label: 'system.settings.datetime', intro: DateIntro, component: DateTime },
  {
    id: 'systemLine',
    label: 'system.settings.systemLine',
    intro: intro('systemLine'),
    component: SystemLineSettings,
  },
  {
    id: 'about',
    label: 'system.settings.about',
    intro: AboutIntro,
    value: value(({ state }) => state.device.appVersion),
    component: About,
  },
];
