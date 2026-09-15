import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { InternalApiKeyGuard } from './internal-api-key.guard.js';
import { QrMenuService } from './qr-menu.service.js';

@Controller('qr-menu/:slug')
export class QrMenuController {
  constructor(private readonly qr: QrMenuService) {}
  @Get('menu-overview') overview(@Param('slug') slug: string) { return this.qr.overview(slug); }
  @Get('categories/:categoryId/dishes') categoryDishes(@Param('slug') slug: string, @Param('categoryId') categoryId: string) { return this.qr.categoryDishes(slug, categoryId); }
  @Get('dishes') dishes(@Param('slug') slug: string) { return this.qr.dishes(slug); }
  @Get('customer-menu') customerMenu(@Param('slug') slug: string) { return this.qr.customerMenu(slug); }
}

@Controller('integrations/qr-menu/:slug/admin')
@UseGuards(InternalApiKeyGuard)
export class QrMenuIntegrationController {
  constructor(private readonly qr: QrMenuService) {}
  @Get('categories') categories(@Param('slug') slug: string) { return this.qr.adminCategories(slug); }
  @Post('categories') createCategory(@Param('slug') slug: string, @Body() body: any) { return this.qr.createCategory(slug, body); }
  @Post('categories/order') @HttpCode(HttpStatus.NO_CONTENT) reorderCategories(@Param('slug') slug: string, @Body('categoryIds') ids: string[]) { return this.qr.reorderCategories(slug, ids); }
  @Post('categories/:categoryId') updateCategory(@Param('slug') slug: string, @Param('categoryId') id: string, @Body() body: any) { return this.qr.updateCategory(slug, id, body); }
  @Post('categories/:categoryId/delete') @HttpCode(HttpStatus.NO_CONTENT) deleteCategory(@Param('slug') slug: string, @Param('categoryId') id: string) { return this.qr.deleteCategory(slug, id); }
  @Get('dishes') dishes(@Param('slug') slug: string, @Query('page') page = '1', @Query('pageSize') pageSize = '20', @Query('categoryId') categoryId = 'all', @Query('status') status = 'all', @Query('query') query = '') { return this.qr.adminDishes(slug, Number(page), Number(pageSize), categoryId, status, query); }
  @Post('dishes') createDish(@Param('slug') slug: string, @Body() body: any) { return this.qr.createDish(slug, body); }
  @Post('dishes/:dishId') updateDish(@Param('slug') slug: string, @Param('dishId') id: string, @Body() body: any) { return this.qr.updateDish(slug, id, body); }
  @Post('dishes/:dishId/status') setDishStatus(@Param('slug') slug: string, @Param('dishId') id: string, @Body() body: any) { return this.qr.setDishStatus(slug, id, body.isPublished, body.isAvailable); }
  @Post('dishes/:dishId/delete') @HttpCode(HttpStatus.NO_CONTENT) deleteDish(@Param('slug') slug: string, @Param('dishId') id: string) { return this.qr.deleteDish(slug, id); }
  @Post('categories/:categoryId/dishes/order') @HttpCode(HttpStatus.NO_CONTENT) reorderDishes(@Param('slug') slug: string, @Param('categoryId') categoryId: string, @Body('dishIds') ids: string[]) { return this.qr.reorderDishes(slug, categoryId, ids); }
  @Post('categories/:categoryId/dishes/move') @HttpCode(HttpStatus.NO_CONTENT) moveDish(@Param('slug') slug: string, @Param('categoryId') categoryId: string, @Body() body: any) { return this.qr.moveDish(slug, categoryId, body.dishId, body.targetDishId, body.placeAfter); }
}
