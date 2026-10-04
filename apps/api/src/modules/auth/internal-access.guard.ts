import {
  CanActivate,
  ExecutionContext,
  Injectable
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { InternalAccessService } from "./internal-access.service";
import { IS_PUBLIC_ENDPOINT } from "./public.decorator";

@Injectable()
export class InternalAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: InternalAccessService
  ) {}

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ENDPOINT, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{ headers?: { cookie?: string } }>();
    this.access.requireSession(request.headers?.cookie);
    return true;
  }
}
