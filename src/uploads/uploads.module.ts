import { Module } from '@nestjs/common';
import { AdminUploadsController, PublicUploadsController } from './uploads.controller.js';
import { AuthModule } from '../auth/auth.module.js';
@Module({ imports: [AuthModule], controllers: [AdminUploadsController, PublicUploadsController] })
export class UploadsModule {}
