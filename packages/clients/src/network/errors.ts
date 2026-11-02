import type { $ZodIssue } from 'zod/v4/core';

export class ApiResponseError extends Error {
  public constructor(path: string, issues: $ZodIssue[]) {
    let errors = `[${path}]: `;
    const messages =
      errors + issues.map((i) => i.message.padStart(errors.length)).join('\n');

    super(messages);

    this.name = 'ApiResponseError';
  }
}
