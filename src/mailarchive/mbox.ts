import { readdir, constants } from 'fs/promises';
import env from 'src/env.js';
import { WorkingGroupNotAvailableError } from './errors.js';
import { accessSync, createReadStream } from 'fs';
import { createInterface } from 'readline';
import { Logger } from 'src/logger.js';

export class MBox {
  private workingGroup: string;

  private static readonly SEP =
    /^From \S+[ \t]+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[ \t]+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[ \t]+\d{1,2}[ \t]+\d{2}:\d{2}:\d{2}[ \t]+\d{4}$/;

  public constructor(workingGroup: string) {
    if (!this.isWorkingGroupAvailable(workingGroup)) {
      throw new WorkingGroupNotAvailableError(workingGroup);
    }

    this.workingGroup = workingGroup;
  }

  public async getAvailableBuckets(): Promise<string[]> {
    const files = await readdir(`${env.DATAPATH}/${this.workingGroup}`);

    const buckets = files.map((f) => f.replace('.mail', ''));

    return buckets;
  }

  public async *read(bucket: string): AsyncGenerator<string> {
    const lines = createInterface({
      input: createReadStream(
        `${env.DATAPATH}/${this.workingGroup}/${bucket}.mail`,
        { encoding: 'utf-8' }
      ),
      crlfDelay: Infinity
    });

    let current: string[] = [];
    const MAX_CHUNK_SIZE = 1_000_000;

    const flush = (): string | undefined => {
      if (current.length === 0) return undefined;

      const chunk = current.join('\n');
      current = [];

      if (chunk.length > MAX_CHUNK_SIZE) {
        Logger.warn(
          'Chunk size exceeds 1MB, the splitters may have failed.',
          'MBox.read'
        );
      }

      return chunk;
    };

    for await (const line of lines) {
      if (!MBox.SEP.test(line)) {
        current.push(line);
        continue;
      }

      const chunk = flush();
      if (chunk !== undefined) yield chunk;
    }

    const chunk = flush();
    if (chunk !== undefined) yield chunk;
  }

  private isWorkingGroupAvailable(workingGroup: string): boolean {
    try {
      accessSync(`${env.DATAPATH}/${workingGroup}`, constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }
}
