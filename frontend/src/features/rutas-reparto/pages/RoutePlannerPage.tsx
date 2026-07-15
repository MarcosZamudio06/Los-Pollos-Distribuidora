import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Calculator, Check, Clock3, LocateFixed, MapPinned, PackageCheck, Search, Truck, X } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import { RoutePlannerMap } from '../components/RoutePlannerMap'
import { Card, Field, PageFrame, PageShell, PrimaryButton, SecondaryButton, SelectInput, StatusMessage, TextInput } from '../components/RouteUi'
import { useAddressSearch, useAssignDeliveryRouteOrders, useCreateOptimizedRoute, useCreateRoutePlan, useDeliveryRoute, useReverseAddress, useRoutePlannerCatalog } from '../hooks'
import type { DeliveryRoutePlan, EligibleDeliverySale, GeocodingResult, RoutePlanStopInput } from '../types'

type DraftStop = Omit<RoutePlanStopInput, 'latitude' | 'longitude'> & { latitude?: number; longitude?: number; customerName: string; saleNumber: string }

function errorMessage(error: unknown, fallback: string) { return error instanceof Error && error.message ? error.message : fallback }
function distance(value?: number) { return value == null ? '—' : value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${value} m` }
function duration(value?: number) { if (value == null) return '—'; const hours = Math.floor(value / 3600); const minutes = Math.round((value % 3600) / 60); return hours ? `${hours} h ${minutes} min` : `${minutes} min` }

export function RoutePlannerPage() {
  const navigate = useNavigate()
  const { routeId } = useParams()
  const initializedRoute = useRef(false)
  const [form, setForm] = useState({ name: '', scheduledDate: new Date().toISOString().slice(0, 10), originLocationId: '', driverId: '' })
  const [salesSearch, setSalesSearch] = useState('')
  const [stops, setStops] = useState<DraftStop[]>([])
  const [activeSaleId, setActiveSaleId] = useState<string>()
  const activeSaleIdRef = useRef<string | undefined>(undefined)
  const [addressQuery, setAddressQuery] = useState('')
  const [addressResultsBySale, setAddressResultsBySale] = useState<Record<string, GeocodingResult[]>>({})
  const addressSearchRequestBySale = useRef(new Map<string, number>())
  const reverseRequestBySale = useRef(new Map<string, number>())
  const [plan, setPlan] = useState<DeliveryRoutePlan | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const [confirming, setConfirming] = useState(false)
  const catalog = useRoutePlannerCatalog(salesSearch)
  const addressSearch = useAddressSearch()
  const reverseAddress = useReverseAddress()
  const createPlan = useCreateRoutePlan()
  const createRoute = useCreateOptimizedRoute()
  const assignPlan = useAssignDeliveryRouteOrders(routeId ?? '')
  const existingRoute = useDeliveryRoute(routeId)
  const isReoptimization = Boolean(routeId)
  const sales = catalog.sales.data?.items ?? []
  const origin = catalog.locations.data?.find((location) => location.id === form.originLocationId)
  const activeStop = stops.find((stop) => stop.saleId === activeSaleId)
  const addressResults = activeSaleId ? addressResultsBySale[activeSaleId] ?? [] : []
  const existingSaleIds = useMemo(() => new Set((existingRoute.data?.orders ?? []).map((order) => order.saleId).filter(Boolean)), [existingRoute.data?.orders])
  const locatedStops = stops.filter((stop): stop is DraftStop & { latitude: number; longitude: number } => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude))
  const canCalculate = Boolean((isReoptimization || form.name.trim()) && form.driverId && form.scheduledDate && origin?.latitude != null && origin?.longitude != null && stops.length && locatedStops.length === stops.length)
  const orderedStops = useMemo(() => plan ? [...stops].sort((a, b) => (plan.orderedStops.find((item) => item.saleId === a.saleId)?.sequence ?? 999) - (plan.orderedStops.find((item) => item.saleId === b.saleId)?.sequence ?? 999)) : stops, [plan, stops])

  function invalidatePlan() { setPlan(null); setIdempotencyKey(''); setConfirming(false) }
  function activateSale(saleId?: string) { activeSaleIdRef.current = saleId; setActiveSaleId(saleId) }
  function invalidateSaleAsync(saleId: string) {
    addressSearchRequestBySale.current.set(saleId, (addressSearchRequestBySale.current.get(saleId) ?? 0) + 1)
    reverseRequestBySale.current.set(saleId, (reverseRequestBySale.current.get(saleId) ?? 0) + 1)
    setAddressResultsBySale((current) => {
      const next = { ...current }
      delete next[saleId]
      return next
    })
  }
  useEffect(() => {
    const route = existingRoute.data
    if (!routeId || !route || initializedRoute.current) return
    initializedRoute.current = true
    setForm({ name: route.name, driverId: route.driverId ?? '', originLocationId: route.originLocationId ?? '', scheduledDate: route.scheduledDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10) })
    setStops((route.orders ?? []).map((order) => ({
      saleId: order.saleId ?? '', saleNumber: order.saleNumber ?? order.saleId ?? 'Venta', customerName: order.customerName ?? 'Cliente de ruta',
      accountReceivableId: order.accountReceivableId ?? undefined, deliveryAddress: order.deliveryAddress ?? '',
      latitude: order.latitude ?? undefined, longitude: order.longitude ?? undefined,
    })).filter((stop) => stop.saleId))
  }, [existingRoute.data, routeId])
  function changeForm(key: keyof typeof form, value: string) { setForm((current) => ({ ...current, [key]: value })); invalidatePlan() }
  function toggleSale(sale: EligibleDeliverySale) {
    if (stops.some((stop) => stop.saleId === sale.saleId)) {
      invalidateSaleAsync(sale.saleId); setStops((current) => current.filter((stop) => stop.saleId !== sale.saleId)); if (activeSaleId === sale.saleId) activateSale(undefined)
    } else {
      setStops((current) => [...current, { saleId: sale.saleId, saleNumber: sale.saleNumber, customerName: sale.customerName, accountReceivableId: sale.accountReceivableId ?? undefined, deliveryAddress: sale.suggestedDeliveryAddress }]);
      activateSale(sale.saleId); setAddressQuery(sale.suggestedDeliveryAddress)
      setAddressResultsBySale((current) => ({ ...current, [sale.saleId]: [] }))
    }
    invalidatePlan()
  }
  function applyAddress(saleId: string, result: GeocodingResult) {
    setStops((current) => current.map((stop) => stop.saleId === saleId ? { ...stop, deliveryAddress: result.label, latitude: result.latitude, longitude: result.longitude, geocoderOsmType: result.osmType ?? undefined, geocoderOsmId: result.osmId ?? undefined } : stop))
    if (activeSaleIdRef.current === saleId) setAddressQuery(result.label)
    setAddressResultsBySale((current) => ({ ...current, [saleId]: [] })); invalidatePlan()
  }
  async function searchAddress() {
    const saleId = activeSaleIdRef.current
    const query = addressQuery.trim()
    if (!saleId || query.length < 3) return
    const requestId = (addressSearchRequestBySale.current.get(saleId) ?? 0) + 1
    addressSearchRequestBySale.current.set(saleId, requestId)
    try {
      const result = await addressSearch.mutateAsync({ q: query, latitude: origin?.latitude == null ? undefined : Number(origin.latitude), longitude: origin?.longitude == null ? undefined : Number(origin.longitude) })
      if (addressSearchRequestBySale.current.get(saleId) !== requestId) return
      setAddressResultsBySale((current) => ({ ...current, [saleId]: result.items }))
    }
    catch (error) { if (addressSearchRequestBySale.current.get(saleId) === requestId && activeSaleIdRef.current === saleId) toast.error(errorMessage(error, 'El buscador de direcciones no está disponible.')) }
  }
  async function moveStop(saleId: string, latitude: number, longitude: number) {
    activateSale(saleId); setStops((current) => current.map((stop) => stop.saleId === saleId ? { ...stop, latitude, longitude } : stop)); invalidatePlan()
    const requestId = (reverseRequestBySale.current.get(saleId) ?? 0) + 1
    reverseRequestBySale.current.set(saleId, requestId)
    try { const result = await reverseAddress.mutateAsync({ latitude, longitude }); if (reverseRequestBySale.current.get(saleId) !== requestId) return; setStops((current) => current.map((stop) => stop.saleId === saleId ? { ...stop, deliveryAddress: result.label, geocoderOsmType: result.osmType ?? undefined, geocoderOsmId: result.osmId ?? undefined } : stop)); if (activeSaleIdRef.current === saleId) setAddressQuery(result.label) }
    catch { if (reverseRequestBySale.current.get(saleId) === requestId && activeSaleIdRef.current === saleId) toast.warning('El punto quedó colocado, pero no fue posible obtener una dirección legible.') }
  }
  async function calculate() {
    if (!canCalculate) return
    try {
      const result = await createPlan.mutateAsync({ routeId, driverId: form.driverId, scheduledDate: form.scheduledDate, originLocationId: form.originLocationId, stops: locatedStops.map((stop) => ({ saleId: stop.saleId, accountReceivableId: stop.accountReceivableId, deliveryAddress: stop.deliveryAddress, latitude: stop.latitude, longitude: stop.longitude, geocoderOsmType: stop.geocoderOsmType, geocoderOsmId: stop.geocoderOsmId })) })
      setPlan(result); setIdempotencyKey(crypto.randomUUID()); toast.success('Ruta calculada. Revisa el orden y el recorrido antes de crearla.')
    } catch (error) { toast.error(errorMessage(error, 'No fue posible calcular la ruta.')) }
  }
  async function confirmCreation() {
    if (!plan || new Date(plan.expiresAt) <= new Date()) { invalidatePlan(); toast.error('El plan expiró. Calcula nuevamente la ruta.'); return }
    try {
      if (routeId) {
        const route = await assignPlan.mutateAsync({ routePlanId: plan.id })
        toast.success('Ruta reoptimizada con las nuevas entregas.'); navigate(`/delivery-routes/${route.id}`)
      } else {
        const route = await createRoute.mutateAsync({ payload: { name: form.name.trim(), driverId: form.driverId, scheduledDate: form.scheduledDate, originLocationId: form.originLocationId, routePlanId: plan.id }, idempotencyKey })
        toast.success('Ruta creada y asignada.'); navigate(`/delivery-routes/${route.id}`)
      }
    } catch (error) { toast.error(errorMessage(error, 'No fue posible crear la ruta. El plan permanece disponible para reintentar.')); throw error }
  }

  return <PageShell><PageFrame>
    {existingRoute.isLoading && <StatusMessage>Cargando ruta para reoptimizar…</StatusMessage>}{existingRoute.error && <StatusMessage tone="error">No fue posible cargar la ruta seleccionada.</StatusMessage>}
    <header className="overflow-hidden rounded-[1.8rem] border border-black/10 bg-[var(--erp-charcoal)] text-white shadow-[0_24px_80px_rgba(17,24,21,.18)]">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_auto]"><div className="p-6 sm:p-8"><button className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.16em] text-white/65 hover:text-white" onClick={() => navigate('/delivery-routes')}><ArrowLeft className="h-4 w-4"/>Volver a rutas</button><p className="mt-7 text-xs font-black uppercase tracking-[.22em] text-[var(--erp-brand-gold-soft)]">Mesa de despacho · {isReoptimization ? 'Reoptimización' : 'Planeación'}</p><h1 className="mt-2 text-3xl font-black tracking-[-.055em] sm:text-4xl">{isReoptimization ? 'Integra nuevas entregas sin dejar un mapa obsoleto' : 'Construye el recorrido antes de mover una unidad'}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-white/70">Selecciona ventas confirmadas, valida cada punto y aprueba el trazado vial que verá el repartidor.</p></div><div className="grid min-w-64 grid-cols-3 border-t border-white/10 bg-white/[.04] lg:grid-cols-1 lg:border-l lg:border-t-0"><div className="p-4"><span className="text-[10px] font-black uppercase tracking-[.18em] text-white/45">Paradas</span><p className="mt-1 text-xl font-black">{stops.length}</p></div><div className="border-l border-white/10 p-4 lg:border-l-0 lg:border-t"><span className="text-[10px] font-black uppercase tracking-[.18em] text-white/45">Distancia</span><p className="mt-1 text-xl font-black text-[var(--erp-brand-gold-soft)]">{distance(plan?.distanceMeters)}</p></div><div className="border-l border-white/10 p-4 lg:border-l-0 lg:border-t"><span className="text-[10px] font-black uppercase tracking-[.18em] text-white/45">Tiempo</span><p className="mt-1 text-xl font-black">{duration(plan?.durationSeconds)}</p></div></div></div>
    </header>

    <div className="grid gap-5 xl:grid-cols-[23rem_minmax(0,1fr)]">
      <aside className="grid content-start gap-4">
        <Card className="p-5"><p className="text-xs font-black uppercase tracking-[.18em] text-[var(--erp-brand-red)]">01 · Datos de salida</p><div className="mt-4 grid gap-4"><Field label="Nombre de la ruta"><TextInput disabled={isReoptimization} value={form.name} onChange={(e) => changeForm('name', e.target.value)} placeholder="Ruta Centro matutina"/></Field><Field label="Fecha programada"><TextInput disabled={isReoptimization} type="date" value={form.scheduledDate} onChange={(e) => changeForm('scheduledDate', e.target.value)}/></Field><Field label="Origen"><SelectInput disabled={isReoptimization} value={form.originLocationId} onChange={(e) => changeForm('originLocationId', e.target.value)}><option value="">Selecciona ubicación</option>{(catalog.locations.data ?? []).map((location) => <option key={location.id} value={location.id}>{location.name}{location.latitude == null ? ' · sin coordenadas' : ''}</option>)}</SelectInput></Field><Field label="Repartidor"><SelectInput disabled={isReoptimization} value={form.driverId} onChange={(e) => changeForm('driverId', e.target.value)}><option value="">Selecciona repartidor</option>{(catalog.drivers.data ?? []).map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</SelectInput></Field></div>{(catalog.drivers.error || catalog.locations.error) && <div className="mt-4"><StatusMessage tone="error">No se pudo cargar el catálogo operativo.</StatusMessage></div>}{origin && origin.latitude == null && <div className="mt-4"><StatusMessage tone="error">Este origen no tiene coordenadas. Configúralas antes de optimizar.</StatusMessage></div>}</Card>
        <Card className="p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.18em] text-[var(--erp-brand-red)]">02 · Ventas elegibles</p><p className="mt-1 text-xs text-[var(--erp-muted-foreground)]">Solo confirmadas y sin ruta.</p></div><PackageCheck className="h-5 w-5 text-[var(--erp-brand-gold-deep)]"/></div><div className="relative mt-4"><Search className="absolute left-3 top-3 h-4 w-4 text-[var(--erp-muted-foreground)]"/><TextInput className="pl-9" placeholder="Folio o cliente" value={salesSearch} onChange={(e) => setSalesSearch(e.target.value)}/></div><div className="mt-3 max-h-64 space-y-2 overflow-auto pr-1">{catalog.sales.isLoading && <p className="p-3 text-sm text-[var(--erp-muted-foreground)]">Buscando ventas…</p>}{!catalog.sales.isLoading && sales.length === 0 && <p className="p-3 text-sm text-[var(--erp-muted-foreground)]">No hay ventas elegibles.</p>}{sales.map((sale) => { const selected = stops.some((stop) => stop.saleId === sale.saleId); return <button aria-pressed={selected} className={`w-full rounded-xl border p-3 text-left transition focus-visible:ring-4 focus-visible:ring-[var(--erp-ring)] ${selected ? 'border-[var(--erp-brand-red)] bg-[rgba(182,42,34,.06)]' : 'border-[color:var(--erp-border)] bg-white hover:border-[var(--erp-brand-gold)]'}`} key={sale.saleId} onClick={() => toggleSale(sale)}><span className="flex items-center justify-between gap-2"><strong className="text-sm">{sale.saleNumber}</strong>{selected && <Check className="h-4 w-4 text-[var(--erp-brand-red)]"/>}</span><span className="mt-1 block text-xs font-semibold text-[var(--erp-muted-foreground)]">{sale.customerName}</span><span className="mt-1 line-clamp-2 block text-xs text-[var(--erp-muted-foreground)]">{sale.suggestedDeliveryAddress || 'Sin dirección sugerida'}</span></button>})}</div></Card>
      </aside>

      <section className="grid content-start gap-4">
        <div className="relative"><RoutePlannerMap activeSaleId={activeSaleId} origin={origin} plan={plan} stops={locatedStops} onMoveStop={(saleId, lat, lon) => void moveStop(saleId, lat, lon)} onSelectStop={(saleId) => { activateSale(saleId); const stop = stops.find((item) => item.saleId === saleId); setAddressQuery(stop?.deliveryAddress ?? '') }}/><div className="pointer-events-none absolute left-4 top-4 rounded-xl border border-white/50 bg-white/92 px-3 py-2 text-xs font-bold shadow-lg backdrop-blur"><MapPinned className="mr-2 inline h-4 w-4 text-[var(--erp-brand-red)]"/>{activeSaleId ? 'Selecciona el punto de entrega de la venta activa en el mapa' : 'Selecciona una venta para agregar su punto de entrega'}</div></div>
        {activeStop && <Card className="p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-[var(--erp-brand-red)]">Ubicar parada activa</p><h2 className="mt-1 text-lg font-black">{activeStop.saleNumber} · {activeStop.customerName}</h2><p className="mt-1 text-xs text-[var(--erp-muted-foreground)]">La dirección elegida se guarda en la planeación; no modifica el domicilio comercial.</p></div><SecondaryButton disabled={existingSaleIds.has(activeStop.saleId)} onClick={() => { invalidateSaleAsync(activeStop.saleId); setStops((current) => current.filter((stop) => stop.saleId !== activeStop.saleId)); activateSale(undefined); invalidatePlan() }}><X className="h-4 w-4"/> {existingSaleIds.has(activeStop.saleId) ? 'Parada existente' : 'Quitar'}</SecondaryButton></div><div className="mt-4 flex gap-2"><TextInput value={addressQuery} onChange={(e) => setAddressQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void searchAddress() } }} placeholder="Buscar calle, número, colonia y ciudad"/><PrimaryButton disabled={addressSearch.isPending || addressQuery.trim().length < 3} onClick={() => void searchAddress()}><Search className="h-4 w-4"/>{addressSearch.isPending ? 'Buscando…' : 'Buscar'}</PrimaryButton></div>{addressResults.length > 0 && <div className="mt-3 grid gap-2">{addressResults.map((result) => <button className="rounded-xl border border-[color:var(--erp-border)] bg-white p-3 text-left text-sm hover:border-[var(--erp-brand-red)] focus-visible:ring-4 focus-visible:ring-[var(--erp-ring)]" key={`${result.osmType}-${result.osmId}-${result.latitude}`} onClick={() => applyAddress(activeStop.saleId, result)}><strong>{result.label}</strong><span className="mt-1 block font-mono text-[10px] text-[var(--erp-muted-foreground)]">{result.latitude.toFixed(6)}, {result.longitude.toFixed(6)}</span></button>)}</div>}{activeStop.latitude != null && <p className="mt-3 flex items-center gap-2 text-xs font-bold text-[var(--erp-success)]"><LocateFixed className="h-4 w-4"/>Punto validado · {activeStop.latitude.toFixed(6)}, {activeStop.longitude?.toFixed(6)}</p>}</Card>}
        <Card className="overflow-hidden p-0"><div className="flex flex-col gap-3 border-b border-[color:var(--erp-border)] p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-[var(--erp-brand-gold-deep)]">03 · Tira de recorrido</p><h2 className="mt-1 text-xl font-black">Secuencia accesible de entregas</h2></div><div className="flex gap-2"><SecondaryButton disabled={!canCalculate || createPlan.isPending} onClick={() => void calculate()}><Calculator className="h-4 w-4"/>{createPlan.isPending ? 'Calculando…' : plan ? 'Recalcular' : 'Calcular ruta'}</SecondaryButton><PrimaryButton disabled={!plan || createRoute.isPending} onClick={() => setConfirming(true)}><Truck className="h-4 w-4"/>Crear y asignar</PrimaryButton></div></div><ol className="grid gap-0">{orderedStops.length === 0 && <li className="p-6 text-sm text-[var(--erp-muted-foreground)]">Selecciona ventas para construir la secuencia.</li>}{orderedStops.map((stop, index) => { const planned = plan?.orderedStops.find((item) => item.saleId === stop.saleId); return <li key={stop.saleId}><button className={`grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-[color:var(--erp-border)] p-4 text-left last:border-0 focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[var(--erp-ring)] ${activeSaleId === stop.saleId ? 'bg-[rgba(182,42,34,.055)]' : 'bg-white hover:bg-[var(--erp-surface)]'}`} onClick={() => { activateSale(stop.saleId); setAddressQuery(stop.deliveryAddress) }}><span className={`grid h-9 w-9 place-items-center rounded-full text-sm font-black ${stop.latitude == null ? 'bg-[var(--erp-surface-muted)] text-[var(--erp-muted-foreground)]' : 'bg-[var(--erp-brand-gold)] text-[var(--erp-charcoal)]'}`}>{planned?.sequence ?? index + 1}</span><span className="min-w-0"><strong className="block truncate text-sm">{stop.saleNumber} · {stop.customerName}</strong><span className="mt-1 block truncate text-xs text-[var(--erp-muted-foreground)]">{stop.deliveryAddress || 'Dirección pendiente'}</span></span><span className="text-right text-xs font-bold text-[var(--erp-muted-foreground)]">{stop.latitude == null ? 'Ubicar' : planned ? <><span className="block text-[var(--erp-success)]">Optimizada</span><span>{distance(planned.legDistanceMeters)} · {duration(planned.legDurationSeconds)}</span></> : 'Lista'}</span></button></li>})}</ol>{plan && <div className="grid grid-cols-2 gap-px bg-[var(--erp-border)] sm:grid-cols-4"><div className="bg-[var(--erp-surface-muted)] p-4"><Clock3 className="h-4 w-4 text-[var(--erp-info)]"/><p className="mt-2 text-xs font-bold text-[var(--erp-muted-foreground)]">Duración estimada</p><strong>{duration(plan.durationSeconds)}</strong></div><div className="bg-[var(--erp-surface-muted)] p-4"><MapPinned className="h-4 w-4 text-[var(--erp-brand-red)]"/><p className="mt-2 text-xs font-bold text-[var(--erp-muted-foreground)]">Distancia total</p><strong>{distance(plan.distanceMeters)}</strong></div><div className="bg-[var(--erp-surface-muted)] p-4"><PackageCheck className="h-4 w-4 text-[var(--erp-success)]"/><p className="mt-2 text-xs font-bold text-[var(--erp-muted-foreground)]">Entregas</p><strong>{plan.orderedStops.length}</strong></div><div className="bg-[var(--erp-surface-muted)] p-4"><Truck className="h-4 w-4 text-[var(--erp-brand-gold-deep)]"/><p className="mt-2 text-xs font-bold text-[var(--erp-muted-foreground)]">Cierre</p><strong>Regreso al origen</strong></div></div>}</Card>
      </section>
    </div>
    <ConfirmationDialog open={confirming} onOpenChange={setConfirming} title={isReoptimization ? 'Aplicar recorrido reoptimizado' : 'Crear y asignar ruta optimizada'} description="Verifica el recorrido antes de asignarlo. La secuencia y geometría aprobadas serán las que verá el repartidor." confirmLabel={isReoptimization ? 'Aplicar reoptimización' : 'Crear y asignar'} isLoading={createRoute.isPending || assignPlan.isPending} onConfirm={confirmCreation}><p><strong>Ruta:</strong> {form.name}</p><p><strong>Repartidor:</strong> {catalog.drivers.data?.find((driver) => driver.id === form.driverId)?.name ?? existingRoute.data?.driverName}</p><p><strong>Recorrido:</strong> {stops.length} paradas · {distance(plan?.distanceMeters)} · {duration(plan?.durationSeconds)}</p></ConfirmationDialog>
  </PageFrame></PageShell>
}
