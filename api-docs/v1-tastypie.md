# Tastypie v1 API — `/api/v1/`

The oldest and largest layer. **Public and read-only** — no authentication, no
API key, no throttling. Verified: no `authentication`, `authorization`,
`*_allowed_methods` or `prepend_urls` are declared on any resource, so Tastypie
defaults apply (`AnonymousAuthentication` + `ReadOnlyAuthorization`).

Every app is mounted at `/api/v1/<app>/`, and every resource supports four routes:

| Route                                           | Purpose        |
| ----------------------------------------------- | -------------- |
| `GET /api/v1/<app>/<resource>/`                 | list           |
| `GET /api/v1/<app>/<resource>/<pk>/`            | detail         |
| `GET /api/v1/<app>/<resource>/set/<id>;<id>;…/` | multi-get      |
| `GET /api/v1/<app>/<resource>/schema/`          | field metadata |

> Exception: `doc/document` uses **`name` as its detail key**, so its detail route
> is `/api/v1/doc/document/rfc9000/` and multi-get is
> `/api/v1/doc/document/set/rfc9000;draft-foo/`.

---

## 1. Request contract

**Filtering** — `?<field>=<value>` and `?<field>__<lookup>=<value>`.

- `ALL` on a field allows every Django ORM lookup: `exact`, `iexact`,
  `contains`, `startswith`, `endswith`, `in` (comma-separated), `range` (exactly
  two comma-separated values), `gt/gte/lt/lte`, `regex/iregex`, `isnull`, and
  the date lookups.
- `ALL_WITH_RELATIONS` additionally allows traversal:
  `?person__email__address=jdoe@example.com`.
- Unknown fields are silently ignored. Bad filter values raise `400`.

**Paging & ordering** — `?limit=` (default 20), `?offset=`, `?order_by=<field>`
or `?order_by=-<field>`, repeatable. `order_by` fields are restricted to the
resource's `Meta.ordering` whitelist.

**Format** — `?format=json|xml|yaml|jsonp`, or `Accept`. JSONP via `?callback=`
(validated against a safe pattern).

**Relations** — `ToOneField` serializes to a resource URI string (or `null`);
`ToManyField` to a list of URI strings (or `[]`). Only `meeting.registration.tickets`
embeds full objects (`full=True`).

---

## 2. Response contract

**List**

```jsonc
{
  "objects": [/* … */],
  "meta": {
    "limit": 20,
    "offset": 0,
    "total_count": 987,
    "next": "https://…/api/v1/doc/document/?limit=20&offset=20",
    "previous": null
  }
}
```

**Detail** — the object itself.

**Multi-get**

```jsonc
{ "objects": [/* … */], "not_found": ["/api/v1/doc/document/missing/"] }
```

**Object shape** — every model field not in `excludes`, plus declared fields,
plus `"resource_uri"`.

**Example**

```bash
curl 'https://datatracker.ietf.org/api/v1/doc/document/?type__slug=rfc&limit=2&order_by=-id'
```

```jsonc
{
  "objects": [
    {
      "resource_uri": "/api/v1/doc/document/rfc9000/",
      "name": "rfc9000",
      "title": "…",
      "rev": "00",
      "time": "2021-05-01T00:00:00Z",
      "type": "/api/v1/name/doctypename/rfc/",
      "group": "/api/v1/group/group/1486/",
      "states": ["/api/v1/doc/state/1/"],
      "tags": ["/api/v1/doc/doctagname/…/"],
      "abstract": "…",
      "pages": 120
    }
  ],
  "meta": {
    "limit": 2,
    "offset": 0,
    "total_count": 1,
    "next": null,
    "previous": null
  }
}
```

**Schema route** returns field metadata:

```jsonc
{
  "fields": {
    "name": {
      "type": "string",
      "nullable": false,
      "blank": false,
      "readonly": false,
      "default": null,
      "help_text": "…",
      "unique": true,
      "primary_key": false,
      "verbose_name": "name"
    }
  },
  "default_format": "application/json",
  "allowed_list_http_methods": ["get", "post", "put", "delete", "patch"],
  "allowed_detail_http_methods": ["get", "post", "put", "delete", "patch"],
  "default_limit": 20,
  "ordering": ["id"],
  "filtering": { "name": "all" }
}
```

The `allowed_*_http_methods` lists are Tastypie's default and are misleading —
writes are rejected by authorization (see §4).

---

## 3. Resource catalog

Field notation: `→` is a to-one relation (URI string), `⇒` is to-many (URI list).
Fields marked in `Meta.excludes` are never returned. Unless stated, the detail
key is `pk`, the resource is read-only, and `Meta.ordering = ["id"]`.

### 3.1 `doc` — `/api/v1/doc/` (38 resources)

| Resource                    | Endpoint                    | Relations / notes                                                                                                                                                                   | Filterable                                                                                                                                                                                           |
| --------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ballottype`                | `ballottype`                | `doc_type`→, `positions`⇒                                                                                                                                                           | id, slug, name, question, used, order, doc_type, positions                                                                                                                                           |
| `deletedevent`              | `deletedevent`              | `content_type`→, `by`→                                                                                                                                                              | id, json, time, content_type, by                                                                                                                                                                     |
| `statetype`                 | `statetype`                 |                                                                                                                                                                                     | slug, label                                                                                                                                                                                          |
| `state`                     | `state`                     | `type`→, `next_states`⇒(self)                                                                                                                                                       | id, slug, name, used, desc, order, type, next_states                                                                                                                                                 |
| **`document`**              | `document`                  | **detail key = `name`**; `type`→, `stream`→, `group`→, `intended_std_level`→, `std_level`→, `ad`→, `shepherd`→, `states`⇒, `tags`⇒, `rfc` (char, from `rfc_number`), `submissions`⇒ | time, title, abstract, rev, pages, order, expires, notify, external_url, uploaded_filename, note, name, type, stream, group, intended_std_level, std_level, ad, shepherd, states, tags (**no `id`**) |
| `documentauthor`            | `documentauthor`            | `person`→, `email`→, `document`→                                                                                                                                                    | id, affiliation, country, order, person, email, document                                                                                                                                             |
| `docevent`                  | `docevent`                  | `by`→, `doc`→                                                                                                                                                                       | id, time, type, rev, desc, by, doc                                                                                                                                                                   |
| `statedocevent`             | `statedocevent`             | `+ docevent_ptr`→, `state_type`→, `state`→                                                                                                                                          | core + docevent_ptr, state_type, state                                                                                                                                                               |
| `dochistory`                | `dochistory`                | like `document` + `doc`→                                                                                                                                                            | all document fields + doc                                                                                                                                                                            |
| `consensusdocevent`         | `consensusdocevent`         | `docevent_ptr`→                                                                                                                                                                     | core + consensus                                                                                                                                                                                     |
| `telechatdocevent`          | `telechatdocevent`          | `docevent_ptr`→                                                                                                                                                                     | core + telechat_date, returning_item                                                                                                                                                                 |
| `docreminder`               | `docreminder`               | `event`→, `type`→                                                                                                                                                                   | id, due, active, event, type                                                                                                                                                                         |
| `lastcalldocevent`          | `lastcalldocevent`          | `docevent_ptr`→                                                                                                                                                                     | core + expires                                                                                                                                                                                       |
| `newrevisiondocevent`       | `newrevisiondocevent`       | `docevent_ptr`→                                                                                                                                                                     | core                                                                                                                                                                                                 |
| `writeupdocevent`           | `writeupdocevent`           | `docevent_ptr`→                                                                                                                                                                     | core + text                                                                                                                                                                                          |
| `initialreviewdocevent`     | `initialreviewdocevent`     | `docevent_ptr`→                                                                                                                                                                     | core + expires                                                                                                                                                                                       |
| `dochistoryauthor`          | `dochistoryauthor`          | `person`→, `email`→, `document`→                                                                                                                                                    | id, affiliation, country, order, person, email, document                                                                                                                                             |
| `ballotdocevent`            | `ballotdocevent`            | `docevent_ptr`→, `ballot_type`→                                                                                                                                                     | core + ballot_type                                                                                                                                                                                   |
| `relateddocument`           | `relateddocument`           | `source`→, `target`→, `relationship`→                                                                                                                                               | id, source, target, relationship                                                                                                                                                                     |
| `relateddochistory`         | `relateddochistory`         | `source`→, `target`→, `relationship`→                                                                                                                                               | id, source, target, relationship                                                                                                                                                                     |
| `ballotpositiondocevent`    | `ballotpositiondocevent`    | `ballot`→, `balloter`→, `pos`→                                                                                                                                                      | core + discuss, discuss_time, comment, comment_time, ballot, balloter, pos                                                                                                                           |
| `addedmessageevent`         | `addedmessageevent`         | `message`→, `in_reply_to`→                                                                                                                                                          | core + msgtype, message, in_reply_to                                                                                                                                                                 |
| `submissiondocevent`        | `submissiondocevent`        | `submission`→                                                                                                                                                                       | core + submission                                                                                                                                                                                    |
| `reviewrequestdocevent`     | `reviewrequestdocevent`     | `review_request`→, `state`→                                                                                                                                                         | core + review_request, state                                                                                                                                                                         |
| `editedauthorsdocevent`     | `editedauthorsdocevent`     | `docevent_ptr`→                                                                                                                                                                     | core + basis                                                                                                                                                                                         |
| `editedrfcauthorsdocevent`  | `editedrfcauthorsdocevent`  | `docevent_ptr`→                                                                                                                                                                     | core                                                                                                                                                                                                 |
| `documenturl`               | `documenturl`               | `doc`→, `tag`→                                                                                                                                                                      | id, desc, url, doc, tag                                                                                                                                                                              |
| `reviewassignmentdocevent`  | `reviewassignmentdocevent`  | `review_assignment`→, `state`→                                                                                                                                                      | core + review_assignment, state                                                                                                                                                                      |
| `ianaexpertdocevent`        | `ianaexpertdocevent`        | `docevent_ptr`→                                                                                                                                                                     | core; ordering `[docevent_ptr]`                                                                                                                                                                      |
| `irsgballotdocevent`        | `irsgballotdocevent`        | `ballot_type`→, `ballotdocevent_ptr`→                                                                                                                                               | core + duedate; ordering `[ballotdocevent_ptr]`                                                                                                                                                      |
| `docextresource`            | `docextresource`            | `doc`→, `name`→                                                                                                                                                                     | id, display_name, value, doc, name                                                                                                                                                                   |
| `documentactionholder`      | `documentactionholder`      | `document`→, `person`→                                                                                                                                                              | id, time_added, document, person                                                                                                                                                                     |
| `bofreqeditordocevent`      | `bofreqeditordocevent`      | `editors`⇒                                                                                                                                                                          | core + editors; ordering `[docevent_ptr]`                                                                                                                                                            |
| `bofreqresponsibledocevent` | `bofreqresponsibledocevent` | `responsible`⇒                                                                                                                                                                      | core + responsible; ordering `[docevent_ptr]`                                                                                                                                                        |
| `storedobject`              | `storedobject`              | blob store metadata                                                                                                                                                                 | id, store, name, sha384, len, store_created, created, modified, doc_name, doc_rev, deleted                                                                                                           |
| `rfcauthor`                 | `rfcauthor`                 | `document`→, `person`→, `email`→ (read-only)                                                                                                                                        | id, titlepage_name, is_editor, affiliation, country, order, document, person, email                                                                                                                  |
| `rpcassignmentdocevent`     | `rpcassignmentdocevent`     | `docevent_ptr`→                                                                                                                                                                     | core + assignments; ordering `[docevent_ptr]`                                                                                                                                                        |
| `rpcactionholderopenentry`  | `rpcactionholderopenentry`  | `document`→, `person`→                                                                                                                                                              | id, purple_id, body, display_name, comment, rfc_number, since_when, deadline, time_captured, document, person                                                                                        |

`core` = `id, time, type, rev, desc, by, doc, docevent_ptr` as applicable.

### 3.2 `person` — `/api/v1/person/` (10 resources)

| Resource             | Relations / notes                                                                               | Filterable                                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `person`             | `user`→                                                                                         | id, time, name, ascii, ascii_short, affiliation, photo, biography, user                                                                                           |
| `personuuid`         | `person`→; ordering `[uuid]`                                                                    | uuid, primary, time, person                                                                                                                                       |
| `email`              | `person`→; ordering `[address]`                                                                 | address, time, active, person (**no `id`**)                                                                                                                       |
| `alias`              | `person`→                                                                                       | id, name, person                                                                                                                                                  |
| **`personalapikey`** | `person`→; **always empty** (`queryset = PersonalApiKey.objects.none()`); `excludes = ['salt']` | id, endpoint, created, valid, salt, count, latest, person                                                                                                         |
| `personevent`        | `person`→                                                                                       | id, time, type, desc, person                                                                                                                                      |
| `personapikeyevent`  | `person`→, `personevent_ptr`→, `key`→                                                           | core + key                                                                                                                                                        |
| `historicalperson`   | `user`→, `history_user`→                                                                        | id, time, name, ascii, ascii_short, affiliation, biography, photo, photo_thumb, history_id, history_date, history_change_reason, history_type, user, history_user |
| `historicalemail`    | `person`→, `history_user`→                                                                      | address, time, primary, origin, active, history_*, person, history_user                                                                                           |
| `personextresource`  | `person`→, `name`→                                                                              | id, display_name, value, person, name                                                                                                                             |

### 3.3 `group` — `/api/v1/group/` (15 resources)

| Resource                | Relations / notes                                                                                                         | Filterable                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `group`                 | `state`→, `type`→, `parent`→, `ad`→, `charter`→, `unused_states`⇒, `unused_tags`⇒; `description` is a computed char field | id, time, name, description, list_email, list_subscribe, list_archive, comments, acronym, state, type, parent, ad, charter, unused_states, unused_tags                                                                                      |
| `groupstatetransitions` | `group`→, `state`→, `next_states`⇒                                                                                        | id, group, state, next_states                                                                                                                                                                                                               |
| `groupmilestone`        | `group`→, `state`→, `docs`⇒                                                                                               | id, desc, due, resolved, time, group, state, docs                                                                                                                                                                                           |
| `grouphistory`          | like `group` + `group`→                                                                                                   | group fields + group                                                                                                                                                                                                                        |
| `groupurl`              | `group`→                                                                                                                  | id, name, url, group                                                                                                                                                                                                                        |
| `role`                  | `name`→, `group`→, `person`→, `email`→                                                                                    | id, name, group, person, email                                                                                                                                                                                                              |
| `groupevent`            | `group`→, `by`→                                                                                                           | id, time, type, desc, group, by                                                                                                                                                                                                             |
| `rolehistory`           | `name`→, `group`→, `person`→, `email`→                                                                                    | id, name, group, person, email                                                                                                                                                                                                              |
| `groupmilestonehistory` | `group`→, `state`→, `milestone`→, `docs`⇒                                                                                 | id, desc, due, resolved, time, group, state, milestone, docs                                                                                                                                                                                |
| `milestonegroupevent`   | `group`→, `by`→, `groupevent_ptr`→, `milestone`→                                                                          | core + milestone                                                                                                                                                                                                                            |
| `changestategroupevent` | `group`→, `by`→, `groupevent_ptr`→, `state`→                                                                              | core + state                                                                                                                                                                                                                                |
| `groupfeatures`         | `type`→, `agenda_type`→                                                                                                   | has_milestones, has_chartering_process, has_documents, has_dependencies, has_nonsession_materials, has_meetings, has_reviews, has_default_chat, customize_workflow, about_page, default_tab, material_types, admin_roles, type, agenda_type |
| `groupextresource`      | `group`→, `name`→                                                                                                         | id, display_name, value, group, name                                                                                                                                                                                                        |
| `appeal`                | `group`→                                                                                                                  | id, name, date, group                                                                                                                                                                                                                       |
| `appealartifact`        | `appeal`→, `artifact_type`→; **`excludes = ("bits",)`**                                                                   | id, date, title, order, content_type, appeal, artifact_type                                                                                                                                                                                 |

### 3.4 `meeting` — `/api/v1/meeting/` (20 resources)

| Resource                  | Relations / notes                                                                                                                         | Filterable                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meeting`                 | `type`→, `schedule`→, `agenda`→ (**alias of `schedule`**, kept for compatibility)                                                         | id, number, date, city, country, time_zone, idsubmit_cutoff_day_offset_00, idsubmit_cutoff_day_offset_01, idsubmit_cutoff_time_utc, idsubmit_cutoff_warning_days, submission_start_day_offset, submmission_cutoff_day_offset, submission_correction_day_offset, venue_name, venue_addr, break_area, reg_area, agenda_info_note, agenda_warning_note, session_request_lock_message, type, schedule, agenda, proceedings_final; ordering `[id, date]` |
| `resourceassociation`     | `name`→                                                                                                                                   | id, icon, desc, name                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `constraint`              | `meeting`→, `source`→, `target`→, `person`→, `name`→                                                                                      | id, meeting, source, target, person, name                                                                                                                                                                                                                                                                                                                                                                                                           |
| `floorplan`               | `meeting`→                                                                                                                                | id, name, short, time, order, image, meeting                                                                                                                                                                                                                                                                                                                                                                                                        |
| `room`                    | `meeting`→, `resources`⇒, `session_types`⇒, `floorplan`→                                                                                  | id, name, time, functional_name, capacity, meeting, resources, session_types, floorplan                                                                                                                                                                                                                                                                                                                                                             |
| `schedule`                | `meeting`→, `owner`→                                                                                                                      | id, name, visible, public, badness, meeting, owner                                                                                                                                                                                                                                                                                                                                                                                                  |
| `session`                 | `meeting`→, `type`→, `purpose`→, `group`→, `materials`⇒, `resources`⇒, `assignments`⇒; `requested_duration` is a **timedelta in seconds** | id, name, short, attendees, agenda_note, requested, requested_duration, comments, scheduled, modified, meeting, type, purpose, group, requested_by, status, materials, resources, assignments; ordering `[id, modified, scheduled, meeting]`                                                                                                                                                                                                        |
| `schedulingevent`         | `session`→, `status`→, `by`→                                                                                                              | id, time, session, by; ordering `[id, time, modified, meeting]`                                                                                                                                                                                                                                                                                                                                                                                     |
| `timeslot`                | `meeting`→, `type`→, `location`→, `sessions`⇒; `duration` is a **timedelta in seconds**                                                   | id, name, time, duration, show_location, modified, meeting, type, location, sessions; ordering `[id, time, modified, meeting]`                                                                                                                                                                                                                                                                                                                      |
| `schedtimesessassignment` | `timeslot`→, `session`→, `schedule`→, `agenda`→ (alias of schedule), `extendedfrom`→(self)                                                | id, modified, badness, pinned, timeslot, session, schedule, agenda, extendedfrom; ordering `[id, modified]`                                                                                                                                                                                                                                                                                                                                         |
| `sessionpresentation`     | `session`→, `document`→                                                                                                                   | id, rev, session, document                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `urlresource`             | `name`→, `room`→                                                                                                                          | id, url, name, room                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `importantdate`           | `meeting`→, `name`→                                                                                                                       | id, date, meeting, name                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `slidesubmission`         | `session`→, `submitter`→                                                                                                                  | id, title, filename, session, submitter                                                                                                                                                                                                                                                                                                                                                                                                             |
| `businessconstraint`      |                                                                                                                                           | slug, name, penalty; ordering `[slug]`                                                                                                                                                                                                                                                                                                                                                                                                              |
| `proceedingsmaterial`     | `meeting`→, `document`→, `type`→                                                                                                          | id, meeting, document, type                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `meetinghost`             | `meeting`→                                                                                                                                | id, name, logo, logo_width, logo_height, meeting                                                                                                                                                                                                                                                                                                                                                                                                    |
| `attended`                | `person`→, `session`→                                                                                                                     | id, person, session                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **`registration`**        | `meeting`→, `person`→, `tickets`⇒ **embedded full objects** (the only `full=True` in the API)                                             | id, first_name, last_name, affiliation, country_code, email, attended, checkedin, meeting, person, tickets                                                                                                                                                                                                                                                                                                                                          |
| `registrationticket`      | `registration`→, `attendance_type`→, `ticket_type`→                                                                                       | id, ticket_type, attendance_type, registration                                                                                                                                                                                                                                                                                                                                                                                                      |

> Durations are serialized as **seconds** (`132`), and accepted as strings like
> `1d2h3m4s` on input paths (there are no writable resources, so this only
> matters if you read the schema).

### 3.5 `name` — `/api/v1/name/` (47 resources)

Lookup tables. The **standard shape** is `slug, name, desc, used, order`, all
`ALL`-filterable, detail by `pk`, read-only.

Standard shape (all of these): `timeslottypename`, `groupstatename`, `doctagname`,
`intendedstdlevelname`, `liaisonstatementpurposename`, `doctypename`, `rolename`,
`iprdisclosurestatename`, `stdlevelname`, `liaisonstatementeventtypename`,
`grouptypename`, `ipreventtypename`, `groupmilestonestatename`, `sessionstatusname`,
`docremindertypename`, `meetingtypename`, `iprlicensetypename`,
`liaisonstatementtagname`, `feedbacktypename`, `liaisonstatementstate`,
`streamname`, `dbtemplatetypename`, `nomineepositionstatename`,
`reviewrequeststatename`, `reviewassignmentstatename`, `reviewtypename`,
`reviewresultname`, `reviewerqueuepolicyname`, `topicaudiencename`,
`formallanguagename`, `continentname`, `docurltagname`, `agendatypename`,
`proceedingsmaterialtypename`, `agendafiltertypename`, `sessionpurposename`,
`telechatagendasectionname`, `appealartifacttypename`, `attendancetypename`,
`registrationtickettypename`.

Variations:

| Resource                    | Difference                                         |
| --------------------------- | -------------------------------------------------- |
| `draftsubmissionstatename`  | `+ next_states`⇒ (self)                            |
| `constraintname`            | `+ penalty`                                        |
| `docrelationshipname`       | `+ revname`                                        |
| `ballotpositionname`        | `+ blocking`                                       |
| `roomresourcename`          | standard                                           |
| `countryname`               | `+ in_eu`, `continent`→                            |
| `importantdatename`         | `+ default_offset_days`                            |
| `timerangename`             | ordering `[slug]`                                  |
| `extresourcetypename`       | ordering `[slug]`                                  |
| `extresourcename`           | `+ type`→; ordering `[slug]`                       |
| `slidesubmissionstatusname` | ordering `[slug]`                                  |
| `sessionpurposename`        | `+ timeslot_types`, `on_agenda`; ordering `[slug]` |

> The endpoint name is the lowercased resource class name with `Resource`
> stripped, e.g. `DocTagNameResource` → `doctagname`. A few resources set
> `resource_name` explicitly: `docextresource`, `personextresource`,
> `groupextresource`, `submissionextresource`, `resourceassociation`,
> `urlresource`, `roomresourcename`, `extresourcetypename`, `extresourcename`,
> `slidesubmissionstatusname`.

### 3.6 `review` — `/api/v1/review/` (12 resources)

| Resource                      | Relations                                                       | Filterable                                                                                                        |
| ----------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `reviewersettings`            | `team`→, `person`→                                              | id, min_interval, filter_re, skip_next, team, person                                                              |
| `reviewrequest`               | `state`→, `type`→, `doc`→, `team`→, `requested_by`→             | id, time, deadline, requested_rev, comment, state, type, doc, team, requested_by                                  |
| `historicalreviewrequest`     | same as above                                                   | same                                                                                                              |
| `unavailableperiod`           | `team`→, `person`→                                              | id, start_date, end_date, availability, reason, team, person                                                      |
| `historicalunavailableperiod` | same                                                            | same                                                                                                              |
| `reviewwish`                  | `team`→, `person`→, `doc`→                                      | id, time, team, person, doc                                                                                       |
| `nextreviewerinteam`          | `team`→, `next_reviewer`→                                       | id, team, next_reviewer                                                                                           |
| `reviewsecretarysettings`     | `team`→, `person`→                                              | id, remind_days_before_deadline, team, person                                                                     |
| `reviewteamsettings`          | `group`→, `review_types`⇒, `review_results`⇒, `notify_ad_when`⇒ | id, autosuggest, group, review_types, review_results, notify_ad_when                                              |
| `historicalreviewersettings`  | `team`→, `person`→, `history_user`→                             | min_interval, filter_re, skip_next, remind_days_before_deadline, expertise, history_*, team, person, history_user |
| `reviewassignment`            | `review_request`→, `state`→, `reviewer`→, `review`→, `result`→  | id, assigned_on, completed_on, reviewed_rev, mailarch_url, review_request, state, reviewer, review, result        |
| `historicalreviewassignment`  | same                                                            | same                                                                                                              |

### 3.7 `ipr` — `/api/v1/ipr/` (10 resources)

| Resource                      | Relations                                                 | Filterable                                                                                                                                                                                                               |
| ----------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `iprdisclosurebase`           | `by`→, `state`→, `docs`⇒, `rel`⇒                          | id, compliant, holder_legal_name, notes, other_designations, submitter_name, submitter_email, time, title, by, state, docs, rel                                                                                          |
| `iprdocrel`                   | `disclosure`→, `document`→                                | id, sections, revisions, disclosure, document                                                                                                                                                                            |
| `holderiprdisclosure`         | base + `iprdisclosurebase_ptr`→, `licensing`→             | base + ietfer_name, ietfer_contact_email, ietfer_contact_info, patent_info, has_patent_pending, holder_contact_email, holder_contact_name, holder_contact_info, licensing_comments, submitter_claims_all_terms_disclosed |
| `thirdpartyiprdisclosure`     | base + `iprdisclosurebase_ptr`→                           | base + ietfer_*, patent_info, has_patent_pending                                                                                                                                                                         |
| `relatedipr`                  | `source`→, `target`→, `relationship`→                     | id, source, target, relationship                                                                                                                                                                                         |
| `nondocspecificiprdisclosure` | base + `iprdisclosurebase_ptr`→                           | base + holder_contact_*, patent_info, has_patent_pending, statement                                                                                                                                                      |
| `genericiprdisclosure`        | same as nondocspecific                                    | same                                                                                                                                                                                                                     |
| `iprevent`                    | `type`→, `by`→, `disclosure`→, `message`→, `in_reply_to`→ | id, time, desc, response_due, type, by, disclosure, message, in_reply_to                                                                                                                                                 |
| `legacymigrationiprevent`     | `iprevent_ptr`→                                           | iprevent fields + iprevent_ptr                                                                                                                                                                                           |
| `removediprdisclosure`        |                                                           | id, removed_id, reason                                                                                                                                                                                                   |

### 3.8 `submit` — `/api/v1/submit/` (6 resources)

| Resource                | Relations / notes                                                                                                 | Filterable                                                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preapproval`           | `by`→                                                                                                             | id, name, time, by                                                                                                                                                                  |
| **`submission`**        | `state`→, `group`→, `draft`→, `checks`⇒; **`excludes = ("first_two_pages","remote_ip","access_key","auth_key")`** | id, name, title, abstract, rev, pages, authors, note, replaces, first_two_pages, file_types, file_size, document_date, submission_date, submitter, xml_version, state, group, draft |
| `submissionevent`       | `submission`→, `by`→                                                                                              | id, time, desc, submission, by                                                                                                                                                      |
| `submissioncheck`       | `submission`→                                                                                                     | id, time, checker, passed, message, errors, warnings, items, submission                                                                                                             |
| `submissionemailevent`  | `submission`→, `by`→, `submissionevent_ptr`→, `message`→, `in_reply_to`→                                          | core + msgtype, message, in_reply_to                                                                                                                                                |
| `submissionextresource` | `name`→, `submission`→                                                                                            | id, display_name, value, name, submission                                                                                                                                           |

### 3.9 `message` — `/api/v1/message/` (4 resources)

| Resource                | Relations / notes                                                                      | Filterable                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **`message`**           | `by`→, `related_groups`⇒, `related_docs`⇒; **always empty** (`Message.objects.none()`) | id, time, subject, frm, to, cc, bcc, reply_to, body, content_type, by, related_groups, related_docs |
| `sendqueue`             | `by`→, `message`→                                                                      | id, time, send_at, sent_at, note, by, message                                                       |
| **`messageattachment`** | `message`→; **always empty**                                                           | id, filename, removed, body, message                                                                |
| `announcementfrom`      | `name`→, `group`→                                                                      | id, address, name, group                                                                            |

### 3.10 `nomcom` — `/api/v1/nomcom/` (11 resources)

| Resource                | Relations                                                     | Filterable                                                                                                                |
| ----------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `nomcom`                | `group`→                                                      | id, public_key, send_questionnaire, reminder_interval, initial_text, show_nominee_pictures, show_accepted_nominees, group |
| `position`              | `nomcom`→, `requirement`→, `questionnaire`→                   | id, name, is_open, accepting_nominations, accepting_feedback, nomcom, requirement, questionnaire                          |
| `nominee`               | `email`→, `duplicated`→(self), `nomcom`→, `nominee_position`⇒ | id, email, duplicated, nomcom, nominee_position                                                                           |
| `reminderdates`         | `nomcom`→                                                     | id, date, nomcom                                                                                                          |
| `nomineeposition`       | `position`→, `nominee`→, `state`→                             | id, time, position, nominee, state                                                                                        |
| `feedback`              | `nomcom`→, `type`→, `person`→, `positions`⇒, `nominees`⇒      | id, author, subject, time, nomcom, type, person, positions, nominees (`comments` deliberately not filterable)             |
| `nomination`            | `position`→, `nominee`→, `comments`→, `person`→               | id, candidate_name, candidate_email, candidate_phone, nominator_email, time, position, nominee, comments, person          |
| `feedbacklastseen`      | `reviewer`→, `nominee`→                                       | id, time, reviewer, nominee                                                                                               |
| `topic`                 | `nomcom`→, `description`→, `audience`→                        | id, subject, accepting_feedback, nomcom, description, audience                                                            |
| `topicfeedbacklastseen` | `reviewer`→, `topic`→                                         | id, time, reviewer, topic                                                                                                 |
| `volunteer`             | `nomcom`→, `person`→                                          | id, affiliation, nomcom, person                                                                                           |

> `nomination` exposes `candidate_phone`, `candidate_email` and
> `nominator_email`. If you are auditing for PII exposure, start here and with
> `feedback`.

### 3.11 `community` — `/api/v1/community/` (3)

| Resource            | Relations                        | Filterable                                  |
| ------------------- | -------------------------------- | ------------------------------------------- |
| `communitylist`     | `user`→, `group`→, `added_docs`⇒ | id, secret, cached, user, group, added_docs |
| `searchrule`        | `community_list`→                | id, rule_type, community_list               |
| `emailsubscription` | `community_list`→                | id, email, notify_on, community_list        |

### 3.12 `liaisons` — `/api/v1/liaisons/` (4)

| Resource                     | Relations                                                                   | Filterable                                                                                                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `liaisonstatement`           | `purpose`→, `state`→, `from_groups`⇒, `to_groups`⇒, `tags`⇒, `attachments`⇒ | id, title, from_contact, to_contacts, response_contacts, technical_contacts, action_holder_contacts, cc_contacts, deadline, other_identifiers, body, purpose, state, from_groups, to_groups, tags, attachments |
| `liaisonstatementevent`      | `type`→, `by`→, `statement`→                                                | id, time, desc, type, by, statement                                                                                                                                                                            |
| `liaisonstatementattachment` | `statement`→, `document`→                                                   | id, removed, statement, document                                                                                                                                                                               |
| `relatedliaisonstatement`    | `source`→, `target`→, `relationship`→                                       | id, source, target, relationship                                                                                                                                                                               |

### 3.13 `mailtrigger` — `/api/v1/mailtrigger/` (4)

| Resource                | Relations / notes                        | Filterable                                    |
| ----------------------- | ---------------------------------------- | --------------------------------------------- |
| `recipient`             | stock serializer; no ordering            | slug, desc, template                          |
| `mailtrigger`           | `to`⇒, `cc`⇒; stock serializer           | slug, desc, to, cc                            |
| `historicalmailtrigger` | `history_user`→; ordering `[history_id]` | slug, desc, history_*, history_user           |
| `historicalrecipient`   | `history_user`→; ordering `[history_id]` | slug, desc, template, history_*, history_user |

### 3.14 `mailinglists` — `/api/v1/mailinglists/` (2)

| Resource           | Relations | Filterable                    |
| ------------------ | --------- | ----------------------------- |
| `allowlisted`      | `by`→     | id, time, email, by           |
| `nonwgmailinglist` |           | id, name, domain, description |

### 3.15 `stats` — `/api/v1/stats/` (4)

| Resource                   | Relations             | Filterable                                                                                                    |
| -------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `countryalias`             | `country`→            | id, alias, country                                                                                            |
| `affiliationignoredending` |                       | id, ending                                                                                                    |
| `affiliationalias`         |                       | id, alias, name                                                                                               |
| `meetingregistration`      | `meeting`→, `person`→ | id, first_name, last_name, affiliation, country_code, email, reg_type, ticket_type, attended, meeting, person |

### 3.16 `iesg` — `/api/v1/iesg/` (3)

| Resource                | Relations / notes            | Filterable            |
| ----------------------- | ---------------------------- | --------------------- |
| `telechatdate`          |                              | id, date              |
| `telechatagendaitem`    |                              | id, text, type, title |
| `telechatagendacontent` | `section`→; **always empty** | id, text, section     |

### 3.17 `redirects` — `/api/v1/redirects/` (3)

| Resource   | Relations            | Filterable                       |
| ---------- | -------------------- | -------------------------------- |
| `redirect` |                      | id, cgi, url, rest, remove       |
| `suffix`   |                      | id, rest, remove                 |
| `command`  | `script`→, `suffix`→ | id, command, url, script, suffix |

### 3.18 `dbtemplate` — `/api/v1/dbtemplate/` (1)

`dbtemplate` — `type`→, `group`→ · filterable: id, path, title, variables, content, type, group.

### 3.19 `utils` — `/api/v1/utils/` (2 registered)

| Resource    | Notes            | Filterable        |
| ----------- | ---------------- | ----------------- |
| `dumpinfo`  |                  | date, host        |
| `dirtybits` | **always empty** | _(none declared)_ |

Two more resources exist but are **not registered**, so they have no endpoints —
`UserResource` (`user`) and `ContentTypeResource` (`contenttype`). They appear
only as relation targets, and their `resource_uri` dehydrates to `""`. If you see
an empty `"/api/v1/utils/user/…"` string in a payload, that is why.

---

## 4. Writability

Nothing in `/api/v1/` is writable.

Tastypie's default `allowed_methods` includes `post/put/delete/patch`, which is
why the `schema/` route advertises them — but `ReadOnlyAuthorization` rejects
them:

- `POST` to a **list** URL → `401 Unauthorized`
- `PUT` / `DELETE` / `PATCH` → `401 Unauthorized`
- `POST` to a **detail** URL → `405 Method Not Allowed` (custom `post_detail`)

So the effective surface is `GET` and `OPTIONS`. Do not build writes against
this layer — use the DRF endpoints in [drf.md](./drf.md).

---

## 5. Usage patterns

### Find a document by name and read its relations

```bash
curl 'https://datatracker.ietf.org/api/v1/doc/document/rfc9000/'
```

Follow the URI strings (`/api/v1/doc/state/<id>/`, `/api/v1/group/group/<id>/`)
to expand relations — they are references, not embedded objects.

### Walk relations with `ALL_WITH_RELATIONS`

```bash
# every email address of a person
curl 'https://datatracker.ietf.org/api/v1/person/email/?person__email__address=jdoe@example.com'

# all documents in a group, newest first
curl 'https://datatracker.ietf.org/api/v1/doc/document/?group__acronym=quic&order_by=-id&limit=100'
```

### Enumerate a whole table

```bash
# Tastypie pages via limit/offset; walk "meta.next"
curl 'https://datatracker.ietf.org/api/v1/person/email/?active=true&limit=100&offset=0'
```

### TypeScript

```ts
type TastypieList<T> = {
  objects: (T & { resource_uri: string })[];
  meta: {
    limit: number;
    offset: number;
    total_count: number;
    next: string | null;
    previous: string | null;
  };
};

async function* paginate<T>(path: string): AsyncGenerator<T> {
  let url: string | null =
    `${BASE}${path}${path.includes('?') ? '&' : '?'}limit=100`;
  while (url) {
    const page: TastypieList<T> = await fetch(url).then((r) => r.json());
    yield* page.objects;
    url = page.meta.next;
  }
}

for await (const email of paginate<{ address: string; active: boolean }>(
  '/api/v1/person/email/'
)) {
  console.log(email.address);
}
```

---

## 6. Notes and sharp edges

1. **`detail_uri_name` is `pk` except for `doc/document`, which uses `name`.**
   `/api/v1/doc/document/9000/` is wrong; use `/api/v1/doc/document/rfc9000/`.
2. **`order_by` is whitelisted.** A field not in `Meta.ordering` returns `400`,
   not an unsorted result. Listed per resource above.
3. **`in` and `range` reject booleans and `None`**, and `range` requires exactly
   two values — a custom hardening in this fork's `ModelResource`.
4. **Database errors surface as `400`** ("The database could not process this
   request…"), not `500`.
5. **Timedelta fields** (`session.requested_duration`, `timeslot.duration`) come
   back as seconds.
6. **Date-times are UTC** with a `Z` suffix.
7. **Some resources always return zero rows** (`personalapikey`, `message`,
   `messageattachment`, `telechatagendacontent`, `dirtybits`). The endpoints and
   schemas exist; the querysets are `.none()` by design. Do not treat "empty" as
   "no data exists".
8. **Excluded fields are not just hidden — filters on them are ignored.** E.g.
   `?salt=` on `personalapikey` and `?first_two_pages=` on `submission` are
   silently dropped.
9. **The `meeting.agenda` and `schedtimesessassignment.agenda` fields are
   backward-compatibility aliases for `schedule`.** Reading both gives the same URI.
10. **`/api/v1/` needs no key, and duplicates data behind token-gated custom
    endpoints** (notably `/api/person/email/`). See
    [README §5](./README.md#5-things-that-will-bite-you).
