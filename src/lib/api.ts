import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "./auth";
import { DomainError } from "./errors";

// Wrap a route handler with uniform auth/validation error handling.
export function handler<T extends unknown[]>(
  fn: (...args: T) => Promise<NextResponse | Response>
) {
  return async (...args: T): Promise<NextResponse | Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof AuthError) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }
      if (e instanceof ZodError) {
        return NextResponse.json(
          { error: e.issues.map((i) => i.message).join("; ") },
          { status: 400 }
        );
      }
      if (e instanceof SyntaxError && /JSON/i.test(e.message)) {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
      }
      if (e instanceof DomainError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      console.error(e);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

export class ApiError extends DomainError {
  constructor(message: string, status = 400) {
    super(message, status);
  }
}

export function notFound(msg = "Not found"): never {
  throw new ApiError(msg, 404);
}

export function forbidden(msg = "Not allowed"): never {
  throw new ApiError(msg, 403);
}

export function badRequest(msg: string): never {
  throw new ApiError(msg, 400);
}
