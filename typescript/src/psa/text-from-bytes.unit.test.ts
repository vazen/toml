import { Option, Result, Schema as S } from 'effect';
import { describe, expect, it } from 'vitest';

import { psaTextFromBytes, TextFromBytes } from './text-from-bytes';

const decode = S.decodeUnknownSync(TextFromBytes);
const encode = S.encodeSync(TextFromBytes);

describe('psaTextFromBytes', () => {
  it.each([
    ['ASCII', [0x41], 'utf-8'],
    ['UTF-8', [0x43, 0x61, 0x66, 0xc3, 0xa9], 'utf-8'],
    ['UTF-8 after a byte-order mark', [0xef, 0xbb, 0xbf, 0x41], 'utf-8'],
    // é is 0xE9: it does not start a valid UTF-8 sequence.
    ['other bytes', [0x43, 0x61, 0x66, 0xe9], 'windows-1252'],
  ])('names the encoding of %s', (_, bytes, encoding) => {
    expect(
      Result.map(
        psaTextFromBytes(Uint8Array.from(bytes)),
        (read) => read.encoding,
      ),
    ).toEqual(Result.succeed(encoding));
  });
});

describe('TextFromBytes', () => {
  const windows1252 = 'PROSPACE SCHEMATIC FILE\r\n; Codepage=1252\r\n';
  const utf8 = 'PROSPACE SCHEMATIC FILE\r\n; Codepage=65001\r\n';

  // Text read back unchanged still declares 1252, so it was written as
  // Windows-1252: UTF-8 would have declared 65001.
  it.each([
    ['ASCII', 'Project,Tiny'],
    // é is 0xE9 and € is 0x80: neither starts a valid UTF-8 sequence.
    ['Windows-1252', 'Project,Café €'],
    [
      'a mix whose bytes are not valid UTF-8 as a whole',
      'Project,Ã©\r\nProduct,é',
    ],
  ])(
    'writes %s declaring 1252 as Windows-1252 and reads it back unchanged',
    (_, rows) => {
      const text = `${windows1252}${rows}`;
      expect(decode(encode(text))).toBe(text);
    },
  );

  it('reads UTF-8 bytes declaring 1252, writes Windows-1252, and reads that back unchanged', () => {
    const text = `${windows1252}Project,Café`;
    const read = decode(Uint8Array.from(Buffer.from(text, 'utf8')));
    expect(read).toBe(text);
    expect(encode(read)).toEqual(Uint8Array.from(Buffer.from(text, 'latin1')));
    expect(decode(encode(read))).toBe(text);
  });

  it.each([
    ['characters Windows-1252 cannot hold', 'Product,Łódź Μg 😀'],
    // Ã© in Windows-1252 is 0xC3 0xA9, which is é in UTF-8.
    [
      'text whose Windows-1252 bytes would read back as other text',
      'Product,Ã©',
    ],
  ])('writes %s as UTF-8, declaring 65001', (_, rows) => {
    const written = `${utf8}${rows}`;
    expect(encode(`${windows1252}${rows}`)).toEqual(
      Uint8Array.from(Buffer.from(written, 'utf8')),
    );
    expect(decode(Uint8Array.from(Buffer.from(written, 'utf8')))).toBe(written);
  });

  it.each([
    ['Windows-1252 text', 'Project,Café'],
    // `^` and `$` with the `m` flag match at U+2028, which cells do not escape.
    [
      'a cell holding a 1252 Codepage line',
      'Product,A\u2028; Codepage=1252\u2028B',
    ],
  ])(
    'writes text that does not declare 1252 as UTF-8, unchanged: %s',
    (_, rows) => {
      const text = `${utf8}${rows}`;
      expect(encode(text)).toEqual(Uint8Array.from(Buffer.from(text, 'utf8')));
    },
  );

  it('refuses an unpaired UTF-16 surrogate, naming its line', () => {
    expect(
      Result.getFailure(
        S.encodeResult(TextFromBytes)(`${utf8}Product,Name-\uD800`),
      ).pipe(Option.map(({ message }) => message)),
    ).toEqual(
      Option.some(
        expect.stringContaining('line 3 holds an unpaired UTF-16 surrogate'),
      ),
    );
  });
});
