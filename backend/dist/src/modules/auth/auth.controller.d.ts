import type { Response } from 'express';
import { AuthService } from './auth.service';
import type { AuthenticatedPrincipal, LoginResult } from './auth.types';
import { ChangeOwnPasswordDto } from './dto/change-own-password.dto';
import { LoginDto } from './dto/login.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(body: LoginDto, response: Response): Promise<{
        success: boolean;
        message: string;
        data: LoginResult;
    }>;
    refresh(cookieHeader: string | undefined, response: Response): Promise<{
        success: boolean;
        message: string;
        data: LoginResult;
    }>;
    logout(user: AuthenticatedPrincipal, response: Response): Promise<{
        success: boolean;
        message: string;
        data: {
            success: true;
        };
    }>;
    changePassword(user: AuthenticatedPrincipal, body: ChangeOwnPasswordDto, response: Response): Promise<{
        success: boolean;
        message: string;
        data: import("./auth.types").AuthenticatedUser;
    }>;
    me(user: AuthenticatedPrincipal): {
        success: boolean;
        message: string;
        data: {
            user: {
                id: string;
                email: string;
                name: string;
                role: string;
                mustChangePassword: boolean;
                operationalLocationId?: string;
            };
        };
    };
    private setRefreshCookie;
    private clearRefreshCookie;
    private readRefreshCookie;
    private toLoginResult;
}
