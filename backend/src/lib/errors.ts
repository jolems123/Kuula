/**
 * ApiError — single error class for the whole backend. Carries an HTTP status
 * and a public-safe message. Thrown from any handler/middleware; the global
 * error handler turns it into a JSON response.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    message: string,
    opts: { code?: string; details?: unknown } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = opts.code ?? "error";
    this.details = opts.details;
  }

  static bad(msg: string, details?: unknown)    { return new ApiError(400, msg, { code: "bad_request", details }); }
  static unauthorized(msg = "Unauthorized")     { return new ApiError(401, msg, { code: "unauthorized" }); }
  static forbidden(msg = "Forbidden")           { return new ApiError(403, msg, { code: "forbidden" }); }
  static notFound(msg = "Not found")            { return new ApiError(404, msg, { code: "not_found" }); }
  static conflict(msg: string, details?: unknown) { return new ApiError(409, msg, { code: "conflict", details }); }
  static unprocessable(msg: string, details?: unknown) { return new ApiError(422, msg, { code: "unprocessable", details }); }
  static rateLimited(msg = "Too many requests, slow down.") { return new ApiError(429, msg, { code: "rate_limited" }); }
  static internal(msg = "Internal server error") { return new ApiError(500, msg, { code: "internal" }); }
  static badGateway(msg = "Upstream provider error") { return new ApiError(502, msg, { code: "bad_gateway" }); }
}
