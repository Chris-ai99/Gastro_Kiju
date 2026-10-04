import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "kiju_internal_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

type SessionPayload = {
  exp: number;
  issuedAt: number;
};

type RateLimitEntry = {
  failedAt: number[];
};

const encode = (value: string) => Buffer.from(value, "utf8").toString("base64url");
const decode = (value: string) => Buffer.from(value, "base64url").toString("utf8");

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

@Injectable()
export class InternalAccessService {
  private readonly accessCode: string;
  private readonly sessionSecret: string;
  private readonly failedAttempts = new Map<string, RateLimitEntry>();

  constructor() {
    const production = process.env["NODE_ENV"] === "production";
    this.accessCode =
      process.env["KIJU_INTERNAL_ACCESS_CODE"]?.trim() ||
      (production ? "" : "KiJu-Entwicklung");
    this.sessionSecret =
      process.env["KIJU_SESSION_SECRET"]?.trim() ||
      (production ? "" : "kiju-development-session-secret-change-me");

    if (!this.accessCode || this.accessCode.length < 8) {
      throw new ServiceUnavailableException(
        "KIJU_INTERNAL_ACCESS_CODE fehlt oder ist zu kurz."
      );
    }
    if (!this.sessionSecret || this.sessionSecret.length < 32) {
      throw new ServiceUnavailableException(
        "KIJU_SESSION_SECRET fehlt oder ist zu kurz."
      );
    }
  }

  authenticate(code: string, clientId: string) {
    this.assertRateLimit(clientId);
    if (!safeEqual(code, this.accessCode)) {
      const now = Date.now();
      const current = this.failedAttempts.get(clientId)?.failedAt ?? [];
      this.failedAttempts.set(clientId, { failedAt: [...current, now] });
      throw new UnauthorizedException("Der Betriebscode ist ungültig.");
    }

    this.failedAttempts.delete(clientId);
    const now = Math.floor(Date.now() / 1000);
    const payload: SessionPayload = {
      issuedAt: now,
      exp: now + SESSION_TTL_SECONDS
    };
    return {
      token: this.sign(payload),
      expiresAt: new Date(payload.exp * 1000).toISOString()
    };
  }

  verifyCookie(cookieHeader?: string) {
    const token = this.readCookie(cookieHeader);
    if (!token) return null;

    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) return null;
    const expectedSignature = this.signature(encodedPayload);
    if (!safeEqual(signature, expectedSignature)) return null;

    try {
      const payload = JSON.parse(decode(encodedPayload)) as Partial<SessionPayload>;
      if (
        typeof payload.exp !== "number" ||
        typeof payload.issuedAt !== "number" ||
        payload.exp <= Math.floor(Date.now() / 1000)
      ) {
        return null;
      }
      return payload as SessionPayload;
    } catch {
      return null;
    }
  }

  requireSession(cookieHeader?: string) {
    const session = this.verifyCookie(cookieHeader);
    if (!session) {
      throw new UnauthorizedException("Bitte zuerst den Betriebscode eingeben.");
    }
    return session;
  }

  createSessionCookie(token: string) {
    const secure = process.env["NODE_ENV"] === "production" ? "; Secure" : "";
    return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
  }

  createExpiredCookie() {
    const secure = process.env["NODE_ENV"] === "production" ? "; Secure" : "";
    return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  }

  private assertRateLimit(clientId: string) {
    const cutoff = Date.now() - ATTEMPT_WINDOW_MS;
    const failedAt = (this.failedAttempts.get(clientId)?.failedAt ?? []).filter(
      (timestamp) => timestamp >= cutoff
    );
    if (failedAt.length >= MAX_FAILED_ATTEMPTS) {
      throw new UnauthorizedException(
        "Zu viele falsche Eingaben. Bitte später erneut versuchen."
      );
    }
    if (failedAt.length > 0) {
      this.failedAttempts.set(clientId, { failedAt });
    } else {
      this.failedAttempts.delete(clientId);
    }
  }

  private sign(payload: SessionPayload) {
    const encodedPayload = encode(JSON.stringify(payload));
    return `${encodedPayload}.${this.signature(encodedPayload)}`;
  }

  private signature(encodedPayload: string) {
    return createHmac("sha256", this.sessionSecret)
      .update(encodedPayload)
      .digest("base64url");
  }

  private readCookie(cookieHeader?: string) {
    if (!cookieHeader) return "";
    for (const cookie of cookieHeader.split(";")) {
      const [name, ...valueParts] = cookie.trim().split("=");
      if (name === COOKIE_NAME) return valueParts.join("=");
    }
    return "";
  }
}
