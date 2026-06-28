import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
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
@Roles('ADMIN')
@UseGuards(JwtAuthGuard, RolesGuard)
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
  async create(@Body() body: CreateUserDto) {
    return {
      success: true,
      message: 'User created successfully',
      data: await this.usersService.create(body),
    };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return {
      success: true,
      message: 'User updated successfully',
      data: await this.usersService.update(id, body),
    };
  }

  @Patch(':id/password')
  async updatePassword(
    @Param('id') id: string,
    @Body() body: UpdateUserPasswordDto,
  ) {
    return {
      success: true,
      message: 'User password updated successfully',
      data: await this.usersService.updatePassword(id, body),
    };
  }

  @Delete(':id')
  async deactivate(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: DeactivateUserDto,
  ) {
    return {
      success: true,
      message: 'User deactivated successfully',
      data: await this.usersService.deactivate(id, currentUser.id, body),
    };
  }
}
