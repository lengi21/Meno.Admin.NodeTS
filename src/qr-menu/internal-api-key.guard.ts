import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('QR_MENU_SYNC_SECRET');
    const actual = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>().headers['x-qr-menu-key'];
    if (!expected || !actual || expected.length !== actual.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
      throw new ForbiddenException('Invalid QR menu integration key.');
    }
    return true;
  }
}
