// Thrown when a capability is used before the connection or budget is ready.
export class NotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotReadyError";
  }
}
