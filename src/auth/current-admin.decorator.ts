import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AdminTokenPayload } from './auth.types.js';
export const CurrentAdmin = createParamDecorator((_data: unknown, context: ExecutionContext): AdminTokenPayload => context.switchToHttp().getRequest().user);
