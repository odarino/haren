export class AppError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "CONFLICT" | "VALIDATION" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }

  get statusCode(): number {
    switch (this.code) {
      case "NOT_FOUND": return 404;
      case "CONFLICT": return 409;
      case "VALIDATION": return 400;
      case "FORBIDDEN": return 403;
    }
  }
}

export function handleAppError(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.statusCode },
    );
  }
  console.error("Unhandled error:", error);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
