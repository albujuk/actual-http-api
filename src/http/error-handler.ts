import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { NotFoundError, NotReadyError } from "../actual/errors.js";

// Maps errors to JSON { error }. 5xx responses never carry the raw message.
export function errorHandler(err: FastifyError, req: FastifyRequest, reply: FastifyReply): void {
  if (err instanceof NotReadyError) {
    reply.code(503).send({ error: "not ready" });
    return;
  }
  if (err instanceof NotFoundError) {
    reply.code(404).send({ error: err.message });
    return;
  }
  const status = err.statusCode ?? 500;
  if (status < 500) {
    reply.code(status).send({ error: err.message });
    return;
  }
  req.log.error(err);
  reply.code(500).send({ error: "internal error" });
}

export function notFoundHandler(_req: FastifyRequest, reply: FastifyReply): void {
  reply.code(404).send({ error: "not found" });
}
