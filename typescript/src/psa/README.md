# PSA Files

Effect Schemas that read a ProSpace PSA file into `PsaData`, and write `PsaData`
back as a PSA file.

- `PsaDataFromPsaBytes` and `PsaDataFromPsaText` read a file of any version, and
  write the version `declaredVersion` holds, or 2024.4.0 when it holds none or
  one [`PsaVersion`](psa-versions.ts) does not list.
- `decodePsaDataFromPsaFile` reads bytes as `PsaDataFromPsaBytes` does, and
  `encodePsaFileFromPsaData({ data, version })` writes them as the version
  given, else as the data declares when that version's rows hold every value,
  else 2024.4.0. Each throws a `SchemaError` where it fails.

```text
PsaData
├── declaredEncoding        PsaEncoding (optional)
├── declaredVersion         string (optional)
├── messages                PsaMessage (list)
├── project                 PsaProject
├── products                PsaProduct (list)
└── planograms              PsaPlanogramSection (list)
    ├── planogram           PsaPlanogram
    ├── performance         PsaPerformance (list)
    ├── segments            PsaSegment (list)
    └── fixtures            PsaFixtureSection (list)
        ├── fixture         PsaFixture
        └── positions       PsaPosition (list)
```

## Reading

A file is read as UTF-8 if it is valid UTF-8, and as Windows-1252 if not,
whatever its Codepage line declares: many files declaring Windows-1252 are
UTF-8. The declaration is kept as `declaredEncoding`, for writing. Each row is
read by its type's columns, whatever version the file declares. A row of a type
this package does not read is kept in the `unknownRowsAfter` of the record
before it. What reading gives up, such as a cell its column cannot read, is
listed in `messages`, and [`PsaMessage`](psa-messages.ts) says what each kind
means.

Reading refuses a file that is not a PSA file, one that starts with a UTF-8
byte-order mark but is not UTF-8, one whose first row is not its only Project
row, and one with a record other than a product before the first planogram.

## Writing

A file is written in Windows-1252, declaring `; Codepage=1252`, when its data
declares Windows-1252 and Windows-1252 can hold its text, and in UTF-8,
declaring `; Codepage=65001`, otherwise. Windows-1252 cannot hold text whose
bytes are also valid UTF-8, such as `Ã©`, which reading would take as `é`.

Writing refuses anything that would not read back as the same records, such as a
value in a column the version written does not have, or an unpaired UTF-16
surrogate. Two exceptions: text is written in Unicode's composed form, so a
letter and a combining accent become the one character Windows-1252 has for
them, and U+FFFD is written as `?`.

So a file read with no messages and written back holds the same records, but for
those two. Its text may differ in form, such as how numbers are written, the
line endings and the order of rows.

## Provenance

This code was built from PSA files, not from Blue Yonder software. Vazen holds a
private corpus of thousands of PSA files, declaring many ProSpace versions, that
customers have supplied over the years or that were published online. The column
count of every version in [`psa-versions.ts`](psa-versions.ts), the text
encodings, the line endings and the ways cells are written were read off those
files. Column names, the meaning of each coded value and what an empty cell
means follow ProSpace's field definitions. The corpus is never published; the
files in [`.test-data/`](.test-data/README.md) are made up.
