import type { AgentsService, CompagnonUnlockResult, LlmStatus } from '@charpentier/platform';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

/** The Compagnon's status, followed as it changes. */
export function useCompagnonStatus(agents: AgentsService): LlmStatus {
  const [status, setStatus] = useState(() => agents.status());
  useEffect(() => agents.onStatusChange(setStatus), [agents]);
  return status;
}

/** The states in which the Compagnon cannot answer, and the panel says so (DESIGN 1.32). */
export type BlockedStatus = 'unconfigured' | 'locked' | 'offline';

export const blockedStatus = (status: LlmStatus): BlockedStatus | null =>
  status === 'unconfigured' || status === 'locked' || status === 'offline' ? status : null;

/**
 * What the field of the conversation or the interview says when it is inert:
 * the gesture to make first.
 */
export const blockedPlaceholderKey = (status: BlockedStatus) =>
  `mentor.blocked.${status}.placeholder` as const;

/**
 * « Quand le Compagnon ne peut pas répondre » (docs/DESIGN.md §4.5, 1.32): a
 * flat block at the head of the panel and of the interview, a sentence, a
 * second one, and the gesture to make when there is one. It goes without a
 * word once the state lifts.
 */
export function CompagnonBlocked({
  agents,
  onEnterKey,
  enterKeyShortcut,
}: {
  readonly agents: AgentsService;
  /** Réglages › Compagnon, where the key is set. */
  readonly onEnterKey: () => void;
  readonly enterKeyShortcut?: string | undefined;
}) {
  const { t } = useTranslation();
  const status = blockedStatus(useCompagnonStatus(agents));
  if (!status) return null;
  return (
    <div className="ch-compagnon-blocked" role="status">
      <p className="ch-compagnon-blocked-lead">{t(`mentor.blocked.${status}.lead`)}</p>
      <p className="ch-compagnon-blocked-help">
        {status === 'unconfigured' && agents.keyOnServer
          ? t('mentor.blocked.unconfigured.helpServer')
          : t(`mentor.blocked.${status}.help`)}
      </p>
      {status === 'unconfigured' && (
        <button type="button" className="ch-btn" onClick={onEnterKey}>
          {t('mentor.blocked.unconfigured.action')}
          {enterKeyShortcut && <kbd>{enterKeyShortcut}</kbd>}
        </button>
      )}
      {status === 'locked' && agents.unlock && <Unlock agents={agents} />}
    </div>
  );
}

/** « Déverrouiller… »: the account's password, on the spot. */
function Unlock({ agents }: { readonly agents: AgentsService }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<Exclude<CompagnonUnlockResult, 'unlocked'> | null>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  if (!open)
    return (
      <button type="button" className="ch-btn" onClick={() => setOpen(true)}>
        {t('mentor.blocked.locked.action')}
      </button>
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!password || pending) return;
    setPending(true);
    setProblem(null);
    void agents.unlock?.(password).then((result) => {
      setPending(false);
      if (result === 'unlocked') return;
      setProblem(result);
      setPassword('');
      field.current?.focus();
    });
  };

  return (
    <form className="ch-compagnon-unlock" onSubmit={submit}>
      {problem && (
        <p className="ch-compagnon-unlock-problem" role="alert">
          <i aria-hidden="true">{t('sync.screen.bang')}</i>
          {t(`mentor.blocked.locked.${problem}`)}
        </p>
      )}
      <input
        ref={field}
        className="ch-field"
        type="password"
        autoComplete="current-password"
        aria-label={t('mentor.blocked.locked.password')}
        placeholder={t('mentor.blocked.locked.password')}
        disabled={pending}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          // The panel's own keys (Échap closes it) stay out of the field.
          if (e.key !== 'Escape') e.stopPropagation();
        }}
      />
      <button type="submit" className="ch-btn is-author" disabled={pending}>
        {t('mentor.blocked.locked.submit')} <kbd>{t('library.enterKey')}</kbd>
      </button>
    </form>
  );
}
