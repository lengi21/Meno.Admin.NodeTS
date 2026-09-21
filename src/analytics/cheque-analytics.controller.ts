import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentAdmin } from '../auth/current-admin.decorator.js';
import type { AdminTokenPayload } from '../auth/auth.types.js';
import { ChequeAnalyticsService } from './cheque-analytics.service.js';

@Controller('admin/analytics')
@UseGuards(JwtAuthGuard)
export class ChequeAnalyticsController {
  constructor(private readonly analytics: ChequeAnalyticsService) {}

  @Get('cheques')
  list(@CurrentAdmin() actor: AdminTokenPayload, @Query() query: Record<string, string | undefined>) {
    return this.analytics.list(actor, query);
  }

  @Get('cheques/filters')
  filters(@CurrentAdmin() actor: AdminTokenPayload) {
    return this.analytics.filters(actor);
  }

  @Get('cheques/:chequeId/advance-receipt')
  advanceReceipt(@CurrentAdmin() actor: AdminTokenPayload, @Param('chequeId') chequeId: string) {
    return this.analytics.advanceReceipt(actor, chequeId);
  }
}