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
