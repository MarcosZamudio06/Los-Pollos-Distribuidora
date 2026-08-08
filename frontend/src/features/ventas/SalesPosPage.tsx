import {
  useCallback,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  History,
  MapPin,
  Maximize2,
  Minimize2,
  Settings2,
  ShieldCheck,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useAuth } from "../auth";
import { useOpenCashSession } from "../cierre-diario/hooks";
import { useCustomers } from "../clientes/hooks/useCustomers";
import type { Customer } from "../clientes/types";
import { usePurchaseLocations } from "../compras/hooks";
import type { OperationalLocation } from "../compras/types";
import { useProducts } from "../inventario/hooks/useProducts";
import type { Product } from "../inventario/types";
import {
  BillingRequestPanel,
  SaleRegisteredScreen,
  TicketModal,
} from "./components";
import { useCreateSale, useSaleTicket } from "./hooks";
import {
  buildCreateSalePayload,
  calculateCartTotal,
  calculateItemSubtotal,
  calculatePaymentsTotal,
  canConfirmSale,
  getCreditRestriction,
  getLocationValidationError,
  getPaymentsValidationError,
  getPosLocationOptions,
  getQuantityValidationError,
  getSaleChannelsForLocation,
  getSaleErrorMessage,
  getSaleRestriction,
  toMoney,
} from "./posLogic";
import { CartPanel } from "./pos/CartPanel";
import { CheckoutDock } from "./pos/CheckoutDock";
import { OperationalBar } from "./pos/OperationalBar";
import { ProductResultsTable } from "./pos/ProductResultsTable";
import { RecentSalesModal } from "./pos/RecentSalesModal";
import { ScanCommandBar } from "./pos/ScanCommandBar";
import type {
  CartItem,
  CreateSaleResponse,
  CustomerOption,
  PaymentType,
  PosTransactionState,
  ProductOption,
  SaleChannel,
  SaleDocumentType,
  SalePaymentInput,
  TicketData,
} from "./types";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { toast } from "sonner";
import {
  documentTypeLabel,
  paymentMethodLabel,
  paymentTypeLabel,
  saleChannelLabel,
} from "./saleLabels";
import { finishPosMeasurement, startPosMeasurement } from "./posPerformance";
import { getPosDeviceId } from "../../lib/deviceIdentity";
import { Money } from "../../lib/money";

function canAccessPos(role?: string | null) {
  return role === "ADMIN" || role === "SELLER";
}

function asNumber(value: string | number | null | undefined) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function findProductByLookup(products: ProductOption[], value: string) {
  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) return undefined;

  return (
    products.find(
      (product) => product.barcode?.trim().toLowerCase() === normalizedValue,
    ) ??
    products.find(
      (product) => product.sku?.trim().toLowerCase() === normalizedValue,
    ) ??
    products.find(
      (product) => product.name.trim().toLowerCase() === normalizedValue,
    )
  );
}

function productToOption(product: Product, locationId: string): ProductOption {
  const balance =
    product.inventoryBalance ??
    product.locationBalance ??
    product.balances?.[0];
  const equivalent = product.activeEquivalences?.[0];
  return {
    id: product.id,
    name: product.name,
    categoryName:
      typeof product.category === "object" && product.category
        ? product.category.name
        : typeof product.category === "string"
          ? product.category
          : null,
    sku: product.sku,
    barcode: product.barcode,
    presentationType: product.presentationType ?? product.presentation ?? "CUT",
    unit: product.unit ?? product.operationalUnit ?? "KG",
    salePrice: String(product.salePrice),
    unitPrice: String(product.salePrice),
    locationId: balance?.locationId ?? locationId,
    locationName: balance?.locationName,
    availableKg: asNumber(balance?.quantityKg),
    availablePieces: asNumber(balance?.quantityPieces),
    isLowStock: balance?.isLowStock,
    equivalentPolicyStatus:
      product.equivalentPolicyStatus ?? product.equivalencePolicyStatus,
    unitEquivalentId: equivalent?.id,
    equivalentFactor: equivalent?.factor,
    equivalentUnitFrom: equivalent?.unitFrom,
    equivalentUnitTo: equivalent?.unitTo,
  };
}

function customerToOption(customer: Customer): CustomerOption {
  return {
    id: customer.id,
    name: customer.name,
    commercialName: customer.commercialName,
    customerNumber: customer.customerNumber,
    customerType: customer.customerType,
    creditStatus: customer.creditStatus,
    creditLimit: customer.creditLimit,
    isActive: customer.isActive,
    active: customer.active,
    isBlockedForCredit: customer.isBlockedForCredit,
    effectiveCreditStatus: customer.effectiveCreditStatus,
    commercialPolicyId: customer.commercialPolicyId,
    creditSummary: customer.creditSummary,
  };
}

function locationLabel(location?: OperationalLocation | null) {
  if (!location) return "No seleccionada";
  return location.code ? `${location.name} · ${location.code}` : location.name;
}

function formatQuantity(value: number) {
  return value.toLocaleString("es-MX", { maximumFractionDigits: 3 });
}

type PendingSale = {
  payload: ReturnType<typeof buildCreateSalePayload>;
  idempotencyKey: string;
  cart: CartItem[];
  customer: CustomerOption | null;
  customerName: string;
  locationName: string;
  paymentType: PaymentType;
  payments: SalePaymentInput[];
  saleChannel: SaleChannel;
  documentType: SaleDocumentType;
  physicalFolio: string;
  requiresAdministrativeInvoice: boolean;
  billingRequestReason: string;
  billingRequestNotes: string;
  locationId: string;
  total: Money;
};

type ConfirmedSale = {
  documentId?: string;
  fallbackTicket: TicketData;
  saleId: string;
  saleNumber: string;
  customerName: string;
  total: string;
};

type ScanFeedbackTone = "success" | "attention" | "warning";

const OFFLINE_SALE_BLOCKER =
  "Sin conexión. La venta no se registrará sin conexión.";
const SCAN_SOUND_PREFERENCE_KEY = "pos:scan-sound-enabled";

function readScanSoundPreference() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SCAN_SOUND_PREFERENCE_KEY) === "true";
  } catch {
    return false;
  }
}

function getSubmitBlocker({
  cart,
  customer,
  locationId,
  payments,
  paymentType,
  submitting,
  requiresAdministrativeInvoice,
  billingRequestReason,
  isAdmin,
  overrideEnabled,
  overrideReason,
  saleChannel,
  allowedSaleChannels,
  cashSessionId,
  isOnline,
}: {
  cart: CartItem[];
  customer: CustomerOption | null;
  locationId: string;
  payments: SalePaymentInput[];
  paymentType: PaymentType;
  submitting: boolean;
  requiresAdministrativeInvoice: boolean;
  billingRequestReason: string;
  isAdmin: boolean;
  overrideEnabled: boolean;
  overrideReason: string;
  saleChannel: SaleChannel;
  allowedSaleChannels: readonly SaleChannel[];
  cashSessionId?: string | null;
  isOnline: boolean;
}) {
  if (!locationId) return "Selecciona una ubicación operativa.";
  if (!allowedSaleChannels.includes(saleChannel))
    return "Selecciona un canal válido para la ubicación operativa.";
  if (!isOnline) return OFFLINE_SALE_BLOCKER;
  if (!cashSessionId)
    return "Abre un turno de caja en esta terminal antes de registrar ventas.";
  if (cart.length === 0) return "Agrega al menos un producto.";
  const locationError = getLocationValidationError(cart, locationId);
  if (locationError) return locationError;
  const invalidItem = cart.find((item) => getQuantityValidationError(item));
  if (invalidItem) return getQuantityValidationError(invalidItem);
  if (requiresAdministrativeInvoice && !customer)
    return "Selecciona un cliente para crear la solicitud administrativa.";
  if (requiresAdministrativeInvoice && !billingRequestReason.trim())
    return "Captura el motivo de la solicitud administrativa.";
  const total = calculateCartTotal(cart);
  const paymentsError =
    payments.length > 0 ? getPaymentsValidationError(payments, total) : null;
  if (paymentsError) return paymentsError;
  const saleRestriction = getSaleRestriction(
    paymentType,
    customer,
    total,
    calculatePaymentsTotal(payments),
    { isAdmin, overrideEnabled, overrideReason },
  );
  return canConfirmSale({
    cart,
    creditRestriction: saleRestriction,
    isSubmitting: submitting,
    locationId,
  })
    ? null
    : (saleRestriction ?? "La venta todavía no puede confirmarse.");
}

function getPosTransactionState({
  cart,
  isOnline,
  isSubmitting,
  paymentType,
  payments,
  selectedCustomer,
  submitBlocker,
  total,
}: {
  cart: CartItem[];
  isOnline: boolean;
  isSubmitting: boolean;
  paymentType: PaymentType;
  payments: SalePaymentInput[];
  selectedCustomer: CustomerOption | null;
  submitBlocker: string | null;
  total: Money;
}): PosTransactionState {
  if (isSubmitting) return "PROCESSING";
  if (!isOnline) return "BLOCKED";
  if (cart.length === 0) return "EMPTY";

  const quantityError = cart.map(getQuantityValidationError).find(Boolean);
  if (quantityError)
    return quantityError.includes("Ingresa") ? "WEIGHT_PENDING" : "BLOCKED";
  if (
    (paymentType === "CREDIT_SALE" ||
      submitBlocker?.includes("solicitud administrativa")) &&
    !selectedCustomer
  )
    return "CUSTOMER_REQUIRED";
  if (submitBlocker?.includes("crédito")) return "CREDIT_BLOCKED";

  const paid = calculatePaymentsTotal(payments);
  if (paymentType === "CASH_SALE" && payments.length === 0)
    return "CART_ACTIVE";
  if (paymentType === "CASH_SALE" && paid.compare(total) < 0)
    return "PAYMENT_PENDING";
  if (submitBlocker?.includes("pago") || submitBlocker?.includes("liquidarse"))
    return "PAYMENT_PENDING";
  if (submitBlocker) return "BLOCKED";
  return "READY_TO_CHARGE";
}

function buildProvisionalTicket(
  response: CreateSaleResponse,
  pendingSale: PendingSale,
  sellerName?: string | null,
): TicketData {
  const sale = response.sale;
  const saleItems = sale?.items ?? [];
  const items =
    saleItems.length > 0
      ? saleItems.map((item, index) => ({
          productName:
            item.productName ??
            item.productNameSnapshot ??
            pendingSale.cart[index]?.name,
          sku: item.sku ?? pendingSale.cart[index]?.sku,
          unit: item.unit ?? pendingSale.cart[index]?.unit,
          quantityKg: item.quantityKg ?? pendingSale.cart[index]?.quantityKg,
          quantityPieces:
            item.quantityPieces ?? pendingSale.cart[index]?.quantityPieces,
          unitPrice: item.unitPrice ?? pendingSale.cart[index]?.unitPrice,
          subtotal:
            item.subtotal ??
            (pendingSale.cart[index]
              ? calculateItemSubtotal(pendingSale.cart[index]).toString()
              : undefined),
        }))
      : pendingSale.cart.map((item) => ({
          productName: item.name,
          sku: item.sku,
          unit: item.unit,
          quantityKg: item.quantityKg,
          quantityPieces: item.quantityPieces,
          unitPrice: item.unitPrice,
          subtotal: calculateItemSubtotal(item).toString(),
        }));
  const payments =
    response.payments ?? (response.payment ? [response.payment] : []);
  const paid = Money.sum(payments.map((payment) => payment.amount));
  const total = Money.from(sale?.total ?? pendingSale.total);

  return {
    ticketId: response.ticketId ?? undefined,
    ticketNumber:
      pendingSale.physicalFolio ||
      sale?.saleNumber ||
      response.ticketId ||
      undefined,
    saleNumber: sale?.saleNumber,
    createdAt: sale?.createdAt,
    documentType: sale?.documentType ?? pendingSale.documentType,
    physicalFolio: pendingSale.physicalFolio || null,
    requiresAdministrativeInvoice: pendingSale.requiresAdministrativeInvoice,
    sellerName: sellerName ?? undefined,
    customerName: sale?.customerName ?? pendingSale.customerName,
    locationId: sale?.locationId ?? pendingSale.locationId,
    locationName: pendingSale.locationName,
    items,
    subtotal: sale?.subtotal ?? total.toString(),
    discount: sale?.discount ?? "0.00",
    tax: sale?.tax ?? "0.00",
    total: total.toString(),
    paid: paid.toString(),
    outstanding:
      response.accountReceivable?.balance ??
      response.accountReceivable?.outstandingAmount ??
      (total.subtract(paid).compare(Money.zero()) > 0
        ? total.subtract(paid).toString()
        : "0.00"),
    dueDate: response.accountReceivable?.dueDate ?? null,
    paymentType: sale?.paymentType ?? pendingSale.paymentType,
    collectionStatus: sale?.collectionStatus,
    status: sale?.status,
    payments: payments.map((payment) => ({
      amount: payment.amount,
      paymentMethod: payment.paymentMethod,
      cashTendered: payment.cashTendered,
      changeGiven: payment.changeGiven,
      paidAt: payment.paidAt ?? undefined,
    })),
  };
}

export function SalesPosPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "ADMIN";
  const isSeller = user?.role === "SELLER";
  const [adminLocationId, setAdminLocationId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerOption | null>(null);
  const [paymentType, setPaymentType] = useState<PaymentType>("CASH_SALE");
  const [payments, setPayments] = useState<SalePaymentInput[]>([]);
  const [selectedSaleChannel, setSelectedSaleChannel] =
    useState<SaleChannel | null>(null);
  const [documentType, setDocumentType] =
    useState<SaleDocumentType>("SIMPLE_NOTE");
  const [physicalFolio, setPhysicalFolio] = useState("");
  const [requiresAdministrativeInvoice, setRequiresAdministrativeInvoice] =
    useState(false);
  const [billingRequestReason, setBillingRequestReason] = useState("");
  const [billingRequestNotes, setBillingRequestNotes] = useState("");
  const [showAdvancedSaleFields, setShowAdvancedSaleFields] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [recentProducts, setRecentProducts] = useState<ProductOption[]>([]);
  const [activeCartItemId, setActiveCartItemId] = useState<string>();
  const [activeQuantityField, setActiveQuantityField] = useState<
    "kg" | "pieces"
  >("kg");
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [scanFeedbackTone, setScanFeedbackTone] =
    useState<ScanFeedbackTone>("success");
  const [scanSoundEnabled, setScanSoundEnabled] = useState(
    readScanSoundPreference,
  );
  const [recentlyAddedProductId, setRecentlyAddedProductId] =
    useState<string>();
  const [showNewSaleDialog, setShowNewSaleDialog] = useState(false);
  const [showRecentSalesModal, setShowRecentSalesModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [confirmedSale, setConfirmedSale] = useState<ConfirmedSale | null>(
    null,
  );
  const [showTicket, setShowTicket] = useState(false);
  const [pendingSale, setPendingSale] = useState<PendingSale | null>(null);
  const pageRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const customerSearchRef = useRef<HTMLInputElement>(null);
  const conditionPanelRef = useRef<HTMLElement>(null);
  const paymentPanelRef = useRef<HTMLElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const recentSalesButtonRef = useRef<HTMLButtonElement>(null);
  const pendingScanRef = useRef<string | null>(null);
  const registrationInFlightRef = useRef(false);
  const cartRef = useRef<CartItem[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);

  const contextLocationId = isSeller
    ? (user?.operationalLocationId ?? "")
    : adminLocationId;
  const deferredProductSearch = useDeferredValue(productSearch);
  const locations = usePurchaseLocations("");
  const locationOptions = useMemo(
    () =>
      getPosLocationOptions(
        locations.data ?? [],
        user?.role,
        user?.operationalLocationId,
      ),
    [locations.data, user?.operationalLocationId, user?.role],
  );
  const selectedLocation = useMemo(
    () =>
      locationOptions.find((location) => location.id === contextLocationId) ??
      null,
    [contextLocationId, locationOptions],
  );
  const locationId = selectedLocation?.id ?? "";
  const allowedSaleChannels = useMemo(
    () => getSaleChannelsForLocation(selectedLocation?.type),
    [selectedLocation?.type],
  );
  const saleChannel =
    selectedSaleChannel && allowedSaleChannels.includes(selectedSaleChannel)
      ? selectedSaleChannel
      : (allowedSaleChannels[0] ?? "COUNTER");
  const productFilters = useMemo(
    () => ({
      isActive: "true",
      locationId: selectedLocation?.id ?? "",
      search: deferredProductSearch,
    }),
    [deferredProductSearch, selectedLocation?.id],
  );
  const products = useProducts(productFilters);
  const customers = useCustomers({ isActive: "true", search: customerSearch });
  const createSale = useCreateSale();
  const ticket = useSaleTicket(
    confirmedSale?.saleId,
    confirmedSale?.documentId,
  );
  const openCashSession = useOpenCashSession(locationId);
  const cashShiftId = openCashSession.data?.id;
  const deviceId = getPosDeviceId();

  const productOptions = useMemo(
    () =>
      (products.data ?? [])
        .map((product) => productToOption(product, selectedLocation?.id ?? ""))
        .filter((product) => product.locationId === selectedLocation?.id),
    [products.data, selectedLocation?.id],
  );
  const frequentProducts = useMemo(
    () =>
      recentProducts.filter(
        (product) => product.locationId === selectedLocation?.id,
      ),
    [recentProducts, selectedLocation?.id],
  );
  const customerOptions = useMemo(
    () => (customers.data ?? []).map(customerToOption),
    [customers.data],
  );
  const total = useMemo(() => calculateCartTotal(cart), [cart]);
  const totalPaid = useMemo(() => calculatePaymentsTotal(payments), [payments]);
  const canOverrideCredit = useMemo(
    () =>
      Boolean(
        paymentType === "CREDIT_SALE" &&
        isAdmin &&
        selectedCustomer?.creditSummary?.effectiveCreditStatus === "BLOCKED" &&
        selectedCustomer.creditSummary.canAdministrativeOverride &&
        !selectedCustomer.creditSummary.blockingReasons?.includes(
          "CREDIT_ADMINISTRATIVELY_BLOCKED",
        ),
      ),
    [isAdmin, paymentType, selectedCustomer],
  );
  const creditOptions = useMemo(
    () => ({ isAdmin, overrideEnabled, overrideReason }),
    [isAdmin, overrideEnabled, overrideReason],
  );
  const creditRestriction = useMemo(
    () =>
      getCreditRestriction(
        paymentType,
        selectedCustomer,
        total,
        creditOptions,
        totalPaid,
      ),
    [creditOptions, paymentType, selectedCustomer, total, totalPaid],
  );
  const submitBlocker = useMemo(
    () =>
      getSubmitBlocker({
        cart,
        customer: selectedCustomer,
        locationId,
        payments,
        paymentType,
        submitting: createSale.isPending,
        requiresAdministrativeInvoice,
        billingRequestReason,
        isAdmin,
        overrideEnabled,
        overrideReason,
        saleChannel,
        allowedSaleChannels,
        cashSessionId: cashShiftId,
        isOnline,
      }),
    [
      allowedSaleChannels,
      billingRequestReason,
      cart,
      cashShiftId,
      createSale.isPending,
      isAdmin,
      isOnline,
      locationId,
      overrideEnabled,
      overrideReason,
      paymentType,
      payments,
      requiresAdministrativeInvoice,
      saleChannel,
      selectedCustomer,
    ],
  );
  const transactionState = useMemo(
    () =>
      getPosTransactionState({
        cart,
        isOnline,
        isSubmitting: createSale.isPending,
        paymentType,
        payments,
        selectedCustomer,
        submitBlocker,
        total,
      }),
    [
      cart,
      createSale.isPending,
      isOnline,
      paymentType,
      payments,
      selectedCustomer,
      submitBlocker,
      total,
    ],
  );

  useEffect(() => {
    cartRef.current = cart;
    finishPosMeasurement("cart-update");
  }, [cart]);

  useEffect(() => {
    if (scanStatus) finishPosMeasurement("scan-feedback", 150);
  }, [scanStatus]);

  useEffect(() => {
    if (deferredProductSearch === productSearch && !products.isFetching)
      finishPosMeasurement("search");
  }, [deferredProductSearch, productSearch, products.isFetching]);

  useEffect(() => {
    if (pendingSale) finishPosMeasurement("checkout");
  }, [pendingSale]);

  useEffect(() => {
    if (ticket.data || ticket.error) finishPosMeasurement("print");
  }, [ticket.data, ticket.error]);

  const commitCart = useCallback((nextCart: CartItem[]) => {
    cartRef.current = nextCart;
    startPosMeasurement("cart-update");
    setCart(nextCart);
  }, []);

  const handleProductSearchChange = useCallback((search: string) => {
    startPosMeasurement("search");
    setProductSearch(search);
  }, []);

  function showScanFeedback(message: string, tone: ScanFeedbackTone) {
    setScanStatus(message);
    setScanFeedbackTone(tone);
  }

  function playScanSound(tone: ScanFeedbackTone, enabled = scanSoundEnabled) {
    if (!enabled || typeof window === "undefined") return;
    const AudioContextConstructor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextConstructor) return;
    const audioContext =
      audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = audioContext;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const accepted = tone !== "warning";
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(
      accepted ? 880 : 220,
      audioContext.currentTime,
    );
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.12,
      audioContext.currentTime + 0.01,
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      audioContext.currentTime + (accepted ? 0.09 : 0.16),
    );
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + (accepted ? 0.1 : 0.17));
  }

  function toggleScanSound() {
    const nextValue = !scanSoundEnabled;
    setScanSoundEnabled(nextValue);
    try {
      window.localStorage.setItem(SCAN_SOUND_PREFERENCE_KEY, String(nextValue));
    } catch {
      // The preference remains active for this session when storage is unavailable.
    }
    if (nextValue) playScanSound("success", true);
  }

  const processPendingScan = useEffectEvent(() => {
    const pendingScan = pendingScanRef.current;
    if (!pendingScan) return;
    const match = findProductByLookup(productOptions, pendingScan);
    if (!match) return;
    pendingScanRef.current = null;
    const tone = handleAddProduct(match);
    playScanSound(tone);
    setProductSearch("");
    if (tone !== "attention")
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
  });

  useEffect(() => {
    if (!recentlyAddedProductId) return;
    const timer = window.setTimeout(
      () => setRecentlyAddedProductId(undefined),
      500,
    );
    return () => window.clearTimeout(timer);
  }, [recentlyAddedProductId]);

  useEffect(() => {
    processPendingScan();
  }, [productOptions]);

  function resetOverride() {
    setOverrideEnabled(false);
    setOverrideReason("");
  }

  function handleCustomerSelect(customer: CustomerOption | null) {
    setSelectedCustomer(customer);
    resetOverride();
    setBackendError(null);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function handleLocationChange(nextLocationId: string) {
    if (isSeller) return;
    setAdminLocationId(nextLocationId);
    pendingScanRef.current = null;
    commitCart([]);
    setActiveCartItemId(undefined);
    setProductSearch("");
    setScanStatus(null);
    setBackendError(null);
    resetOverride();
  }

  function handleAddProduct(product: ProductOption): ScanFeedbackTone {
    const hasNoStock = product.availableKg <= 0 && product.availablePieces <= 0;
    if (hasNoStock) {
      showScanFeedback(
        `Producto sin existencia en ${product.locationName ?? product.locationId}.`,
        "warning",
      );
      return "warning";
    }

    setBackendError(null);
    const existing = cartRef.current.find(
      (item) => item.productId === product.id,
    );
    const isActiveMixedLine =
      existing?.unit === "KG_AND_PIECE" && activeCartItemId === product.id;
    const scanField =
      product.unit === "PIECE"
        ? "pieces"
        : product.unit === "KG"
          ? "kg"
          : isActiveMixedLine
            ? activeQuantityField
            : "kg";
    setActiveCartItemId(product.id);
    setActiveQuantityField(scanField);
    setRecentProducts((current) =>
      [product, ...current.filter((item) => item.id !== product.id)].slice(
        0,
        6,
      ),
    );

    if (!existing) {
      const nextItem: CartItem = {
        ...product,
        productId: product.id,
        quantityKg: 0,
        quantityPieces:
          product.unit === "PIECE" ? Math.min(1, product.availablePieces) : 0,
      };
      const nextCart = [...cartRef.current, nextItem];
      commitCart(nextCart);
      setRecentlyAddedProductId(product.id);
      if (scanField === "kg") {
        showScanFeedback(`Captura el peso de ${product.name}`, "attention");
        window.setTimeout(
          () =>
            Array.from(
              document.querySelectorAll<HTMLInputElement>(
                'input[aria-label^="Kilos capturados"]',
              ),
            )
              .find(
                (input) =>
                  input.getAttribute("aria-label") ===
                  `Kilos capturados de ${product.name}`,
              )
              ?.focus(),
          0,
        );
        return "attention";
      }
      showScanFeedback(`Agregado: ${product.name}`, "success");
      return "success";
    }

    if (scanField === "pieces") {
      const availablePieces = Math.max(0, Math.trunc(existing.availablePieces));
      if (existing.quantityPieces >= availablePieces) {
        showScanFeedback(
          `Stock máximo: ${product.name} (${formatQuantity(existing.quantityPieces)} piezas)`,
          "warning",
        );
        return "warning";
      }
      const nextPieces = existing.quantityPieces + 1;
      const nextCart = cartRef.current.map((item) =>
        item.productId === product.id
          ? { ...item, quantityPieces: nextPieces }
          : item,
      );
      commitCart(nextCart);
      setRecentlyAddedProductId(product.id);
      showScanFeedback(
        `Incrementado: ${product.name} (${formatQuantity(nextPieces)} ${nextPieces === 1 ? "pieza" : "piezas"})`,
        "success",
      );
      return "success";
    }

    showScanFeedback(`Captura el peso de ${product.name}`, "attention");
    return "attention";
  }

  const handleQuantityChange = useCallback(
    (productId: string, quantityKg: number, quantityPieces: number) => {
      const nextCart = cartRef.current.map((item) =>
        item.productId === productId
          ? { ...item, quantityKg, quantityPieces }
          : item,
      );
      commitCart(nextCart);
    },
    [commitCart],
  );

  const handleQuantityFocus = useCallback(
    (productId: string, field: "kg" | "pieces") => {
      setActiveCartItemId(productId);
      setActiveQuantityField(field);
    },
    [],
  );

  const handleCartActivate = useCallback(
    (productId: string) => {
      const item = cartRef.current.find(
        (current) => current.productId === productId,
      );
      const field = item?.unit === "PIECE" ? "pieces" : "kg";
      handleQuantityFocus(productId, field);
    },
    [handleQuantityFocus],
  );

  function handleProductSearchSubmit(value: string) {
    const normalizedValue = value.trim().toLowerCase();
    if (!normalizedValue) return;
    startPosMeasurement("scan-feedback");
    const match = findProductByLookup(productOptions, normalizedValue);
    if (!match) {
      pendingScanRef.current = normalizedValue;
      showScanFeedback(`Buscando el código ${value.trim()}...`, "warning");
      return;
    }
    pendingScanRef.current = null;
    const tone = handleAddProduct(match);
    playScanSound(tone);
    setProductSearch("");
    if (tone !== "attention")
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function clearSaleDraft() {
    pendingScanRef.current = null;
    commitCart([]);
    setActiveCartItemId(undefined);
    setSelectedCustomer(null);
    setProductSearch("");
    setCustomerSearch("");
    setPaymentType("CASH_SALE");
    setPayments([]);
    setSelectedSaleChannel(null);
    setDocumentType("SIMPLE_NOTE");
    setPhysicalFolio("");
    setRequiresAdministrativeInvoice(false);
    setBillingRequestReason("");
    setBillingRequestNotes("");
    setShowAdvancedSaleFields(false);
    setBackendError(null);
    setScanStatus(null);
    setScanFeedbackTone("success");
    setRecentlyAddedProductId(undefined);
    resetOverride();
  }

  function clearConfirmedSale() {
    setShowTicket(false);
    setConfirmedSale(null);
  }

  function closeRegisteredSale() {
    clearConfirmedSale();
    clearSaleDraft();
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  const handleRemoveProduct = useCallback(
    (productId: string) => {
      const nextCart = cartRef.current.filter(
        (item) => item.productId !== productId,
      );
      commitCart(nextCart);
      setActiveCartItemId((activeItemId) =>
        activeItemId === productId ? undefined : activeItemId,
      );
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    },
    [commitCart],
  );

  function handleProductResultAdd(product: ProductOption) {
    const tone = handleAddProduct(product);
    if (tone !== "attention")
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function hasDraftChanges() {
    return Boolean(
      cart.length ||
      selectedCustomer ||
      productSearch ||
      customerSearch ||
      payments.length ||
      physicalFolio ||
      requiresAdministrativeInvoice ||
      billingRequestReason ||
      billingRequestNotes ||
      overrideEnabled ||
      overrideReason,
    );
  }

  function handleNewSale() {
    if (pendingSale) return;
    if (confirmedSale) {
      closeRegisteredSale();
      return;
    }
    if (hasDraftChanges()) {
      setShowNewSaleDialog(true);
      return;
    }
    clearSaleDraft();
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function confirmNewSale() {
    clearSaleDraft();
    clearConfirmedSale();
    setShowNewSaleDialog(false);
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function handleConfirmSale() {
    if (pendingSale || createSale.isPending) return;
    if (submitBlocker) return;
    startPosMeasurement("checkout");
    setBackendError(null);
    setPendingSale({
      idempotencyKey: crypto.randomUUID(),
      payload: buildCreateSalePayload({
        administrativeOverrideReason: overrideEnabled
          ? overrideReason
          : undefined,
        billingRequestReason,
        billingRequestNotes,
        cart,
        customer: selectedCustomer,
        documentType,
        locationId,
        payments,
        paymentType,
        physicalFolio,
        cashShiftId,
        deviceId,
        requiresAdministrativeInvoice,
        saleChannel,
        total,
      }),
      cart: cart.map((item) => ({ ...item })),
      customer: selectedCustomer,
      customerName: selectedCustomer?.name ?? "Público general",
      locationName: locationLabel(selectedLocation),
      paymentType,
      payments: payments.map((payment) => ({ ...payment })),
      saleChannel,
      documentType,
      physicalFolio,
      requiresAdministrativeInvoice,
      billingRequestReason,
      billingRequestNotes,
      locationId,
      total,
    });
  }

  async function confirmRegistration() {
    if (!pendingSale || createSale.isPending || registrationInFlightRef.current)
      return;
    registrationInFlightRef.current = true;
    if (!isOnline) {
      setBackendError(OFFLINE_SALE_BLOCKER);
      registrationInFlightRef.current = false;
      return;
    }
    startPosMeasurement("checkout-registration");
    try {
      const response = await createSale.mutateAsync({
        payload: pendingSale.payload,
        idempotencyKey: pendingSale.idempotencyKey,
      });
      const sale = response.sale;
      const saleId = sale?.id;
      if (!saleId) {
        setBackendError(
          "La venta fue procesada, pero la respuesta no incluyó su identificador. Revisa el historial antes de reintentar.",
        );
        finishPosMeasurement("checkout-registration");
        return;
      }
      const documentId =
        response.documents?.find(
          (document) => document.documentType === pendingSale.documentType,
        )?.id ??
        response.ticketId ??
        undefined;
      const fallbackTicket = buildProvisionalTicket(
        response,
        pendingSale,
        user?.name,
      );
      setConfirmedSale({
        documentId,
        fallbackTicket,
        saleId,
        saleNumber: sale?.saleNumber ?? saleId,
        customerName: sale?.customerName ?? pendingSale.customerName,
        total: Money.from(sale?.total ?? pendingSale.total).toString(),
      });
      setShowTicket(false);
      clearSaleDraft();
      setPendingSale(null);
      toast.success("Venta registrada correctamente.");
      if (
        (response.creditWarnings ?? sale?.creditWarnings ?? []).includes(
          "CREDIT_OVERDUE_WARNING",
        )
      )
        toast.warning("Venta registrada con advertencia por saldo vencido.");
      if (
        (response.creditWarnings ?? sale?.creditWarnings ?? []).includes(
          "CREDIT_OVERRIDE_APPLIED",
        )
      )
        toast.warning(
          "Venta registrada con autorización administrativa de crédito.",
        );
      finishPosMeasurement("checkout-registration");
      void products.refetch();
    } catch (error) {
      setBackendError(getSaleErrorMessage(error));
      finishPosMeasurement("checkout-registration");
    } finally {
      registrationInFlightRef.current = false;
    }
  }

  function handleRetryPrint() {
    startPosMeasurement("print");
    setShowTicket(true);
    if (confirmedSale?.documentId) void ticket.refetch();
  }

  function handleOpenHistory() {
    clearConfirmedSale();
    navigate("/sales/history");
  }

  async function toggleFullscreen() {
    if (!document.fullscreenEnabled) {
      setFullscreenError(
        "El navegador no permite pantalla completa en este entorno.",
      );
      return;
    }
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await pageRef.current?.requestFullscreen();
      setFullscreenError(null);
    } catch {
      setFullscreenError("No se pudo cambiar a pantalla completa.");
    }
  }

  useEffect(() => {
    function updateOnlineState() {
      setIsOnline(navigator.onLine);
    }

    function updateFullscreenState() {
      setIsFullscreen(document.fullscreenElement === pageRef.current);
    }

    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
      document.removeEventListener("fullscreenchange", updateFullscreenState);
    };
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Enter" && !event.repeat) {
        if (pendingSale) {
          event.preventDefault();
          event.stopImmediatePropagation();
          void confirmRegistration();
          return;
        }

        const target =
          event.target instanceof HTMLElement ? event.target : null;
        const isPrimaryAction = Boolean(
          target?.closest("[data-pos-primary-action]"),
        );
        const isInteractiveControl = Boolean(
          target?.closest(
            'button, input, textarea, select, a, [contenteditable="true"]',
          ),
        );
        if ((isInteractiveControl && !isPrimaryAction) || submitBlocker) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        handleConfirmSale();
      } else if (event.key === "F2") {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (event.key === "F4") {
        event.preventDefault();
        customerSearchRef.current?.focus();
      } else if (event.key === "F6") {
        event.preventDefault();
        paymentPanelRef.current
          ?.querySelector<HTMLElement>("select, input, button")
          ?.focus();
      } else if (event.key === "F8") {
        event.preventDefault();
        handleConfirmSale();
      } else if (event.key === "F9") {
        event.preventDefault();
        handleNewSale();
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });

  const pendingPaid = pendingSale
    ? calculatePaymentsTotal(pendingSale.payments)
    : Money.zero();
  const pendingOutstanding =
    pendingSale &&
    pendingSale.total.subtract(pendingPaid).compare(Money.zero()) > 0
      ? pendingSale.total.subtract(pendingPaid)
      : Money.zero();
  const pendingCustomerBalance =
    pendingSale?.customer?.creditSummary?.outstandingAmount;
  const ticketLoading = Boolean(ticket.isLoading || ticket.isFetching);
  const printStatus = confirmedSale
    ? ticketLoading
      ? "loading"
      : ticket.data
        ? "ready"
        : ticket.error
          ? "error"
          : confirmedSale.documentId
            ? "loading"
            : "unavailable"
    : undefined;

  if (!canAccessPos(user?.role)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--pos-porcelain)] p-6 text-[var(--pos-ink)]">
        <section className="max-w-xl rounded-2xl border border-[var(--pos-steel)] bg-white p-8 shadow-[0_20px_50px_rgba(23,33,30,0.10)]">
          <h1 className="font-[var(--pos-display)] text-3xl font-bold uppercase tracking-[-0.02em]">
            Acceso al POS denegado
          </h1>
          <p className="mt-3 text-[var(--pos-muted)]">
            Solo los roles ADMIN y SELLER pueden registrar ventas desde el POS.
          </p>
          <Link
            className="mt-6 inline-flex font-bold text-[var(--pos-red)]"
            to="/"
          >
            Volver a operaciones
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main
      className="relative flex h-full min-h-0 overflow-hidden bg-[var(--pos-porcelain)] font-[var(--pos-body)] text-[var(--pos-ink)] fullscreen:h-dvh"
      data-pos-shell
      ref={pageRef}
    >
      <section className="mx-auto flex h-full min-h-0 w-full max-w-[1680px] flex-col border-x border-[var(--pos-steel)] bg-white">
        <OperationalBar>
          <label className="flex min-w-0 items-center gap-2 border-r border-[var(--pos-steel)] pr-3">
            <MapPin className="h-4 w-4 shrink-0 text-[var(--pos-green)]" />
            <span className="sr-only">Ubicación operativa</span>
            <select
              className="min-w-0 max-w-48 truncate bg-transparent font-bold outline-none"
              disabled={isSeller}
              onChange={(event) => handleLocationChange(event.target.value)}
              value={locationId}
            >
              <option value="">Selecciona ubicación</option>
              {locationOptions.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                  {location.code ? ` · ${location.code}` : ""}
                </option>
              ))}
            </select>
          </label>
          <div
            className={`ml-3 flex min-w-0 items-center gap-1.5 font-bold ${openCashSession.data ? "text-[var(--pos-ink)]" : "text-[var(--pos-red)]"}`}
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {openCashSession.isLoading
                ? "Consultando turno"
                : openCashSession.data
                  ? `${openCashSession.data.terminal.name} · turno abierto`
                  : "Turno sin abrir"}
            </span>
            {!openCashSession.data && (
              <Link
                className="ml-1 shrink-0 underline underline-offset-2"
                to="/daily-close"
              >
                Abrir turno
              </Link>
            )}
          </div>
          <span className="mx-3 hidden h-4 border-l border-[var(--pos-steel)] xl:block" />
          <span className="hidden truncate font-medium xl:block">
            {openCashSession.data?.cashier?.name ?? user?.name ?? "Sin cajero"}
          </span>
          <span className="ml-auto hidden font-[var(--pos-mono)] text-[0.68rem] text-[var(--pos-muted)] xl:inline">
            {new Date().toLocaleTimeString("es-MX", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span
            className={`ml-3 inline-flex items-center gap-1.5 font-bold ${isOnline ? "text-[var(--pos-green)]" : "text-[var(--pos-red)]"}`}
          >
            {isOnline ? (
              <Wifi className="h-4 w-4" />
            ) : (
              <WifiOff className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {isOnline ? "En línea" : "Sin conexión"}
            </span>
          </span>
          <button
            aria-label={
              scanSoundEnabled
                ? "Desactivar sonido de escaneo"
                : "Activar sonido de escaneo"
            }
            aria-pressed={scanSoundEnabled}
            className={`ml-3 inline-grid h-11 w-11 place-items-center transition ${scanSoundEnabled ? "bg-[rgba(22,117,82,0.10)] text-[var(--pos-success)]" : "text-[var(--pos-muted)] hover:text-[var(--pos-ink)]"}`}
            onClick={toggleScanSound}
            title={
              scanSoundEnabled
                ? "Sonido de escaneo activado"
                : "Sonido de escaneo desactivado"
            }
            type="button"
          >
            {scanSoundEnabled ? (
              <Volume2 className="h-4 w-4" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </button>
          <button
            aria-label={
              isFullscreen
                ? "Salir de pantalla completa"
                : "Activar pantalla completa"
            }
            className="ml-1 inline-grid h-11 w-11 place-items-center text-[var(--pos-muted)] transition hover:text-[var(--pos-ink)]"
            onClick={() => void toggleFullscreen()}
            type="button"
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
          <button
            aria-controls="pos-recent-sales-modal"
            aria-expanded={showRecentSalesModal}
            aria-haspopup="dialog"
            aria-label="Abrir ventas recientes"
            className="ml-1 inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 border-l border-[var(--pos-steel)] px-2 text-xs font-bold text-[var(--pos-muted)] transition hover:bg-[var(--pos-surface-secondary)] hover:text-[var(--pos-ink)] focus-visible:relative focus-visible:z-10 sm:w-auto sm:justify-start sm:px-3"
            onClick={() => setShowRecentSalesModal(true)}
            ref={recentSalesButtonRef}
            title="Ventas recientes"
            type="button"
          >
            <History aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Ventas recientes</span>
          </button>
          <button
            aria-keyshortcuts="F9"
            className="ml-1 h-11 border-l border-[var(--pos-steel)] pl-3 text-xs font-bold text-[#1D5FD1] transition hover:text-[var(--pos-ink)]"
            onClick={handleNewSale}
            type="button"
          >
            Nueva venta <span className="font-[var(--pos-mono)]">F9</span>
          </button>
          {fullscreenError && (
            <p className="sr-only" role="status">
              {fullscreenError}
            </p>
          )}
          <p className="sr-only">
            Impresora: no configurada. Báscula: captura manual.
          </p>
        </OperationalBar>

        <ScanCommandBar
          onSearchChange={handleProductSearchChange}
          onSearchSubmit={handleProductSearchSubmit}
          search={productSearch}
          searchInputRef={searchInputRef}
        />
        {scanStatus && (
          <p
            className={`shrink-0 border-b px-4 py-1.5 text-xs font-bold ${scanFeedbackTone === "success" ? "border-[rgba(35,113,90,0.25)] bg-[rgba(35,113,90,0.08)] text-[var(--pos-green)]" : scanFeedbackTone === "attention" ? "border-[rgba(233,167,47,0.35)] bg-[rgba(233,167,47,0.14)] text-[#7d5a12]" : "border-[rgba(182,42,34,0.25)] bg-[rgba(182,42,34,0.08)] text-[var(--pos-red)]"}`}
            role="status"
            aria-live="polite"
          >
            {scanStatus}
          </p>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-[40fr_60fr] overflow-hidden xl:grid-cols-[38fr_62fr]">
          <section
            className="min-h-0 min-w-0 overflow-hidden border-r border-[var(--pos-steel)]"
            aria-label="Resultados de productos"
          >
            <ProductResultsTable
              error={products.error}
              frequentProducts={frequentProducts}
              isLoading={products.isLoading}
              locationDisabled={isSeller}
              locations={locationOptions}
              locationsError={locations.error}
              locationsLoading={locations.isLoading}
              locationId={locationId}
              onAdd={handleProductResultAdd}
              onLocationChange={handleLocationChange}
              products={productOptions}
              search={deferredProductSearch}
              showLocationSelector={false}
            />
          </section>
          <section
            className="relative flex min-h-0 min-w-0 flex-col overflow-hidden"
            aria-label="Carrito y captura de cantidades"
          >
            <CartPanel
              activeItemId={activeCartItemId}
              highlightedItemId={recentlyAddedProductId}
              items={cart}
              onActivate={handleCartActivate}
              onQuantityChange={handleQuantityChange}
              onQuantityCommit={() =>
                window.setTimeout(() => searchInputRef.current?.focus(), 0)
              }
              onQuantityFocus={handleQuantityFocus}
              onRemove={handleRemoveProduct}
            />
          </section>
        </div>

        <details
          className="absolute inset-x-3 top-[60px] z-40 sm:inset-x-auto sm:right-3"
          onToggle={(event) =>
            setShowAdvancedSaleFields(event.currentTarget.open)
          }
          open={
            showAdvancedSaleFields ||
            Boolean(canOverrideCredit || requiresAdministrativeInvoice)
          }
        >
          <summary className="flex h-11 w-full cursor-pointer list-none items-center justify-center gap-2 border border-[var(--pos-steel)] bg-white px-3 text-xs font-bold text-[var(--pos-muted)] shadow-[0_8px_18px_rgba(23,33,30,0.10)] transition hover:text-[var(--pos-ink)] sm:w-auto sm:justify-start">
            <Settings2 aria-hidden="true" className="size-4 shrink-0" />
            Opciones de venta
          </summary>
          <div className="pos-drawer-enter absolute left-0 right-0 top-full mt-2 grid max-h-[calc(100dvh-8rem)] w-full grid-cols-1 gap-3 overflow-y-auto border border-[var(--pos-steel)] bg-white p-3 shadow-[0_18px_40px_rgba(23,33,30,0.16)] sm:left-auto sm:w-[min(96vw,58rem)] sm:grid-cols-2 lg:grid-cols-3">
            <section className="rounded-xl border border-[var(--pos-steel)] bg-[var(--pos-porcelain)] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-muted)]">
                    Control documental
                  </p>
                  <h2 className="mt-1 font-[var(--pos-display)] text-lg font-bold uppercase tracking-[-0.02em]">
                    Documento de venta
                  </h2>
                </div>
              </div>
              <p className="mt-2 text-xs text-[var(--pos-muted)]">
                Comprobante interno del MVP. No es factura fiscal.
              </p>
              <div className="mt-3 grid gap-2">
                <label className="grid gap-1.5 text-xs font-bold text-[var(--pos-muted)]">
                  Canal de venta
                  <select
                    aria-label="Canal de venta"
                    className="rounded-lg border border-[var(--pos-steel)] bg-white px-3 py-2 text-sm font-semibold text-[var(--pos-ink)] disabled:cursor-not-allowed disabled:bg-[var(--pos-porcelain)]"
                    disabled={
                      !selectedLocation || allowedSaleChannels.length <= 1
                    }
                    onChange={(event) =>
                      setSelectedSaleChannel(event.target.value as SaleChannel)
                    }
                    value={saleChannel}
                  >
                    {!selectedLocation && (
                      <option value="COUNTER">Selecciona una ubicación</option>
                    )}
                    {allowedSaleChannels.map((channel) => (
                      <option key={channel} value={channel}>
                        {saleChannelLabel(channel)}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedLocation && allowedSaleChannels.length === 1 && (
                  <p className="rounded-lg bg-[rgba(35,113,90,0.08)] p-2 text-xs font-bold text-[var(--pos-green)]">
                    El canal se deriva automáticamente de la ubicación.
                  </p>
                )}
                {!selectedLocation && (
                  <p className="rounded-lg bg-[rgba(233,167,47,0.16)] p-2 text-xs font-bold text-[#7d5a12]">
                    Selecciona una ubicación operativa para conocer los canales
                    válidos.
                  </p>
                )}
                <label className="grid gap-1.5 text-xs font-bold text-[var(--pos-muted)]">
                  Tipo de documento
                  <select
                    aria-label="Tipo de documento"
                    className="rounded-lg border border-[var(--pos-steel)] bg-white px-3 py-2 text-sm font-semibold text-[var(--pos-ink)]"
                    onChange={(event) =>
                      setDocumentType(event.target.value as SaleDocumentType)
                    }
                    value={documentType}
                  >
                    <option value="SCALE_TICKET">Ticket de báscula</option>
                    <option value="SIMPLE_NOTE">Nota sencilla</option>
                    <option value="LARGE_NOTE">Nota grande</option>
                    <option value="INTERNAL_RECEIPT">
                      Comprobante interno
                    </option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs font-bold text-[var(--pos-muted)]">
                  Folio físico
                  <input
                    className="rounded-lg border border-[var(--pos-steel)] bg-white px-3 py-2 text-sm font-semibold text-[var(--pos-ink)]"
                    onChange={(event) => setPhysicalFolio(event.target.value)}
                    placeholder="Cuando aplique"
                    value={physicalFolio}
                  />
                </label>
              </div>
            </section>
            <BillingRequestPanel
              hasCustomer={Boolean(selectedCustomer)}
              notes={billingRequestNotes}
              onNotesChange={setBillingRequestNotes}
              onReasonChange={setBillingRequestReason}
              onRequiresAdministrativeInvoiceChange={
                setRequiresAdministrativeInvoice
              }
              reason={billingRequestReason}
              requiresAdministrativeInvoice={requiresAdministrativeInvoice}
            />
            {canOverrideCredit && (
              <section className="rounded-xl border border-[rgba(233,167,47,0.55)] bg-[rgba(233,167,47,0.12)] p-3 text-[#5b4310] shadow-[0_10px_24px_rgba(23,33,30,0.05)]">
                <label className="flex items-start gap-3 text-sm font-black">
                  <input
                    checked={overrideEnabled}
                    name="credit-override"
                    onChange={(event) => {
                      setOverrideEnabled(event.target.checked);
                      if (!event.target.checked) setOverrideReason("");
                    }}
                    type="checkbox"
                  />
                  <span>
                    Autorizar excepción de crédito
                    <span className="mt-1 block text-xs font-semibold text-[#7d5a12]">
                      Solo ADMIN puede continuar y el motivo quedará registrado.
                    </span>
                  </span>
                </label>
                {overrideEnabled && (
                  <label className="mt-3 grid gap-1.5 text-xs font-black">
                    Motivo obligatorio
                    <textarea
                      className="min-h-20 rounded-lg border border-[rgba(233,167,47,0.55)] bg-white px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-[rgba(233,167,47,0.35)]"
                      name="credit-override-reason"
                      onChange={(event) =>
                        setOverrideReason(event.target.value)
                      }
                      placeholder="Describe quién autorizó y por qué"
                      value={overrideReason}
                    />
                  </label>
                )}
              </section>
            )}
          </div>
        </details>

        {showRecentSalesModal && (
          <RecentSalesModal
            onClose={() => setShowRecentSalesModal(false)}
            returnFocusRef={recentSalesButtonRef}
          />
        )}

        <CheckoutDock
          cart={cart}
          conditionPanelRef={conditionPanelRef}
          confirmButtonRef={confirmButtonRef}
          creditOptions={creditOptions}
          creditRestriction={creditRestriction}
          customerSearch={customerSearch}
          customerSearchRef={customerSearchRef}
          customers={customerOptions}
          customersError={customers.error}
          customersLoading={customers.isLoading}
          disabledReason={submitBlocker}
          isSubmitting={createSale.isPending}
          onConfirm={handleConfirmSale}
          onCustomerSearchChange={setCustomerSearch}
          onCustomerSelect={handleCustomerSelect}
          onPaymentTypeChange={(type) => {
            setPaymentType(type);
            resetOverride();
          }}
          onPaymentsChange={setPayments}
          paymentPanelRef={paymentPanelRef}
          paymentType={paymentType}
          payments={payments}
          selectedCustomer={selectedCustomer}
          total={total}
          transactionState={transactionState}
        />
        {backendError && (
          <p
            role="alert"
            className="absolute bottom-36 left-0 right-0 border-t border-[rgba(182,42,34,0.22)] bg-[rgba(182,42,34,0.08)] px-3 py-2 text-xs font-bold text-[var(--pos-red)]"
          >
            {backendError}
          </p>
        )}
      </section>
      {confirmedSale && (
        <SaleRegisteredScreen
          customerName={confirmedSale.customerName}
          onClose={closeRegisteredSale}
          onNewSale={handleNewSale}
          onOpenHistory={handleOpenHistory}
          onRetryPrint={handleRetryPrint}
          printStatus={printStatus}
          saleNumber={confirmedSale.saleNumber}
          total={confirmedSale.total}
        />
      )}
      {confirmedSale && showTicket && (
        <TicketModal
          fallback={ticketLoading ? undefined : confirmedSale.fallbackTicket}
          isLoading={ticketLoading}
          isProvisional={!ticketLoading && !ticket.data}
          onClose={() => setShowTicket(false)}
          ticket={ticket.data}
        />
      )}
      <ConfirmationDialog
        confirmDisabled={!isOnline}
        confirmLabel="Confirmar registro"
        container={pageRef.current}
        description={
          isOnline
            ? "Verifique la venta antes de descontar inventario y registrar el cobro."
            : OFFLINE_SALE_BLOCKER
        }
        isLoading={createSale.isPending}
        onConfirm={confirmRegistration}
        onOpenChange={(open) => {
          if (!open) setPendingSale(null);
        }}
        open={Boolean(pendingSale)}
        title="Confirmar venta"
      >
        {pendingSale && (
          <div className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <p>
                <strong>Cliente:</strong> {pendingSale.customerName}
              </p>
              <p>
                <strong>Sucursal:</strong> {pendingSale.locationName}
              </p>
              <p>
                <strong>Documento:</strong>{" "}
                {documentTypeLabel(pendingSale.documentType)}
              </p>
              <p>
                <strong>Folio:</strong>{" "}
                {pendingSale.physicalFolio || "Sin folio físico"}
              </p>
              <p>
                <strong>Canal:</strong>{" "}
                {saleChannelLabel(pendingSale.saleChannel)}
              </p>
              <p>
                <strong>Tipo:</strong>{" "}
                {paymentTypeLabel(pendingSale.paymentType)}
              </p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-[var(--pos-steel)] bg-white">
              <table className="w-full min-w-[500px] text-left text-xs">
                <thead className="border-b border-[var(--pos-steel)] bg-[var(--pos-porcelain)] font-mono uppercase tracking-[0.08em] text-[var(--pos-muted)]">
                  <tr>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">Kilos</th>
                    <th className="px-3 py-2">Piezas</th>
                    <th className="px-3 py-2 text-right">P. unitario</th>
                    <th className="px-3 py-2 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingSale.cart.map((item) => (
                    <tr
                      className="border-b border-[var(--pos-steel)] last:border-0"
                      key={item.productId}
                    >
                      <td className="px-3 py-2 font-bold">{item.name}</td>
                      <td className="px-3 py-2 font-mono">
                        {item.quantityKg
                          ? formatQuantity(item.quantityKg)
                          : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {item.quantityPieces
                          ? formatQuantity(item.quantityPieces)
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {toMoney(item.unitPrice)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold">
                        {toMoney(calculateItemSubtotal(item))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="grid gap-1 border-t border-[var(--pos-steel)] pt-3 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd className="font-mono font-bold">
                  {toMoney(pendingSale.total)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Descuento autorizado</dt>
                <dd className="font-mono font-bold">No aplicado</dd>
              </div>
              <div className="flex justify-between">
                <dt>Pagado</dt>
                <dd className="font-mono font-bold">{toMoney(pendingPaid)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Saldo pendiente de esta venta</dt>
                <dd className="font-mono font-bold">
                  {toMoney(pendingOutstanding)}
                </dd>
              </div>
              {pendingCustomerBalance !== undefined && (
                <div className="flex justify-between text-[var(--pos-muted)]">
                  <dt>Saldo histórico del cliente</dt>
                  <dd className="font-mono font-bold">
                    {toMoney(pendingCustomerBalance)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between text-base font-black">
                <dt>Total</dt>
                <dd className="font-mono">{toMoney(pendingSale.total)}</dd>
              </div>
            </dl>
            <div className="grid gap-1 text-xs">
              <p>
                <strong>Pagos:</strong>{" "}
                {pendingSale.payments.length
                  ? pendingSale.payments
                      .map(
                        (payment) =>
                          `${paymentMethodLabel(payment.paymentMethod)} ${toMoney(payment.amount)}`,
                      )
                      .join(" · ")
                  : "Sin pago inmediato"}
              </p>
              <p>
                <strong>Solicitud administrativa:</strong>{" "}
                {pendingSale.requiresAdministrativeInvoice
                  ? `Se creará · ${pendingSale.billingRequestReason || "Motivo pendiente"}`
                  : "No se creará"}
              </p>
              {pendingSale.payload.administrativeOverrideReason && (
                <p className="rounded-xl bg-[rgba(233,167,47,0.16)] p-3 text-[#5b4310]">
                  <strong>Autorización administrativa:</strong>{" "}
                  {pendingSale.payload.administrativeOverrideReason}
                </p>
              )}
            </div>
          </div>
        )}
        {backendError && (
          <p className="font-semibold text-[var(--pos-red)]" role="alert">
            {backendError}
          </p>
        )}
      </ConfirmationDialog>
      <ConfirmationDialog
        confirmLabel="Iniciar nueva venta"
        container={pageRef.current}
        description="La captura actual se eliminará y no podrá recuperarse."
        onConfirm={confirmNewSale}
        onOpenChange={setShowNewSaleDialog}
        open={showNewSaleDialog}
        title="¿Iniciar nueva venta?"
      >
        <p>
          Se borrarán productos, cliente, pagos, folio y solicitud
          administrativa de esta captura.
        </p>
      </ConfirmationDialog>
      <aside
        className="fixed inset-0 z-50 hidden items-center justify-center bg-[var(--pos-porcelain)] p-6 max-[1023px]:flex"
        role="status"
      >
        <section className="max-w-md border border-[var(--pos-steel)] bg-white p-6 text-center">
          <h2 className="text-xl font-bold">Resolución no compatible</h2>
          <p className="mt-3 text-sm text-[var(--pos-muted)]">
            El POS operativo requiere una resolución mínima de 1024 × 768 px
            para mantener visibles el carrito, total y cobro.
          </p>
        </section>
      </aside>
    </main>
  );
}
