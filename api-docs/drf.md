# DRF API

Django REST Framework endpoints. All require `X-Api-Key` (see
[README §2C](./README.md#c-drf-token--x-api-key-header-per-view-endpoint)).

**Global behaviour**

- `Content-Type` and `Accept` are `application/json` (415 otherwise).
- Errors: `{"errors": [{"code", "detail", "attr"}]}`.
- Status codes: `200` OK · `202` Accepted (async jobs) · `400` validation ·
  `403` bad/missing token · `404` unknown object · `405` method not allowed ·
  `409` conflict (RFC publish/upload only) · `415` wrong content type.
- No throttling. No default pagination.

```ts
const headers = {
  'X-Api-Key': process.env.DATATRACKER_API_TOKEN!,
  'Content-Type': 'application/json'
};
```

---

## 1. `/api/red/` — RFC metadata (read-only)

Token endpoint: `ietf.api.red_api`. Read-only — no create/update/delete.

### `GET /api/red/doc/`

List RFCs.

| Query param                           | Meaning                                                          |
| ------------------------------------- | ---------------------------------------------------------------- |
| `published_after`, `published_before` | `YYYY-MM-DD` range on publication date                           |
| `stream`                              | repeatable; used `StreamName` slug                               |
| `number`                              | comma-separated RFC numbers, e.g. `number=9000,9001`             |
| `group`, `area`                       | repeatable; group acronym                                        |
| `status`                              | repeatable; `std, ps, ds, bcp, inf, exp, hist, unkn, not-issued` |
| `sort`                                | `number`, `published`, `-number`, `-published`                   |
| `search`                              | full-text over `title` and `abstract` (`^`=prefix, `=`=exact)    |
| `limit`, `offset`                     | default 10, max 500                                              |

Response envelope:

```json
{ "count": 1, "next": null, "previous": null, "results": [/* RfcMetadata */] }
```

### `GET /api/red/doc/<rfc_number>/`

Single RFC. Same as the list item plus `text` (the RFC text, or `null`).

**`RfcMetadata` shape**

```jsonc
{
  "number": 9000,
  "title": "QUIC: A UDP-Based Multiplexed and Secure Transport",
  "published": "2021-05-01",
  "status": { "slug": "ps", "name": "Proposed Standard" },
  "pages": 120,
  "authors": [
    {
      "titlepage_name": "J. Doe",
      "is_editor": false,
      "person": 1234,
      "email": "jdoe@example.com",
      "affiliation": "Example",
      "country": "US",
      "datatracker_person_path": "/person/1234"
    }
  ],
  "group": {
    "acronym": "quic",
    "name": "…",
    "type": "wg",
    "state": "active",
    "list_email": "quic@ietf.org"
  },
  "area": {
    "acronym": "tsv",
    "name": "…",
    "ads": [{ "name": "…", "email": "…" }]
  },
  "stream": { "slug": "IETF", "name": "IETF", "desc": "…" },
  "ad": { "name": null, "email": "…" },
  "group_list_email": "quic@ietf.org",
  "identifiers": [{ "type": "doi", "value": "10.17487/RFC9000" }],
  "obsoletes": [{ "id": 1, "number": 8999, "title": "…" }],
  "obsoleted_by": [],
  "updates": [],
  "updated_by": [],
  "subseries": [{ "name": "bcp91", "type": "bcp" }],
  "draft": {
    "id": 1,
    "name": "draft-ietf-quic-transport",
    "title": "…",
    "shepherd": { "email": "…" },
    "ad": { "name": "…", "email": "…" }
  },
  "abstract": "…",
  "formats": [{ "fmt": "txt", "name": "rfc9000.txt" }],
  "keywords": ["…"],
  "has_errata": false
}
```

> `ad.name` is `null` in practice — the serializer reads a field the view never populates.

### `GET /api/red/subseries/` and `GET /api/red/subseries/<name>/`

BCP / STD / FYI collections. `name` looks like `bcp91`, `std86`, `fyi1`.
No pagination — the response is a bare array.

```jsonc
{ "name": "bcp91", "type": "bcp", "contents": [/* RfcMetadata[] */] }
```

Filter: `type=bcp|std|fyi` (repeatable).

```ts
const rfc = await fetch(`${BASE}/api/red/doc/9000`, { headers }).then((r) =>
  r.json()
);
const list = await fetch(
  `${BASE}/api/red/doc/?stream=IETF&sort=-number&limit=50`,
  { headers }
).then((r) => r.json());
```

---

## 2. `/api/purple/` — RPC integration

Token endpoint: `ietf.api.views_rpc` for every route below.

### Drafts

| Method | Path                                     | Request            | Response                                          |
| ------ | ---------------------------------------- | ------------------ | ------------------------------------------------- |
| GET    | `/api/purple/draft/<doc_id>/`            | —                  | `FullDraft`                                       |
| GET    | `/api/purple/draft/<doc_id>/references/` | —                  | `[{"id","name"}]` (normative I-D references only) |
| GET    | `/api/purple/draft/submitted-to-rpc/`    | —                  | `[SubmittedToQueue]`                              |
| POST   | `/api/purple/draft/bulk-authors/`        | `["draft-foo", …]` | `[DraftWithAuthors]`                              |
| POST   | `/api/purple/doc/drafts_by_names/`       | `["draft-foo", …]` | `[Draft]`                                         |

`doc_id` is the **Document pk**, not the draft name. Use `drafts_by_names` when
you only have names.

**`FullDraft`**

```jsonc
{
  "id": 1,
  "name": "draft-ietf-quic-transport",
  "rev": "34",
  "stream": "IETF",
  "title": "…",
  "group": "quic",
  "area": {/* Area */},
  "abstract": "…",
  "pages": 120,
  "source_format": "xml-v3", // "unknown" | "xml-v2" | "xml-v3" | "txt"
  "authors": [
    { "person": 123, "plain_name": "J. Doe", "affiliation": "Example" }
  ],
  "intended_std_level": "ps",
  "consensus": true,
  "shepherd": 456, // Person pk; omitted when no shepherd
  "ad": 789,
  "wg_chairs": [{ "name": "…", "email": "…" }]
}
```

**`Draft`** (subset): `id, name, rev, stream, title, group, pages, source_format, authors, consensus`.
**`SubmittedToQueue`**: `id, name, stream, submitted` (datetime|null), `consensus`.
**`DraftWithAuthors`**: `{ draft_name, authors: [{ person_pk, name, last_name, initials, email_addresses }] }`.
Missing names are silently omitted from bulk results.

### People

| Method | Path                                        | Request                               | Response             |
| ------ | ------------------------------------------- | ------------------------------------- | -------------------- |
| GET    | `/api/purple/person/<person_id>/`           | —                                     | `Person`             |
| POST   | `/api/purple/person/batch/`                 | `[1,2,3]`                             | `[Person]`           |
| POST   | `/api/purple/person/batch-by-email/`        | `["a@b.c"]`                           | `[EmailPerson]`      |
| GET    | `/api/purple/persons/search/?search=<term>` | `search`                              | paginated `[Person]` |
| GET    | `/api/purple/subject/<subject_id>/person/`  | `subject_id` = OIDC subject (user pk) | `Person`             |

**`Person`**: `{ id, plain_name, email, picture, url }`
**`EmailPerson`**: `{ email, person_pk, name, last_name, initials }`

`persons/search` uses `RpcLimitOffsetPagination` (default 10, max 100), envelope
`{count, next, previous, results}`. The search term is used **verbatim** — no
whitespace/comma splitting (unlike `/api/red/doc/?search=`).

### RFCs

| Method        | Path                                                | Request       | Response                    |
| ------------- | --------------------------------------------------- | ------------- | --------------------------- |
| **PUT/PATCH** | `/api/purple/rfc/<rfc_number>/`                     | `EditableRfc` | `EditableRfc` (read subset) |
| GET           | `/api/purple/rfc/rfc-original-stream/`              | —             | `[{rfc_number, stream}]`    |
| POST          | `/api/purple/rfc/bulk-authors/`                     | `[8765]`      | `[{rfc_number, authors}]`   |
| GET           | `/api/purple/rfc/<rfc_number>/authors/`             | —             | `[RfcAuthor]`               |
| GET           | `/api/purple/rfc/<rfc_number>/authors/<author_id>/` | —             | `RfcAuthor`                 |

> There is **no GET on `/api/purple/rfc/<n>/`** — it is PUT/PATCH only. Use
> `/api/red/doc/<n>/` to read RFC metadata.

**`EditableRfc` write keys:** `published` (ISO-8601 **with UTC offset**),
`title`, `authors` (min 1 — replaces the entire author set), `stream`,
`abstract`, `pages`, `std_level`, `subseries`, `keywords`, `updates`, `obsoletes`.
PUT requires `published`, `title`, `authors`, `subseries`; PATCH accepts any subset.
`updates`/`obsoletes` are arrays of RFC numbers that must already exist.

**Response** is the read subset: `title`, `authors`, `stream`, `abstract`,
`pages`, `std_level`, `keywords`.

**`RfcAuthor`**

```jsonc
{
  "titlepage_name": "J. Doe",
  "is_editor": false,
  "person": 123,
  "email": "jdoe@example.com",
  "affiliation": "Example",
  "country": "US",
  "datatracker_person_path": "/person/123"
}
```

(`email` is read-only on input; `person` is a Person pk; `datatracker_person_path`
is omitted when `person` is null.)

### Publishing (write, fire-and-forget)

| Method | Path                             | Request               | Response                                             |
| ------ | -------------------------------- | --------------------- | ---------------------------------------------------- |
| POST   | `/api/purple/rfc/publish/`       | `RfcPub` (JSON)       | `200 {"message":"ack"}` · `409` if files/blobs exist |
| POST   | `/api/purple/rfc/publish/files/` | `multipart/form-data` | `200 {"message":"ack"}` · `409`                      |
| POST   | `/api/purple/rfc_index/refresh/` | none                  | `202` empty                                          |
| POST   | `/api/purple/queue/process/`     | `{"data": <any>}`     | `202` empty                                          |

**`RfcPub` request body**

```jsonc
{
  "published": "2021-05-01T00:00:00Z", // required, needs UTC offset
  "rfc_number": 9000, // required, >= 1
  "title": "…", // required
  "stream": "IETF", // required (StreamName slug)
  "std_level": "ps", // required (StdLevelName slug)
  "subseries": [], // required (list of "bcp91"-style names)
  "authors": [
    {
      // required, may be []
      "titlepage_name": "J. Doe", // required
      "is_editor": false,
      "person": 123,
      "affiliation": "Example",
      "country": "US"
    }
  ],
  "draft_name": "draft-ietf-quic-transport", // optional, but must pair with draft_rev
  "draft_rev": "34",
  "group": "quic", // optional; empty -> "none" group
  "abstract": "…",
  "pages": 120,
  "ad": 789,
  "obsoletes": [8999],
  "updates": [8998],
  "keywords": ["…"]
}
```

`authors[].email` is **ignored on input** (read-only).

**`rfc/publish/files/` multipart fields**

- `rfc` — RFC number (required)
- `contents` — one or more file parts. The extension selects the type; allowed:
  `.html`, `.json` (ignored), `.notprepped.xml`, `.pdf`, `.txt`, `.xml`.
  Empty files and duplicate extensions are rejected.
- `mtime` — optional ISO datetime with UTC offset (defaults to now)
- `replace` — optional bool (default `false`); `409` when the files already
  exist and this is not set.

```ts
const form = new FormData();
form.append('rfc', '9000');
form.append('contents', new Blob([xml]), 'rfc9000.xml');
form.append('replace', 'true');
await fetch(`${BASE}/api/purple/rfc/publish/files/`, {
  method: 'POST',
  headers: { 'X-Api-Key': token }, // do NOT set Content-Type; boundary required
  body: form
});
```

---

## 3. `/api/person/` — identity / UUID resolution

| Method | Path                             | Token endpoint               | Request                 | Response                            |
| ------ | -------------------------------- | ---------------------------- | ----------------------- | ----------------------------------- |
| GET    | `/api/person/uuid/<uuid>/`       | `ietf.person.api_uuid`       | —                       | `UuidResolution`                    |
| POST   | `/api/person/uuid/lookup/`       | `ietf.person.api_uuid`       | `{"uuids": [...]}`      | `{"results": [...]}`                |
| POST   | `/api/person/uuid/by-person-pk/` | `ietf.person.api_uuid_by_pk` | `{"person_pks": [...]}` | `{"results": [...]}` _(deprecated)_ |

UUIDs are case-insensitive (`anycase_uuid` converter). Any UUID ever issued
resolves, including superseded/merged ones.

**`UuidResolution`**

```json
{ "uuid": "…", "is_primary": true, "primary_uuid": "…", "prior_uuids": ["…"] }
```

Batch limits: max **500** items per request, `allow_empty=false`. Duplicates are
collapsed. Batch responses never fail the whole request — unknown ids come back
with `"status": "unknown"`:

```jsonc
{
  "results": [
    {
      "uuid": "…",
      "status": "resolved",
      "is_primary": true,
      "primary_uuid": "…",
      "prior_uuids": []
    },
    {
      "uuid": "…",
      "status": "unknown",
      "is_primary": null,
      "primary_uuid": null,
      "prior_uuids": []
    }
  ]
}
```

`by-person-pk` results have `person_pk` instead of `uuid` and **no** `is_primary`.
It is a transitional migration helper and is flagged deprecated in the schema.

---

## 4. `/api/meeting/session/<pk>/` — Meetecho push endpoints

Token endpoints are **per action** (`ietf.api.meeting.session.<action>`), so each
capability can be revoked separately. All are `POST`, JSON, and all return:

```json
{ "session_id": 12345 }
```

| Path              | Token endpoint            | Request body                                                                 |
| ----------------- | ------------------------- | ---------------------------------------------------------------------------- |
| `video-url/`      | `…session.video_url`      | `{"url": "https://…"}` (URL, max 200)                                        |
| `recording-name/` | `…session.recording_name` | `{"name": "…"} (max 64)`                                                     |
| `bluesheet/`      | `…session.bluesheet`      | `{"bluesheet": [{"name": "…", "affiliation": "…"}]}`                         |
| `attendees/`      | `…session.attendees`      | `{"attendees": [{"person_uuid": "…", "join_time": "2024-02-21T18:00:00Z"}]}` |
| `chatlog/`        | `…session.chatlog`        | `{"chatlog": [ <any object>, … ]}`                                           |
| `polls/`          | `…session.polls`          | `{"polls": [ <any object>, … ]}`                                             |

Details that matter:

- `attendees[].join_time` **must carry an explicit UTC offset** (`Z` is fine).
  Naive timestamps are rejected with `400 Datetime must include a UTC offset.`
- `attendees[].person_uuid` must be a UUID the datatracker has issued. The whole
  batch is all-or-nothing: one bad UUID → `400` and nothing is recorded.
  Re-pushing keeps the _first_ `join_time` (`ignore_conflicts`).
- `bluesheet[]` entries are free text; they are **not** resolved to Persons.
  `affiliation` may be blank.
- `chatlog` / `polls` entries are stored verbatim as JSON — no schema.
- A session with no official timeslot fails with `400` (`SaveMaterialsError`
  message). Other validation failures also come back as `400`.
- Unknown session pk → `404`. Bad token → `403`.
- Events are authored by the `(System)` Person, since there is no requesting user.

```ts
await fetch(`${BASE}/api/meeting/session/${sessionId}/attendees/`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    attendees: [{ person_uuid: '…', join_time: new Date().toISOString() }]
  })
});
```

### Meeting registration lookups

| Method | Path                                                 | Token endpoint                                   |
| ------ | ---------------------------------------------------- | ------------------------------------------------ |
| GET    | `/api/meeting/registration/attended/<email>/`        | `ietf.api.meeting.registration.attended`         |
| GET    | `/api/meeting/registration/attended/by-uuid/<uuid>/` | `ietf.api.meeting.registration.attended_by_uuid` |

```jsonc
{
  "first_name": "Jane",
  "last_name": "Doe",
  "email": "jdoe@example.com",
  "attended": [
    {
      "meeting": "118",
      "attendance_type": "onsite",
      "ticket_type": "week_pass"
    }
  ]
}
```

`email` in the response is always the person's **primary** address (not the one
you looked up), or `""` if they have none. `attended` covers IETF meetings ≥ 110
that have attendance evidence (checked-in or an `Attended` row). Unknown
uuid/email → `404`.

---

## 5. `/api/reef/` — RFC popularity

| Method | Path                                | Token endpoint      | Request | Response    |
| ------ | ----------------------------------- | ------------------- | ------- | ----------- |
| POST   | `/api/reef/rfc/popularity_updated/` | `ietf.api.reef_api` | none    | `202` empty |

Fire-and-forget: queues `update_rfc_searchindex_popularities_task`. Any request
body is ignored.

---

## 6. `/api/accounts/migration/` — account migration

Token endpoints differ per view (`ietf.ietfauth.api_migration.verify` /
`.claim_email`). Both are `POST` + JSON.

### `POST /api/accounts/migration/verify/`

```jsonc
{
  "username_or_email": "jdoe",
  "encrypted_password": "<base64 RSA-OAEP ciphertext>"
}
```

The password must be encrypted with **RSA-OAEP (SHA-256 digest, MGF1-SHA-256,
no label)** using `ACCOUNT_MIGRATION_PUBLIC_KEY`, then base64-encoded. There is
no plaintext alternative.

```jsonc
{
  "person_uuid": "…", // or null
  "name": { "full": "…", "plain": "…", "first": "…", "last": "…" },
  "emails": [{ "address": "…", "primary": true, "active": true }],
  "pronouns": null,
  "github_username": null,
  "portrait_url": "https://…/photo.jpg",
  "legacy_sub": "12345",
  "last_login": "2024-01-01T00:00:00Z",
  "already_linked": false // hard-coded false until a link endpoint exists
}
```

**Every credential failure returns the same `400` `verification_failed`** —
unknown user, wrong password, inactive account, ambiguous identifier and
missing-Person are deliberately indistinguishable (anti-enumeration). Do not try
to branch on the reason. A separate `400 undecryptable_password` means the RSA
envelope itself was bad. There is **no lockout**.

### `POST /api/accounts/migration/claim-email/`

```jsonc
{ "person_uuid": "…", "address": "jdoe@example.com" }
```

```json
{ "address": "jdoe@example.com", "primary": false, "active": true }
```

Idempotent — repeat calls succeed and change nothing. Creates the `Email` if
absent (origin `"account migration"`), reactivates an inactive one, and never
changes `primary`. Error codes: `unknown_person_uuid`, `address_has_no_owner`,
`address_belongs_to_another_person`.
