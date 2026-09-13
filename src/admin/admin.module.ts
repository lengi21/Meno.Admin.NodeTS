import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminAccessService } from './admin-access.service.js';
@Module({ imports: [AuthModule], controllers: [AdminController], providers: [AdminService, AdminAccessService], exports: [AdminAccessService] })
export class AdminModule {}
