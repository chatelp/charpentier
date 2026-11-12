// @ts-check
/**
 * Local ESLint rule: no user-facing literal text in JSX.
 * All UI strings must come from the i18n catalogue (t('…')), so the interface
 * can be translated and stays consistent.
 *
 * Reports JSX text containing a letter, and string literals given to
 * user-facing attributes (title, alt, placeholder, aria-*…).
 */

const USER_FACING_ATTRIBUTES = new Set([
  'title',
  'alt',
  'placeholder',
  'label',
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
]);

const hasLetter = (text) => /\p{L}/u.test(text);

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow untranslated user-facing text in JSX' },
    messages: {
      literal: 'User-facing text must come from i18n (t(…)), not a literal: "{{text}}".',
    },
    schema: [],
  },
  create(context) {
    const report = (node, text) =>
      context.report({ node, messageId: 'literal', data: { text: text.trim().slice(0, 40) } });

    return {
      JSXText(node) {
        if (hasLetter(node.value)) report(node, node.value);
      },
      // <p>{'Bonjour'}</p>
      'JSXElement > JSXExpressionContainer, JSXFragment > JSXExpressionContainer'(node) {
        const expression = node.expression;
        if (
          expression.type === 'Literal' &&
          typeof expression.value === 'string' &&
          hasLetter(expression.value)
        ) {
          report(node, expression.value);
        }
        if (
          expression.type === 'TemplateLiteral' &&
          expression.quasis.some((q) => hasLetter(q.value.raw))
        ) {
          report(node, expression.quasis.map((q) => q.value.raw).join('…'));
        }
      },
      JSXAttribute(node) {
        const name = typeof node.name.name === 'string' ? node.name.name : node.name.name.name;
        if (!USER_FACING_ATTRIBUTES.has(name) || !node.value) return;
        const value = node.value;
        if (value.type === 'Literal' && typeof value.value === 'string' && hasLetter(value.value)) {
          report(value, value.value);
        }
        if (
          value.type === 'JSXExpressionContainer' &&
          value.expression.type === 'Literal' &&
          typeof value.expression.value === 'string' &&
          hasLetter(value.expression.value)
        ) {
          report(value, value.expression.value);
        }
      },
    };
  },
};

export default {
  meta: { name: 'charpentier' },
  rules: { 'no-ui-literal': rule },
};
