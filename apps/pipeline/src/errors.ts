export class ReconcileError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ReconcileError';
  }
}
