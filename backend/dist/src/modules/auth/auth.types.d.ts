export type AuthenticatedUser = {
    id: string;
    email: string;
    name: string;
    role: string;
    permissions?: string[];
    mustChangePassword: boolean;
    operationalLocationId?: string;
};
export type TokenPayload = {
    sub: string;
    email: string;
    role: string;
    type: 'access' | 'refresh';
    sessionId: string;
    sessionVersion: number;
    tokenVersion?: number;
};
export type LoginResult = {
    accessToken: string;
    user: AuthenticatedUser;
};
export type IssuedSession = LoginResult & {
    refreshToken: string;
    refreshTokenExpiresAt: Date;
};
export type AuthenticatedPrincipal = AuthenticatedUser & {
    authSessionId: string;
};
