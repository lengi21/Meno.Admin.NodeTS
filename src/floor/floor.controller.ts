import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentAdmin } from '../auth/current-admin.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AdminTokenPayload } from '../auth/auth.types.js';
import { FloorService } from './floor.service.js';
import { ReorderDto, SaveHallDto, SaveTableDto } from './dto/floor.dto.js';

@Controller('admin/halls')
@UseGuards(JwtAuthGuard)
export class FloorController {
  constructor(private readonly floor: FloorService) {}
  @Get() list(@CurrentAdmin() actor: AdminTokenPayload) { return this.floor.list(actor); }
  @Get('menus') menus(@CurrentAdmin() actor: AdminTokenPayload) { return this.floor.menus(actor); }
  @Post() createHall(@CurrentAdmin() actor: AdminTokenPayload, @Body() body: SaveHallDto) { return this.floor.createHall(actor, body); }
  @Patch(':hallId') updateHall(@CurrentAdmin() actor: AdminTokenPayload, @Param('hallId') hallId: string, @Body() body: SaveHallDto) { return this.floor.updateHall(actor, hallId, body); }
  @Delete(':hallId') deleteHall(@CurrentAdmin() actor: AdminTokenPayload, @Param('hallId') hallId: string) { return this.floor.deleteHall(actor, hallId); }
  @Put('order') reorderHalls(@CurrentAdmin() actor: AdminTokenPayload, @Body() body: ReorderDto) { return this.floor.reorderHalls(actor, body.ids); }
  @Post(':hallId/tables') createTable(@CurrentAdmin() actor: AdminTokenPayload, @Param('hallId') hallId: string, @Body() body: SaveTableDto) { return this.floor.createTable(actor, hallId, body); }
  @Patch(':hallId/tables/:tableId') updateTable(@CurrentAdmin() actor: AdminTokenPayload, @Param('hallId') hallId: string, @Param('tableId') tableId: string, @Body() body: SaveTableDto) { return this.floor.updateTable(actor, hallId, tableId, body); }
  @Delete(':hallId/tables/:tableId') deleteTable(@CurrentAdmin() actor: AdminTokenPayload, @Param('hallId') hallId: string, @Param('tableId') tableId: string) { return this.floor.deleteTable(actor, hallId, tableId); }
  @Put(':hallId/tables/order') reorderTables(@CurrentAdmin() actor: AdminTokenPayload, @Param('hallId') hallId: string, @Body() body: ReorderDto) { return this.floor.reorderTables(actor, hallId, body.ids); }
}
