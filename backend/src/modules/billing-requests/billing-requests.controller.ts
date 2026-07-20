import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { BillingRequestsService } from './billing-requests.service';
import { CancelBillingRequestDto, CreateBillingRequestDto, LinkInvoiceDto, ListBillingRequestsQueryDto, ReviewBillingRequestDto, UpdateBillingRequestDto } from './dto';

@Controller(['billing/requests', 'billing-requests'])
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingRequestsController {
  constructor(private readonly service: BillingRequestsService) {}

  @Get()
  @Roles('ADMIN', 'BILLING', 'SELLER', 'COLLECTIONS')
  async findAll(@Query() query: ListBillingRequestsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return { success: true, message: 'Billing requests retrieved successfully', data: await this.service.findAll(query, user) };
  }

  @Get(':id')
  @Roles('ADMIN', 'BILLING', 'SELLER', 'COLLECTIONS')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return { success: true, message: 'Billing request retrieved successfully', data: await this.service.findOne(id, user) };
  }

  @Post()
  @Roles('ADMIN', 'SELLER')
  async create(@Body() body: CreateBillingRequestDto, @CurrentUser() user: AuthenticatedUser, @Headers('Idempotency-Key') idempotencyKey?: string) {
    if (body.documents?.length && !idempotencyKey?.trim()) throw new BadRequestException('Idempotency-Key header is required');
    return { success: true, message: 'Billing request created successfully', data: await this.service.create(body, user, idempotencyKey) };
  }

  @Post(':id/start-review')
  @Roles('ADMIN', 'BILLING')
  async startReview(@Param('id') id: string, @Body() body: ReviewBillingRequestDto, @CurrentUser() user: AuthenticatedUser) {
    return { success: true, message: 'Billing request review started successfully', data: await this.service.startReview(id, body, user) };
  }

  @Post(':id/approve')
  @Roles('ADMIN', 'BILLING')
  async approve(@Param('id') id: string, @Body() body: ReviewBillingRequestDto, @CurrentUser() user: AuthenticatedUser) {
    return { success: true, message: 'Billing request approved successfully', data: await this.service.approve(id, body, user) };
  }

  @Post(':id/reject')
  @Roles('ADMIN', 'BILLING')
  async reject(@Param('id') id: string, @Body() body: ReviewBillingRequestDto, @CurrentUser() user: AuthenticatedUser) {
    return { success: true, message: 'Billing request rejected successfully', data: await this.service.reject(id, body, user) };
  }

  @Patch(':id')
  @Roles('ADMIN', 'SELLER')
  async update(@Param('id') id: string, @Body() body: UpdateBillingRequestDto, @CurrentUser() user: AuthenticatedUser) {
    return { success: true, message: 'Billing request updated successfully', data: await this.service.update(id, body, user) };
  }

  @Post(':id/cancel')
  @Roles('ADMIN', 'BILLING')
  async cancel(@Param('id') id: string, @Body() body: CancelBillingRequestDto, @CurrentUser() user: AuthenticatedUser) {
    return { success: true, message: 'Billing request cancelled successfully', data: await this.service.cancel(id, body, user) };
  }

  @Post(':id/link-invoice')
  @Roles('ADMIN', 'BILLING')
  async linkInvoice(@Param('id') id: string, @Body() body: LinkInvoiceDto, @CurrentUser() user: AuthenticatedUser, @Headers('Idempotency-Key') idempotencyKey?: string) {
    if (!idempotencyKey?.trim()) throw new BadRequestException('Idempotency-Key header is required');
    if (!!body.invoiceId === !!body.invoice) throw new BadRequestException('Provide exactly one of invoiceId or invoice');
    return { success: true, message: 'Invoice linked successfully', data: await this.service.linkInvoice(id, body, user, idempotencyKey.trim()) };
  }
}
