import type { $ZodIssue } from 'zod/v4/core';

export class ApiResponseError extends Error {
  public constructor(path: string, issues: $ZodIssue[]) {
    let errors = `[${path}]: `;

    let issue = issues.map((i) => i.message.padStart(errors.length)).join('\n');

    super(errors.concat(issue));

    this.name = 'ApiResponseError';
  }
}
