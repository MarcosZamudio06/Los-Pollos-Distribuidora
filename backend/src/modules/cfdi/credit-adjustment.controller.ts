import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreditAdjustmentService } from './credit-adjustment.service';
import {
  CreateCreditAdjustmentDto,
  CreditAdjustmentVersionDto,
} from './dto/credit-adjustment.dto';

@Controller('billing/credit-adjustments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CreditAdjustmentController {
  constructor(private readonly service: CreditAdjustmentService) {}

  @Post()
  @Roles('ADMIN', 'BILLING')
  async create(
    @Body() body: CreateCreditAdjustmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    const key = this.requireIdempotencyKey(idempotencyKey);
    return {
      success: true,
      message: 'Credit adjustment created successfully',
      data: await this.service.create(body, user, key),
    };
  }

  @Get(':id')
  @Roles('ADMIN', 'BILLING')
  async findOne(@Param('id') id: string) {
    return {
      success: true,
      data: await this.service.findOne(id),
    };
  }

  @Post(':id/approve')
  @Roles('ADMIN', 'BILLING')
  async approve(
    @Param('id') id: string,
    @Body() body: CreditAdjustmentVersionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Credit adjustment approved successfully',
      data: await this.service.approve(id, body, user),
    };
  }

  @Post(':id/issue-cfdi')
  @Roles('ADMIN', 'BILLING')
  async issue(
    @Param('id') id: string,
    @Body() body: CreditAdjustmentVersionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    const key = this.requireIdempotencyKey(idempotencyKey);
    return {
      success: true,
      message: 'Credit-note CFDI issuance processed successfully',
      data: await this.service.issue(id, body, user, key),
    };
  }

  private requireIdempotencyKey(value?: string): string {
    const key = value?.trim();
    if (!key) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    if (key.length > 128) {
      throw new BadRequestException('IDEMPOTENCY_KEY_TOO_LONG');
    }
    return key;
  }
}
