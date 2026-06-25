import { CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthService } from '../../modules/auth/auth.service';
export declare class JwtAuthGuard implements CanActivate {
    private readonly authService;
    constructor(authService: AuthService);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private extractBearerToken;
}
