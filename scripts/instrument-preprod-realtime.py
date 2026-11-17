"""Opt-in diagnostic transform: owned copy only; never edit the repository."""
from pathlib import Path
import hashlib,json,sys
root=Path(sys.argv[1]).resolve()
if root==Path(__file__).resolve().parents[1]:raise SystemExit('Refusing live repository transform')
changes=[]
for name in ['sales','fleet','cedis']:
 p=root/f'frontend/src/lib/{name}Socket.ts';original=p.read_text()
 scope='originLocationId' if name=='fleet' else 'locationId'
 needle='const socket = this.getSocket();'
 if original.count(needle)!=1:raise SystemExit('Diagnostic anchor mismatch: '+name)
 updated='import { instrumentRealtime } from "../../e2e/realtime-diagnostics";\n'+original.replace(needle,needle+f'\n    instrumentRealtime(socket, "{name}", {scope}, Boolean(token));')
 p.write_text(updated);changes.append({'path':str(p.relative_to(root)),'original':hashlib.sha256(original.encode()).hexdigest(),'instrumented':hashlib.sha256(updated.encode()).hexdigest()})
for path,name in [('pedidos/PedidosPage.tsx','PedidosPage'),('fleet/pages/FleetLivePage.tsx','FleetLivePage'),('cedis/CedisIncomingSuppliesPage.tsx','CedisIncomingSuppliesPage')]:
 p=root/'frontend/src/features'/path;original=p.read_text();needle=f'export function {name}() {{'
 if original.count(needle)!=1:raise SystemExit('Page diagnostic anchor mismatch: '+name)
 relative='../../../../e2e/realtime-diagnostics' if name=='FleetLivePage' else '../../../e2e/realtime-diagnostics'
 updated=f'import {{ useEffect as useUatLifecycle }} from "react";\nimport {{ traceRealtime }} from "{relative}";\n'+original.replace(needle,needle+f'\n useUatLifecycle(() => {{traceRealtime({{name:"{name}",phase:"mount"}}); return () => traceRealtime({{name:"{name}",phase:"unmount"}});}}, []);')
 p.write_text(updated);changes.append({'path':str(p.relative_to(root)),'original':hashlib.sha256(original.encode()).hexdigest(),'instrumented':hashlib.sha256(updated.encode()).hexdigest()})
p=root/'frontend/src/features/auth/AuthProvider.tsx';original=p.read_text()
needle='  const user = session?.user ?? null;'
if original.count(needle)!=1:raise SystemExit('Auth diagnostic anchor mismatch')
updated='import { traceRealtime } from "../../../e2e/realtime-diagnostics";\n'+original.replace(needle,needle+"\n  useEffect(() => { traceRealtime({name:'AuthProvider',phase:'state',status,tokenPresent:Boolean(accessToken),role:session?.user.role ?? null}); }, [status,accessToken,session?.user.role]);")
p.write_text(updated);changes.append({'path':str(p.relative_to(root)),'original':hashlib.sha256(original.encode()).hexdigest(),'instrumented':hashlib.sha256(updated.encode()).hexdigest()})
p=root/'frontend/src/lib/queryClient.ts';original=p.read_text()
updated=original+"\nObject.assign(globalThis, { __uatQuerySnapshot: () => queryClient.getQueryCache().getAll().filter(q => /fleet|sales|cedis/i.test(JSON.stringify(q.queryKey))).map(q => ({key:q.queryKey,status:q.state.status,fetchStatus:q.state.fetchStatus,updatedAt:q.state.dataUpdatedAt,hasData:q.state.data !== undefined})) });\n"
p.write_text(updated);changes.append({'path':str(p.relative_to(root)),'original':hashlib.sha256(original.encode()).hexdigest(),'instrumented':hashlib.sha256(updated.encode()).hexdigest()})
print(json.dumps(changes,indent=2))
