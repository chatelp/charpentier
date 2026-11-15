/**
 * A small YAML writer for the module files of the mirror (write-only in v1,
 * docs/SPEC.md §17). Strings are double-quoted (or block literals when they
 * span lines), so any text round-trips through a YAML reader.
 */
export function toYaml(value: unknown, indent = 0): string {
  return `${emit(value, indent)}\n`;
}

const pad = (n: number) => ' '.repeat(n);

function scalar(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return '[]';
  if (typeof value === 'object') return '{}';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(String(value));
}

const isBlock = (v: unknown) =>
  (Array.isArray(v) && v.length > 0) ||
  (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length > 0);

function multiline(value: unknown): value is string {
  return typeof value === 'string' && value.includes('\n');
}

function emit(value: unknown, indent: number): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad(indent)}[]`;
    return value
      .map((item) => {
        if (isBlock(item)) {
          const inner = emit(item, indent + 2).trimStart();
          return `${pad(indent)}- ${inner}`;
        }
        return `${pad(indent)}- ${multiline(item) ? literal(item, indent + 2) : scalar(item)}`;
      })
      .join('\n');
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return `${pad(indent)}{}`;
    return entries
      .map(([key, v]) => {
        const k = /^[A-Za-z_][\w:-]*$/.test(key) ? key : JSON.stringify(key);
        if (isBlock(v)) return `${pad(indent)}${k}:\n${emit(v, indent + 2)}`;
        return `${pad(indent)}${k}: ${multiline(v) ? literal(v, indent + 2) : scalar(v)}`;
      })
      .join('\n');
  }
  return `${pad(indent)}${scalar(value)}`;
}

function literal(text: string, indent: number): string {
  // `|-` keeps the lines and drops the final line break; `|+` when the text ends with one.
  const chomp = text.endsWith('\n') ? '+' : '-';
  const body = (chomp === '+' ? text.slice(0, -1) : text)
    .split('\n')
    .map((line) => (line ? `${pad(indent)}${line}` : ''))
    .join('\n');
  return `|${chomp}\n${body}`;
}
