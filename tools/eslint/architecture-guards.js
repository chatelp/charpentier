// @ts-check
/**
 * Local ESLint rules behind the architecture guardrails (CLAUDE.md, docs/SPEC.md §21).
 *
 * The core rules `no-restricted-imports` and `no-restricted-globals` only see
 * static imports and bare global names. These rules close the ways around them:
 *
 * - `module-boundaries`: every way of naming a module (static import, re-export,
 *   `import()`, `require()`, `import x = require()`, `import('x')` types), a
 *   module path computed at run time, and relative paths that leave the package
 *   or enter a forbidden folder.
 * - `no-host-global-access`: host globals reached through the global object
 *   (`globalThis.process`, `(window as X).require`), and the global object
 *   handed around as a value (which hides the property access from any linter).
 * - `transact-origin`: every Yjs transaction names its origin.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

/** Removes the wrappers TypeScript puts around an expression (`x as T`, `x!`, `<T>x`, `x satisfies T`). */
const TS_WRAPPERS = new Set([
  'TSAsExpression',
  'TSTypeAssertion',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'ChainExpression',
]);

const unwrap = (node) => {
  let current = node;
  while (current && TS_WRAPPERS.has(current.type)) current = current.expression;
  return current;
};

/** The node that uses the value of `node`, above its TypeScript wrappers. */
const consumerOf = (node) => {
  let current = node;
  while (current.parent && TS_WRAPPERS.has(current.parent.type)) current = current.parent;
  return { inner: current, parent: current.parent };
};

/** The text of a module specifier when it is known statically, else null. */
const staticString = (node) => {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return null;
};

const packageRoots = new Map();

/** Folder of the nearest package.json above `dir`. */
function packageRootOf(dir) {
  if (packageRoots.has(dir)) return packageRoots.get(dir);
  const parent = path.dirname(dir);
  const root = existsSync(path.join(dir, 'package.json'))
    ? dir
    : parent === dir
      ? null
      : packageRootOf(parent);
  packageRoots.set(dir, root);
  return root;
}

const isInside = (file, folder) => {
  const relative = path.relative(folder, file);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

/**
 * Does `specifier` name `pattern`? A pattern is a module name (which also
 * covers its subpaths: `electron` matches `electron/main`) or a prefix ending
 * with `*` (`node:*`, `@electron/*`).
 */
const matchesModule = (specifier, pattern) =>
  pattern.endsWith('*')
    ? specifier.startsWith(pattern.slice(0, -1))
    : specifier === pattern || specifier.startsWith(`${pattern}/`);

/** `node:fs`, `fs/promises`, `@scope/name`, `electron`: not a plain word like `path` or `url`. */
const UNAMBIGUOUS_MODULE = /^(electron$|@|[\w-]+[:/])/;

/** @type {import('eslint').Rule.RuleModule} */
const moduleBoundaries = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid modules of another host or layer, however they are named, and paths leaving the package',
    },
    messages: {
      forbidden: "'{{source}}' is forbidden here. {{message}}",
      dynamic:
        'The module of a dynamic import or require must be a string literal: a computed path escapes every import guard.',
      escape:
        "'{{source}}' leaves the package: import another package by its name, so the layering rules see it.",
      zone: "'{{source}}' reaches into {{zone}}, which this code must not import.",
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          /** Forbidden modules, grouped by reason. */
          modules: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['match', 'message'],
              properties: {
                match: { type: 'array', items: { type: 'string' } },
                message: { type: 'string' },
              },
            },
          },
          /** Folders (relative to the repository root) no relative path may enter from outside. */
          zones: { type: 'array', items: { type: 'string' } },
          /** Also report a forbidden module named by any string given to a call (`anyRequire('electron')`). */
          callArguments: { type: 'boolean' },
        },
      },
    ],
  },
  create(context) {
    const { modules = [], zones = [], callArguments = false } = context.options[0] ?? {};
    const filename = context.physicalFilename ?? context.filename;
    const folder = path.dirname(filename);
    const packageRoot = packageRootOf(folder);
    const zoneFolders = zones.map((zone) => ({ zone, folder: path.resolve(context.cwd, zone) }));

    const forbiddenReason = (specifier) =>
      modules.find((group) => group.match.some((pattern) => matchesModule(specifier, pattern)));

    /** @returns {boolean} whether something was reported */
    function check(node, raw) {
      // Vite-style suffixes (`./worker?modulePath`) are not part of the module's name.
      const source = raw.replace(/[?#].*$/, '');
      const isPath = source.startsWith('.') || source.startsWith('/') || /^file:/.test(source);
      if (!isPath) {
        const group = forbiddenReason(source);
        if (group) {
          context.report({
            node,
            messageId: 'forbidden',
            data: { source: raw, message: group.message },
          });
        }
        return Boolean(group);
      }
      const target = /^file:/.test(source)
        ? source.replace(/^file:\/\//, '')
        : path.resolve(folder, source);
      if (packageRoot && !isInside(target, packageRoot)) {
        context.report({ node, messageId: 'escape', data: { source: raw } });
        return true;
      }
      const entered = zoneFolders.find(
        (zone) => isInside(target, zone.folder) && !isInside(filename, zone.folder),
      );
      if (entered) {
        context.report({ node, messageId: 'zone', data: { source: raw, zone: entered.zone } });
      }
      return Boolean(entered);
    }

    function checkDynamic(node, argument) {
      const source = staticString(argument);
      if (source === null) context.report({ node: argument ?? node, messageId: 'dynamic' });
      else check(argument, source);
    }

    const isRequire = (callee) => {
      const target = unwrap(callee);
      if (target.type === 'Identifier') return target.name === 'require';
      // require.resolve('x'), module.require('x'), anything.require('x')
      return (
        target.type === 'MemberExpression' &&
        ((target.object.type === 'Identifier' && target.object.name === 'require') ||
          (!target.computed && target.property.name === 'require') ||
          (target.computed && staticString(target.property) === 'require'))
      );
    };

    return {
      ImportDeclaration: (node) => void check(node.source, node.source.value),
      ExportAllDeclaration: (node) => void check(node.source, node.source.value),
      ExportNamedDeclaration(node) {
        if (node.source) check(node.source, node.source.value);
      },
      ImportExpression: (node) => checkDynamic(node, node.source),
      TSImportEqualsDeclaration(node) {
        const reference = node.moduleReference;
        if (reference.type === 'TSExternalModuleReference') {
          checkDynamic(node, reference.expression);
        }
      },
      TSImportType(node) {
        // typescript-estree 8 names it `argument` (a literal type), later versions `source`.
        const argument = /** @type {any} */ (node).source ?? node.argument?.literal;
        if (staticString(argument) !== null) check(argument, staticString(argument));
      },
      CallExpression(node) {
        if (isRequire(node.callee)) {
          checkDynamic(node, node.arguments[0]);
          return;
        }
        if (!callArguments) return;
        for (const argument of node.arguments) {
          const source = staticString(argument);
          // Only names that can hardly be anything but a module: `get('url')` is not an import.
          if (source !== null && UNAMBIGUOUS_MODULE.test(source) && forbiddenReason(source)) {
            check(argument, source);
          }
        }
      },
    };
  },
};

const GLOBAL_OBJECTS = new Set([
  'globalThis',
  'window',
  'self',
  'global',
  'top',
  'parent',
  'frames',
]);

/** @type {import('eslint').Rule.RuleModule} */
const noHostGlobalAccess = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid reaching restricted globals through the global object, and using the global object as a value',
    },
    messages: {
      member: "'{{object}}.{{name}}' is forbidden here. {{message}}",
      computed:
        "A computed property of '{{object}}' can name any global: use a literal property name.",
      alias:
        "'{{object}}' used as a value hides what is read from it: access its properties directly ({{object}}.name).",
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          globals: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'message'],
              properties: { name: { type: 'string' }, message: { type: 'string' } },
            },
          },
        },
      },
    ],
  },
  create(context) {
    const restricted = new Map(
      (context.options[0]?.globals ?? []).map(({ name, message }) => [name, message]),
    );
    const { sourceCode } = context;

    /** True when `node` names the real global object, not a local variable called `window` or `self`. */
    function isGlobalObject(node) {
      if (node.type !== 'Identifier' || !GLOBAL_OBJECTS.has(node.name)) return false;
      for (let scope = sourceCode.getScope(node); scope; scope = scope.upper) {
        const variable = scope.set.get(node.name);
        if (variable) return variable.defs.length === 0;
      }
      return true;
    }

    /** False where the identifier is only a name: a property key, a type, an import specifier, a label. */
    function isReference(node) {
      const { parent } = node;
      switch (parent.type) {
        case 'MemberExpression':
          return parent.object === node || parent.computed;
        case 'Property':
          return parent.value === node || parent.computed;
        case 'PropertyDefinition':
        case 'MethodDefinition':
        case 'AccessorProperty':
          return parent.key !== node || parent.computed;
        case 'LabeledStatement':
        case 'BreakStatement':
        case 'ContinueStatement':
          return false;
        default:
          if (/^(Import|Export).*Specifier$/.test(parent.type)) return false;
          // Type-level names (globalThis.KeyboardEvent, a `parent:` member of an interface…).
          return !parent.type.startsWith('TS') || TS_WRAPPERS.has(parent.type);
      }
    }

    return {
      Identifier(node) {
        if (!GLOBAL_OBJECTS.has(node.name) || !isReference(node) || !isGlobalObject(node)) return;
        const { inner, parent } = consumerOf(node);

        if (parent.type === 'MemberExpression' && parent.object === inner) {
          const name = parent.computed ? staticString(parent.property) : parent.property.name;
          if (name === null || name === undefined) {
            context.report({ node: parent, messageId: 'computed', data: { object: node.name } });
          } else if (GLOBAL_OBJECTS.has(name)) {
            // window.window, globalThis.self… : judged again one level up, as an alias or a member.
            const outer = consumerOf(parent);
            const chained =
              outer.parent.type === 'MemberExpression' && outer.parent.object === outer.inner;
            if (!chained) {
              context.report({ node: parent, messageId: 'alias', data: { object: node.name } });
            } else {
              const next = outer.parent.computed
                ? staticString(outer.parent.property)
                : outer.parent.property.name;
              if (next === null || next === undefined) {
                context.report({
                  node: outer.parent,
                  messageId: 'computed',
                  data: { object: name },
                });
              } else if (restricted.has(next) || GLOBAL_OBJECTS.has(next)) {
                context.report({
                  node: outer.parent,
                  messageId: 'member',
                  data: {
                    object: name,
                    name: next,
                    message: restricted.get(next) ?? 'Do not chain global objects.',
                  },
                });
              }
            }
          } else if (restricted.has(name)) {
            context.report({
              node: parent,
              messageId: 'member',
              data: { object: node.name, name, message: restricted.get(name) },
            });
          }
          return;
        }
        // Harmless uses of the bare name: existence and identity tests.
        if (parent.type === 'UnaryExpression' && parent.operator === 'typeof') return;
        if (
          parent.type === 'BinaryExpression' &&
          ['===', '!==', '==', '!=', 'instanceof'].includes(parent.operator)
        ) {
          return;
        }
        context.report({ node, messageId: 'alias', data: { object: node.name } });
      },
    };
  },
};

/** @type {import('eslint').Rule.RuleModule} */
const transactOrigin = {
  meta: {
    type: 'problem',
    docs: { description: 'Require an origin on every Yjs transaction' },
    messages: {
      missing:
        'A Yjs transaction must name its origin (author, agent:<name>, mirror, system, migration): pass it as the last argument of transact.',
    },
    schema: [],
  },
  create(context) {
    const isNothing = (node) =>
      !node ||
      (node.type === 'Identifier' && node.name === 'undefined') ||
      (node.type === 'Literal' && node.value === null) ||
      (node.type === 'UnaryExpression' && node.operator === 'void');

    return {
      CallExpression(node) {
        const callee = unwrap(node.callee);
        // doc.transact(fn, origin) or Y.transact(doc, fn, origin) / transact(doc, fn, origin).
        const method =
          callee.type === 'MemberExpression' &&
          (callee.computed
            ? staticString(callee.property) === 'transact'
            : callee.property.name === 'transact');
        const bare = callee.type === 'Identifier' && callee.name === 'transact';
        if (!method && !bare) return;
        if (node.arguments.some((argument) => argument.type === 'SpreadElement')) return;
        const isFunction = (argument) =>
          argument?.type === 'ArrowFunctionExpression' || argument?.type === 'FunctionExpression';
        const [first, second] = node.arguments.map(unwrap);
        const takesDoc =
          bare || isFunction(second) || (!isFunction(first) && node.arguments.length >= 3);
        const origin = node.arguments[takesDoc ? 2 : 1];
        if (isNothing(origin)) context.report({ node, messageId: 'missing' });
      },
    };
  },
};

export default {
  'module-boundaries': moduleBoundaries,
  'no-host-global-access': noHostGlobalAccess,
  'transact-origin': transactOrigin,
};
