import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth'
import { billingReportService } from './service'
import type { BillingReportFilters } from './types'

export function useBillingReport(filters: BillingReportFilters) { const { accessToken } = useAuth(); return useQuery({ queryKey: ['billing-report', filters], queryFn: () => billingReportService.list(filters, accessToken), placeholderData: (previous) => previous }) }
export function useBillingReportDetail(id?: string) { const { accessToken } = useAuth(); return useQuery({ enabled: Boolean(id), queryKey: ['billing-report-detail', id], queryFn: () => billingReportService.detail(id!, accessToken) }) }
export function useBillingRequestCommand() { const { accessToken } = useAuth(); const client = useQueryClient(); return useMutation({ mutationFn: (input: { kind: 'create'; body: unknown } | { kind: 'review'; id: string; action: 'approve' | 'reject' | 'cancel'; expectedVersion: number; reason: string }) => input.kind === 'create' ? billingReportService.createRequest(input.body, accessToken) : billingReportService.reviewRequest(input.id, input.action, { expectedVersion: input.expectedVersion, reason: input.reason }, accessToken), onSuccess: () => { void client.invalidateQueries({ queryKey: ['billing-report'] }); void client.invalidateQueries({ queryKey: ['billing-report-detail'] }) } }) }
