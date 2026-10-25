import { TaskPool } from 'src/network/task-pool.js';
import { DatatrackerError } from './errors.js';
import { Logger } from 'src/logger.js';
import { UserAgent, FetchLimit } from 'src/network/constants.js';
import type { ICache } from 'src/cache/interface.js';
import { InMemoryCache } from 'src/cache/in-memory.js';
import {
  docHistoryAuthorSchema,
  docHistorySchema,
  meetingRegistrationSchema,
  meetingSchema,
  personEmailSchema,
  personSchema,
  tastypieSchema
} from './schema.js';
import type {
  DocHistory,
  DocHistoryAuthor,
  Meeting,
  MeetingRegistration,
  Person,
  PersonEmail,
  TastypieResponse
} from './schema.js';
import zod from 'zod';
import { ApiResponseError } from 'src/network/errors.js';

const pool = new TaskPool({ maxConcurrent: 2, minIntervalMs: 1000 });

export class DatatrackerClient {
  private readonly BASE = 'https://datatracker.ietf.org';

  private meetingCache: ICache<number, Meeting>;

  public constructor(meetingCache?: ICache<number, Meeting>) {
    this.meetingCache = meetingCache ?? new InMemoryCache<number, Meeting>();
  }

  public async fetchPeopleByEmails(
    emails: string[]
  ): Promise<Map<string, PersonEmail>> {
    const result = new Map<string, PersonEmail>();

    for (const email of chunked(emails, 50)) {
      const path = `/api/v1/person/email/?address__in=${encodeURIComponent(email.join(','))}&limit=${FetchLimit.toString()}`;

      const rows = await this.fetchAll(path, personEmailSchema);

      for (const row of rows) {
        result.set(row.address.toLowerCase(), row);
      }
    }

    return result;
  }

  public async fetchPersonByEmail(email: string): Promise<PersonEmail | null> {
    const path = `/api/v1/person/email/?address=${email}`;

    const rows = await this.fetchAll(path, personEmailSchema);

    if (rows.length === 0) return null;

    return rows[0];
  }

  public async fetchPerson(id: number): Promise<Person | null> {
    const path = `/api/v1/person/person/?id=${id.toString()}`;

    const res = await this.fetchAll(path, personSchema);

    if (res.length === 0) return null;

    return res[0];
  }

  public async fetchPeople(ids: number[]): Promise<Person[]> {
    const path = `/api/v1/person/person/?id__in=${ids.join(',')}`;

    const res = await this.fetchAll(path, personSchema);

    return res;
  }

  public async fetchMeeting(meetingId: number): Promise<Meeting | null> {
    const hit = this.meetingCache.get(meetingId);
    if (hit) return hit;

    const path = `/api/v1/meeting/meeting/?id=${meetingId.toString()}&limit=${FetchLimit.toString()}`;

    const res = await this.fetchAll(path, meetingSchema);

    if (res.length === 0) return null;

    this.meetingCache.set(meetingId, res[0]);

    return res[0];
  }

  public async fetchMeetingRegistrations(
    personId: number
  ): Promise<MeetingRegistration[]> {
    const path = `/api/v1/meeting/registration/?person=${personId.toString()}&limit=${FetchLimit.toString()}`;

    const res = await this.fetchAll(path, meetingRegistrationSchema);

    return res;
  }

  public async fetchDocHistoriesAuthor(
    personId: number
  ): Promise<DocHistoryAuthor[]> {
    const path = `/api/v1/doc/dochistoryauthor/?person=${personId.toString()}&limit=${FetchLimit.toString()}`;

    const res = await this.fetchAll(path, docHistoryAuthorSchema);

    return res;
  }

  public async fetchDocHistory(documentId: number): Promise<DocHistory[]> {
    const path = `/api/v1/doc/dochistory/?id=${documentId.toString()}&limit=${FetchLimit.toString()}`;

    const res = await this.fetchAll(path, docHistorySchema);

    return res;
  }

  public async fetchDocHistoriesDates(
    ids: number[]
  ): Promise<Map<number, Date>> {
    const dates = new Map<number, Date>();

    for (const id of chunked(ids, 150)) {
      const path = `/api/v1/doc/dochistory/?id__in=${id.join(',')}&limit=${FetchLimit.toString()}`;
      const res = await this.fetchAll(path, docHistorySchema);

      res.forEach((r) => {
        dates.set(r.id, new Date(r.time));
      });
    }

    return dates;
  }

  public async fetchAffiliations(personId: number): Promise<string[]> {
    const documentHistories = await this.fetchDocHistoriesAuthor(personId);
    const meetingRegistrations = await this.fetchMeetingRegistrations(personId);

    const affiliationsRaw = [
      ...documentHistories.map((d) => d.affiliation),
      ...meetingRegistrations.map((m) => m.affiliation)
    ];

    const affiliations = new Set<string>();

    affiliationsRaw.forEach((aff) => {
      const a = aff.trim().toLowerCase();

      if (a === '') return;

      affiliations.add(a);
    });

    return [...affiliations];
  }

  private async fetchJson<T>(path: string, schema: zod.ZodType<T>): Promise<T> {
    return pool.schedule(async () => {
      const res = await fetch(`${this.BASE}${path}`, {
        headers: {
          Accept: 'application/json',
          'user-agent': UserAgent
        }
      });

      Logger.debug(`Fetching ${path}`, 'DatatrackerClient');

      if (!res.ok) throw new DatatrackerError(res.status, path);

      const parsed = schema.safeParse(res);

      if (!parsed.success) {
        throw new ApiResponseError(path, parsed.error.issues);
      }

      return parsed.data;
    });
  }

  private async fetchAll<T>(
    firstPath: string,
    schema: zod.ZodType<T>
  ): Promise<T[]> {
    const out: T[] = [];
    let path: string | null = firstPath;

    while (path !== null) {
      const page: TastypieResponse<T> = await this.fetchJson(
        path,
        tastypieSchema(schema)
      );
      out.push(...page.objects);
      path = page.meta.next;
    }

    return out;
  }
}

export function extractId(uri: string): number {
  const result = Number(/(\d+)\/$/.exec(uri)?.[1]);

  Logger.debug(`${uri} --- ${result.toString()}`);

  return result;
}

function chunked<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];

  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }

  return out;
}
