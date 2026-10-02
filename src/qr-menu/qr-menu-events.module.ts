import { Global, Module } from '@nestjs/common';
import { QrMenuEventsService } from './qr-menu-events.service.js';

@Global()
@Module({ providers: [QrMenuEventsService], exports: [QrMenuEventsService] })
export class QrMenuEventsModule {}
