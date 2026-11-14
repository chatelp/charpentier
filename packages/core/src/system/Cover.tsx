import type { PhoneSetup, SystemService, WifiNetwork } from '@charpentier/platform';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '../app/platform-context';
import { featureText } from '../features/feature';
import { Signal } from './controls';
import { QrCode, wifiCode } from './QrCode';
import { useSystemState } from './system-store';
import './cover.css';

/** The system's cover (phase 5.6): the lock first, else the first start. */
export function SystemCover() {
  const system = usePlatform().system as SystemService;
  const state = useSystemState(system);
  return state.lock.locked ? <LockScreen system={system} /> : <FirstStart system={system} />;
}

const MIN_DOTS = 6;

/**
 * The lock (docs/DESIGN.md §4.12): full screen on the page, the time, the
 * date in small capitals, an engraved field where each character typed is a
 * vermilion dot. No project title, no text. A wrong code shakes the field
 * once and empties it; after 5, a wait.
 */
function LockScreen({ system }: { readonly system: SystemService }) {
  const { t, i18n } = useTranslation();
  const text = featureText(t);
  const state = useSystemState(system);
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [shake, setShake] = useState(0);
  const [message, setMessage] = useState<'wrong' | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => input.current?.focus(), []);

  const retryAt = state.lock.retryAt ? Date.parse(state.lock.retryAt) : null;
  const waiting = retryAt !== null && retryAt > now.getTime();
  const seconds = waiting ? Math.ceil((retryAt - now.getTime()) / 1000) : 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!code || waiting) return;
    const result = await system.unlock(code);
    if (result === 'ok') return;
    setCode('');
    setShake((n) => n + 1);
    setMessage(result === 'wrong' ? 'wrong' : null);
  };

  const time = new Intl.DateTimeFormat(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: !state.settings.clock24,
    timeZone: state.timeZone,
  }).format(now);
  const date = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: state.timeZone,
  }).format(now);
  const dots = Math.max(MIN_DOTS, code.length + 1);

  return (
    <form
      className="ch-lock"
      aria-label={text('system.lock.label')}
      onSubmit={(e) => void submit(e)}
      onPointerDown={(e) => {
        if (e.target !== input.current) {
          e.preventDefault();
          input.current?.focus();
        }
      }}
    >
      <p className="ch-lock-time">{time}</p>
      <p className="ch-lock-date">{date}</p>
      <label className="ch-lock-field">
        <span
          className="ch-lock-dots"
          aria-hidden="true"
          key={shake}
          data-shake={shake > 0 || undefined}
        >
          {Array.from({ length: Math.min(dots, 8) }, (_, i) => (
            <span key={i} className={i < code.length ? 'is-typed' : undefined} />
          ))}
        </span>
        <input
          ref={input}
          type="password"
          className="ch-lock-input"
          aria-label={text('system.lock.code')}
          autoComplete="off"
          maxLength={8}
          value={code}
          disabled={waiting}
          onChange={(e) => {
            setCode(e.target.value);
            setMessage(null);
          }}
          onBlur={() => requestAnimationFrame(() => input.current?.focus())}
        />
      </label>
      <p className="ch-lock-hint" role="status">
        {waiting
          ? text('system.lock.wait', { seconds })
          : message
            ? text(`system.lock.${message}`)
            : text('system.lock.hint')}
      </p>
    </form>
  );
}

type Step = 'wifi' | 'code' | 'sync' | 'mentor';

/**
 * Where the first start is: the choice, the keyboard's four steps, or the
 * phone's path (docs/DESIGN.md §4.12 « Premier démarrage de l'appareil »):
 * its three steps, the home Wi-Fi typed here when the phone's was refused,
 * the lock's code on this keyboard, the end.
 */
type Mode = 'choice' | 'keyboard' | 'phone' | 'phone-wifi' | 'phone-code' | 'end';

/**
 * The device's first start (§4.12): before the welcome note, a centred page,
 * « Bienvenue », the fleuron, the Compagnon's sentence, then the choice
 * between the phone (phase 5.13) and the keyboard's four steps, each with
 * « Continuer ⏎ » and « Plus tard Échap ». What is put off stays in the
 * system line and the settings.
 */
function FirstStart({ system }: { readonly system: SystemService }) {
  const { t } = useTranslation();
  const text = featureText(t);
  const f = (key: string, options?: Readonly<Record<string, unknown>>) =>
    text(`system.firstStart.${key}`, options);
  const platform = usePlatform();
  const setup = useSystemState(system).phoneSetup;
  const steps: Step[] = [
    'wifi',
    'code',
    ...(platform.sync ? (['sync'] as const) : []),
    ...(platform.agents ? (['mentor'] as const) : []),
  ];
  const [mode, setMode] = useState<Mode>('choice');
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    void system.phoneSetupAvailable().then(setAvailable);
  }, [system]);
  const [step, setStep] = useState<Step>('wifi');
  const next = () => {
    const following = steps[steps.indexOf(step) + 1];
    if (following) setStep(following);
    else void system.finishFirstStart();
  };
  const toKeyboard = () => {
    void system.stopPhoneSetup();
    setMode('keyboard');
  };
  const failed = (['wifi', 'sync', 'mentor'] as const).some(
    (k) => setup?.steps?.[k]?.status === 'failed',
  );
  const sentence =
    mode === 'choice'
      ? f('choice.mentor')
      : mode === 'keyboard'
        ? f('mentor')
        : mode === 'phone-code'
          ? f('phone.codeMentor')
          : mode === 'end'
            ? f(failed ? 'phone.almost' : 'phone.ready')
            : setup?.stage === 'done' && setup.steps?.wifi?.status === 'failed'
              ? f('phone.notPassed')
              : setup?.stage === 'apply' || setup?.stage === 'done'
                ? f('phone.received')
                : f('phone.mentor');
  const phoneStep =
    mode === 'phone-code' ||
    mode === 'phone-wifi' ||
    setup?.stage === 'apply' ||
    setup?.stage === 'done'
      ? 2
      : setup?.stage === 'fill'
        ? 1
        : 0;

  return (
    <div className="ch-first">
      <h1 className="ch-first-title">{f('title')}</h1>
      <div className="ch-first-fleuron" aria-hidden="true">
        ⁂
      </div>
      <p className="ch-first-mentor">{sentence}</p>
      {mode === 'keyboard' && (
        <StepsRow
          label={f('steps')}
          items={steps.map((s) => f(`step.${s}`))}
          on={steps.indexOf(step)}
        />
      )}
      {(mode === 'phone' || mode === 'phone-wifi' || mode === 'phone-code') && (
        <StepsRow
          label={f('phone.steps')}
          items={(['join', 'fill', 'apply'] as const).map((s) => f(`phone.step.${s}`))}
          on={phoneStep}
        />
      )}
      {mode === 'choice' && (
        <Choice
          f={f}
          available={available}
          onPhone={() => setMode('phone')}
          onKeyboard={() => setMode('keyboard')}
        />
      )}
      {mode === 'keyboard' && step === 'wifi' && <WifiStep system={system} f={f} onDone={next} />}
      {mode === 'keyboard' && step === 'code' && <CodeStep system={system} f={f} onDone={next} />}
      {mode === 'keyboard' && step === 'sync' && <SyncStep f={f} onDone={next} />}
      {mode === 'keyboard' && step === 'mentor' && <MentorStep f={f} onDone={next} />}
      {mode === 'phone' && (
        <PhoneFlow
          system={system}
          f={f}
          onKeyboard={toKeyboard}
          onWifiHere={() => setMode('phone-wifi')}
          onApplied={() => setMode('phone-code')}
          onUnavailable={() => {
            setAvailable(false);
            setMode('choice');
          }}
        />
      )}
      {mode === 'phone-wifi' && (
        <WifiStep
          system={system}
          f={f}
          initial={setup?.steps?.wifi?.value}
          onDone={() => setMode('phone')}
        />
      )}
      {mode === 'phone-code' && (
        <CodeStep
          system={system}
          f={f}
          intro={f('phone.codeIntro')}
          onDone={() => setMode('end')}
        />
      )}
      {mode === 'end' && (
        <End
          system={system}
          f={f}
          onWrite={() => {
            void system.stopPhoneSetup();
            void system.finishFirstStart();
          }}
        />
      )}
    </div>
  );
}

function StepsRow({
  label,
  items,
  on,
}: {
  readonly label: string;
  readonly items: readonly string[];
  readonly on: number;
}) {
  return (
    <ol className="ch-seg ch-first-steps" aria-label={label}>
      {items.map((item, i) => (
        <li
          key={item}
          className={i === on ? 'is-on' : undefined}
          aria-current={i === on || undefined}
        >
          {item}
        </li>
      ))}
    </ol>
  );
}

type F = (key: string, options?: Readonly<Record<string, unknown>>) => string;

/** The choice: from the phone (lit, ⏎) or at the keyboard (Échap); ← → go from one to the other. */
function Choice({
  f,
  available,
  onPhone,
  onKeyboard,
}: {
  readonly f: F;
  /** Null while it is being checked. */
  readonly available: boolean | null;
  onPhone(): void;
  onKeyboard(): void;
}) {
  const [lit, setLit] = useState<'phone' | 'keyboard'>('phone');
  const chosen = available === false ? 'keyboard' : lit;
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => root.current?.focus({ preventScroll: true }), []);
  const choose = (which: 'phone' | 'keyboard') => {
    if (which === 'phone' && available) onPhone();
    if (which === 'keyboard') onKeyboard();
  };
  return (
    <div
      ref={root}
      tabIndex={-1}
      className="ch-first-step ph-wide ph-choose"
      onKeyDown={(e) => {
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && available) {
          e.preventDefault();
          setLit((l) => (l === 'phone' ? 'keyboard' : 'phone'));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          choose(chosen);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onKeyboard();
        }
      }}
    >
      <div className="ph-choice" role="group" aria-label={f('choice.label')}>
        <button
          type="button"
          className={`ph-card${available === false ? ' is-off' : chosen === 'phone' ? ' is-lit' : ''}`}
          disabled={available === false}
          aria-pressed={chosen === 'phone'}
          onClick={() => choose('phone')}
          onMouseEnter={() => available && setLit('phone')}
        >
          <span className="ph-card-head">
            {f('choice.phone')}
            <span className="ph-card-tag">
              {f(available === false ? 'choice.unavailable' : 'choice.recommended')}
            </span>
          </span>
          <span className="ph-card-text">
            {f(available === false ? 'choice.phoneOff' : 'choice.phoneText')}
          </span>
          {available !== false && <kbd>{f('enterKey')}</kbd>}
        </button>
        <button
          type="button"
          className={`ph-card${chosen === 'keyboard' ? ' is-lit' : ''}`}
          aria-pressed={chosen === 'keyboard'}
          onClick={() => choose('keyboard')}
          onMouseEnter={() => setLit('keyboard')}
        >
          <span className="ph-card-head">{f('choice.keyboard')}</span>
          <span className="ph-card-text">{f('choice.keyboardText')}</span>
          <kbd>{available === false ? f('enterKey') : f('escapeKey')}</kbd>
        </button>
      </div>
      <p className="ph-hint">{f(available === false ? 'choice.hintOff' : 'choice.hint')}</p>
    </div>
  );
}

/**
 * The phone's path (phase 5.13): `1 rejoindre` (the code of the temporary
 * network), `2 remplir` (the code of the page, its six digits), `3 appliquer`
 * (one line per setting, each in its turn). « Au clavier » (Échap) leaves at
 * any time and closes the network.
 */
function PhoneFlow({
  system,
  f,
  onKeyboard,
  onWifiHere,
  onApplied,
  onUnavailable,
}: {
  readonly system: SystemService;
  readonly f: F;
  onKeyboard(): void;
  onWifiHere(): void;
  onApplied(): void;
  onUnavailable(): void;
}) {
  const setup = useSystemState(system).phoneSetup;
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
    // Back from the Wi-Fi typed here, the path goes on where it was.
    if (system.state().phoneSetup) return;
    void system.startPhoneSetup().then((result) => {
      if (result === 'unavailable') onUnavailable();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, at the start
  }, []);
  const wifiRefused = setup?.stage === 'done' && setup.steps?.wifi?.status === 'failed';
  const applied = setup?.stage === 'done' && !wifiRefused;
  // All applied: a moment to read the list, then the lock's code.
  useEffect(() => {
    if (!applied) return;
    const timer = setTimeout(onApplied, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when it is applied
  }, [applied]);
  const retry = () => void system.startPhoneSetup(true);

  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (wifiRefused) onWifiHere();
      else if (setup?.stage === 'join' || setup?.stage === 'fill' || !setup) onKeyboard();
    } else if (e.key === 'Enter' && wifiRefused) {
      e.preventDefault();
      retry();
    }
  };

  return (
    <div ref={root} tabIndex={-1} className="ch-first-step ph-wide" onKeyDown={keys}>
      {!setup && <p className="ph-wait">{f('busy')}</p>}
      {setup && (setup.stage === 'join' || setup.stage === 'fill') && <Scan setup={setup} f={f} />}
      {setup && (setup.stage === 'apply' || setup.stage === 'done') && (
        <>
          <ApplyList setup={setup} f={f} />
          {!wifiRefused && <p className="ph-wait">{f('phone.nothingToDo')}</p>}
        </>
      )}
      <p className="ph-actions">
        {wifiRefused ? (
          <>
            <button type="button" className="ch-btn is-mentor" onClick={retry}>
              {f('phone.fixFromPhone')} <kbd>{f('enterKey')}</kbd>
            </button>
            <button type="button" className="ch-btn" onClick={onWifiHere}>
              {f('phone.typeHere')} <kbd>{f('escapeKey')}</kbd>
            </button>
          </>
        ) : (
          (!setup || setup.stage === 'join' || setup.stage === 'fill') && (
            <button type="button" className="ch-btn" onClick={onKeyboard}>
              {f('phone.keyboard')} <kbd>{f('escapeKey')}</kbd>
            </button>
          )
        )}
      </p>
    </div>
  );
}

/** The code to scan, and the same in clear for a phone without a camera. */
function Scan({ setup, f }: { readonly setup: PhoneSetup; readonly f: F }) {
  const page = setup.stage === 'fill' ? setup.page : null;
  const code = page?.code ?? '';
  const wait = page
    ? setup.note === 'renewed'
      ? { text: f('phone.renewed'), news: true }
      : { text: f(setup.opened ? 'phone.pageWait' : 'phone.openWait'), news: false }
    : setup.note === 'left'
      ? { text: f('phone.left'), news: true }
      : { text: f('phone.joinWait'), news: false };
  return (
    <div className="ph-scan">
      <div className={`ph-qr${page && setup.opened ? ' is-faded' : ''}`}>
        {page ? (
          <QrCode value={page.url} label={f('phone.pageCode')} />
        ) : (
          <QrCode
            value={wifiCode(setup.network.ssid, setup.network.password)}
            label={f('phone.networkCode')}
          />
        )}
      </div>
      <div>
        <p className="ph-say">
          {f(page ? (setup.opened ? 'phone.opened' : 'phone.open') : 'phone.join')}
        </p>
        <dl className="ph-plain">
          <span className="ph-plain-head">{f('phone.noCamera')}</span>
          {page ? (
            <>
              <dt>{f('phone.address')}</dt>
              <dd>{page.address}</dd>
              <dt>{f('phone.code')}</dt>
              <dd>{`${code.slice(0, 3)} ${code.slice(3)}`}</dd>
            </>
          ) : (
            <>
              <dt>{f('phone.network')}</dt>
              <dd>{setup.network.ssid}</dd>
              <dt>{f('phone.password')}</dt>
              <dd>{setup.network.password}</dd>
            </>
          )}
        </dl>
        {page && !setup.opened && <p className="ph-tip">{f('phone.tip')}</p>}
        <p className={`ph-wait${wait.news ? ' is-news' : ''}`} role="status">
          {wait.text}
        </p>
      </div>
    </div>
  );
}

/** One line per setting received, in a hollow: its name, its value, its state. */
function ApplyList({
  setup,
  f,
  end = false,
  lock,
}: {
  readonly setup: PhoneSetup;
  readonly f: F;
  /** At the end: a failure says it can wait for the settings. */
  readonly end?: boolean;
  /** The lock's line, at the end. */
  readonly lock?: { readonly hasCode: boolean };
}) {
  const row = (key: 'wifi' | 'sync' | 'mentor') => {
    const step = setup.steps?.[key];
    if (!step) return null;
    const cls =
      step.status === 'failed'
        ? 'is-failed'
        : step.status === 'running'
          ? 'is-now'
          : step.status === 'todo' || step.status === 'waiting'
            ? 'is-todo'
            : '';
    const why =
      step.status === 'failed'
        ? `${f(`phone.why.${key}.${step.reason ?? 'failed'}`, {
            value: step.value,
            defaultValue: f(`phone.why.${key}.failed`, { value: step.value }),
          })}${end ? ` ${f('phone.later')}` : ''}`
        : null;
    return (
      <li key={key} className={cls}>
        <span className="what">{f(`phone.line.${key}`)}</span>
        <span className="value">{step.value}</span>
        <span className="state">{f(`phone.state.${key}.${step.status}`)}</span>
        {why && <span className="why">{why}</span>}
      </li>
    );
  };
  return (
    <ul className="ph-apply" aria-label={f('phone.results')}>
      <li>
        <span className="what">{f('phone.line.temporary')}</span>
        <span className="value">{setup.network.ssid}</span>
        <span className="state">{f(setup.open ? 'phone.state.open' : 'phone.state.closed')}</span>
      </li>
      {row('wifi')}
      {row('sync')}
      {row('mentor')}
      {lock && (
        <li>
          <span className="what">{f('phone.line.lock')}</span>
          <span className="value">{f(lock.hasCode ? 'phone.lockCode' : 'phone.lockNone')}</span>
          <span className="state">
            {f(lock.hasCode ? 'phone.state.lockSet' : 'phone.state.lockLater')}
          </span>
        </li>
      )}
    </ul>
  );
}

/** The end: the whole list, then « Écrire ⏎ ». */
function End({
  system,
  f,
  onWrite,
}: {
  readonly system: SystemService;
  readonly f: F;
  onWrite(): void;
}) {
  const state = useSystemState(system);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  return (
    <div className="ch-first-step ph-wide">
      {state.phoneSetup && (
        <ApplyList setup={state.phoneSetup} f={f} end lock={{ hasCode: state.lock.hasCode }} />
      )}
      <p className="ph-actions">
        <button ref={button} type="button" className="ch-btn is-author" onClick={onWrite}>
          {f('phone.write')} <kbd>{f('enterKey')}</kbd>
        </button>
      </p>
    </div>
  );
}

/** A step: its form (⏎ continues), « Plus tard » (Échap). */
function StepForm({
  f,
  onSubmit,
  onLater,
  busy,
  message,
  extra,
  laterLabel,
  hideSubmit = false,
  children,
}: {
  readonly f: F;
  onSubmit(): void;
  onLater(): void;
  readonly busy: boolean;
  readonly message: string | null;
  readonly extra?: ReactNode;
  /** « Plus tard » by default. */
  readonly laterLabel?: string | undefined;
  /** Nothing to continue yet (the phone has the hand). */
  readonly hideSubmit?: boolean;
  readonly children: ReactNode;
}) {
  // The keys reach the step even when it has no field yet (no network in
  // range, a scan still running): the form takes the focus, its fields after.
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const element = form.current;
    if (element && !element.contains(document.activeElement))
      element.focus({ preventScroll: true });
  }, []);
  return (
    <form
      ref={form}
      tabIndex={-1}
      className="ch-first-step"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSubmit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onLater();
        } else if (
          e.key === 'Enter' &&
          !(e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement)
        ) {
          // ⏎ on a network of the list continues too.
          e.preventDefault();
          if (!busy) onSubmit();
        }
      }}
    >
      {children}
      <p className="ch-first-message" role="status">
        {busy ? f('busy') : message}
      </p>
      <p className="ch-first-actions">
        {!hideSubmit && (
          <button type="submit" className="ch-btn is-mentor" disabled={busy}>
            {f('continue')} <kbd>{f('enterKey')}</kbd>
          </button>
        )}
        {extra}
        <button type="button" className="ch-btn" onClick={onLater}>
          {laterLabel ?? f('later')} <kbd>{f('escapeKey')}</kbd>
        </button>
      </p>
    </form>
  );
}

function WifiStep({
  system,
  f,
  initial,
  onDone,
}: {
  readonly system: SystemService;
  readonly f: F;
  /** The network already chosen (the one the phone gave, refused). */
  readonly initial?: string | undefined;
  onDone(): void;
}) {
  const state = useSystemState(system);
  const networks = state.wifi.networks;
  // The network chosen, else the joined one, else the first in range (a scan may come late).
  const [picked, setChosen] = useState<string | null>(() => initial ?? state.wifi.connected);
  const chosen = picked ?? networks[0]?.ssid ?? null;
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const list = useRef<HTMLUListElement>(null);
  // Networks that arrive after the step opened (the first scan): the chosen
  // one takes the focus, unless the author is typing a password.
  const inRange = networks.length > 0;
  useEffect(() => {
    if (!inRange || document.activeElement instanceof HTMLInputElement) return;
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }, [inRange]);
  const network = networks.find((n) => n.ssid === chosen);
  const needsPassword = !!network && network.secure && !network.known;

  const submit = async () => {
    if (!network || state.wifi.connected === network.ssid) return onDone();
    setBusy(true);
    const result = await system.connectWifi(network.ssid, needsPassword ? password : undefined);
    setBusy(false);
    if (result === 'connected') onDone();
    else setMessage(f(result === 'wrong-password' ? 'wrongPassword' : 'failed'));
  };

  const move = (by: number) => {
    const i = networks.findIndex((n) => n.ssid === chosen);
    const target = networks[(i + by + networks.length) % networks.length];
    if (!target) return;
    setChosen(target.ssid);
    setPassword('');
    setMessage(null);
    requestAnimationFrame(() =>
      list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(),
    );
  };

  return (
    <StepForm f={f} onSubmit={() => void submit()} onLater={onDone} busy={busy} message={message}>
      {networks.length === 0 ? (
        <p className="ch-first-intro">{f('noNetwork')}</p>
      ) : (
        <ul className="ch-first-networks" role="listbox" aria-label={f('networks')} ref={list}>
          {networks.map((n: WifiNetwork) => (
            <li
              key={n.ssid}
              role="option"
              tabIndex={n.ssid === chosen ? 0 : -1}
              aria-selected={n.ssid === chosen}
              className={n.ssid === chosen ? 'is-chosen' : undefined}
              onClick={() => {
                setChosen(n.ssid);
                setPassword('');
                setMessage(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  move(e.key === 'ArrowDown' ? 1 : -1);
                }
              }}
            >
              <span className="ch-first-ssid">{n.ssid}</span>
              <span className="ch-first-net">
                <Signal bars={n.signal} />
                {n.secure && <span>{f('protected')}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {needsPassword && (
        <input
          type="password"
          className="ch-first-input"
          aria-label={f('password', { ssid: network.ssid })}
          placeholder={f('password', { ssid: network.ssid })}
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      )}
    </StepForm>
  );
}

function CodeStep({
  system,
  f,
  intro,
  onDone,
}: {
  readonly system: SystemService;
  readonly f: F;
  /** Its sentence, when it comes after the phone. */
  readonly intro?: string;
  onDone(): void;
}) {
  const [code, setCode] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  const submit = async () => {
    if (code !== again) return setMessage(f('codeMismatch'));
    setBusy(true);
    const result = await system.setLockCode(code);
    setBusy(false);
    if (result === 'ok') onDone();
    else setMessage(f('codeInvalid'));
  };
  return (
    <StepForm
      f={f}
      onSubmit={() => void submit()}
      onLater={onDone}
      busy={busy}
      message={message}
      extra={
        <button type="button" className="ch-btn" onClick={onDone}>
          {f('noCode')}
        </button>
      }
    >
      <p className="ch-first-intro">{intro ?? f('codeIntro')}</p>
      <input
        ref={first}
        type="password"
        className="ch-first-input"
        aria-label={f('codeField')}
        placeholder={f('codeField')}
        autoComplete="off"
        maxLength={8}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <input
        type="password"
        className="ch-first-input"
        aria-label={f('codeAgain')}
        placeholder={f('codeAgain')}
        autoComplete="off"
        maxLength={8}
        value={again}
        onChange={(e) => setAgain(e.target.value)}
      />
    </StepForm>
  );
}

function SyncStep({ f, onDone }: { readonly f: F; onDone(): void }) {
  const { t } = useTranslation();
  const sync = usePlatform().sync;
  const [server, setServer] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  const submit = async () => {
    if (!sync || !server.trim() || !email.trim()) return onDone();
    setBusy(true);
    const result = await sync.signIn({ server: server.trim(), email: email.trim(), password });
    setBusy(false);
    if (result === 'ok') onDone();
    else setMessage(t(`sync.signIn.${result}`));
  };
  return (
    <StepForm f={f} onSubmit={() => void submit()} onLater={onDone} busy={busy} message={message}>
      <p className="ch-first-intro">{f('syncIntro')}</p>
      <input
        ref={first}
        type="url"
        className="ch-first-input"
        aria-label={f('server')}
        placeholder={f('server')}
        value={server}
        onChange={(e) => setServer(e.target.value)}
      />
      <input
        type="email"
        className="ch-first-input"
        aria-label={f('email')}
        placeholder={f('email')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        className="ch-first-input"
        aria-label={f('syncPassword')}
        placeholder={f('syncPassword')}
        autoComplete="off"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
    </StepForm>
  );
}

function MentorStep({ f, onDone }: { readonly f: F; onDone(): void }) {
  const { t } = useTranslation();
  const agents = usePlatform().agents;
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus(), []);
  const submit = async () => {
    if (!agents || !key.trim()) return onDone();
    setBusy(true);
    const result = await agents.setApiKey(key.trim());
    setBusy(false);
    if (result === 'saved') onDone();
    else setMessage(t(`mentor.apiKey.${result}`));
  };
  return (
    <StepForm f={f} onSubmit={() => void submit()} onLater={onDone} busy={busy} message={message}>
      <p className="ch-first-intro">{f('mentorIntro')}</p>
      <input
        ref={field}
        type="password"
        className="ch-first-input"
        aria-label={f('apiKey')}
        placeholder={f('apiKey')}
        autoComplete="off"
        value={key}
        onChange={(e) => setKey(e.target.value)}
      />
    </StepForm>
  );
}
