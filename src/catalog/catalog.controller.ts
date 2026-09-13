import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AdminTokenPayload } from '../auth/auth.types.js';
import { CurrentAdmin } from '../auth/current-admin.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CatalogService } from './catalog.service.js';

@Controller('admin/catalog')
@UseGuards(JwtAuthGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Get('menus') menus(@CurrentAdmin() actor: AdminTokenPayload) { return this.catalog.menus(actor); }
  @Post('menus') createMenu(@CurrentAdmin() actor: AdminTokenPayload, @Body() body: any) { return this.catalog.createMenu(actor, body); }
  @Patch('menus/:id') updateMenu(@CurrentAdmin() actor: AdminTokenPayload, @Param('id') id: string, @Body() body: any) { return this.catalog.updateMenu(actor, id, body); }
  @Delete('menus/:id') deleteMenu(@CurrentAdmin() actor: AdminTokenPayload, @Param('id') id: string) { return this.catalog.deleteMenu(actor, id); }
  @Get('menus/:id/structure') menuStructure(@CurrentAdmin() actor: AdminTokenPayload, @Param('id') id: string) { return this.catalog.menuStructure(actor, id); }
  @Put('menus/:id/categories') saveMenuCategories(@CurrentAdmin() actor: AdminTokenPayload, @Param('id') id: string, @Body() body: { items: any[] }) { return this.catalog.saveMenuCategories(actor, id, body.items); }
  @Put('menus/:id/dishes') saveMenuDishes(@CurrentAdmin() actor: AdminTokenPayload, @Param('id') id: string, @Body() body: { items: any[] }) { return this.catalog.saveMenuDishes(actor, id, body.items); }
  @Get('categories') categories(@CurrentAdmin() actor: AdminTokenPayload) { return this.catalog.categories(actor); }
  @Post('categories') createCategory(@CurrentAdmin() actor: AdminTokenPayload, @Body() body: any) { return this.catalog.createCategory(actor, body); }
  @Patch('categories/:id') updateCategory(@CurrentAdmin() actor: AdminTokenPayload, @Param('id') id: string, @Body() body: any) { return this.catalog.updateCategory(actor, id, body); }
  @Delete('categories/:id') deleteCategory(@CurrentAdmin() actor: AdminTokenPayload, @Param('id') id: string) { return this.catalog.deleteCategory(actor, id); }
  @Get('dishes') dishes(@CurrentAdmin() actor: AdminTokenPayload, @Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('search') search?: string) { return this.catalog.dishes(actor, Number(page ?? 1), Math.min(Number(pageSize ?? 20), 100), search ?? ''); }
  @Post('dishes') createDish(@CurrentAdmin() actor: AdminTokenPayload, @Body() body: any) { return this.catalog.createDish(actor, body); }
  @Patch('dishes/:id') updateDish(@CurrentAdmin() actor: AdminTokenPayload, @Param('id') id: string, @Body() body: any) { return this.catalog.updateDish(actor, id, body); }
  @Delete('dishes/:id') deleteDish(@CurrentAdmin() actor: AdminTokenPayload, @Param('id') id: string) { return this.catalog.deleteDish(actor, id); }
}
