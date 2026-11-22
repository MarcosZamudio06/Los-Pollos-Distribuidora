import { describe, it, expect, vi, afterEach } from "vitest";
import { installSessionRecovery } from "../realtimeRecovery";
afterEach(() => vi.unstubAllGlobals());
describe("REV-005 bounded authenticated namespace recovery", () => {
  it.each([200, 401, 403])(
    "HTTP %s never rotates tokens and only valid sessions reconnect once",
    async (status) => {
      let handler!: (reason: string) => void;
      const socket = {
        connected: false,
        connect: vi.fn(),
        on: vi.fn((_e, h) => {
          handler = h;
        }),
        off: vi.fn(),
      };
      const fetch = vi
        .fn()
        .mockResolvedValue({
          ok: status === 200,
          json: async () => ({
            success: true,
            data: { user: { id: "user", mustChangePassword: false } },
          }),
        });
      vi.stubGlobal("fetch", fetch);
      const cleanup = installSessionRecovery(socket, "original-token");
      handler("transport close");
      expect(fetch).not.toHaveBeenCalled();
      handler("io server disconnect");
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      await vi.waitFor(() =>
        expect(socket.connect).toHaveBeenCalledTimes(status === 200 ? 1 : 0),
      );
      handler("io server disconnect");
      await Promise.resolve();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        "/api/auth/me",
        expect.objectContaining({
          credentials: "omit",
          headers: { authorization: "Bearer original-token" },
        }),
      );
      cleanup();
      expect(socket.off).toHaveBeenCalledWith("disconnect", handler);
    },
  );
  it("cleanup suppresses a late valid response", async () => {
    let finish!: (v: unknown) => void, handler!: (r: string) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((r) => (finish = r))),
    );
    const socket = {
      connected: false,
      connect: vi.fn(),
      on: vi.fn((_e, h) => {
        handler = h;
      }),
      off: vi.fn(),
    };
    const stop = installSessionRecovery(socket, "token");
    handler("io server disconnect");
    stop();
    finish({
      ok: true,
      json: async () => ({ success: true, data: { user: { id: "user" } } }),
    });
    await Promise.resolve();
    expect(socket.connect).not.toHaveBeenCalled();
  });
});
