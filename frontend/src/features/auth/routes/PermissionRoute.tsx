import { Navigate } from "react-router-dom";
import type { PropsWithChildren } from "react";
import { useAuth } from "../useAuth";
import { hasPermission } from "../permissions";

type PermissionRouteProps = PropsWithChildren<{
  permission: string;
}>;

export function PermissionRoute({
  children,
  permission,
}: PermissionRouteProps) {
  const { user } = useAuth();

  if (!user || !hasPermission(user, permission)) {
    return <Navigate replace to="/403" />;
  }

  return children;
}
