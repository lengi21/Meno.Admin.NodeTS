import { Module } from '@nestjs/common';
import { InternalApiKeyGuard } from './internal-api-key.guard.js';
import { QrMenuController, QrMenuIntegrationController } from './qr-menu.controller.js';
import { QrMenuService } from './qr-menu.service.js';

@Module({ controllers: [QrMenuController, QrMenuIntegrationController], providers: [QrMenuService, InternalApiKeyGuard] })
export class QrMenuModule {}
