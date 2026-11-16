import { listEntities } from '@charpentier/schema';
import { useTranslation } from 'react-i18next';
import type * as Y from 'yjs';
import { useDocSnapshot } from '../hooks/use-doc-snapshot';

/**
 * The style choice a remark relies on (phase 6.4, DESIGN §4.5 1.16): the
 * author's decision, engraved in their hollow and their ink under the
 * Compagnon's words. Only a validated choice, still in the Atelier; a click
 * opens its sheet beside the text.
 */
export function StyleCitation({
  root,
  choiceId,
  onOpen,
}: {
  readonly root: Y.Doc;
  readonly choiceId: string | undefined;
  readonly onOpen: (entityId: string) => void;
}) {
  const { t } = useTranslation();
  const choice = useDocSnapshot(root, (doc) => {
    if (!choiceId) return undefined;
    const entity = listEntities(doc, 'style').find((e) => e.id === choiceId);
    if (entity?.status !== 'validated') return undefined;
    const text = entity.fields['choice']?.value;
    const category = entity.fields['category']?.value;
    return typeof text === 'string'
      ? { text, category: typeof category === 'string' ? category : 'other' }
      : undefined;
  });
  if (!choice || !choiceId) return null;
  const category = t(
    `atelier.options.category.${choice.category}` as 'atelier.options.category.other',
    {
      defaultValue: choice.category,
    },
  );
  return (
    <button
      type="button"
      tabIndex={-1}
      className="ch-style-citation"
      aria-label={t('reference.yourChoiceLabel', { category, choice: choice.text })}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(choiceId);
      }}
    >
      <span className="ch-label">{t('reference.yourChoice', { category })}</span>
      <span className="ch-style-citation-text">{choice.text}</span>
    </button>
  );
}
