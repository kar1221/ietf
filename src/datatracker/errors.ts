import type { $ZodIssue } from 'zod/v4/core';

export class DatatrackerError extends Error {
  public readonly statusCode: number;
  public readonly path: string;

  public constructor(statusCode: number, path: string) {
    super(`datatracker ${statusCode.toString()} on ${path}`);
    this.name = 'DatatrackerError';

    this.statusCode = statusCode;
    this.path = path;
  }
}

export class ApiResponseError extends Error {
  public constructor(path: string, issues: $ZodIssue[]) {
    let errors = `[${path}]: `;

    let issue = issues.map((i) => i.message.padStart(errors.length)).join('\n');

    super(errors.concat(issue));

    this.name = 'ApiResponseError';
  }
}
