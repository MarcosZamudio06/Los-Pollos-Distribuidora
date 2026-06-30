import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../../modules/auth/auth.service';
export declare class JwtAuthGuard implements CanActivate {
    private readonly authService;
    private readonly reflector?;
    constructor(authService: AuthService, reflector?: Reflector | undefined);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private allowsPasswordChangeRequired;
    private extractBearerToken;
}
