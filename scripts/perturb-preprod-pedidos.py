"""Negative detector controls. Never invoked for a frozen acceptance candidate."""
from pathlib import Path
import sys,json,hashlib
root=Path(sys.argv[1]).resolve();mode=sys.argv[2]
if root==Path(__file__).resolve().parents[1]:raise SystemExit('Refusing live ERP perturbation')
changes=[]
def edit(name,fn):
 p=root/name;s=p.read_text();v=fn(s)
 if s==v:raise SystemExit('Negative anchor missing: '+name)
 p.write_text(v);changes.append({'path':name,'before':hashlib.sha256(s.encode()).hexdigest(),'after':hashlib.sha256(v.encode()).hexdigest()})
if mode=='no-recovery':
 def disable(s):
  import re
  s=s.replace('import { reconcileRealtimeQuery } from "../../lib/realtimeRecovery";','')
  s,n=re.subn(r'void reconcileRealtimeQuery\(queryClient, \[\s*"branch-orders",\s*activeFilters,?\s*\]\);','/* Diagnostic negative: intentionally no reconnect reconciliation. */',s)
  if n!=1:raise SystemExit('Expected one recovery call')
  return s
 edit('frontend/src/features/pedidos/PedidosPage.tsx',disable)
 edit('frontend/e2e/pedidos-recovery-observer.ts',lambda s:s+'\nqueryClient.setDefaultOptions({queries:{...queryClient.getDefaultOptions().queries,refetchOnReconnect:false}});\n')
elif mode=='stale-priority':
 edit('frontend/e2e/pedidos-recovery-observer.ts',lambda s:s.replace('return body;','''   const expected=(globalThis as unknown as {__uatStalePriority?:string}).__uatStalePriority;
   if(expected && !orders.some(x=>x.id===expected)) {
    const active=queryClient.getQueryCache().getAll().find(q=>q.queryKey[0]==="branch-orders" && q.getObserversCount()>0);
    if(active)queryClient.setQueryData(active.queryKey,body.data ?? body);
   }
   return body;'''))
elif mode=='dom-snapshot':
 edit('frontend/src/features/pedidos/PedidosPage.tsx',lambda s:s.replace('  const orders = ordersQuery.data?.items ?? [];','''  const frozenOrders = useRef<SaleOrder[] | null>(null);
  if (!frozenOrders.current && ordersQuery.data?.items.length) frozenOrders.current=ordersQuery.data.items;
  const orders = frozenOrders.current ?? [];'''))
else:raise SystemExit('Unknown diagnostic mutant')
print(json.dumps({'mode':mode,'changes':changes},indent=2))
