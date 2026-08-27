import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth";
import { billingRequestsService } from "./billingRequestsService";
import type {
  BillingRequestFilters,
  BillingRequestMutation,
  CancelInvoiceInput,
  IssueCfdiInput,
  InvoiceReconciliationInput,
  SatCatalogKey,
  CreateCreditAdjustmentInput,
} from "./types";

export function useBillingRequests(filters: BillingRequestFilters) {
  const { accessToken } = useAuth();
  return useQuery({
    queryKey: ["billing-requests", filters],
    queryFn: () => billingRequestsService.list(filters, accessToken),
  });
}
export function useBillingRequest(id?: string) {
  const { accessToken } = useAuth();
  return useQuery({
    enabled: Boolean(id),
    queryKey: ["billing-requests", id],
    queryFn: () => billingRequestsService.get(id as string, accessToken),
  });
}
export function useCreateBillingRequest() {
  const { accessToken } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      customerId: string;
      saleId: string;
      reason: string;
      notes?: string;
    }) => billingRequestsService.create(input, accessToken),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["billing-requests"] });
      void client.invalidateQueries({ queryKey: ["sales"] });
    },
  });
}
export function useUpdateBillingRequest(id: string) {
  const { accessToken } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: BillingRequestMutation) => {
      if (!input.status)
        return billingRequestsService.update(id, input, accessToken);
      if (!input.expectedVersion)
        throw new Error(
          "expectedVersion is required for billing request transitions",
        );
      const command =
        input.status === "IN_REVIEW"
          ? "start-review"
          : (input.status.toLowerCase() as "approve" | "reject" | "cancel");
      return billingRequestsService.transition(
        id,
        command,
        {
          expectedVersion: input.expectedVersion,
          reason: input.reason ?? "",
          notes: input.notes,
        },
        accessToken,
      );
    },
    onSuccess: (result) => {
      client.setQueryData(["billing-requests", id], result);
      void client.invalidateQueries({ queryKey: ["billing-requests"] });
    },
  });
}
export function useLinkBillingInvoice(id: string) {
  const { accessToken } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: InvoiceReconciliationInput) =>
      billingRequestsService.linkInvoice(id, input, accessToken),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["billing-requests", id] });
      void client.invalidateQueries({ queryKey: ["billing-requests"] });
      void client.invalidateQueries({ queryKey: ["billing-reportable-notes"] });
    },
  });
}

export function useIssueBillingCfdi(id: string) {
  const { accessToken } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (command: { input: IssueCfdiInput; idempotencyKey: string }) =>
      billingRequestsService.issueCfdi(
        id,
        command.input,
        accessToken,
        command.idempotencyKey,
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["billing-requests", id] });
      void client.invalidateQueries({ queryKey: ["billing-requests"] });
      void client.invalidateQueries({ queryKey: ["billing-invoices"] });
    },
    onError: () => {
      // A 409 or transport failure may race with a backend reservation. The
      // next detail fetch is the source of truth instead of a client retry.
      void client.invalidateQueries({ queryKey: ["billing-requests", id] });
    },
  });
}

export function useFiscalArtifactDownload() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (command: { invoiceId: string; type: "XML" | "PDF" }) =>
      billingRequestsService.getFiscalArtifact(
        command.invoiceId,
        command.type,
        accessToken,
      ),
  });
}

export function useCancelInvoice(invoiceId: string) {
  const { accessToken } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (command: {
      input: CancelInvoiceInput;
      idempotencyKey: string;
    }) =>
      billingRequestsService.cancelInvoice(
        invoiceId,
        command.input,
        accessToken,
        command.idempotencyKey,
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["billing-requests"] });
      void client.invalidateQueries({ queryKey: ["billing-invoices"] });
      void client.invalidateQueries({
        queryKey: ["billing-invoice-cancellation", invoiceId],
      });
    },
    onError: () => {
      // The server may have accepted the request before the transport failed;
      // refresh the request instead of issuing another browser-side command.
      void client.invalidateQueries({ queryKey: ["billing-requests"] });
    },
  });
}

/** Manual status refresh only. There is deliberately no refetchInterval. */
export function useCancellationStatus(invoiceId?: string, enabled = false) {
  const { accessToken } = useAuth();
  return useQuery({
    enabled: Boolean(invoiceId) && enabled,
    queryKey: ["billing-invoice-cancellation", invoiceId],
    queryFn: () =>
      billingRequestsService.getCancellationStatus(
        invoiceId as string,
        accessToken,
      ),
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  });
}

export function useSatCatalog(key: SatCatalogKey, enabled = true) {
  const { accessToken } = useAuth();
  return useQuery({
    enabled,
    queryKey: ["sat-catalog", key],
    queryFn: () => billingRequestsService.getSatCatalog(key, accessToken),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useCreateCreditAdjustment() {
  const { accessToken } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (command: {
      input: CreateCreditAdjustmentInput;
      idempotencyKey: string;
    }) =>
      billingRequestsService.createCreditAdjustment(
        command.input,
        accessToken,
        command.idempotencyKey,
      ),
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["billing-invoices"] }),
  });
}

export function useApproveCreditAdjustment() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (command: { id: string; expectedVersion: number }) =>
      billingRequestsService.approveCreditAdjustment(
        command.id,
        command.expectedVersion,
        accessToken,
      ),
  });
}

export function useIssueCreditAdjustment() {
  const { accessToken } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (command: {
      id: string;
      expectedVersion: number;
      idempotencyKey: string;
    }) =>
      billingRequestsService.issueCreditAdjustment(
        command.id,
        command.expectedVersion,
        accessToken,
        command.idempotencyKey,
      ),
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["billing-invoices"] }),
  });
}
