import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth.types';
import { ChangeOwnPasswordDto } from './dto/change-own-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(body: LoginDto): Promise<{
        success: boolean;
        message: string;
        data: import("./auth.types").LoginResult;
    }>;
    refresh(body: RefreshTokenDto): Promise<{
        success: boolean;
        message: string;
        data: import("./auth.types").LoginResult;
    }>;
    logout(): {
        success: boolean;
        message: string;
        data: {
            success: true;
        };
    };
    changePassword(user: AuthenticatedUser, body: ChangeOwnPasswordDto): Promise<{
        success: boolean;
        message: string;
        data: AuthenticatedUser;
    }>;
    me(user: AuthenticatedUser): {
        success: boolean;
        message: string;
        data: {
            user: AuthenticatedUser;
        };
    };
}
