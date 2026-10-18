import { TaskPool } from 'src/network/task-pool.js';
import { DatatrackerError } from './errors.js';
import type {
  MeetingRegistration,
  PersonInfo,
  TastypieResponse
} from './types.js';

const UA =
  'ietf-doc-analyzer/0.1 (+https://github.com/kar1221/ietf; khyeong191@gmail.com)';

const pool = new TaskPool({ maxConcurrent: 2, minIntervalMs: 1000 });

type EmailToPerson = Map<string, PersonInfo>;

export class DatatrackerClient {
  private readonly BASE = 'https://datatracker.ietf.org';

  public async fetchPeopleInfo(emails: string[]): Promise<EmailToPerson> {
    const result: EmailToPerson = new Map<string, PersonInfo>();

    for (const email of chunked(emails, 50)) {
      const path = `/api/v1/person/email/?address__in=${encodeURIComponent(email.join(','))}&limit=200`;

      const rows = await this.fetchAll<PersonInfo>(path);

      for (const row of rows) {
        result.set(row.address.toLowerCase(), row);
      }
    }

    return result;
  }

  public async fetchMeetingRegistration(
    personId: number
  ): Promise<MeetingRegistration[]> {
    const path = `/api/v1/meeting/registration/?person=${personId.toString()}&limit=20`;

    const res = await this.fetchAll<MeetingRegistration>(path);

    return res;
  }

  private async fetchJson<T>(path: string): Promise<T> {
    return pool.schedule(async () => {
      const res = await fetch(`${this.BASE}${path}`, {
        headers: {
          Accept: 'application/json',
          'user-agent': UA
        }
      });

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
