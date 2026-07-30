import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Body,
  Query,
  Req,
} from '@nestjs/common';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestWithId } from '../../common/middleware/request-id.middleware';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import {
  ListAccessAuditLogsDto,
  RevokeUserSessionsDto,
  UpdateRolePermissionsDto,
  UpdateUserAccessProfileDto,
} from './dto';
import { AccessControlService } from './access-control.service';

@Controller()
export class AccessControlController {
  constructor(private readonly service: AccessControlService) {}

  @Get('permissions')
  @RequirePermissions(PERMISSIONS.ROLES_READ)
  async listPermissions() {
    return this.response('Permissions retrieved successfully', await this.service.listPermissions());
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.ROLES_READ)
  async listRoles() {
    return this.response('Access profiles retrieved successfully', await this.service.listRoles());
  }

  @Get('roles/:id')
  @RequirePermissions(PERMISSIONS.ROLES_READ)
  async getRole(@Param('id') id: string) {
    return this.response('Access profile retrieved successfully', await this.service.getRole(id));
  }

  @Patch('roles/:id/permissions')
  @RequirePermissions(PERMISSIONS.ACCESS_PROFILES_MANAGE)
  async updateRolePermissions(
    @Param('id') id: string,
    @Body() body: UpdateRolePermissionsDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
  ) {
    return this.response(
      'Access profile permissions updated successfully',
      await this.service.updateRolePermissions(id, body, actor, this.context(request)),
    );
  }

  @Get('users/:id/access')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  async getUserAccess(@Param('id') id: string) {
    return this.response('User access retrieved successfully', await this.service.getUserAccess(id));
  }

  @Patch('users/:id/access-profile')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  async updateUserAccessProfile(
    @Param('id') id: string,
    @Body() body: UpdateUserAccessProfileDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
  ) {
    return this.response(
      'User access profile updated successfully',
      await this.service.updateUserAccessProfile(id, body, actor, this.context(request)),
    );
  }

  @Post('users/:id/sessions/revoke')
  @RequirePermissions(PERMISSIONS.USER_SESSIONS_REVOKE)
  async revokeUserSessions(
    @Param('id') id: string,
    @Body() body: RevokeUserSessionsDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
    @Req() request: RequestWithId,
  ) {
    return this.response(
      'User sessions revoked successfully',
      await this.service.revokeUserSessions(id, body, actor, this.context(request)),
    );
  }

  @Get('access-control/audit-logs')
  @RequirePermissions(PERMISSIONS.ACCESS_AUDIT_READ)
  async listAuditLogs(@Query() query: ListAccessAuditLogsDto) {
    return this.response('Access-control audit logs retrieved successfully', await this.service.listAuditLogs(query));
  }

  private response(message: string, data: unknown) {
    return { success: true, message, data };
  }

  private context(request: RequestWithId) {
    return { requestId: request.requestId, ipAddress: request.ip };
  }
}
