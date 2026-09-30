// Thrown when a capability is used before the connection or budget is ready.
export class NotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotReadyError";
  }
}

// Thrown when a requested resource does not exist. The message is bridge-authored and safe to send.
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

// An @actual-app/api error the bridge has no mapping for. Sent as a generic 500.
export class ActualApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActualApiError";
  }
}

// Thrown when a request body refers to something that does not exist, such as an unknown
// category id. The message is bridge-authored and safe to send.
export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}
