export type AuthenticatedUser = {
    id: string;
    email: string;
    name: string;
    role: string;
};
export type TokenPayload = {
    sub: string;
    email: string;
    role: string;
    type: 'access' | 'refresh';
};
export type LoginResult = {
    accessToken: string;
    refreshToken: string;
    user: AuthenticatedUser;
};
