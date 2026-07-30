import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedPrincipal, AuthenticatedUser, IssuedSession } from './auth.types';
import { ChangeOwnPasswordDto } from './dto/change-own-password.dto';
import { LoginDto } from './dto/login.dto';
export declare class AuthService {
    private readonly prisma;
    private readonly jwtService;
    constructor(prisma: PrismaService, jwtService: JwtService);
    login(credentials: LoginDto): Promise<IssuedSession>;
    refresh(refreshToken: string): Promise<IssuedSession>;
    verifyAccessToken(token: string): Promise<AuthenticatedPrincipal>;
    changeOwnPassword(userId: string, dto: ChangeOwnPasswordDto): Promise<AuthenticatedUser>;
    logout(sessionId: string): Promise<{
        success: true;
    }>;
    private issueTokens;
    private findSession;
    private revokeSession;
    private isIdleExpired;
    private getSessionTtlSeconds;
    private hashToken;
    private tokenHashesMatch;
    private findUserById;
    private findUserByEmail;
    private assertPasswordPolicy;
    private toAuthenticatedUser;
    private signToken;
    private verifyToken;
    private getSecret;
    private getExpiresIn;
}
