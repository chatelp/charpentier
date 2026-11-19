import {
  batteryLevel,
  deviceVersionLabel,
  hasBattery,
  type BluetoothDevice,
  type SystemService,
  type SystemSettings,
} from '@charpentier/platform';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '../app/platform-context';
import { featureText, type SettingsSection } from '../features/feature';
import { Gauge, Keys, Slider } from './controls';
import { duration, hours, minutesSince, postSoon, shortDate } from './panels';
import { beforeRestart } from './restart';
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
  return { platform, system, state, s, text, set, yesNo, language: i18n.language };
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
        {/* D-37: 100 % by default (1920 px); 125 and 150 % for larger letters. */}
        <Row label={s('rows.screenScale')} help={s('rows.screenScaleHelp')}>
          <Keys
            options={[100, 125, 150].map((v) => ({
              value: v as 100 | 125 | 150,
              label: text('system.seg.percent', { value: v }),
            }))}
            value={state.settings.screenScale}
            label={s('rows.screenScale')}
            onChange={set('screenScale')}
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
              { value: 5500 as const, label: s('values.warmthLight') },
              { value: 4800 as const, label: s('values.warmthMedium') },
              { value: 4000 as const, label: s('values.warmthStrong') },
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

function Sound() {
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

/** A light confirmation (« Revenir à 0.5.0… »): a first press arms it for 3 s, a second acts. */
function useArmed(): [boolean, (act: () => void) => void] {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);
  return [
    armed,
    (act) => {
      if (armed) {
        setArmed(false);
        act();
      } else setArmed(true);
    },
  ];
}

/** The update ready, or what the version installed brought (docs/DESIGN.md §4.12). */
function UpdateCard() {
  const { platform, system, state, s, language } = useSettings();
  const [armed, arm] = useArmed();
  const update = state.update;
  if (!update) return null;
  const { ready, installed } = update;
  const notes = ready?.notes ?? installed.notes;
  if (!ready && notes.length === 0) return null;
  const time = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="ch-set-card">
      {ready ? (
        <Row
          label={s('rows.updateReady', { version: ready.version })}
          help={s('rows.updateReadyHelp', { date: shortDate(ready.publishedAt, language) })}
        >
          <button
            type="button"
            className="ch-btn"
            onClick={() => arm(() => void beforeRestart(platform).then(() => system.reboot()))}
          >
            {armed ? s('rows.confirmRestart') : s('rows.restart')}
            <kbd>{armed ? '⏎' : '⊞R'}</kbd>
          </button>
        </Row>
      ) : (
        <Row
          label={s('rows.updateNews', { version: installed.version })}
          help={s('rows.updateInstalled', {
            day: dayLabel(installed.installedAt, language, s),
            time: time.format(new Date(installed.installedAt)),
          })}
        />
      )}
      <ul className="ch-set-notes">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

/** « aujourd’hui » or « le 12 nov. » */
function dayLabel(iso: string, language: string, s: (key: string) => string) {
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString()
    ? s('rows.today')
    : `${s('rows.on')} ${shortDate(iso, language)}`;
}

/** The check: when it was, « Vérifier maintenant », and the last failure said plainly. */
function UpdateCheck() {
  const { system, state, s, language } = useSettings();
  const update = state.update;
  if (!update) return null;
  const time = (iso: string) =>
    new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  const { failure } = update;
  const help = update.checking
    ? s('rows.checking')
    : failure
      ? s(`rows.failure.${failure.reason}`, { version: failure.version, time: time(failure.at) })
      : s('rows.checkHelp', {
          last: update.lastCheck ? time(update.lastCheck) : s('rows.never'),
        });
  return (
    <Row label={s('rows.check')} help={help}>
      <button
        type="button"
        className="ch-btn"
        disabled={update.checking}
        onClick={() => void system.checkUpdate()}
      >
        {s('rows.checkNow')}
      </button>
    </Row>
  );
}

/** Back to the previous version, or forward again to the one set aside. */
function UpdateSwitch() {
  const { platform, system, state, s } = useSettings();
  const [armed, arm] = useArmed();
  const [failed, setFailed] = useState(false);
  const update = state.update;
  const forward = update?.setAside;
  const target = forward ?? update?.previous;
  if (!update || !target) return null;
  const version = target.version;
  const installed = update.installed.version;
  const help = !target.readable
    ? s('rows.backUnreadable', { version })
    : failed
      ? s('rows.backFailed', { version })
      : armed
        ? s(forward ? 'rows.forwardArmed' : 'rows.backArmed', { version, installed })
        : s(forward ? 'rows.forwardHelp' : 'rows.backHelp', { version });
  return (
    <Row label={s(forward ? 'rows.forward' : 'rows.back')} help={help}>
      <button
        type="button"
        className="ch-btn"
        disabled={!target.readable}
        onClick={() =>
          arm(async () => {
            await beforeRestart(platform);
            setFailed((await system.bootVersion(version)) === 'failed');
          })
        }
      >
        {armed ? s('rows.confirmSwitch', { version }) : s('rows.switchTo', { version })}
        {armed && <kbd>⏎</kbd>}
      </button>
    </Row>
  );
}

function About() {
  const { state, s, language } = useSettings();
  const installedAt = state.update?.installed.installedAt ?? state.device.installedAt;
  return (
    <>
      <Row label={s('rows.appVersion')}>
        <span className="ch-set-value">
          {s('rows.versionValue', {
            version: deviceVersionLabel(state),
            day: dayLabel(installedAt, language, s),
          })}
        </span>
      </Row>
      <Row label={s('rows.osVersion')}>
        <span className="ch-set-value">
          {s('rows.osValue', { os: state.device.osVersion, generation: state.device.generation })}
        </span>
      </Row>
      {state.update && (
        <Group title={s('groups.update')}>
          <UpdateCard />
          <UpdateCheck />
          <UpdateSwitch />
        </Group>
      )}
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

/**
 * A dial of the board (docs/DESIGN.md §4.12, 1.23): the value large, then a
 * line or two of detail in the muted ink.
 */
function dial(
  read: (settings: ReturnType<typeof useSettings>) => {
    readonly value: ReactNode;
    readonly details: readonly ReactNode[];
  },
) {
  return function Dial() {
    const { value: big, details } = read(useSettings());
    return (
      <>
        <p className="ch-sysset-dial-value">{big}</p>
        {details.filter(Boolean).map((d, i) => (
          <p key={i} className="ch-sysset-dial-detail">
            {d}
          </p>
        ))}
      </>
    );
  };
}

/** What the lock asks, the same on the board and in the rail. */
const lockValue = ({ state, s }: ReturnType<typeof useSettings>) =>
  state.settings.askCode === 'wake'
    ? s('rows.askWake')
    : state.settings.askCode === 'after15'
      ? s('rows.askAfter15')
      : s('rows.askNever');

const printerName = ({ state }: ReturnType<typeof useSettings>) =>
  state.printers.find((p) => p.isDefault)?.name ?? state.printers[0]?.name;

/** « Europe/Paris » → « Paris ». */
const city = (timeZone: string) => (timeZone.split('/').at(-1) ?? timeZone).replace(/_/g, ' ');

const dot = (...parts: readonly (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' · ');

/** « x250 · 0.1.1 (43d2f0a) · allumé depuis 3 h 12 », after the board's title. */
export function SettingsSubtitle() {
  const { state, s } = useSettings();
  return (
    <>
      {dot(
        state.device.name,
        deviceVersionLabel(state),
        s('board.since', { time: duration(minutesSince(state.device.bootedAt)) }),
      )}
    </>
  );
}

export const systemSettingsSections: readonly SettingsSection[] = [
  {
    id: 'network',
    label: 'system.settings.network',
    intro: intro('network'),
    value: value(({ state, s }) => (state.wifi.enabled ? (state.wifi.connected ?? '–') : s('off'))),
    component: Network,
    dial: dial(({ state, s }) => ({
      value: state.wifi.enabled ? (state.wifi.connected ?? '–') : s('off'),
      details: [
        dot(
          `${s('rows.wifi')} ${state.wifi.enabled ? s('on') : s('off')}`,
          `${s('rows.ethernet')} ${state.ethernet.connected ? s('on') : s('off')}`,
        ),
        state.wifi.address,
      ],
    })),
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
    value: value(({ state, text }) =>
      text('system.seg.percent', { value: state.settings.screenScale }),
    ),
    component: Display,
    dial: dial(({ state, s, text }) => ({
      value: text('system.seg.percent', { value: state.settings.screenScale }),
      details: [
        dot(
          `${s('rows.brightness')} ${state.brightness}`,
          `${s('rows.night')} ${state.night.mode === 'auto' ? s('rows.auto') : state.night.mode === 'on' ? s('on') : s('off')}`,
        ),
        `${s('rows.external')} : ${state.externalScreen ?? s('values.none')}`,
      ],
    })),
  },
  {
    id: 'sound',
    label: 'system.settings.sound',
    intro: intro('sound'),
    value: value(({ state, s }) => (state.muted ? s('rows.mute') : `${state.volume} %`)),
    component: Sound,
    dial: dial(({ state, s }) => ({
      value: state.muted ? s('rows.mute') : String(state.volume),
      details: [!state.muted && <Gauge value={state.volume} />],
    })),
  },
  {
    id: 'power',
    label: 'system.settings.power',
    intro: PowerIntro,
    value: value(({ state }) => (hasBattery(state) ? `${batteryLevel(state)} %` : '')),
    component: Power,
    dial: dial(({ state }) => ({
      value: hasBattery(state) ? `${batteryLevel(state)} %` : '–',
      details: [
        state.power.remaining !== null && hours(state.power.remaining),
        state.power.charging && '⚡',
      ],
    })),
  },
  {
    id: 'lock',
    label: 'system.settings.lock',
    intro: intro('lock'),
    value: value(lockValue),
    component: Lock,
    dial: dial((settings) => ({
      value: lockValue(settings),
      details: [settings.state.lock.hasCode ? null : settings.s('board.noCode')],
    })),
  },
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
    // The make alone in the rail; the board has room for the model.
    value: value((settings) => printerName(settings)?.split(' ')[0] ?? '–'),
    component: Printing,
    dial: dial((settings) => ({
      value: printerName(settings) ?? '—',
      details: [settings.state.settings.paperSize === 'a4' ? 'A4' : settings.s('rows.letter')],
    })),
  },
  {
    id: 'usb',
    label: 'system.settings.usb',
    intro: intro('usb'),
    value: value(({ state }) => state.usb?.name ?? '–'),
    component: Usb,
    dial: dial(({ state, s }) => ({
      value: state.usb ? state.usb.name : '—',
      details: [state.usb ? null : s('board.noUsb')],
    })),
  },
  {
    id: 'datetime',
    label: 'system.settings.datetime',
    intro: DateIntro,
    value: value(({ state }) => city(state.timeZone)),
    component: DateTime,
    dial: dial(({ state, s, language }) => ({
      value: new Intl.DateTimeFormat(language, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: !state.settings.clock24,
      }).format(new Date()),
      details: [dot(city(state.timeZone), state.settings.autoTime && s('rows.autoTimeShort'))],
    })),
  },
  {
    id: 'systemLine',
    label: 'system.settings.systemLine',
    intro: intro('systemLine'),
    value: value(({ state, s }) => (state.settings.showCpu ? 'cpu' : s('off'))),
    component: SystemLineSettings,
    dial: dial(({ state, s }) => ({
      value: state.settings.showCpu ? 'cpu' : s('off'),
      details: [s('rows.showCpu')],
    })),
  },
  {
    id: 'about',
    label: 'system.settings.about',
    intro: AboutIntro,
    value: value(({ state, s }) =>
      state.update?.ready
        ? s('rows.readyShort', { version: state.update.ready.version })
        : deviceVersionLabel(state),
    ),
    component: About,
  },
];
