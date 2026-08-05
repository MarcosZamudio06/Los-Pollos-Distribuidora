import { ArrowLeft, Banknote, MapPin, RefreshCw, Store } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { PageContainer } from "../../components/layout/PageContainer";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
} from "../../components/ui";
import { formatMoney } from "../../lib/money";
import { getOperationalDate } from "../../lib/operationalDate";
import {
  EmptyState,
  LoadingState,
  StatusBadge,
} from "../dashboard/dashboardComponents";
import {
  cashState,
  cedisCycleStatusLabels,
  cedisCycleStatusTones,
  formatCoordinates,
  formatPhysicalQuantity,
  salesDifference,
} from "./cedisPresentation";
import {
  useCedisBranchHistory,
  useCedisCycleSummary,
  useOperationalLocation,
} from "./hooks";
import type { CedisCycleStatus, CedisDashboardCard } from "./types";

function firstDayOfMonth(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4">
      <dt className="text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
        {label}
      </dt>
      <dd className="mt-2 font-black tabular-nums">{value}</dd>
    </div>
  );
}

function DetailError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="p-6" role="alert">
      <Badge tone="red">Error de consulta</Badge>
      <CardTitle className="mt-3">No se pudo cargar el detalle</CardTitle>
      <CardDescription className="mt-2">
        Vuelve a intentarlo para consultar la sucursal.
      </CardDescription>
      <Button className="mt-5" onClick={onRetry} variant="secondary">
        <RefreshCw aria-hidden="true" className="h-4 w-4" />
        Reintentar
      </Button>
    </Card>
  );
}

function DetailSummary({ card }: { card: CedisDashboardCard }) {
  const difference = salesDifference(card);
  const cash = cashState(card);

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]">
            Jornada seleccionada
          </p>
          <CardTitle className="mt-2">Resumen operativo</CardTitle>
        </div>
        {card.cycle && (
          <StatusBadge tone={cedisCycleStatusTones[card.cycle.status]}>
            {cedisCycleStatusLabels[card.cycle.status]}
          </StatusBadge>
        )}
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <DetailMetric
          label="Cantidad entregada"
          value={
            card.physical
              ? formatPhysicalQuantity(
                  card.physical.deliveredKg,
                  card.physical.deliveredPieces,
                )
              : "—"
          }
        />
        <DetailMetric
          label="Cantidad devuelta"
          value={
            card.physical
              ? formatPhysicalQuantity(
                  card.physical.returnedKg,
                  card.physical.returnedPieces,
                )
              : "—"
          }
        />
        <DetailMetric
          label="Venta esperada"
          value={card.financial ? formatMoney(card.financial.expectedSales) : "—"}
        />
        <DetailMetric
          label="Venta real"
          value={card.financial ? formatMoney(card.financial.actualSales) : "—"}
        />
        <DetailMetric
          label="Diferencia"
          value={difference ? formatMoney(difference) : "—"}
        />
        <DetailMetric label="Estado de caja" value={cash.label} />
      </dl>
    </Card>
  );
}

export function CedisBranchDetailPage() {
  const { branchId } = useParams();
  const [searchParams] = useSearchParams();
  const businessDate = searchParams.get("date") ?? getOperationalDate();
  const cycleId = searchParams.get("cycle") ?? undefined;
  const branchQuery = useOperationalLocation(branchId);
  const historyQuery = useCedisBranchHistory(branchId, {
    dateFrom: firstDayOfMonth(businessDate),
    dateTo: businessDate,
    limit: 25,
    page: 1,
    status: (searchParams.get("status") || undefined) as
      | CedisCycleStatus
      | undefined,
  });
  const summaryQuery = useCedisCycleSummary(cycleId);
  const branch = branchQuery.data;
  const selectedCard = historyQuery.data?.items.find(
    (item) => item.cycle?.id === cycleId,
  );
  const coordinates = formatCoordinates(branch?.latitude, branch?.longitude);
  const backQuery = searchParams.toString();

  if (branchQuery.isLoading || historyQuery.isLoading) {
    return (
      <PageContainer>
        <section className="mx-auto max-w-[96rem]">
          <LoadingState cards={3} />
        </section>
      </PageContainer>
    );
  }

  if (branchQuery.error || historyQuery.error) {
    return (
      <PageContainer>
        <section className="mx-auto max-w-[96rem]">
          <DetailError
            onRetry={() => {
              void branchQuery.refetch();
              void historyQuery.refetch();
            }}
          />
        </section>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <section className="mx-auto flex max-w-[96rem] flex-col gap-6">
        <Link
          className="inline-flex w-fit items-center gap-2 text-sm font-bold text-[var(--erp-info)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--erp-brand-gold)]"
          to={`/cedis${backQuery ? `?${backQuery}` : ""}`}
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Volver a CEDIS / Sucursales
        </Link>
        <header className="rounded-[2rem] border border-[color:var(--erp-border)] bg-white p-6 shadow-[var(--erp-shadow-elevated)] sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[rgba(47,111,115,0.12)] text-[var(--erp-info)]">
                <Store aria-hidden="true" className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--erp-brand-gold-deep)]">
                  Detalle de sucursal
                </p>
                <h1 className="mt-2 text-3xl font-black tracking-[-0.06em] sm:text-4xl">
                  {branch?.name ?? selectedCard?.branch.name ?? "Sucursal"}
                </h1>
                <p className="mt-2 text-sm font-bold text-[var(--erp-muted-foreground)]">
                  {branch?.code ?? selectedCard?.branch.code ?? "Sin código"}
                </p>
              </div>
            </div>
            <div className="space-y-2 text-sm text-[var(--erp-muted-foreground)] lg:max-w-sm lg:text-right">
              <p className="flex items-start gap-2 lg:justify-end">
                <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                {branch?.address ?? selectedCard?.branch.address ?? "Dirección no registrada"}
              </p>
              {coordinates && <p>Coordenadas: {coordinates}</p>}
            </div>
          </div>
        </header>

        {summaryQuery.data ? (
          <DetailSummary
            card={{
              branch: summaryQuery.data.branch,
              cash: {
                counted: summaryQuery.data.totals.cashCounted,
                difference: summaryQuery.data.totals.cashDifference,
                expected: summaryQuery.data.totals.expectedCash,
              },
              cycle: {
                businessDate: summaryQuery.data.businessDate,
                id: summaryQuery.data.id,
                status: summaryQuery.data.status,
                version: summaryQuery.data.version,
              },
              financial: {
                actualSales: summaryQuery.data.totals.actualSales,
                expectedSales: summaryQuery.data.totals.expectedSales,
              },
              lastActivityAt: summaryQuery.data.lastActivityAt,
              physical: {
                actualSoldKg: summaryQuery.data.totals.actualSoldKg,
                actualSoldPieces: summaryQuery.data.totals.actualSoldPieces,
                deliveredKg: summaryQuery.data.totals.deliveredKg,
                deliveredPieces: summaryQuery.data.totals.deliveredPieces,
                expectedSoldKg: summaryQuery.data.totals.expectedSoldKg,
                expectedSoldPieces: summaryQuery.data.totals.expectedSoldPieces,
                returnedKg: summaryQuery.data.totals.returnedKg,
                returnedPieces: summaryQuery.data.totals.returnedPieces,
              },
              warningCount: summaryQuery.data.warningCount,
            }}
          />
        ) : selectedCard ? (
          <DetailSummary card={selectedCard} />
        ) : (
          <EmptyState
            description="No existe una jornada para la fecha seleccionada. El historial disponible se muestra abajo."
            title="Sin jornada seleccionada"
          />
        )}

        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]">
                Seguimiento
              </p>
              <CardTitle className="mt-2">Historial de jornadas</CardTitle>
              <CardDescription className="mt-1">
                Consulta los ciclos registrados durante el mes de la fecha seleccionada.
              </CardDescription>
            </div>
            <Badge tone="blue">
              <Banknote aria-hidden="true" className="mr-1.5 inline h-3.5 w-3.5" />
              {historyQuery.data?.total ?? 0} registro(s)
            </Badge>
          </div>
          {historyQuery.data?.items.length ? (
            <div className="mt-5 overflow-x-auto rounded-2xl border border-[color:var(--erp-border)]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--erp-surface)] text-xs uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
                  <tr>
                    <th className="px-4 py-3 font-black">Fecha</th>
                    <th className="px-4 py-3 font-black">Estado</th>
                    <th className="px-4 py-3 font-black">Venta real</th>
                    <th className="px-4 py-3 font-black">Advertencias</th>
                  </tr>
                </thead>
                <tbody>
                  {historyQuery.data.items.map((item) => (
                    <tr
                      className="border-t border-[color:var(--erp-border)]"
                      key={item.cycle?.id ?? `${item.branch.id}-${item.lastActivityAt}`}
                    >
                      <td className="px-4 py-3 font-bold">{item.cycle?.businessDate ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          tone={item.cycle ? cedisCycleStatusTones[item.cycle.status] : "slate"}
                        >
                          {item.cycle
                            ? cedisCycleStatusLabels[item.cycle.status]
                            : "Sin jornada"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 font-bold tabular-nums">
                        {item.financial ? formatMoney(item.financial.actualSales) : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{item.warningCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState description="No hay ciclos históricos para este periodo." />
            </div>
          )}
        </Card>
      </section>
    </PageContainer>
  );
}
