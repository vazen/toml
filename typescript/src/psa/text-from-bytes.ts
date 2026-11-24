import {
  Array as A,
  Effect,
  Option,
  pipe,
  Record,
  Result,
  Schema as S,
  SchemaGetter,
  SchemaIssue,
  String as Str,
} from 'effect';

const windows1252 = new TextDecoder('windows-1252');
const utf8 = new TextDecoder('utf-8', { fatal: true });
const utf8Encoder = new TextEncoder();

const BYTE_ORDER_MARK = [0xef, 0xbb, 0xbf];
// Windows-1252's characters for bytes 0x80 to 0x9F, which some Node.js
// releases, 24.0.0 among them, decode as control characters. The five bytes
// Windows-1252 leaves undefined decode as the control character of the same
// number.
const CHARACTERS_FOR_0X80_TO_0X9F =
  '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';
const CONTROL_CHARACTER = /[\u0080-\u009F]/gu;
const decodeWindows1252 = (bytes: Uint8Array): string =>
  windows1252
    .decode(bytes)
    .replaceAll(CONTROL_CHARACTER, (character) =>
      CHARACTERS_FOR_0X80_TO_0X9F.charAt(character.charCodeAt(0) - 0x80),
    );
// Built from the decoder, so writing is exactly the inverse of reading.
const BYTE_BY_CHARACTER = new Map(
  A.makeBy(
    256,
    (byte) => [decodeWindows1252(Uint8Array.of(byte)), byte] as const,
  ),
);
const REPLACEMENT_CHARACTER = '\uFFFD';
// With the `u` flag a surrogate pair is one character, so this matches only
// half of one, which no encoding can write.
const UNPAIRED_SURROGATE = /[\uD800-\uDFFF]/u;
// 65001 is Windows' code page for UTF-8, though many UTF-8 files in Vazen's PSA
// corpus (README.md) declare 1252.
const CODEPAGE_LINE_BY_ENCODING: Record.ReadonlyRecord<PsaEncoding, string> = {
  'utf-8': '; Codepage=65001',
  'windows-1252': '; Codepage=1252',
};
const ENCODING_BY_CODEPAGE_LINE = new Map(
  Record.toEntries(CODEPAGE_LINE_BY_ENCODING).map(
    ([encoding, line]) => [line, encoding] as const,
  ),
);
// A whole line, split at LF as `PsaLinesFromText` splits: the `m` flag would
// also match at U+2028 and U+2029, which a cell may hold. Only a comment line
// starts with `;`, so this matches no row.
const WINDOWS_1252_CODEPAGE_LINE = new RegExp(
  String.raw`(?<=^|\n)${CODEPAGE_LINE_BY_ENCODING['windows-1252']}(?=\r?\n|$)`,
  'u',
);

/** The encoding a PSA file's bytes are read or written in. */
export const PsaEncoding = S.Literals(['utf-8', 'windows-1252']);
export type PsaEncoding = typeof PsaEncoding.Type;

/** The header line declaring that a file is in the given encoding. */
export const codepageLine = (encoding: PsaEncoding): string =>
  CODEPAGE_LINE_BY_ENCODING[encoding];

/** The encoding a header line declares, if it is a Codepage line we write. */
export const encodingOfCodepageLine = (
  line: string,
): Option.Option<PsaEncoding> =>
  Option.fromNullishOr(ENCODING_BY_CODEPAGE_LINE.get(line));

/**
 * A PSA file's text, and the encoding it was read in. A file is read as UTF-8
 * when it starts with a byte-order mark or is valid UTF-8, since many that
 * declare Windows-1252 are UTF-8, and as Windows-1252 otherwise. One with a
 * byte-order mark that is not valid UTF-8 fails, with the reason.
 */
export const psaTextFromBytes = (
  bytes: Uint8Array,
): Result.Result<Readonly<{ encoding: PsaEncoding; text: string }>, string> => {
  const marked = BYTE_ORDER_MARK.every((byte, index) => bytes[index] === byte);
  const body = marked ? bytes.subarray(BYTE_ORDER_MARK.length) : bytes;
  const text = Result.try(() => utf8.decode(body));
  return marked
    ? Result.mapBoth(text, {
        onFailure: () =>
          'the file starts with a UTF-8 byte-order mark but is not valid UTF-8',
        onSuccess: (read) => ({ encoding: 'utf-8', text: read }),
      })
    : Result.succeed(
        Result.match(text, {
          onFailure: () => ({
            encoding: 'windows-1252',
            text: decodeWindows1252(body),
          }),
          onSuccess: (read) => ({ encoding: 'utf-8', text: read }),
        }),
      );
};

/**
 * A PSA file's text, read as `psaTextFromBytes` reads it. Text is written in
 * Windows-1252 when its Codepage line declares 1252 and Windows-1252 holds it,
 * and in UTF-8 otherwise, with that line changed to declare 65001. Text holding
 * an unpaired UTF-16 surrogate is refused, naming its line.
 */
export const TextFromBytes = S.Uint8Array.pipe(
  S.decodeTo(S.String, {
    decode: SchemaGetter.transformEffect((bytes, _) =>
      Effect.fromResult(
        Result.mapBoth(psaTextFromBytes(bytes), {
          onFailure: (message) =>
            new SchemaIssue.InvalidValue({ message }, bytes),
          onSuccess: ({ text }) => text,
        }),
      ),
    ),
    encode: SchemaGetter.transformEffect((text, _) => {
      const written = normalisePsaText(text);
      return Option.match(
        Option.fromNullishOr(UNPAIRED_SURROGATE.exec(written)),
        {
          onNone: () =>
            Effect.succeed(
              pipe(
                WINDOWS_1252_CODEPAGE_LINE.test(written)
                  ? windows1252BytesOf(written)
                  : Option.none(),
                Option.getOrElse(() =>
                  // Copied, since under jsdom `TextEncoder` gives Node's
                  // `Uint8Array`, which `S.Uint8Array` refuses.
                  Uint8Array.from(
                    utf8Encoder.encode(
                      written.replace(WINDOWS_1252_CODEPAGE_LINE, () =>
                        codepageLine('utf-8'),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          onSome: ({ index }) =>
            Effect.fail(
              new SchemaIssue.InvalidValue(
                {
                  message: `line ${Str.split(written.slice(0, index), '\n').length} holds an unpaired UTF-16 surrogate, half of a character, which no encoding can hold`,
                },
                text,
              ),
            ),
        },
      );
    }),
  }),
).annotate({ identifier: 'TextFromBytes' });

/** Composes text for Windows-1252 and replaces U+FFFD with `?`. */
export const normalisePsaText = (text: string): string =>
  text.normalize('NFC').replaceAll(REPLACEMENT_CHARACTER, '?');

// None when Windows-1252 cannot hold a character of the text, or when its
// bytes are also valid UTF-8 and so would read back as other text, as `Ã©`
// would read back as `é`.
const windows1252BytesOf = (text: string): Option.Option<Uint8Array> => {
  // Each character Windows-1252 holds is one UTF-16 code unit and one byte.
  const encoded = new Uint8Array(text.length);
  let index = 0;
  for (const character of text) {
    const byte = Option.fromNullishOr(BYTE_BY_CHARACTER.get(character));
    if (Option.isNone(byte)) {
      return Option.none();
    }
    encoded[index] = byte.value;
    index += 1;
  }
  return Result.match(
    Result.try(() => utf8.decode(encoded)),
    {
      onFailure: () => Option.some(encoded),
      onSuccess: (readBack) =>
        readBack === text ? Option.some(encoded) : Option.none(),
    },
  );
};
