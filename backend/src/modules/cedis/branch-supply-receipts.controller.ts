import {
  BadRequestException,
  Body,
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
import { ListIncomingSuppliesQueryDto, ReceiveIncomingSupplyDto } from './dto';
import { BranchSupplyReceiptsService } from './branch-supply-receipts.service';

@Controller('cedis/incoming-supplies')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'WAREHOUSE', 'SELLER')
@RequirePermissions(PERMISSIONS.CEDIS_RECEIVE_SUPPLIES)
export class BranchSupplyReceiptsController {
  constructor(private readonly service: BranchSupplyReceiptsService) {}

  @Get()
  async list(
    @Query() query: ListIncomingSuppliesQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Incoming CEDIS supplies retrieved successfully',
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
      message: 'Incoming CEDIS supply retrieved successfully',
      data: await this.service.findOne(transferId, user),
    };
  }

  @Post(':transferId/receive')
  async receive(
    @Param('transferId') transferId: string,
    @Body() body: ReceiveIncomingSupplyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const key = idempotencyKey?.trim();
    if (!key) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return {
      success: true,
      message: 'CEDIS supply received successfully',
      data: await this.service.receive(transferId, body, user, key),
    };
  }
}
