import { ForbiddenException, Injectable } from '@nestjs/common';
import { AdminTokenPayload } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AdminAccessService {
  constructor(private readonly prisma: PrismaService) {}
  async assert(actor: AdminTokenPayload, permission: string): Promise<void> {
    const user = await this.prisma.adminUser.findFirst({ where: { id: actor.sub, restaurantId: actor.restaurantId, status: 'ACTIVE' }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, permissions: { include: { permission: true } } } });
    if (!user) throw new ForbiddenException();
    if (user.roles.some((link) => link.role.isOwnerRole)) return;
    const granted = new Set(user.roles.flatMap((link) => link.role.permissions.map((item) => item.permission.code)));
    for (const link of user.permissions) link.isGranted ? granted.add(link.permission.code) : granted.delete(link.permission.code);
    if (!granted.has(permission)) throw new ForbiddenException(`Missing permission: ${permission}`);
  }
}
