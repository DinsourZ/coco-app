// Ported from CoCo OS platform/web/src/api/exactJson.ts (MIT) and adapted for
// React Native (Hermes) where ReadableStream response.body?.getReader() may not
// be present. Enforces bounded byte size, exact BigInt integer tokens, max
// nesting depth, and rejects duplicate decoded object keys.

export const EXACT_JSON_MAX_BYTES = 16_384;
const MAX_DEPTH = 16;

function utf8ByteLength(input: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(input).byteLength;
  }
  let bytes = 0;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

export function parseExactJson(text: string, maxBytes = EXACT_JSON_MAX_BYTES): unknown {
  const invalid = (): never => {
    throw new Error('Invalid runtime response');
  };
  if (utf8ByteLength(text) > maxBytes) invalid();

  let position = 0;
  const numberToken = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;

  const whitespace = () => {
    while (/[\t\n\r ]/.test(text[position] ?? '')) position += 1;
  };

  const string = (): string => {
    const start = position;
    position += 1;
    while (position < text.length) {
      const character = text[position];
      position += 1;
      if (character === '\\') position += 1;
      else if (character === '"') {
        try {
          return JSON.parse(text.slice(start, position)) as string;
        } catch {
          return invalid();
        }
      }
    }
    return invalid();
  };

  const value = (depth: number): unknown => {
    if (depth > MAX_DEPTH) return invalid();
    whitespace();
    if (text[position] === '"') return string();
    if (text[position] === '{' || text[position] === '[') {
      const isObject = text[position] === '{';
      position += 1;
      const end = isObject ? '}' : ']';
      const entries: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      const items: unknown[] = [];
      whitespace();
      if (text[position] === end) {
        position += 1;
        return isObject ? entries : items;
      }
      while (position < text.length) {
        if (isObject) {
          whitespace();
          if (text[position] !== '"') return invalid();
          const key = string();
          if (Object.prototype.hasOwnProperty.call(entries, key)) return invalid();
          whitespace();
          if (text[position] !== ':') return invalid();
          position += 1;
          entries[key] = value(depth + 1);
        } else {
          items.push(value(depth + 1));
        }
        whitespace();
        if (text[position] === end) {
          position += 1;
          return isObject ? entries : items;
        }
        if (text[position] !== ',') return invalid();
        position += 1;
      }
      return invalid();
    }
    for (const [literal, result] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ] as const) {
      if (text.startsWith(literal, position)) {
        position += literal.length;
        return result;
      }
    }
    numberToken.lastIndex = position;
    const match = numberToken.exec(text);
    if (!match || match[0].length > 32) return invalid();
    position = numberToken.lastIndex;
    if (!/[.eE]/.test(match[0])) return BigInt(match[0]);
    const numeric = Number(match[0]);
    return Number.isFinite(numeric) ? numeric : invalid();
  };

  const result = value(0);
  whitespace();
  if (position !== text.length) return invalid();
  return result;
}

export async function readExactJson(
  response: Response,
  maxBytes = EXACT_JSON_MAX_BYTES,
): Promise<unknown> {
  const reader = response.body?.getReader?.();
  if (reader) {
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new Error('Invalid runtime response');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      return parseExactJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes), maxBytes);
    } catch {
      throw new Error('Invalid runtime response');
    }
  }

  // React Native (Hermes) fetch fallback when ReadableStream is not exposed.
  const text = await response.text();
  if (utf8ByteLength(text) > maxBytes) {
    throw new Error('Invalid runtime response');
  }
  return parseExactJson(text, maxBytes);
}
