/**
 * Augment Express Request for req.user set by auth middleware.
 */
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email?: string };
    }
  }
}

export {};
