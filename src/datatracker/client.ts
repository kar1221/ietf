import { TaskPool } from 'src/network/task-pool.js';
import { DatatrackerError } from './errors.js';
import type {
  DocHistory,
  MeetingRegistration,
  PersonInfo,
  TastypieResponse
} from './types.js';
import { Logger } from 'src/logger.js';
import { UserAgent, FetchLimit } from 'src/network/constants.js';

const pool = new TaskPool({ maxConcurrent: 2, minIntervalMs: 1000 });

export class DatatrackerClient {
  private readonly BASE = 'https://datatracker.ietf.org';

  public async fetchPeopleInfo(
    emails: string[]
  ): Promise<Map<string, PersonInfo>> {
    const result = new Map<string, PersonInfo>();

    for (const email of chunked(emails, 50)) {
      const path = `/api/v1/person/email/?address__in=${encodeURIComponent(email.join(','))}&limit=${FetchLimit.toString()}`;

      const rows = await this.fetchAll<PersonInfo>(path);

      for (const row of rows) {
        result.set(row.address.toLowerCase(), row);
      }
    }

    return result;
  }

  public async fetchPersonInfo(email: string): Promise<PersonInfo | null> {
    const path = `/api/v1/person/email/?address=${email}`;

    const rows = await this.fetchAll<PersonInfo>(path);

    if (rows.length === 0) return null;

    return rows[0];
  }

  public async fetchMeetingRegistrations(
    personId: number
  ): Promise<MeetingRegistration[]> {
    const path = `/api/v1/meeting/registration/?person=${personId.toString()}&limit=${FetchLimit.toString()}`;

    const res = await this.fetchAll<MeetingRegistration>(path);

    return res;
  }

  public async fetchDocHistories(personId: number): Promise<DocHistory[]> {
    const path = `/api/v1/doc/dochistoryauthor/?person=${personId.toString()}&limit=${FetchLimit.toString()}`;

    const res = await this.fetchAll<DocHistory>(path);

    return res;
  }

  public async fetchAffiliations(personId: number): Promise<string[]> {
    const documentHistories = await this.fetchDocHistories(personId);
    const meetingRegistrations = await this.fetchMeetingRegistrations(personId);

    const affiliationsRaw = [
      ...documentHistories.map((d) => d.affiliation),
      ...meetingRegistrations.map((m) => m.affiliation)
    ];

    const affiliations = new Set<string>();

    affiliationsRaw.forEach((aff) => {
      const a = aff.trim();

      if (a === '') return;

      affiliations.add(a);
    });

    return [...affiliations];
  }

  private async fetchJson<T>(path: string): Promise<T> {
    return pool.schedule(async () => {
      const res = await fetch(`${this.BASE}${path}`, {
        headers: {
          Accept: 'application/json',
          'user-agent': UserAgent
        }
      });

      Logger.debug(`Fetching ${path}`, 'DatatrackerClient');

      if (!res.ok) throw new DatatrackerError(res.status, path);

      return res.json() as Promise<T>;
    });
  }

  private async fetchAll<T>(firstPath: string): Promise<T[]> {
    const out: T[] = [];
    let path: string | null = firstPath;

    while (path !== null) {
      const page: TastypieResponse<T> = await this.fetchJson(path);
      out.push(...page.objects);
      path = page.meta.next;
    }

    return out;
  }
}

function chunked<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];

  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }

  return out;
}
