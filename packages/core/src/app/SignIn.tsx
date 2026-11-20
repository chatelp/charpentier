import type { SignInResult, SyncService } from '@charpentier/platform';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import './sign-in.css';

export interface SignInProps {
  readonly sync: SyncService;
  /** The e-mail of the last account signed in here, if any. */
  readonly email?: string;
  /** Signed in: the account's novels are on their way. */
  readonly onSignedIn: (email: string) => void;
}

type Problem = Exclude<SignInResult, 'ok' | 'no-keychain'> | 'offline';

const MESSAGES = {
  invalid: ['sync.screen.invalid', null],
  'too-many-attempts': ['sync.screen.tooMany', 'sync.screen.tooManyHelp'],
  unreachable: ['sync.screen.unreachable', 'sync.screen.unreachableHelp'],
  offline: ['sync.screen.offline', 'sync.screen.offlineHelp'],
} as const;

const isOnline = () => globalThis.navigator?.onLine ?? true;

/**
 * The door of the app the server serves (docs/DESIGN.md §4.9 bis, phase
 * 4.7 a; the author's choice on 20 November 2026: sign in first). A real
 * form, so that the browser's password manager fills it; the server is the
 * page's own.
 */
export function SignIn({ sync, email: knownEmail = '', onSignedIn }: SignInProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState(knownEmail);
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [online, setOnline] = useState(isOnline);
  const emailField = useRef<HTMLInputElement>(null);
  const passwordField = useRef<HTMLInputElement>(null);
  const passwordId = useId();

  useEffect(() => {
    const update = () => setOnline(isOnline());
    globalThis.addEventListener?.('online', update);
    globalThis.addEventListener?.('offline', update);
    return () => {
      globalThis.removeEventListener?.('online', update);
      globalThis.removeEventListener?.('offline', update);
    };
  }, []);

  // On the e-mail, or on the password when the e-mail is known.
  useEffect(() => {
    (knownEmail ? passwordField : emailField).current?.focus();
  }, [knownEmail]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending || !online || !email.trim() || !password) return;
    setPending(true);
    setProblem(null);
    const signedIn = email.trim();
    sync.signIn({ server: sync.server ?? '', email: signedIn, password }).then(
      (result) => {
        setPending(false);
        if (result === 'ok' || result === 'no-keychain') return onSignedIn(signedIn);
        setProblem(result);
        // The e-mail stays; the password is typed again.
        if (result === 'invalid') {
          setPassword('');
          setTimeout(() => passwordField.current?.focus());
        }
      },
      () => {
        setPending(false);
        setProblem('unreachable');
      },
    );
  };

  const shownProblem: Problem | null = online ? problem : 'offline';
  const message = shownProblem && MESSAGES[shownProblem];
  const inert = pending || !online;
  const host = sync.server ? new URL(sync.server).host : '';

  return (
    <main className="ch-signin">
      <div className="ch-signin-icon" aria-hidden="true" />
      <h1 className="ch-signin-title">{t('app.name')}</h1>
      <p className="ch-signin-lead">{t('sync.screen.lead')}</p>
      <form className="ch-signin-card" onSubmit={submit} aria-label={t('app.name')}>
        {message && (
          <p className="ch-signin-message" role="alert">
            <i aria-hidden="true">{t('sync.screen.bang')}</i>
            <span>
              {t(message[0])}
              {message[1] && <small>{t(message[1])}</small>}
            </span>
          </p>
        )}
        <label className="ch-signin-label">
          {t('sync.screen.email')}
          <input
            ref={emailField}
            className="ch-field"
            type="email"
            name="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            disabled={inert}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <div className="ch-signin-label">
          <label htmlFor={passwordId}>{t('sync.screen.password')}</label>
          <span className="ch-signin-password">
            <input
              id={passwordId}
              ref={passwordField}
              className="ch-field"
              type={shown ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              required
              disabled={inert}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="ch-signin-show"
              aria-pressed={shown}
              disabled={inert}
              onClick={() => setShown((s) => !s)}
            >
              {t(shown ? 'sync.screen.hide' : 'sync.screen.show')}
            </button>
          </span>
        </div>
        <button type="submit" className="ch-btn ch-signin-submit" aria-disabled={inert}>
          {pending ? (
            t('sync.screen.signingIn')
          ) : (
            <>
              {t(problem === 'unreachable' ? 'sync.screen.retry' : 'sync.screen.submit')}{' '}
              <kbd>{t('library.enterKey')}</kbd>
            </>
          )}
        </button>
      </form>
      <p className="ch-signin-foot">
        {host && (
          <>
            <Trans i18nKey="sync.screen.account" values={{ host }} components={{ host: <b /> }} />
            <br />
          </>
        )}
        {t('sync.screen.forgotten')}
      </p>
    </main>
  );
}
