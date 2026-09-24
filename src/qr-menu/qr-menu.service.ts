import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AvailabilityStatus, MenuPurpose } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

type TranslationInput = { languageCode: 'ka' | 'en' | 'ru'; name: string; description?: string; recipe?: string | null };
type CategoryDraft = { imageUrl?: string; isVisible: boolean; translations: TranslationInput[] };
type DishDraft = { categoryId: string; imageUrl?: string; priceAmountMinor: number; calories?: number | null; isPublished: boolean; isAvailable: boolean; translations: TranslationInput[] };

@Injectable()
export class QrMenuService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(slug: string) {
    const { menu } = await this.qrMenu(slug);
    return { categories: menu.categories.filter((link) => link.status === 'AVAILABLE' && link.category.status === 'AVAILABLE').map((link) => this.category(link.category)) };
  }

  async categoryDishes(slug: string, categoryId: string) {
    const { menu } = await this.qrMenu(slug);
    const linked = menu.categories.some((link) => link.categoryId === categoryId && link.status === 'AVAILABLE' && link.category.status === 'AVAILABLE');
    if (!linked) throw new NotFoundException('Category not found.');
    return menu.dishes.filter((link) => link.dish.categoryId === categoryId && this.visibleDish(link)).map((link) => this.dish(link.dish, link.priceOverride));
  }

  async dishes(slug: string) {
    const { menu } = await this.qrMenu(slug);
    return menu.dishes.filter((link) => this.visibleDish(link)).map((link) => this.dish(link.dish, link.priceOverride));
  }

  async customerMenu(slug: string) {
    const { menu } = await this.qrMenu(slug);
    return {
      categories: menu.categories
        .filter((link) => link.status === 'AVAILABLE' && link.category.status === 'AVAILABLE')
        .map((link) => ({ category: this.category(link.category), dishes: menu.dishes.filter((dish) => dish.dish.categoryId === link.categoryId && this.visibleDish(dish)).map((dish) => this.dish(dish.dish, dish.priceOverride)) })),
    };
  }

  async adminCategories(slug: string) {
    const { menu } = await this.qrMenu(slug);
    return menu.categories.map((link) => ({ category: this.category(link.category), dishCount: menu.dishes.filter((dish) => dish.dish.categoryId === link.categoryId).length }));
  }

  async createCategory(slug: string, draft: CategoryDraft) {
    const { restaurant, menu } = await this.qrMenu(slug);
    this.assertTranslations(draft.translations);
    const sortOrder = menu.categories.length + 1;
    const category = await this.prisma.category.create({ data: { restaurantId: restaurant.id, imageUrl: this.blank(draft.imageUrl), status: draft.isVisible ? 'AVAILABLE' : 'HIDDEN', sortOrder, translations: { create: draft.translations.map(({ languageCode, name }) => ({ languageCode, name: name.trim() })) } }, include: { translations: true } });
    await this.prisma.menuCategory.create({ data: { menuId: menu.id, categoryId: category.id, sortOrder } });
    return this.category(category);
  }

  async updateCategory(slug: string, categoryId: string, draft: CategoryDraft) {
    const { restaurant, menu } = await this.qrMenu(slug);
    this.assertTranslations(draft.translations);
    if (!menu.categories.some((item) => item.categoryId === categoryId)) throw new NotFoundException('Category not found.');
    const category = await this.prisma.category.update({ where: { id: categoryId }, data: { restaurantId: restaurant.id, imageUrl: this.blank(draft.imageUrl), status: draft.isVisible ? 'AVAILABLE' : 'HIDDEN', translations: { deleteMany: {}, create: draft.translations.map(({ languageCode, name }) => ({ languageCode, name: name.trim() })) } }, include: { translations: true } });
    return this.category(category);
  }

  async deleteCategory(slug: string, categoryId: string) {
    const { menu } = await this.qrMenu(slug);
    if (!menu.categories.some((item) => item.categoryId === categoryId)) throw new NotFoundException('Category not found.');
    await this.prisma.$transaction(async (tx) => {
      await tx.category.update({ where: { id: categoryId }, data: { status: 'HIDDEN', deletedAt: new Date() } });
      await tx.menuDish.deleteMany({ where: { menuId: menu.id, dish: { categoryId } } });
      await tx.menuCategory.delete({ where: { menuId_categoryId: { menuId: menu.id, categoryId } } });
    });
  }

  async reorderCategories(slug: string, categoryIds: string[]) {
    const { menu } = await this.qrMenu(slug);
    this.assertOrder(menu.categories.map((item) => item.categoryId), categoryIds, 'category');
    await this.prisma.$transaction(categoryIds.flatMap((id, index) => [
      this.prisma.category.update({ where: { id }, data: { sortOrder: index + 1 } }),
      this.prisma.menuCategory.update({ where: { menuId_categoryId: { menuId: menu.id, categoryId: id } }, data: { sortOrder: index + 1 } }),
    ]));
  }

  async adminDishes(slug: string, page: number, pageSize: number, categoryId: string, status: string, query: string) {
    const { menu } = await this.qrMenu(slug);
    const filtered = menu.dishes.filter((link) => (categoryId === 'all' || link.dish.categoryId === categoryId) && (!query || link.dish.translations.some((translation) => translation.name.toLowerCase().includes(query.toLowerCase()))) && (status === 'all' || (status === 'active' ? this.visibleDish(link) : !this.visibleDish(link))));
    const start = (page - 1) * pageSize;
    return { page, pageSize, totalItems: filtered.length, items: filtered.slice(start, start + pageSize).map((link) => ({ dish: this.dish(link.dish, link.priceOverride), category: this.category(link.dish.category) })) };
  }

  async createDish(slug: string, draft: DishDraft) {
    const { restaurant, menu } = await this.qrMenu(slug);
    // The legacy QR-admin editor does not collect descriptions.  They are
    // optional menu copy, so only translated names are required here.
    this.assertTranslations(draft.translations);
    if (!menu.categories.some((item) => item.categoryId === draft.categoryId)) throw new BadRequestException('The dish category is not included in the QR menu.');
    const sortOrder = menu.dishes.filter((item) => item.dish.categoryId === draft.categoryId).length + 1;
    const dish = await this.prisma.dish.create({ data: { restaurantId: restaurant.id, categoryId: draft.categoryId, imageUrl: this.blank(draft.imageUrl), priceAmount: draft.priceAmountMinor / 100, calories: draft.calories ?? null, status: this.dishStatus(draft), sortOrder, translations: { create: draft.translations.map((item) => ({ languageCode: item.languageCode, name: item.name.trim(), description: item.description?.trim() || '', recipe: this.blank(item.recipe ?? undefined) })) } }, include: { translations: true } });
    await this.prisma.menuDish.create({ data: { menuId: menu.id, dishId: dish.id, sortOrder } });
    return this.dish(dish, null);
  }

  async updateDish(slug: string, dishId: string, draft: DishDraft) {
    const { restaurant, menu } = await this.qrMenu(slug);
    // Keep QR-admin edits compatible with dishes that have no description.
    this.assertTranslations(draft.translations);
    const linked = menu.dishes.find((item) => item.dishId === dishId);
    if (!linked || !menu.categories.some((item) => item.categoryId === draft.categoryId)) throw new NotFoundException('Dish not found.');
    const dish = await this.prisma.dish.update({ where: { id: dishId }, data: { restaurantId: restaurant.id, categoryId: draft.categoryId, imageUrl: this.blank(draft.imageUrl), priceAmount: draft.priceAmountMinor / 100, calories: draft.calories ?? null, status: this.dishStatus(draft), translations: { deleteMany: {}, create: draft.translations.map((item) => ({ languageCode: item.languageCode, name: item.name.trim(), description: item.description?.trim() || '', recipe: this.blank(item.recipe ?? undefined) })) } }, include: { translations: true } });
    return this.dish(dish, linked.priceOverride);
  }

  async setDishStatus(slug: string, dishId: string, isPublished: boolean, isAvailable: boolean) {
    const { menu } = await this.qrMenu(slug);
    if (!menu.dishes.some((item) => item.dishId === dishId)) throw new NotFoundException('Dish not found.');
    const dish = await this.prisma.dish.update({ where: { id: dishId }, data: { status: this.dishStatus({ isPublished, isAvailable }) }, include: { translations: true } });
    return this.dish(dish, null);
  }

  async deleteDish(slug: string, dishId: string) {
    const { menu } = await this.qrMenu(slug);
    if (!menu.dishes.some((item) => item.dishId === dishId)) throw new NotFoundException('Dish not found.');
    await this.prisma.dish.update({ where: { id: dishId }, data: { status: 'HIDDEN', deletedAt: new Date() } });
  }

  async reorderDishes(slug: string, categoryId: string, dishIds: string[]) {
    const { menu } = await this.qrMenu(slug);
    const links = menu.dishes.filter((item) => item.dish.categoryId === categoryId);
    this.assertOrder(links.map((item) => item.dishId), dishIds, 'dish');
    await this.prisma.$transaction(dishIds.flatMap((id, index) => [
      this.prisma.dish.update({ where: { id }, data: { sortOrder: index + 1 } }),
      this.prisma.menuDish.update({ where: { menuId_dishId: { menuId: menu.id, dishId: id } }, data: { sortOrder: index + 1 } }),
    ]));
  }

  async moveDish(slug: string, categoryId: string, dishId: string, targetDishId: string, placeAfter: boolean) {
    const { menu } = await this.qrMenu(slug);
    const items = menu.dishes.filter((item) => item.dish.categoryId === categoryId).map((item) => item.dishId);
    const sourceIndex = items.indexOf(dishId); const targetIndex = items.indexOf(targetDishId);
    if (sourceIndex < 0 || targetIndex < 0) throw new BadRequestException('The dish move target was not found.');
    items.splice(sourceIndex, 1); items.splice(items.indexOf(targetDishId) + (placeAfter ? 1 : 0), 0, dishId);
    await this.reorderDishes(slug, categoryId, items);
  }

  private async qrMenu(slug: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { slug } });
    if (!restaurant) throw new NotFoundException('Restaurant not found.');
    let menu = await this.prisma.menu.findFirst({ where: { restaurantId: restaurant.id, code: 'QR_MENU' } });
    if (!menu) {
      const categories = await this.prisma.category.findMany({ where: { restaurantId: restaurant.id, deletedAt: null }, orderBy: { sortOrder: 'asc' } });
      const dishes = await this.prisma.dish.findMany({ where: { restaurantId: restaurant.id, deletedAt: null }, orderBy: { sortOrder: 'asc' } });
      menu = await this.prisma.menu.create({ data: { restaurantId: restaurant.id, code: 'QR_MENU', isSystem: true, purpose: MenuPurpose.QR, status: 'ACTIVE', translations: { create: [{ languageCode: 'ka', name: 'QR მენიუ' }, { languageCode: 'en', name: 'QR Menu' }, { languageCode: 'ru', name: 'QR меню' }] }, categories: { create: categories.map((category) => ({ categoryId: category.id, sortOrder: category.sortOrder })) }, dishes: { create: dishes.map((dish) => ({ dishId: dish.id, sortOrder: dish.sortOrder })) } } });
    }
    const withItems = await this.prisma.menu.findUniqueOrThrow({ where: { id: menu.id }, include: { categories: { orderBy: { sortOrder: 'asc' }, include: { category: { include: { translations: true } } } }, dishes: { orderBy: { sortOrder: 'asc' }, include: { dish: { include: { translations: true, category: { include: { translations: true } } } } } } } });
    return { restaurant, menu: withItems };
  }

  private category(category: any) { return { id: category.id, restaurantId: category.restaurantId, image: category.imageUrl ? { url: category.imageUrl, width: 1200, height: 800 } : null, isVisible: category.status === 'AVAILABLE', sortOrder: category.sortOrder, translations: category.translations.map((item: any) => ({ languageCode: item.languageCode, name: item.name })) }; }
  private dish(dish: any, priceOverride: unknown) { const amount = priceOverride ?? dish.priceAmount; return { id: dish.id, restaurantId: dish.restaurantId, categoryId: dish.categoryId, image: dish.imageUrl ? { url: dish.imageUrl, width: 900, height: 600 } : null, price: { amountMinor: Math.round(Number(amount) * 100), currency: 'GEL' }, calories: dish.calories, isPublished: dish.status !== 'HIDDEN', isAvailable: dish.status === 'AVAILABLE', sortOrder: dish.sortOrder, translations: dish.translations.map((item: any) => ({ languageCode: item.languageCode, name: item.name, description: item.description, recipe: item.recipe })) }; }
  private visibleDish(link: any) { return link.status === 'AVAILABLE' && link.dish.status === 'AVAILABLE' && link.dish.category.status === 'AVAILABLE'; }
  private dishStatus(value: { isPublished: boolean; isAvailable: boolean }): AvailabilityStatus { return !value.isPublished ? 'HIDDEN' : value.isAvailable ? 'AVAILABLE' : 'PAUSED'; }
  private assertTranslations(value: TranslationInput[], dish = false) { for (const languageCode of ['ka', 'en', 'ru'] as const) { const item = value?.find((translation) => translation.languageCode === languageCode); if (!item?.name?.trim() || (dish && !item.description?.trim())) throw new BadRequestException(`Missing ${languageCode} translation.`); } }
  private assertOrder(existing: string[], next: string[], name: string) { if (existing.length !== next.length || existing.some((id) => !next.includes(id)) || new Set(next).size !== next.length) throw new BadRequestException(`The ${name} order is incomplete.`); }
  private blank(value?: string | null) { return value?.trim() || null; }
}
