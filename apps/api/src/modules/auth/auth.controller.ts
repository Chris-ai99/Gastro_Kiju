import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Ip,
  Post,
  Res,
  UnauthorizedException
} from "@nestjs/common";

import { InternalAccessService } from "./internal-access.service";
import { PublicEndpoint } from "./public.decorator";

const clientAddress = (forwardedFor: string | undefined, ip: string) =>
  forwardedFor?.split(",")[0]?.trim() || ip || "unknown";

type HeaderResponse = {
  setHeader(name: string, value: string): void;
};

@Controller("auth")
@PublicEndpoint()
export class AuthController {
  constructor(private readonly access: InternalAccessService) {}

  @Post("access")
  @HttpCode(200)
  accessLogin(
    @Body() body: unknown,
    @Headers("x-forwarded-for") forwardedFor: string | undefined,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: HeaderResponse
  ) {
    const code =
      body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string"
        ? (body as { code: string }).code.trim()
        : "";
    if (!code) {
      throw new UnauthorizedException("Bitte den Betriebscode eingeben.");
    }
    const session = this.access.authenticate(code, clientAddress(forwardedFor, ip));
    response.setHeader("Set-Cookie", this.access.createSessionCookie(session.token));
    return { authenticated: true, expiresAt: session.expiresAt };
  }

  @Get("session")
  session(@Headers("cookie") cookie: string | undefined) {
    const session = this.access.verifyCookie(cookie);
    return {
      authenticated: Boolean(session),
      expiresAt: session ? new Date(session.exp * 1000).toISOString() : undefined
    };
  }

  @Post("logout")
  @HttpCode(200)
  logout(@Res({ passthrough: true }) response: HeaderResponse) {
    response.setHeader("Set-Cookie", this.access.createExpiredCookie());
    return { authenticated: false };
  }
}
