import { readdir, constants } from 'fs/promises';
import env from 'src/env.js';
import { WorkingGroupNotAvailableError } from './errors.js';
import { accessSync, createReadStream } from 'fs';
import { createInterface } from 'readline';

export class MBox {
  private workingGroup: string;

  private static readonly SEP =
    /^From \S+ (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[ \t]+\d{1,2} \d{2}:\d{2}:\d{2} \d{4}\r?$/gm;

  public constructor(workingGroup: string) {
    if (!this.isWorkingGroupAvailable(workingGroup)) {
      throw new WorkingGroupNotAvailableError(workingGroup);
    }

    this.workingGroup = workingGroup;
  }

  public async getFiles(): Promise<string[]> {
    const files = await readdir(`${env.DATAPATH}/${this.workingGroup}`);

    return files;
  }

  public async *read(filename: string): AsyncGenerator<string> {
    const lines = createInterface({
      input: createReadStream(
        `${env.DATAPATH}/${this.workingGroup}/${filename}`,
        { encoding: 'utf-8' }
      ),
      crlfDelay: Infinity
    });

    let current: string[] = [];

    for await (const line of lines) {
      if (MBox.SEP.test(line)) {
        if (current.length !== 0) yield current.join('\n');

        current = [];
        continue;
      }
      current.push(line);
    }

    if (current.length > 0) yield current.join('\n');
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
