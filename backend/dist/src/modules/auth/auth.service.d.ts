import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { AuthenticatedUser, LoginResult } from './auth.types';
export declare class AuthService {
    private readonly prisma;
    private readonly jwtService;
    constructor(prisma: PrismaService, jwtService: JwtService);
    login(credentials: LoginDto): Promise<LoginResult>;
    refresh(refreshToken: string): Promise<LoginResult>;
    verifyAccessToken(token: string): Promise<AuthenticatedUser>;
    logout(): {
        success: true;
    };
    private findUserByEmail;
    private toAuthenticatedUser;
    private signToken;
    private verifyToken;
    private getSecret;
}
