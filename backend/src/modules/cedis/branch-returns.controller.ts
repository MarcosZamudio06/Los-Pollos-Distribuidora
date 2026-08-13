import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ListBranchReturnsQueryDto } from './dto';
import { BranchReturnsService } from './branch-returns.service';

@Controller('cedis/returns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'WAREHOUSE', 'SELLER')
@RequirePermissions(PERMISSIONS.CEDIS_VIEW)
export class BranchReturnsController {
  constructor(private readonly service: BranchReturnsService) {}

  @Get()
  async list(
    @Query() query: ListBranchReturnsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'CEDIS returns retrieved successfully',
      data: await this.service.list(query, user),
    };
  }

  @Get(':transferId')
  async findOne(
    @Param('transferId') transferId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'CEDIS return retrieved successfully',
      data: await this.service.findOne(transferId, user),
    };
  }

  @Post(':transferId/complete')
  @Roles('ADMIN', 'WAREHOUSE')
  @RequirePermissions(PERMISSIONS.CEDIS_RECEIVE_RETURNS)
  async complete(
    @Param('transferId') transferId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const key = idempotencyKey?.trim();
    if (!key)
      throw new BadRequestException('Idempotency-Key header is required');
    return {
      success: true,
      message: 'CEDIS return completed successfully',
      data: await this.service.complete(transferId, user, key),
    };
  }
}
