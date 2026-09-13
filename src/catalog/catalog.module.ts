import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { AdminModule } from '../admin/admin.module.js';
import { AuthModule } from '../auth/auth.module.js';
@Module({ imports: [AdminModule, AuthModule], controllers: [CatalogController], providers: [CatalogService] })
export class CatalogModule {}
