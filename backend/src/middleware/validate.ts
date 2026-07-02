/**
 * Zod schema validator for request body / query / params.
 *
 *   router.post("/loans/apply", validate({ body: applySchema }), handler);
 *
 * On failure, returns 400 with `{ error, code: "validation_error", details }`
 * where details is the zod flattened error.
 */
import type { NextFunction, Request, Response, RequestHandler } from "express";
import { ZodError, type ZodSchema } from "zod";
import { ApiError } from "../lib/errors.js";

interface Schemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function validate(schemas: Schemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body)   req.body   = schemas.body.parse(req.body);
      if (schemas.query)  req.query  = schemas.query.parse(req.query) as Record<string, string>;
      if (schemas.params) req.params = schemas.params.parse(req.params) as Record<string, string>;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(new ApiError(400, "Validation error", {
          code: "validation_error",
          details: err.flatten(),
        }));
      }
      next(err);
    }
  };
}
