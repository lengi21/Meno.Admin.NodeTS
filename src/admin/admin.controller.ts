import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentAdmin } from '../auth/current-admin.decorator.js';
import { AdminTokenPayload } from '../auth/auth.types.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { SaveRoleDto } from './dto/save-role.dto.js';
import { UpdatePosSettingsDto } from './dto/update-pos-settings.dto.js';
import { UpdateStaffDto } from './dto/update-staff.dto.js';
import { SaveAdminPrinterDto } from './dto/save-admin-printer.dto.js';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}
  @Get('settings/:restaurantId') settings(@CurrentAdmin() actor: AdminTokenPayload, @Param('restaurantId') restaurantId: string) { return this.admin.getSettings(actor, restaurantId); }
  @Patch('settings/:restaurantId') updateSettings(@CurrentAdmin() actor: AdminTokenPayload, @Param('restaurantId') restaurantId: string, @Body() patch: UpdatePosSettingsDto) { return this.admin.updateSettings(actor, restaurantId, patch); }
  @Get('printers') printers(@CurrentAdmin() actor: AdminTokenPayload) { return this.admin.listPrinters(actor); }
  @Post('printers') createPrinter(@CurrentAdmin() actor: AdminTokenPayload, @Body() body: SaveAdminPrinterDto) { return this.admin.savePrinter(actor, body); }
  @Patch('printers/:printerId') updatePrinter(@CurrentAdmin() actor: AdminTokenPayload, @Param('printerId') printerId: string, @Body() body: SaveAdminPrinterDto) { return this.admin.savePrinter(actor, body, printerId); }
  @Delete('printers/:printerId') deletePrinter(@CurrentAdmin() actor: AdminTokenPayload, @Param('printerId') printerId: string) { return this.admin.deletePrinter(actor, printerId); }
  @Get('staff') staff(@CurrentAdmin() actor: AdminTokenPayload) { return this.admin.listStaff(actor); }
  @Post('staff') createStaff(@CurrentAdmin() actor: AdminTokenPayload, @Body() body: CreateStaffDto) { return this.admin.createStaff(actor, body); }
  @Patch('staff/:staffId') updateStaff(@CurrentAdmin() actor: AdminTokenPayload, @Param('staffId') staffId: string, @Body() body: UpdateStaffDto) { return this.admin.updateStaff(actor, staffId, body); }
  @Delete('staff/:staffId') deleteStaff(@CurrentAdmin() actor: AdminTokenPayload, @Param('staffId') staffId: string) { return this.admin.deleteStaff(actor, staffId); }
  @Post('staff/:staffId/pin/reset') resetPin(@CurrentAdmin() actor: AdminTokenPayload, @Param('staffId') staffId: string) { return this.admin.regeneratePin(actor, staffId, 'staff.pin.reset'); }
  @Post('staff/:staffId/pin/resend') resendPin(@CurrentAdmin() actor: AdminTokenPayload, @Param('staffId') staffId: string) { return this.admin.regeneratePin(actor, staffId, 'staff.pin.resend'); }
  @Get('permissions') permissions(@CurrentAdmin() actor: AdminTokenPayload) { return this.admin.listPermissions(actor); }
  @Get('roles') roles(@CurrentAdmin() actor: AdminTokenPayload) { return this.admin.listRoles(actor); }
  @Post('roles') createRole(@CurrentAdmin() actor: AdminTokenPayload, @Body() body: SaveRoleDto) { return this.admin.createRole(actor, body); }
  @Patch('roles/:roleId') updateRole(@CurrentAdmin() actor: AdminTokenPayload, @Param('roleId') roleId: string, @Body() body: SaveRoleDto) { return this.admin.updateRole(actor, roleId, body); }
  @Delete('roles/:roleId') deleteRole(@CurrentAdmin() actor: AdminTokenPayload, @Param('roleId') roleId: string) { return this.admin.deleteRole(actor, roleId); }
}
