import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateUserDto,
  DeactivateUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
  UpdateUserPasswordDto,
} from './dto';
import { UsersService } from './users.service';

@Controller('users')
@RequirePermissions(PERMISSIONS.USERS_MANAGE)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async findAll(@Query() query: ListUsersQueryDto) {
    return {
      success: true,
      message: 'Users retrieved successfully',
      data: await this.usersService.findAll(query),
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return {
      success: true,
      message: 'User retrieved successfully',
      data: await this.usersService.findOne(id),
    };
  }

  @Post()
  async create(
    @Body() body: CreateUserDto,
    @CurrentUser() actor: AuthenticatedUser & { authSessionId: string },
  ) {
    return {
      success: true,
      message: 'User created successfully',
      data: await this.usersService.create(body, actor),
    };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser & { authSessionId: string },
  ) {
    return {
      success: true,
      message: 'User updated successfully',
      data: await this.usersService.update(id, body, actor),
    };
  }

  @Patch(':id/password')
  async updatePassword(
    @Param('id') id: string,
    @Body() body: UpdateUserPasswordDto,
    @CurrentUser() actor: AuthenticatedUser & { authSessionId: string },
  ) {
    return {
      success: true,
      message: 'User password updated successfully',
      data: await this.usersService.updatePassword(id, body, actor),
    };
  }

  @Delete(':id')
  async deactivate(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser & { authSessionId: string },
    @Body() body: DeactivateUserDto,
  ) {
    return {
      success: true,
      message: 'User deactivated successfully',
      data: await this.usersService.deactivate(id, currentUser, body),
    };
  }
}
