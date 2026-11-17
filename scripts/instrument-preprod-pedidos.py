"""Install passive Pedidos observations only in a runner-owned source copy."""
from pathlib import Path
import hashlib,json,sys
root=Path(sys.argv[1]).resolve()
if root==Path(__file__).resolve().parents[1]:raise SystemExit('Refusing live ERP transform')
changes=[]
def edit(name,needle,replacement):
 p=root/name;s=p.read_text()
 if s.count(needle)!=1:raise SystemExit('Observer anchor mismatch: '+name)
 updated=s.replace(needle,replacement);p.write_text(updated)
 changes.append({'path':name,'before':hashlib.sha256(s.encode()).hexdigest(),'after':hashlib.sha256(updated.encode()).hexdigest()})
edit('frontend/src/main.tsx','import { StrictMode }','import "../e2e/pedidos-recovery-observer";\nimport { StrictMode }')
edit('frontend/src/features/pedidos/PedidosPage.tsx','import { reconcileRealtimeQuery }','import { observeOrdersConnection, observeOrdersLifecycle } from "../../../e2e/pedidos-recovery-observer";\nimport { reconcileRealtimeQuery }')
edit('frontend/src/features/pedidos/PedidosPage.tsx','      onConnected: () => {','      onConnected: () => {\n        observeOrdersConnection(activeFilters);')
edit('frontend/src/features/pedidos/PedidosPage.tsx','export function PedidosPage() {','export function PedidosPage() {\n  useEffect(() => { observeOrdersLifecycle("mount"); return () => observeOrdersLifecycle("unmount"); }, []);')
edit('frontend/src/features/pedidos/PedidosPage.tsx','      onDisconnected: () => setConnectionStatus("disconnected"),','      onDisconnected: () => { observeOrdersLifecycle("onDisconnected"); setConnectionStatus("disconnected"); },')
edit('frontend/src/lib/salesSocket.ts','import { installSessionRecovery }','import { observeOrdersSocket } from "../../e2e/pedidos-recovery-observer";\nimport { installSessionRecovery }')
edit('frontend/src/lib/salesSocket.ts','    const socket = this.getSocket();','    const socket = this.getSocket();\n    observeOrdersSocket(socket);')
print(json.dumps(changes,indent=2))
