import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}
  async signIn(email: string, password: string) {
    const user = await this.prisma.adminUser.findFirst({ where: { email: email.toLowerCase(), status: 'ACTIVE' }, include: { restaurant: { include: { translations: true } }, roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, permissions: { include: { permission: true } } } });
    if (!user || !(await argon2.verify(user.passwordHash, password))) throw new UnauthorizedException('Invalid email or password');
    const accessToken = await this.jwt.signAsync({ sub: user.id, restaurantId: user.restaurantId, email: user.email, type: 'access' });
    const refreshToken = await this.jwt.signAsync({ sub: user.id, restaurantId: user.restaurantId, email: user.email, type: 'refresh' }, { expiresIn: '7d' });
    const rolePermissions = user.roles.flatMap((link) => link.role.permissions.map((permission) => permission.permission.code));
    const directPermissions = user.permissions.filter((link) => link.isGranted).map((link) => link.permission.code);
    return { accessToken, refreshToken, expiresInSeconds: 3600, user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, restaurantId: user.restaurantId, restaurantName: user.restaurant.translations.find((item) => item.languageCode === 'ka')?.name ?? user.restaurant.slug, permissions: [...new Set([...rolePermissions, ...directPermissions])], isOwner: user.roles.some((link) => link.role.isOwnerRole) } };
  }
  async refresh(refreshToken: string) { const payload = await this.jwt.verifyAsync<{ sub: string; type?: string }>(refreshToken).catch(() => { throw new UnauthorizedException('Invalid refresh token'); }); if (payload.type !== 'refresh') throw new UnauthorizedException('Invalid refresh token'); const user = await this.prisma.adminUser.findFirst({ where: { id: payload.sub, status: 'ACTIVE' } }); if (!user) throw new UnauthorizedException('Inactive user'); const accessToken = await this.jwt.signAsync({ sub: user.id, restaurantId: user.restaurantId, email: user.email, type: 'access' }); return { accessToken, expiresInSeconds: 3600 }; }
}

