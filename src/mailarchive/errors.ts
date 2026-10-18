export class HttpError extends Error {
  public constructor(statusCode: number, endPoint: string) {
    super(`Http ${statusCode.toString()} for ${endPoint}`);
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
