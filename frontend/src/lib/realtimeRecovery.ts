import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** Cancel first: invalidation alone can reuse an initial in-flight stale read. */
export async function reconcileRealtimeQuery(
  client: QueryClient,
  queryKey: QueryKey,
) {
  await client.cancelQueries({ queryKey });
  await client.invalidateQueries({ queryKey });
}

type RecoverableSocket = {
  connected: boolean;
  connect(): unknown;
  on(event: "disconnect", handler: (reason: string) => void): unknown;
  off(event: "disconnect", handler: (reason: string) => void): unknown;
};

/** One authenticated attempt per subscription. Never rotate or replay credentials. */
export function installSessionRecovery(
  socket: RecoverableSocket,
  token: string,
) {
  let disposed = false;
  let attempted = false;
  const abort = new AbortController();
  const onDisconnect = (reason: string) => {
    if (reason !== "io server disconnect" || attempted || disposed) return;
    attempted = true;
    const api = (
      import.meta.env.VITE_API_BASE_URL ??
      import.meta.env.VITE_API_URL ??
      "/api"
    ).replace(/\/$/, "");
    void fetch(`${api}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
      credentials: "omit",
      signal: abort.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as {
          success?: boolean;
          data?: { user?: { id?: string; mustChangePassword?: boolean } };
        };
        if (
          body.success === true &&
          body.data?.user?.id &&
          !body.data.user.mustChangePassword &&
          !disposed &&
          !socket.connected
        )
          socket.connect();
      })
      .catch(() => {
        /* No recursive retry; token renewal or navigation can resubscribe. */
      });
  };
  socket.on("disconnect", onDisconnect);
  return () => {
    disposed = true;
    abort.abort();
    socket.off("disconnect", onDisconnect);
  };
}
