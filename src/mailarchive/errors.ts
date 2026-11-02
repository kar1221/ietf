export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly endPoint: string;

  public constructor(statusCode: number, endPoint: string) {
    super(`Http ${statusCode.toString()} for ${endPoint}`);
    this.name = 'HttpError';

    this.statusCode = statusCode;
    this.endPoint = endPoint;
  }
}

export class ParseError extends Error {
  public readonly hash?: string;

  public constructor(message: string, hash?: string) {
    super(hash ? `${message} (msg ${hash})` : message);
    this.name = 'ParseError';
    this.hash = hash;
  }
}

export class WorkingGroupNotAvailableError extends Error {
  public constructor(workingGroup: string) {
    super(`${workingGroup} cannot be found. Did you fetch it to disk?`);

    this.name = 'WorkingGroupNotAvailableError';
  }
}

export class BadParametersError extends Error {
  public constructor(message: string) {
    super(message);

    this.name = 'BadParametersError';
  }
}
