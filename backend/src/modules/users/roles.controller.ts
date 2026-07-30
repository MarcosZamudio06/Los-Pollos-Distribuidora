import { Controller, Get } from '@nestjs/common';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { UsersService } from './users.service';

@Controller('roles')
@RequirePermissions(PERMISSIONS.ROLES_READ)
export class RolesController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async findAll() {
    return { success: true, message: 'Roles retrieved successfully', data: await this.usersService.findRoles() };
  }
}
