import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AuthController } from "./auth.controller";
import { InternalAccessGuard } from "./internal-access.guard";
import { InternalAccessService } from "./internal-access.service";

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    InternalAccessService,
    InternalAccessGuard,
    {
      provide: APP_GUARD,
      useExisting: InternalAccessGuard
    }
  ],
  exports: [InternalAccessService]
})
export class AuthModule {}
