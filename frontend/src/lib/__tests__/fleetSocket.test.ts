import { beforeEach, describe, expect, it, vi } from "vitest";
import { io } from "socket.io-client";
import {
  FLEET_POSITION_UPDATED_EVENT,
  fleetSocket,
  getFleetSocketUrl,
} from "../fleetSocket";

vi.mock("socket.io-client", () => ({
  io: vi.fn(),
}));

describe("fleetSocket", () => {
  const socket = {
    auth: {},
    connected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    io: { on: vi.fn(), off: vi.fn() },
    off: vi.fn(),
    on: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(io).mockReturnValue(socket as never);
  });

  it("uses the fleet namespace and shared Socket.IO path", () => {
    expect(getFleetSocketUrl()).toBe("/fleet");
    const cleanup = fleetSocket.subscribe("access-token", undefined, {
      onPositionUpdated: vi.fn(),
    });

    expect(io).toHaveBeenCalledWith(
      "/fleet",
      expect.objectContaining({
        autoConnect: false,
        path: "/api/socket.io",
        reconnection: true,
      }),
    );
    expect(socket.auth).toEqual({ token: "access-token" });
    cleanup();
  });

  it("removes handlers and disconnects on cleanup", () => {
    const onPositionUpdated = vi.fn();
    const onConnected = vi.fn();
    const onReconnecting = vi.fn();
    const cleanup = fleetSocket.subscribe("access-token", "origin-1", {
      onPositionUpdated,
      onConnected,
      onReconnecting,
    });

    cleanup();

    expect(socket.off).toHaveBeenCalledWith(
      FLEET_POSITION_UPDATED_EVENT,
      onPositionUpdated,
    );
    expect(socket.off).toHaveBeenCalledWith("connect", onConnected);
    expect(socket.io.off).toHaveBeenCalledWith(
      "reconnect_attempt",
      onReconnecting,
    );
    expect(socket.disconnect).toHaveBeenCalled();
  });
});
