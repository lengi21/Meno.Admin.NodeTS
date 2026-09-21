import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminModule } from '../admin/admin.module.js';
import { ChequeAnalyticsController } from './cheque-analytics.controller.js';
import { ChequeAnalyticsService } from './cheque-analytics.service.js';

@Module({
  imports: [AuthModule, AdminModule],
  controllers: [ChequeAnalyticsController],
  providers: [ChequeAnalyticsService],
})
export class AnalyticsModule {}