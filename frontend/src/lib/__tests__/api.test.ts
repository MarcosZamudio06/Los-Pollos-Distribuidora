import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiClientError,
  createApiClient,
  parseRetryAfterHeader,
} from "../api";

describe("api client error metadata", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves the Retry-After delay from a throttled response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: "RATE_LIMIT_EXCEEDED",
            message: "Too many requests",
            statusCode: 429,
            success: false,
          }),
          {
            headers: {
              "content-type": "application/json",
              "Retry-After": "120",
            },
            status: 429,
          },
        ),
      ),
    );

    const error = await createApiClient("/api")
      .post("/auth/login", { body: { email: "user@example.com" } })
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      payload: {
        error: "RATE_LIMIT_EXCEEDED",
      },
      retryAfterSeconds: 120,
      statusCode: 429,
    });
  });

  it("parses an HTTP-date Retry-After value into seconds", () => {
    const now = Date.parse("Wed, 21 Oct 2015 07:28:00 GMT");

    expect(
      parseRetryAfterHeader("Wed, 21 Oct 2015 07:30:00 GMT", now),
    ).toBe(120);
  });
});
