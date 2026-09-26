import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
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

  @Get('sold-dishes')
  soldDishes(@CurrentAdmin() actor: AdminTokenPayload, @Query() query: Record<string, string | undefined>) {
    return this.analytics.soldDishes(actor, query);
  }

  @Get('sold-dishes/export')
  async exportSoldDishes(@CurrentAdmin() actor: AdminTokenPayload, @Query() query: Record<string, string | undefined>, @Res() response: { setHeader(name: string, value: string): void; send(body: Buffer): void }) {
    const workbook = await this.analytics.soldDishesWorkbook(actor, query);
    const suffix = query.businessDayId ? 'business-day' : query.from || query.to ? `${query.from ?? 'start'}_${query.to ?? 'end'}` : 'current-business-day';
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="meno-sold-dishes-${suffix}.xlsx"`);
    response.send(workbook);
  }
  @Get('cheques/:chequeId/advance-receipt')
  advanceReceipt(@CurrentAdmin() actor: AdminTokenPayload, @Param('chequeId') chequeId: string) {
    return this.analytics.advanceReceipt(actor, chequeId);
  }
}

