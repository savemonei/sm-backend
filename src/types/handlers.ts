/**
 * Re-export Express core types so handlers use consistent definitions.
 * Avoids TS resolving global Request/Response (fetch) on Vercel (TS 5.9).
 */
import type {
  Request as CoreRequest,
  Response as CoreResponse,
  NextFunction as CoreNextFunction,
} from "express-serve-static-core";

export type Request = CoreRequest;
export type Response = CoreResponse;
export type NextFunction = CoreNextFunction;

/** Request with optional user set by auth middleware (see types/express.d.ts). */
export type RequestWithUser = CoreRequest & { user?: { id: string; email?: string } };
