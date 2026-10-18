# Custom endpoints

Hand-written Django views. Error formats vary per family — each entry states its
own. Unless noted, state-changing endpoints are `csrf_exempt`, so plain `POST`
from a script works.

Legend for auth: **[token]** = `X-Api-Key` app token · **[apikey]** = `apikey`
personal key parameter · **[session]** = logged-in browser · **[none]** = public.

---

## 1. Index & meta

### `GET /api/` **[none]**

HTML help page. Not machine-readable.

### `GET /api/v1/` **[none]**

Tastypie resource index:

```json
{
  "doc": { "list_endpoint": "/api/v1/doc/" },
  "person": { "list_endpoint": "/api/v1/person/" }
}
```

Format via `?format=` or `Accept`; JSONP via `?callback=` (validated).
`400 Invalid Accept header` on a malformed `Accept` — deliberately does not
reflect the header back (XSS guard).

### `GET /api/version/` **[none]**

```jsonc
{
  "version": "11.0.0",
  "other": { "markdown": "…", "pyang": "…", "rfc2html": "…", "xml2rfc": "…" },
  "dumptime": "2024-01-01 00:00:00 +0000" // or null
}
```

`other` keys come from `ADVERTISE_VERSIONS` via package metadata.

---

## 2. Documents & aliases

### `GET /api/doc/draft-aliases/` **[token]** `ietf.api.views.draft_aliases`

```json
{
  "aliases": [
    {
      "alias": "draft-ietf-quic-transport",
      "domains": ["ietf"],
      "addresses": ["quic-chairs@ietf.org"]
    }
  ]
}
```

GET only; other methods → `405` (empty body).

### `GET /api/doc/rfc-author-survey-recipients/` **[token]** `…rfc_author_survey_recipients`

| Query param                                         | Meaning                                                                             |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `to`, `from`                                        | ISO-8601 datetimes; naive treated as UTC. Default: `to`=now, `from`=14 days earlier |
| `testing`                                           | flag (presence-only) — rewrite email domains to `fake.example.com`                  |
| `testaddr=ADDR[;author\|shepherd\|author,shepherd]` | repeatable; **requires** `testing`                                                  |

Response is a **bare JSON array** (not an object):

```jsonc
[
  {
    "name": "…",
    "email": "…",
    "type": "author", // "author" | "shepherd" | "author/shepherd"
    "rfc_number": "9000, 9001",
    "rfc_name": "…",
    "rfc_title": "…",
    "rfc_number_and_title": "RFC 9000: …, RFC 9001: …",
    "published_date": "…"
  }
]
```

List fields are pre-joined with `", "`. Errors: `400 Invalid to parameter`,
`400 Invalid from parameter`, `400 Invalid time range, from is later than to`,
`400 Must include the testing parameter when using testaddr`.

### `GET /api/rfcdiff-latest-json/<name>[-<rev>][.txt|.html]` **[none]**

Resolves "what's the latest version of this draft/RFC and what did it supersede".
Accepts both draft names (`draft-foo-bar`) and RFC names (`rfc2460`, `RFC 2460`).

Response keys vary by lookup case:

```jsonc
// RFC that came from a known draft, or draft that became an RFC
{ "content_url": "…", "name": "rfc2460", "previous": "draft-foo-03", "previous_url": "…" }
// generic draft
{ "content_url": "…", "rev": "04", "name": "draft-foo-bar", "previous": "draft-foo-bar-03", "previous_url": "…" }
// history not found -> speculative result
{ "warning": "History for this version not found - these results are speculation", … }
```

`404` when the document cannot be found.

---

## 3. Groups & people

### `GET /api/group/group-aliases/` **[token]** `ietf.api.views.group_aliases`

```json
{
  "aliases": [
    { "alias": "quic-chairs", "domains": ["ietf", "iab"], "addresses": ["…"] }
  ]
}
```

Note `domains` varies (unlike `draft-aliases`, which is always `["ietf"]`).

### `GET /api/group/role-holder-addresses/` **[token]** `…role_holder_addresses`

```json
{ "addresses": ["ad@example.com", "chair@example.com"] }
```

Active emails of role holders in active groups of type
`ag, area, dir, iab, ietf, irtf, nomcom, rg, team, wg, rag`, sorted.
Excludes `unknown-email-*`.

> The only token endpoint **without** `@csrf_exempt` — a POST will be killed by
> CSRF middleware before the view runs. Use GET.

### `GET /api/person/email/` **[token]** `ietf.api.views.active_email_list`

```json
{ "addresses": ["a@example.com", "b@example.com"] }
```

All active `Email.address` values.

> Also available **without auth** at `GET /api/v1/person/email/?active=true`.

### `GET /api/person/email/<email>/related/` **[token]** `…related_email_list`

```json
{ "addresses": ["a@example.com", "b@example.com"] }
```

All addresses belonging to the same Person as `<email>`. `200 {"addresses": []}`
if the address exists but has no Person. `404` (`text/plain` "Email not found")
if the address is unknown. Non-ASCII addresses work.

### `GET /api/export/personal-information/` **[session]**

GDPR export of the logged-in person. Response is gzipped (`Vary: Accept-Encoding`):

```json
{
  "person.person": {
    "123": {
      /* deeply expanded person: name, ascii, user,
     email_set, apikeys, meetingregistration, documentauthor, … (40+ relations) */
    }
  }
}
```

`404` if the account has no `Person`.

### `POST /api/v2/person/person` **[apikey]** `/api/v2/person/person` + role `Robot`

Bulk person export for the mailarchive.

**Request** (form-encoded): `apikey`, optional `_expand` (comma-separated
relations to inline), optional `_key` (default `pk`), and **any other fields are
treated as Person filters**. GET params are merged as filters too, with `not__x`
for exclusion and `a,b` for lists. At least one filter is required.

**Response:**

```json
{ "person.person": { "123": { "name": "…", "ascii": "…", "user": { … }, … } } }
```

Inner dict is keyed by the `_key` field. Bad filter fields return
`200 {"error": "<FieldError text>"}` — note the **200**.

Errors: `400 No filters provided`, `403 Restricted to role: Robot`, plus the
usual apikey errors.

---

## 4. Email ingestion

### `POST /api/email/` and `POST /api/email/test/`

**[token]** `ietf.api.views.ingest_email` / `ietf.api.views.ingest_email_test`

`test` validates but does not process; it has its own token so it can be rotated
independently.

**Request** — `Content-Type` **must** be `application/json` (else `415`):

```jsonc
{
  "dest": "iana-review", // see below
  "message": "<base64 of a raw RFC822 message>"
}
```

Valid `dest` values:

- `iana-review`
- `ipr-response`
- `nomcom-feedback-<year>` (e.g. `nomcom-feedback-2025`)

`message` must be **strict** base64 (`validate=True`), and the body is validated
against a JSON Schema (Draft 2020-12) requiring both string properties.

**Response** — `200` in all three cases:

```json
{ "result": "ok" } // or "bad_dest" or "bad_msg"
```

Note: `bad_dest` and `bad_msg` still return HTTP 200. Check `result`.

Errors (text/plain): `405 Method not allowed`, `415 Content-Type must be
application/json`, `400 JSON parse error at line L col C: …`,
`400 JSON schema error at $.x: …`, `400 Invalid request format`,
`400 Invalid message: bad base64 encoding`.

Side effects: ingestion writes DB rows and may send mail. If an ingester raises
`EmailIngestionError`, an error report is mailed to `ADMINS` and the call returns
`{"result": "bad_msg"}`.

---

## 5. Meetecho / meeting notifications

All **[apikey]** + role. All respond `200 "Done"` (text/plain) on success and
`400 <message>` (text/plain) on validation failure.

| Path                                       | Key endpoint                          | Role                           | Request (form)                                                    |
| ------------------------------------------ | ------------------------------------- | ------------------------------ | ----------------------------------------------------------------- |
| `POST /api/notify/meeting/bluesheet/`      | `/api/notify/meeting/bluesheet`       | Recording Manager, Secretariat | `session_id`, `bluesheet` = JSON array `[{"name","affiliation"}]` |
| `POST /api/notify/session/attendees/`      | `/api/notify/session/attendees`       | Recording Manager              | `attended` = JSON `{"session_id", "attendees":[…]}`               |
| `POST /api/notify/session/chatlog/`        | `/api/notify/session/chatlog`         | Recording Manager              | `apidata` = JSON `{"session_id", "chatlog":[…]}`                  |
| `POST /api/notify/session/polls/`          | `/api/notify/session/polls`           | Recording Manager              | `apidata` = JSON `{"session_id", "polls":[…]}`                    |
| `POST /api/meeting/session/video/url`      | `/api/meeting/session/video/url`      | Recording Manager              | `session_id`, `url`                                               |
| `POST /api/meeting/session/recording-name` | `/api/meeting/session/recording-name` | Recording Manager              | `session_id`, `name`                                              |

`attendees` accepts either the deprecated form (array of user pks) or the current
form `{"user_id": 1, "join_time": "2024-02-21T18:00:00Z"}` (RFC 3339 with
offset). Repeat pushes keep existing join times. For interim meetings a
bluesheet is regenerated as a side effect.

`video/url` also accepts a **deprecated** parameter set — if `meeting`, `group`
or `item` is present it switches to `meeting=<n>&group=<acronym|plenary>&item=<1-based index>&url=<url>`.

Typical `400` messages: `Missing session_id parameter`, `Missing name parameter`,
`Session not found with session_id '<x>'`, `Invalid json value: '<json>'`,
`Malformed post`, `Invalid session`, `Invalid attendee`,
`URL is the same`.

> Two branches return the literal string `Invalid session_id: {session_id}` —
> a missing `f`-prefix bug in `ietf/meeting/views.py`. Tolerate it.

**These are the legacy twins of `/api/meeting/session/<pk>/*`** (see
[drf.md §4](./drf.md#4-apisession-meetecho-push-endpoints)). Same capabilities;
difference is auth (personal apikey + role vs app token) and who authors the
resulting doc events (the key holder's Person vs `(System)`).

### `POST /api/notify/meeting/registration/v2/` **[token]** `…api_new_meeting_registration_v2`

`Content-Type: application/json` required (415 otherwise).

```jsonc
{
  "objects": {
    "jdoe@example.com": {
      "first_name": "Jane",
      "last_name": "Doe",
      "email": "jdoe@example.com",
      "affiliation": "Example",
      "country_code": "US",
      "meeting": "118",
      "checkedin": true,
      "cancelled": false,
      "is_nomcom_volunteer": false,
      "tickets": [{ "attendance_type": "onsite", "ticket_type": "week_pass" }]
    }
  }
}
```

All listed fields are required per registration; `tickets` is an array of
`{attendance_type, ticket_type}`.

**Only the first registration in `objects` is processed** (one per call). The
`meeting` must already exist and the email key must be a known `Email`.

Response: **`202` text/plain `"Success"`**.

Errors: `405`, `415`, `400` (`JSON parse error…`, `JSON schema error $.x…`,
`Invalid request format`, `Invalid meeting value: <n>`, `Unknown email: <addr>`).

Side effects: upserts `Registration`, reconciles `RegistrationTicket` rows,
deletes the registration when `cancelled` and no tickets remain, and creates a
`nomcom.Volunteer` when `is_nomcom_volunteer` is true and exactly one NomCom is
accepting volunteers.

---

## 6. Materials & blobs

### `GET /api/meeting/<num>/materials/<document>[.ext]/resolve-cached/`

**[token]** `ietf.meeting.views.api_resolve_materials_name` (note: _without_ `_cached`)

`num` is a meeting number (`119`) or interim id (`interim-…`); `document` is the
materials document name; `ext` is accepted but ignored.

```json
{ "bucket": "slides", "name": "slides-119-quic-00.pdf" }
```

`404` with `{ "status": 404, "title": "Error", "detail": "No suitable file for <doc> for meeting <num>" }`.
Also 404 if `num` is omitted.

### `GET /api/meeting/blob/<bucket>/<name>` **[token]** `…api_retrieve_materials_blob`

Streams a blob. Allowed buckets:
`agenda, bluesheets, chatlog, minutes, narrativeminutes, polls, procmaterials, slides`.

Returns a `FileResponse` with `Content-Disposition: inline; attachment; filename=<name>`
and a content type derived from the blob (`.html`→`text/html`, `.md`→`text/markdown`,
`.pdf`→`application/pdf`, `.txt`→`text/plain`, else `application/octet-stream`).

`<name>` must start with a lowercase letter (`[a-z][a-z0-9.-]+`).

> Side effect: if the blob is missing it is materialized from the filesystem and
> written into the blob store, so the first call may be slow.
> 404 variants: `Bucket <b> not found.`, `Document corresponding to <b>:<n> not found.`,
> `Object <b>:<n> not found.`

### `GET /api/meeting/<num>/agenda-data` **[none]**

Full meeting agenda + floorplans. Only **full IETF** meetings, numbered > 64.

```jsonc
{
  "meeting": { "number": "118", "city": "…", "startDate": "…", "endDate": "…",
               "updated": "…", "timezone": "…", "infoNote": "…",
               "warningNote": "…", "prelimAgendaDate": "…" },
  "categories": [ … ],
  "isCurrentMeeting": true, "usesNotes": true,
  "schedule": [{ "id", "slug", "sessionId", "room", "location": {"short","name"},
                 "acronym", "duration", "name", "slotId", "slotName", "slotModified",
                 "startDateTime", "status", "rescheduledTo": {"startDateTime","duration"},
                 "type", "purpose", "isBoF", "isProposed", "filterKeywords",
                 "groupAcronym", "groupName", "groupParent": {"acronym"}, "note",
                 "remoteInstructions", "flags": {"agenda","showAgenda"},
                 "agenda": {"url"}, "orderInMeeting", "short", "sessionToken",
                 "links": {"chat","chatArchive","recordings":[…],"videoStream",
                           "audioStream","webex","onsiteTool","calendar"} }],
  "floors": [{ "id", "image", "name", "short", "width", "height",
               "rooms": [{ "id","name","functionalName","slug","left","right","top","bottom" }] }]
}
```

Cached 6 minutes for the current meeting, 8 days otherwise. Unknown meeting or
number ≤ 64 → HTML `404`.

### `GET /api/meeting/session/<session_id>/materials` **[none]**

```jsonc
{
  "url": "…",                                   // session agenda doc, or null
  "slides": {
    "decks": [{ "id", "title", "rev", "url", "ext", "order" }],
    "actions": [{ "label": "Upload slides", "url": "/meeting/…" }]   // [] when not permitted
  },
  "minutes": { "id", "title", "url", "ext" }    // or null
}
```

`slides.actions` is non-empty only for Secretariat, or when the submission
cutoff has not passed and the caller may manage materials. Unknown pk → HTML `404`.

---

## 7. IESG

### `POST /api/iesg/position` **[apikey]** `/api/iesg/position` + role `Area Director`

Sets a ballot position programmatically.

**Request** (form): `apikey`, `doc` (document name), `position` (slug of a
`BallotPositionName`, e.g. `discuss`, `noobj`, `norecord`), optional `discuss`,
optional `comment`.

**Response:** `200 "Done"` (text/plain).

**Errors** (text/plain 400): `Missing document name`, `Document not found`,
`Missing parameter: position, one of: <slugs>`, `Bad position name, must be one of: <slugs>`,
`No open ballot found`, `Form not valid: <field: errors>`.
A blocking position requires a non-empty `discuss`.

Side effects: creates `BallotPositionDocEvent` (+ `added_comment` events for
changed text) and **sends the position announcement email** — exactly one per
call, including recast/clear. Recipients come from the mailtrigger
(`iesg_ballot_saved` / `irsg_ballot_saved` / `rsab_ballot_saved`) by stream.

---

## 8. Submissions

### `ANY /api/submit/` **[none]**

Always `410 Gone` with an HTML notice pointing at `/api/submission`. Tombstone.

### `GET /api/submission/` **[none]** → HTML documentation page.

### `POST /api/submission/` **[none] — no authentication**

Uploads an Internet-Draft. `multipart/form-data` required.

| Field      | Required | Meaning                                                                     |
| ---------- | -------- | --------------------------------------------------------------------------- |
| `user`     | yes      | submitter login/username (an email address). Free text — names the account. |
| `xml`      | yes      | the Internet-Draft XML file (XML only)                                      |
| `replaces` | no       | comma-separated draft names this replaces                                   |

**Success** — `200 application/json`:

```jsonc
{
  "id": "126375",
  "name": "draft-user-example",
  "rev": "00",
  "status_url": "https://datatracker.ietf.org/api/submission/126375/status/",
  "submission_url": "https://datatracker.ietf.org/submission/status/126375/…"
}
```

(`id` is a **string**.)

**Errors** — `{"error": "…", "messages": ["…"]}`:

- `400 {"error": "Validation Error", "messages": [...]}` — form/XML validation,
  unknown user (`No such user: <x>`, `No person matches <x>`,
  `No user matches: <x>`, `No person with username <x>`), rate limits,
  submission blackout period, duplicate in-flight submission.
- `500 {"error": "Multiple matching accounts for <x>"}` or `{"error": "IO Error", …}`
- `405 {"error": "Method not allowed"}` for other verbs.

Side effects: creates a `Submission` in `validating` state and queues a Celery
task that validates the draft, checks every author has an email and that the
submitter is an author, then runs the normal email-confirmation flow ending in
`posted` or `cancel`. If an exception occurs after the row is created, the files
and row are cleaned up.

> **Rate limits** (daily, count + MB): same submitter 50 (5000 in the k8s config),
> same draft name 20, same group 150, global 1000 (2000 MB). "Same submitter" is
> keyed on `remote_ip`, which is read from `CF-Connecting-IP` / `X-Forwarded-For`
> (first hop) — spoofable.

### `GET /api/submission/<submission_id>/status/` **[none]**

```json
{ "id": "123", "state": "validating", "state_desc": "Validating" }
```

`state` is a `DraftSubmissionStateName` slug (`validating`, `uploaded`, `auth`,
`cancel`, `posted`, `manual`, …); `state_desc` is its display name. `id` is a
string. Unknown id → HTML `404`.

---

## 9. Misc

### `GET|POST /api/appauth/authortools` · `/api/appauth/bibxml`

**[apikey]** — the key endpoint must equal the request path exactly.

```json
{ "success": true }
```

`405 Method not allowed` for other verbs. Note this **logs the caller in** and
bumps key usage counters — it is an existence check for "does this person hold a
valid key for this app", not a pure validation.

### `POST /api/directauth/` **[token-in-body]** `ietf.api.views.directauth`

Validates a username/password pair on behalf of a third party.

**Request** (form-encoded): a single field `data` whose value is a **JSON string**:

```json
{ "authtoken": "…", "username": "jdoe", "password": "…" }
```

The form must contain _only_ `data`.

**Response — always HTTP 200:**

```jsonc
{ "result": "success" }
{ "result": "failure", "reason": "invalid post" }            // bad/missing data, or extra fields
{ "result": "failure", "reason": "invalid authtoken" }
{ "result": "failure", "reason": "authentication failed" }   // unknown user, ambiguous case-match, bad password
```

Non-POST → `405` (empty). Username matching is case-insensitive and must resolve
to exactly one user; the password is checked against the canonical stored
username. No session is created. Only logging side effects.

### `ANY /api/metrics/nfs/` **[token]** `ietf.api.views.nfs_metrics`

Prometheus text:

```
nfs_latency_seconds{operation="write"} 0.012
nfs_latency_seconds{operation="read"} 0.009
```

No method check — any verb runs. Side effect: writes and reads a 10 KB temp file
in `NFS_METRICS_TMP_DIR` to measure NFS latency.

### `GET /api/openid/**` **[none]**

Standard OIDC provider (`oidc_provider`). Issuer document at `/api/openid/`.
