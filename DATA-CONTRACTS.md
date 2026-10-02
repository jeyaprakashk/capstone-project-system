# Data contracts

The server returns data only; the client bridge and views consume these shapes.
Spreadsheet columns, `FIELD_DEFINITIONS` and A1 positions never appear in a DTO.

## Envelope

Every migrated endpoint returns `JSON.stringify` of one of:

```json
{ "ok": true,  "data": { }, "generatedAt": "2026-01-02T12:00:00.000Z" }
{ "ok": false, "error": { "code": "UNAUTHORIZED", "message": "You do not have access." } }
```

- `generatedAt` and every date inside `data` are ISO-8601 strings, never `Date` objects.
- `message` is safe to show a user. Internal detail is logged on the server only.
- The bridge treats a response that does not match the envelope as an error.

Error codes: `UNAUTHENTICATED`, `UNAUTHORIZED`, `NOT_FOUND`, `INVALID_INPUT`,
`CONFLICT`, `UNAVAILABLE`, `INTERNAL`.

## Endpoints

One section per migrated endpoint, added with the dashboard that needs it:

| Endpoint | Role | Request | `data` shape | Replaces |
| --- | --- | --- | --- | --- |
| _none yet_ | | | | |

For each endpoint record: required role, request fields and validation, the exact
`data` fields and types, and which server HTML builder it replaces. Each endpoint has
a contract test that checks its output against this shape, and a golden-master
comparison against the output of the function it replaces.

## Rules

- Names are camelCase and describe meaning (`repoStatus`), not columns.
- Unknown or empty values are `null`, not `""` or `0`, when the difference matters
  (for example unavailable commit evidence).
- Keep payloads lean; send only what the view renders.
- Reads are safe to retry. Writes are idempotent where possible and are never retried
  automatically.
