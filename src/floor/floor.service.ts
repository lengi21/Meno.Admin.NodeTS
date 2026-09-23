import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminTokenPayload } from '../auth/auth.types.js';
import { AdminAccessService } from '../admin/admin-access.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SaveHallDto, SaveTableDto } from './dto/floor.dto.js';

const ACTIVE_CHEQUE = ['OPEN', 'READY_TO_CLOSE'] as const;

@Injectable()
export class FloorService {
  constructor(private readonly prisma: PrismaService, private readonly access: AdminAccessService) {}

  private async audit(actor: AdminTokenPayload, action: string, entityType: string, entityId: string, metadata?: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.adminAuditEvent.create({ data: { restaurantId: actor.restaurantId, adminUserId: actor.sub, action, entityType, entityId, metadata } });
  }

  private async assertMenu(restaurantId: string, menuId: string | null | undefined): Promise<string | null> {
    if (!menuId) return null;
    const menu = await this.prisma.menu.findFirst({ where: { id: menuId, restaurantId, status: 'ACTIVE', purpose: 'POS' }, select: { id: true } });
    if (!menu) throw new NotFoundException('Active POS menu not found');
    return menu.id;
  }

  private async hall(actor: AdminTokenPayload, hallId: string) {
    const hall = await this.prisma.hall.findFirst({ where: { id: hallId, restaurantId: actor.restaurantId, deletedAt: null } });
    if (!hall) throw new NotFoundException('Hall not found');
    return hall;
  }

  private async table(actor: AdminTokenPayload, hallId: string, tableId: string) {
    const table = await this.prisma.diningTable.findFirst({ where: { id: tableId, hallId, deletedAt: null, hall: { restaurantId: actor.restaurantId, deletedAt: null } } });
    if (!table) throw new NotFoundException('Table not found');
    return table;
  }

  async list(actor: AdminTokenPayload) {
    await this.access.assert(actor, 'halls.view');
    await this.access.assert(actor, 'tables.view');
    return this.prisma.hall.findMany({
      where: { restaurantId: actor.restaurantId, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        menu: { select: { id: true, translations: { select: { languageCode: true, name: true } } } },
        tables: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' }, include: { cheques: { where: { status: { in: [...ACTIVE_CHEQUE] } }, select: { id: true }, take: 1 } } },
        _count: { select: { tables: true } },
      },
    }).then((halls) => halls.map((hall) => ({
      ...hall,
      hasActiveCheque: hall.tables.some((table) => table.cheques.length > 0),
      tables: hall.tables.map(({ cheques, ...table }) => ({ ...table, hasActiveCheque: cheques.length > 0 })),
    })));
  }

  async menus(actor: AdminTokenPayload) {
    await this.access.assert(actor, 'halls.view');
    return this.prisma.menu.findMany({ where: { restaurantId: actor.restaurantId, purpose: 'POS', status: 'ACTIVE' }, include: { translations: { select: { languageCode: true, name: true } } }, orderBy: { createdAt: 'asc' } });
  }

  async createHall(actor: AdminTokenPayload, dto: SaveHallDto) {
    await this.access.assert(actor, 'halls.create');
    const menuId = await this.assertMenu(actor.restaurantId, dto.menuId);
    const sortOrder = await this.prisma.hall.count({ where: { restaurantId: actor.restaurantId, deletedAt: null } });
    const hall = await this.prisma.hall.create({ data: { restaurantId: actor.restaurantId, name: dto.name.trim(), menuId, isActive: dto.isActive ?? true, sortOrder } });
    await this.audit(actor, 'HALL_CREATED', 'Hall', hall.id, { name: hall.name });
    return hall;
  }

  async updateHall(actor: AdminTokenPayload, hallId: string, dto: SaveHallDto) {
    const existing = await this.hall(actor, hallId);
    if (dto.isActive !== undefined && dto.isActive !== existing.isActive) await this.access.assert(actor, 'halls.pause');
    else await this.access.assert(actor, 'halls.update');
    const menuId = dto.menuId === undefined ? existing.menuId : await this.assertMenu(actor.restaurantId, dto.menuId);
    const hall = await this.prisma.hall.update({ where: { id: hallId }, data: { name: dto.name.trim(), menuId, isActive: dto.isActive ?? existing.isActive } });
    await this.audit(actor, hall.isActive ? 'HALL_UPDATED' : 'HALL_PAUSED', 'Hall', hall.id, { name: hall.name, menuId: hall.menuId });
    return hall;
  }

  async deleteHall(actor: AdminTokenPayload, hallId: string) {
    await this.access.assert(actor, 'halls.delete');
    await this.hall(actor, hallId);
    const active = await this.prisma.cheque.count({ where: { restaurantId: actor.restaurantId, table: { hallId }, status: { in: [...ACTIVE_CHEQUE] } } });
    if (active) throw new ConflictException('A hall with active cheques cannot be deleted');
    await this.prisma.$transaction([
      this.prisma.diningTable.updateMany({ where: { hallId, deletedAt: null }, data: { isActive: false, deletedAt: new Date() } }),
      this.prisma.hall.update({ where: { id: hallId }, data: { isActive: false, deletedAt: new Date() } }),
    ]);
    await this.audit(actor, 'HALL_SOFT_DELETED', 'Hall', hallId);
    return { id: hallId };
  }

  async reorderHalls(actor: AdminTokenPayload, ids: string[]) {
    await this.access.assert(actor, 'halls.order');
    const halls = await this.prisma.hall.findMany({ where: { id: { in: ids }, restaurantId: actor.restaurantId, deletedAt: null }, select: { id: true } });
    if (halls.length !== ids.length || new Set(ids).size !== ids.length) throw new ConflictException('Invalid hall order');
    await this.prisma.$transaction(ids.map((id, index) => this.prisma.hall.update({ where: { id }, data: { sortOrder: index } })));
    await this.audit(actor, 'HALLS_REORDERED', 'Hall', actor.restaurantId, { ids });
    return this.list(actor);
  }

  async createTable(actor: AdminTokenPayload, hallId: string, dto: SaveTableDto) {
    await this.access.assert(actor, 'tables.create');
    await this.hall(actor, hallId);
    const sortOrder = await this.prisma.diningTable.count({ where: { hallId, deletedAt: null } });
    const table = await this.prisma.diningTable.create({ data: { hallId, name: dto.name.trim(), isActive: dto.isActive ?? true, sortOrder } });
    await this.audit(actor, 'TABLE_CREATED', 'DiningTable', table.id, { name: table.name, hallId });
    return table;
  }

  async updateTable(actor: AdminTokenPayload, hallId: string, tableId: string, dto: SaveTableDto) {
    const existing = await this.table(actor, hallId, tableId);
    if (dto.isActive !== undefined && dto.isActive !== existing.isActive) await this.access.assert(actor, 'tables.pause');
    else await this.access.assert(actor, 'tables.update');
    const table = await this.prisma.diningTable.update({ where: { id: tableId }, data: { name: dto.name.trim(), isActive: dto.isActive ?? existing.isActive } });
    await this.audit(actor, table.isActive ? 'TABLE_UPDATED' : 'TABLE_PAUSED', 'DiningTable', table.id, { name: table.name, hallId });
    return table;
  }

  async deleteTable(actor: AdminTokenPayload, hallId: string, tableId: string) {
    await this.access.assert(actor, 'tables.delete');
    await this.table(actor, hallId, tableId);
    const active = await this.prisma.cheque.count({ where: { restaurantId: actor.restaurantId, tableId, status: { in: [...ACTIVE_CHEQUE] } } });
    if (active) throw new ConflictException('A table with an active cheque cannot be deleted');
    await this.prisma.diningTable.update({ where: { id: tableId }, data: { isActive: false, deletedAt: new Date() } });
    await this.audit(actor, 'TABLE_SOFT_DELETED', 'DiningTable', tableId, { hallId });
    return { id: tableId };
  }

  async reorderTables(actor: AdminTokenPayload, hallId: string, ids: string[]) {
    await this.access.assert(actor, 'tables.order');
    await this.hall(actor, hallId);
    const tables = await this.prisma.diningTable.findMany({ where: { id: { in: ids }, hallId, deletedAt: null }, select: { id: true } });
    if (tables.length !== ids.length || new Set(ids).size !== ids.length) throw new ConflictException('Invalid table order');
    await this.prisma.$transaction(ids.map((id, index) => this.prisma.diningTable.update({ where: { id }, data: { sortOrder: index } })));
    await this.audit(actor, 'TABLES_REORDERED', 'Hall', hallId, { ids });
    return this.list(actor);
  }
}
