import type { SignInResult, SyncService } from '@charpentier/platform';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import './sign-in.css';

export interface SignInProps {
  readonly sync: SyncService;
  /** Signed in: the account's novels are on their way. */
  readonly onSignedIn: () => void;
}

/**
 * The first screen of the app the server serves (phase 4.7 a, choice of the
 * author on 20 November 2026: sign in first). A real form, so that the
 * browser's password manager fills it; the server is the page's own.
 */
export function SignIn({ sync, onSignedIn }: SignInProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Exclude<SignInResult, 'ok'> | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending || !email.trim() || !password) return;
    setPending(true);
    setError(null);
    sync.signIn({ server: sync.server ?? '', email: email.trim(), password }).then(
      (result) => {
        if (result === 'ok') return onSignedIn();
        setError(result);
        setPending(false);
      },
      () => {
        setError('unreachable');
        setPending(false);
      },
    );
  };

  return (
    <main className="ch-signin">
      <form className="ch-signin-card" onSubmit={submit} aria-labelledby="ch-signin-title">
        <h1 id="ch-signin-title" className="ch-signin-title">
          {t('app.name')}
        </h1>
        <p className="ch-signin-lead">{t('sync.screen.lead')}</p>
        {error && (
          <p className="ch-signin-error" role="alert">
            {error === 'unreachable' ? t('sync.screen.unreachable') : t(`sync.signIn.${error}`)}
          </p>
        )}
        <label className="ch-signin-label">
          {t('sync.screen.email')}
          <input
            className="ch-field"
            type="email"
            name="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="ch-signin-label">
          {t('sync.screen.password')}
          <input
            className="ch-field"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit" className="ch-btn ch-signin-submit" disabled={pending}>
          {pending ? t('sync.screen.signingIn') : t('sync.screen.submit')}
        </button>
      </form>
    </main>
  );
}
