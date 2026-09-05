import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  History,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { Button, Input, Select } from "../../components/ui";
import { apiClient } from "../../lib/api";
import { hasPermission, PERMISSIONS, useAuth } from "../auth";

type Envelope<T> = { data: T };
type Permission = {
  key: string;
  description?: string | null;
  group: string;
  risk: "standard" | "sensitive" | "critical";
};
type AccessProfile = {
  id: string;
  name: string;
  description?: string | null;
  version: number;
  userCount: number;
  activeSessionCount: number;
  permissions: Permission[];
};
type AccessUser = {
  id: string;
  name: string;
  email: string;
  controlNumber: string;
  isActive: boolean;
  roleId: string;
  role: {
    id: string;
    name: string;
    description?: string | null;
    version: number;
  };
  operationalLocation: { id: string; name: string; type: string };
};
type UserAccess = {
  user: AccessUser;
  permissions: string[];
  activeSessionCount: number;
  sessions: Array<{
    id: string;
    createdAt: string;
    lastUsedAt: string;
    absoluteExpiresAt: string;
  }>;
};
type AuditLog = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  affectedUserCount: number;
  revokedSessionCount: number;
  createdAt: string;
  actor: { id: string; name: string; email: string };
};
type AuditData = {
  items: AuditLog[];
  total: number;
  page: number;
  limit: number;
};

const riskLabel: Record<Permission["risk"], string> = {
  standard: "Operativo",
  sensitive: "Sensible",
  critical: "Crítico",
};

const riskClass: Record<Permission["risk"], string> = {
  standard: "bg-slate-100 text-slate-700",
  sensitive: "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-800",
};

const permissionCopy: Record<string, { label: string; description: string }> = {
  "access_audit.read": {
    label: "Consultar auditoría de accesos",
    description: "Consultar el historial de auditoría de accesos.",
  },
  "access_profiles.manage": {
    label: "Administrar perfiles de acceso",
    description: "Administrar perfiles de acceso y sus permisos.",
  },
  "collections.receive_cash": {
    label: "Recibir efectivo de cobranza",
    description:
      "Recibir pagos de cobranza en efectivo en la ubicación asignada.",
  },
  "cash_shift.open_own": {
    label: "Abrir y consultar turno propio",
    description:
      "Abrir y consultar el turno de caja propio en la ubicación asignada.",
  },
  "cash_shift.close_own": {
    label: "Cerrar turno propio",
    description: "Cerrar el turno de caja propio con su dispositivo registrado.",
  },
  "cash_terminals.reassign": {
    label: "Reasignar terminales de caja",
    description: "Reasignar terminales de caja a una ubicación operativa.",
  },
  "costs.read": {
    label: "Consultar costos y márgenes",
    description: "Consultar costos de compra e información de márgenes.",
  },
  "daily_closes.differences.authorize": {
    label: "Autorizar diferencias de cierre",
    description: "Autorizar diferencias del cierre diario.",
  },
  "daily_closes.reopen": {
    label: "Reabrir cierre diario",
    description: "Reabrir un cierre diario ya realizado.",
  },
  "fiscal_information.export": {
    label: "Exportar información fiscal",
    description: "Exportar información fiscal.",
  },
  "payments.cancel": {
    label: "Cancelar pagos registrados",
    description: "Cancelar pagos registrados.",
  },
  "roles.read": {
    label: "Consultar perfiles de acceso",
    description: "Consultar perfiles de acceso.",
  },
  "users.manage": {
    label: "Administrar usuarios internos",
    description: "Administrar usuarios internos.",
  },
  "user_sessions.revoke": {
    label: "Revocar sesiones activas",
    description: "Revocar sesiones activas de usuarios internos.",
  },
};

const permissionGroupLabels: Record<string, string> = {
  Access: "Acceso",
  Cash: "Caja",
  Finance: "Finanzas",
  Information: "Información",
  Security: "Seguridad",
};

const profileDescriptionTranslations: Record<string, string> = {
  ADMIN: "Administrador del sistema con acceso completo.",
  BILLING:
    "Usuario de revisión de facturación, conciliación y vinculación de facturas.",
  COLLECTIONS: "Usuario de cuentas por cobrar y cobranza.",
  DRIVER: "Usuario de operaciones de reparto en ruta.",
  SELLER: "Usuario de punto de venta y operaciones de venta.",
  WAREHOUSE: "Usuario de inventario y operaciones de almacén.",
};

function getPermissionCopy(permission: Permission) {
  return (
    permissionCopy[permission.key] ?? {
      label: "Permiso de acceso",
      description: "Permiso de acceso sin descripción disponible.",
    }
  );
}

function getProfileDescription(profile: AccessProfile | null) {
  if (!profile) return "Selecciona un perfil para revisar sus permisos.";
  return (
    profileDescriptionTranslations[profile.name] ??
    profile.description ??
    "Perfil de acceso operativo."
  );
}

function authHeaders(token?: string | null): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

type AccessProfilesData = {
  access: UserAccess | null;
  audit: AuditData;
  permissions: Permission[];
  profiles: AccessProfile[];
};

async function fetchAccessProfilesData(
  headers: Record<string, string>,
  userId: string | null,
): Promise<AccessProfilesData> {
  const requests: [
    Promise<{ data: AccessProfile[] }>,
    Promise<{ data: Permission[] }>,
    Promise<{ data: AuditData }>,
  ] = [
    apiClient.get<Envelope<AccessProfile[]>>("/roles", { headers }),
    apiClient.get<Envelope<Permission[]>>("/permissions", { headers }),
    apiClient.get<Envelope<AuditData>>(
      "/access-control/audit-logs?limit=25",
      { headers },
    ),
  ];
  const [profileResponse, permissionResponse, auditResponse] =
    await Promise.all(requests);
  const accessResponse = userId
    ? await apiClient.get<Envelope<UserAccess>>(`/users/${userId}/access`, {
        headers,
      })
    : null;

  return {
    access: accessResponse?.data ?? null,
    audit: auditResponse.data,
    permissions: permissionResponse.data,
    profiles: profileResponse.data,
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AccessProfilesPage() {
  const { accessToken, logout, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = searchParams.get("userId");
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [audit, setAudit] = useState<AuditData>({
    items: [],
    total: 0,
    page: 1,
    limit: 25,
  });
  const [selectedId, setSelectedId] = useState("");
  const [draftKeys, setDraftKeys] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [access, setAccess] = useState<UserAccess | null>(null);
  const [profileReason, setProfileReason] = useState("");
  const [sessionReason, setSessionReason] = useState("");
  const [nextUserRoleId, setNextUserRoleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selectedIdRef = useRef("");

  const headers = useMemo(() => authHeaders(accessToken), [accessToken]);
  const selectedProfile =
    profiles.find((profile) => profile.id === selectedId) ?? null;
  const selectedKeys = useMemo(() => new Set(draftKeys), [draftKeys]);
  const originalKeys = useMemo(
    () =>
      new Set(
        selectedProfile?.permissions.map((permission) => permission.key) ?? [],
      ),
    [selectedProfile],
  );
  const added = draftKeys.filter((key) => !originalKeys.has(key));
  const removed = [...originalKeys].filter((key) => !selectedKeys.has(key));
  const groupedPermissions = useMemo(
    () =>
      permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
        groups[permission.group] = [
          ...(groups[permission.group] ?? []),
          permission,
        ];
        return groups;
      }, {}),
    [permissions],
  );
  const canManageProfiles = hasPermission(
    user,
    PERMISSIONS.accessProfilesManage,
  );

  const applyAccessProfilesData = useCallback((data: AccessProfilesData) => {
    setProfiles(data.profiles);
    setPermissions(data.permissions);
    setAudit(data.audit);
    const initialProfile =
      data.profiles.find((profile) => profile.id === selectedIdRef.current) ??
      data.profiles[0];
    if (initialProfile) {
      selectedIdRef.current = initialProfile.id;
      setSelectedId(initialProfile.id);
      setDraftKeys(
        initialProfile.permissions.map((permission) => permission.key),
      );
    }
    setAccess(data.access);
    if (data.access) setNextUserRoleId(data.access.user.roleId);
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      applyAccessProfilesData(await fetchAccessProfilesData(headers, userId));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo cargar el control de acceso.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetchAccessProfilesData(headers, userId)
      .then((data) => {
        if (active) applyAccessProfilesData(data);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : "No se pudo cargar el control de acceso.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyAccessProfilesData, headers, userId]);

  function selectProfile(profile: AccessProfile) {
    selectedIdRef.current = profile.id;
    setSelectedId(profile.id);
    setDraftKeys(profile.permissions.map((permission) => permission.key));
    setReason("");
    setNotice("");
  }

  function togglePermission(key: string) {
    setDraftKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  async function savePermissions() {
    if (!selectedProfile || !reason.trim() || !canManageProfiles) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await apiClient.patch<
        Envelope<{ role: AccessProfile; currentSessionRevoked: boolean }>,
        { permissionKeys: string[]; expectedVersion: number; reason: string }
      >(`/roles/${selectedProfile.id}/permissions`, {
        body: {
          permissionKeys: draftKeys,
          expectedVersion: selectedProfile.version,
          reason: reason.trim(),
        },
        headers,
      });
      setNotice(
        `Perfil actualizado. ${response.data.role.userCount} empleados afectados y sus sesiones activas fueron cerradas.`,
      );
      if (response.data.currentSessionRevoked) {
        await logout();
        navigate("/login", { replace: true });
        return;
      }
      await load();
      setReason("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo actualizar el perfil.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateUserProfile() {
    if (!access || !nextUserRoleId || !profileReason.trim()) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await apiClient.patch<
        Envelope<{ access: UserAccess; currentSessionRevoked: boolean }>,
        { roleId: string; expectedRoleId: string; reason: string }
      >(`/users/${access.user.id}/access-profile`, {
        body: {
          roleId: nextUserRoleId,
          expectedRoleId: access.user.roleId,
          reason: profileReason.trim(),
        },
        headers,
      });
      setNotice("Perfil del empleado actualizado y sesiones revocadas.");
      if (response.data.currentSessionRevoked) {
        await logout();
        navigate("/login", { replace: true });
        return;
      }
      setAccess(response.data.access);
      setProfileReason("");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo reasignar el perfil.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function revokeSessions() {
    if (!access || !sessionReason.trim()) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await apiClient.post<
        Envelope<{ currentSessionRevoked: boolean }>,
        { reason: string }
      >(`/users/${access.user.id}/sessions/revoke`, {
        body: { reason: sessionReason.trim() },
        headers,
      });
      if (response.data.currentSessionRevoked) {
        await logout();
        navigate("/login", { replace: true });
        return;
      }
      setNotice("Sesiones activas revocadas.");
      setSessionReason("");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudieron revocar las sesiones.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-full bg-[var(--erp-background)] p-4 text-[var(--erp-foreground)] sm:p-6 lg:p-8">
      <div className="mx-auto grid max-w-[1480px] gap-6">
        <header className="overflow-hidden rounded-[1.6rem] border border-[color:var(--erp-border)] border-t-4 border-t-[var(--erp-brand-gold)] bg-white p-6 text-[var(--erp-foreground)] shadow-[var(--erp-shadow)] sm:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <Link
                className="inline-flex items-center gap-2 text-sm font-bold text-[var(--erp-muted-foreground)] transition hover:text-[var(--erp-brand-red)]"
                to="/admin/employees"
              >
                <ArrowLeft className="h-4 w-4" /> Volver a configuración de
                empleados
              </Link>
              <p className="mt-6 flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-[var(--erp-brand-gold-deep)]">
                <LockKeyhole className="h-4 w-4" /> Gobierno de acceso
              </p>
              <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-[-.05em] text-[var(--erp-foreground)] sm:text-5xl">
                Perfiles que dejan huella.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--erp-muted-foreground)]">
                Administra capacidades canónicas, revisa el impacto antes de
                guardar y cierra sesiones que ya no deben operar.
              </p>
            </div>
            <div className="grid min-w-64 grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)]">
              <div className="bg-white p-4">
                <p className="text-xs uppercase tracking-[.14em] text-[var(--erp-muted-foreground)]">
                  Perfiles
                </p>
                <p className="mt-2 text-3xl font-black">{profiles.length}</p>
              </div>
              <div className="bg-white p-4">
                <p className="text-xs uppercase tracking-[.14em] text-[var(--erp-muted-foreground)]">
                  Permisos
                </p>
                <p className="mt-2 text-3xl font-black">{permissions.length}</p>
              </div>
            </div>
          </div>
        </header>

        {error && (
          <p
            className="rounded-xl border border-[rgba(157,45,36,.3)] bg-[rgba(157,45,36,.08)] p-4 text-sm font-semibold text-[var(--erp-danger)]"
            role="alert"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            className="rounded-xl border border-[rgba(63,123,65,.3)] bg-[rgba(63,123,65,.09)] p-4 text-sm font-semibold text-[var(--erp-success)]"
            role="status"
          >
            {notice}
          </p>
        )}

        <section className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)_20rem]">
          <aside className="rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white p-3 shadow-[var(--erp-shadow)]">
            <div className="px-3 py-3">
              <p className="text-xs font-black uppercase tracking-[.16em] text-[var(--erp-brand-red)]">
                Perfiles canónicos
              </p>
              <p className="mt-1 text-xs text-[var(--erp-muted-foreground)]">
                El puesto permanece estable; sus capacidades son explícitas.
              </p>
            </div>
            <div className="grid gap-1">
              {profiles.map((profile) => (
                <button
                  aria-pressed={profile.id === selectedId}
                  className={`rounded-xl border px-3 py-3 text-left transition ${profile.id === selectedId ? "border-[var(--erp-brand-gold)] bg-white text-[var(--erp-foreground)] shadow-[0_10px_24px_rgba(17,24,21,0.07)]" : "border-transparent text-[var(--erp-foreground)] hover:bg-[var(--erp-surface-muted)]"}`}
                  key={profile.id}
                  onClick={() => selectProfile(profile)}
                  type="button"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-black">{profile.name}</span>
                    <span className="font-mono text-xs text-[var(--erp-muted-foreground)]">
                      v{profile.version}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-[var(--erp-muted-foreground)]">
                    {profile.userCount} empleados · {profile.activeSessionCount}{" "}
                    sesiones
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white shadow-[var(--erp-shadow)]">
            <div className="border-b border-[color:var(--erp-border)] p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <p className="text-xs font-black uppercase tracking-[.16em] text-[var(--erp-brand-gold-deep)]">
                    Editor de capacidades
                  </p>
                  <h2 className="mt-2 text-2xl font-black">
                    {selectedProfile?.name ??
                      (loading ? "Cargando..." : "Sin perfil")}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">
                    {getProfileDescription(selectedProfile)}
                  </p>
                </div>
                {selectedProfile && (
                  <div className="rounded-xl bg-[var(--erp-surface-muted)] px-3 py-2 text-right text-xs">
                    <p className="text-[var(--erp-muted-foreground)]">
                      Sesiones que se cerrarían
                    </p>
                    <p className="font-black">
                      {selectedProfile.activeSessionCount}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
              {Object.entries(groupedPermissions).map(
                ([group, groupPermissions]) => (
                  <div
                    className="rounded-xl border border-[color:var(--erp-border)] p-4"
                    key={group}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-black">
                        {permissionGroupLabels[group] ?? "Otros permisos"}
                      </h3>
                      <span className="text-xs text-[var(--erp-muted-foreground)]">
                        {
                          groupPermissions.filter((permission) =>
                            selectedKeys.has(permission.key),
                          ).length
                        }
                        /{groupPermissions.length}
                      </span>
                    </div>
                    <div className="grid gap-2">
                      {groupPermissions.map((permission) => {
                        const copy = getPermissionCopy(permission);
                        return (
                          <label
                            className="flex cursor-pointer items-start gap-3 rounded-lg p-2 transition hover:bg-[var(--erp-surface-muted)]"
                            key={permission.key}
                          >
                            <input
                              checked={selectedKeys.has(permission.key)}
                              className="mt-1 h-4 w-4 accent-[var(--erp-brand-red)]"
                              disabled={!canManageProfiles || saving}
                              onChange={() => togglePermission(permission.key)}
                              type="checkbox"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold">
                                  {copy.label}
                                </span>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${riskClass[permission.risk]}`}
                                >
                                  {riskLabel[permission.risk]}
                                </span>
                              </span>
                              <span className="mt-1 block text-xs leading-5 text-[var(--erp-muted-foreground)]">
                                {copy.description}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ),
              )}
            </div>
            <div className="border-t border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] p-5 sm:p-6">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <label className="grid gap-1.5 text-sm font-bold">
                  Motivo obligatorio
                  <Input
                    disabled={!canManageProfiles || saving}
                    maxLength={300}
                    placeholder="Ej. Separación de revisión financiera"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <Button
                  disabled={
                    !selectedProfile ||
                    !canManageProfiles ||
                    !reason.trim() ||
                    saving ||
                    (added.length === 0 && removed.length === 0)
                  }
                  onClick={() => void savePermissions()}
                >
                  <ShieldCheck className="h-4 w-4" /> Guardar cambios
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {added.length > 0 && (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 font-bold text-emerald-800">
                    +{added.length} permisos
                  </span>
                )}
                {removed.length > 0 && (
                  <span className="rounded-full bg-red-100 px-3 py-1 font-bold text-red-800">
                    -{removed.length} permisos
                  </span>
                )}
                {selectedProfile && (
                  <span className="rounded-full bg-white px-3 py-1 font-semibold text-[var(--erp-muted-foreground)]">
                    Afecta {selectedProfile.userCount} empleados
                  </span>
                )}
              </div>
            </div>
          </section>

          <aside className="grid content-start gap-6">
            {access ? (
              <section className="rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white p-5 shadow-[var(--erp-shadow)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[.16em] text-[var(--erp-brand-red)]">
                      Empleado seleccionado
                    </p>
                    <h2 className="mt-2 text-xl font-black">
                      {access.user.name}
                    </h2>
                    <p className="mt-1 text-xs text-[var(--erp-muted-foreground)]">
                      {access.user.controlNumber} ·{" "}
                      {access.user.operationalLocation.name}
                    </p>
                  </div>
                  <Link
                    aria-label="Cerrar empleado seleccionado"
                    className="rounded-lg p-2 text-[var(--erp-muted-foreground)] hover:bg-[var(--erp-surface-muted)]"
                    to="/admin/access-profiles"
                  >
                    <X className="h-4 w-4" />
                  </Link>
                </div>
                <div className="mt-5 grid gap-3">
                  <label className="grid gap-1.5 text-sm font-bold">
                    Nuevo perfil
                    <Select
                      disabled={!canManageProfiles || saving}
                      onChange={(event) =>
                        setNextUserRoleId(event.target.value)
                      }
                      value={nextUserRoleId}
                    >
                      {profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="grid gap-1.5 text-sm font-bold">
                    Motivo del cambio
                    <Input
                      disabled={!canManageProfiles || saving}
                      placeholder="Cambio de responsabilidad"
                      value={profileReason}
                      onChange={(event) => setProfileReason(event.target.value)}
                    />
                  </label>
                  <Button
                    disabled={
                      !canManageProfiles ||
                      saving ||
                      !profileReason.trim() ||
                      nextUserRoleId === access.user.roleId
                    }
                    onClick={() => void updateUserProfile()}
                    variant="secondary"
                  >
                    <Users className="h-4 w-4" /> Reasignar perfil
                  </Button>
                </div>
                <div className="mt-5 border-t border-[color:var(--erp-border)] pt-4">
                  <p className="text-xs font-black uppercase tracking-[.14em] text-[var(--erp-muted-foreground)]">
                    Sesiones activas: {access.activeSessionCount}
                  </p>
                  <label className="mt-3 grid gap-1.5 text-sm font-bold">
                    Motivo de cierre
                    <Input
                      disabled={!canManageProfiles || saving}
                      placeholder="Revocación preventiva"
                      value={sessionReason}
                      onChange={(event) => setSessionReason(event.target.value)}
                    />
                  </label>
                  <Button
                    className="mt-3 w-full"
                    disabled={
                      !hasPermission(user, PERMISSIONS.userSessionsRevoke) ||
                      saving ||
                      !sessionReason.trim()
                    }
                    onClick={() => void revokeSessions()}
                    variant="outline"
                  >
                    <KeyRound className="h-4 w-4" /> Cerrar sesiones
                  </Button>
                </div>
              </section>
            ) : (
              <section className="rounded-[1.4rem] border border-dashed border-[color:var(--erp-border)] bg-white p-5 shadow-[var(--erp-shadow)]">
                <Users className="h-5 w-5 text-[var(--erp-brand-gold-deep)]" />
                <h2 className="mt-3 font-black">Impacto por empleado</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--erp-muted-foreground)]">
                  Abre un empleado desde la administración de personal para
                  revisar su perfil efectivo y cerrar sus sesiones.
                </p>
                <Link
                  className="mt-4 inline-flex text-sm font-black text-[var(--erp-brand-red)] hover:underline"
                  to="/admin/employees"
                >
                  Ir a empleados
                </Link>
              </section>
            )}
            <section className="rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white p-5 shadow-[var(--erp-shadow)]">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-[var(--erp-brand-gold-deep)]" />
                <h2 className="font-black">Últimos cambios</h2>
              </div>
              <div className="mt-4 grid gap-3">
                {audit.items.length === 0 ? (
                  <p className="text-sm text-[var(--erp-muted-foreground)]">
                    Aún no hay movimientos de acceso.
                  </p>
                ) : (
                  audit.items.slice(0, 5).map((item) => (
                    <div
                      className="border-l-2 border-[var(--erp-brand-gold)] pl-3"
                      key={item.id}
                    >
                      <p className="font-mono text-[11px] font-bold">
                        {item.action}
                      </p>
                      <p className="mt-1 text-xs text-[var(--erp-muted-foreground)]">
                        {item.actor.name} · {formatDate(item.createdAt)}
                      </p>
                      <p className="mt-1 text-xs leading-5">{item.reason}</p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
