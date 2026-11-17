"""Safe CEDIS lifecycle observations, only in an explicitly disposable source copy."""
from pathlib import Path
import hashlib,json,sys
root=Path(sys.argv[1]).resolve()
if root==Path(__file__).resolve().parents[1]:raise SystemExit('Refusing live ERP transform')
changes=[]
def edit(name,needle,replacement):
 p=root/name;s=p.read_text()
 if s.count(needle)!=1:raise SystemExit('CEDIS observer anchor mismatch: '+name)
 t=s.replace(needle,replacement);p.write_text(t)
 changes.append({'path':name,'before':hashlib.sha256(s.encode()).hexdigest(),'after':hashlib.sha256(t.encode()).hexdigest()})
helper='''
export function cedisTrace(phase: string, details: Record<string, unknown> = {}) {
  const g = globalThis as unknown as { __cedisTrace?: unknown[] };
  (g.__cedisTrace ??= []).push({ phase, at: Date.now(), ...details });
}
let subscriptionSequence = 0;
'''
edit('frontend/src/lib/cedisSocket.ts','class CedisSocketClient {',helper+'\nclass CedisSocketClient {')
edit('frontend/src/lib/cedisSocket.ts','    const socket = this.getSocket();','''    const socket = this.getSocket();
    const subscription = ++subscriptionSequence;
    cedisTrace("subscribe", { subscription, locationId, tokenPresent: Boolean(token), shouldReconnect, connected: socket.connected, active: socket.active });
''')
edit('frontend/src/lib/cedisSocket.ts','    const connected = () => {','''    const connected = () => {
      cedisTrace("connect", { subscription, id: socket.id, locationId, connected: socket.connected });''')
edit('frontend/src/lib/cedisSocket.ts','    const disconnected = () => handlers.onConnectionState?.("disconnected");','''    const disconnected = (reason: string) => { cedisTrace("disconnect", { subscription, reason }); handlers.onConnectionState?.("disconnected"); };''')
edit('frontend/src/lib/cedisSocket.ts','    const error = () => handlers.onConnectionState?.("error");','''    const error = () => { cedisTrace("connect_error", { subscription }); handlers.onConnectionState?.("error"); };''')
edit('frontend/src/lib/cedisSocket.ts','    if (!socket.connected) socket.connect();','''    if (!socket.connected) { cedisTrace("connect-call", { subscription, locationId, tokenPresent: Boolean(token) }); socket.connect(); }''')
edit('frontend/src/lib/cedisSocket.ts','      stopRecovery();','''      cedisTrace("cleanup", { subscription, locationId, connected: socket.connected });
      stopRecovery();''')
edit('frontend/src/lib/cedisSocket.ts','    return this.socket;','''    const manager = this.socket.io;
    manager.on("open", () => cedisTrace("engine-open", { namespace: "/cedis", engine: manager.engine?.id }));
    manager.on("close", () => cedisTrace("engine-close"));
    manager.on("error", () => cedisTrace("engine-error"));
    manager.on("reconnect_attempt", () => cedisTrace("reconnect-attempt"));
    cedisTrace("instance-created", { namespace: "/cedis" });
    return this.socket;''')
edit('frontend/src/features/cedis/CedisIncomingSuppliesPage.tsx','import { cedisSocket, type CedisConnectionState }','import { cedisSocket, cedisTrace, type CedisConnectionState }')
edit('frontend/src/features/cedis/CedisIncomingSuppliesPage.tsx','export function CedisIncomingSuppliesPage() {','''export function CedisIncomingSuppliesPage() {
  useEffect(() => { cedisTrace("page-mount"); return () => cedisTrace("page-unmount"); }, []);''')
edit('frontend/src/features/cedis/CedisIncomingSuppliesPage.tsx','    if (!accessToken || !socketLocationId) return undefined;','''    cedisTrace("effect", { tokenPresent: Boolean(accessToken), locationId: socketLocationId, role: user?.role, businessDate });
    if (!accessToken || !socketLocationId) return undefined;''')
edit('frontend/src/features/cedis/CedisIncomingSuppliesPage.tsx','        onConnectionState: setConnection,','''        onConnectionState: (state) => { cedisTrace("visible-state", { state }); setConnection(state); },''')
print(json.dumps(changes,indent=2))
