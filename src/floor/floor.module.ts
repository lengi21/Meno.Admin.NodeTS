import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { FloorController } from './floor.controller.js';
import { FloorService } from './floor.service.js';
@Module({ imports: [AdminModule, AuthModule], controllers: [FloorController], providers: [FloorService] })
export class FloorModule {}
