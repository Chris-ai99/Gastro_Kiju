import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import authModule from "../dist/api/src/modules/auth/internal-access.service.js";

test("Betriebscode erzeugt eine gültige, signierte Gerätesitzung", () => {
  const previousCode = process.env.KIJU_INTERNAL_ACCESS_CODE;
  const previousSecret = process.env.KIJU_SESSION_SECRET;
  process.env.KIJU_INTERNAL_ACCESS_CODE = "unit-test-access-code";
  process.env.KIJU_SESSION_SECRET = "unit-test-session-secret-with-at-least-32-bytes";

  try {
    const { InternalAccessService } = authModule;
    const service = new InternalAccessService();
    const session = service.authenticate("unit-test-access-code", "unit-client");
    const cookie = service.createSessionCookie(session.token);

    assert.ok(service.verifyCookie(cookie));
    assert.equal(service.verifyCookie(cookie.replace("kiju_internal_session=", "kiju_internal_session=x")), null);
    assert.throws(
      () => service.authenticate("wrong-code", "other-client"),
      /Betriebscode ist ungültig/
    );
  } finally {
    if (previousCode === undefined) delete process.env.KIJU_INTERNAL_ACCESS_CODE;
    else process.env.KIJU_INTERNAL_ACCESS_CODE = previousCode;
    if (previousSecret === undefined) delete process.env.KIJU_SESSION_SECRET;
    else process.env.KIJU_SESSION_SECRET = previousSecret;
  }
});

test("Manipulierte oder abgelaufene Cookies werden nicht akzeptiert", () => {
  const previousCode = process.env.KIJU_INTERNAL_ACCESS_CODE;
  const previousSecret = process.env.KIJU_SESSION_SECRET;
  process.env.KIJU_INTERNAL_ACCESS_CODE = "unit-test-access-code";
  process.env.KIJU_SESSION_SECRET = "unit-test-session-secret-with-at-least-32-bytes";

  try {
    const { InternalAccessService } = authModule;
    const service = new InternalAccessService();
    const session = service.authenticate("unit-test-access-code", "unit-client");
    const [encodedPayload] = session.token.split(".");
    const expiredPayload = Buffer.from(
      JSON.stringify({ issuedAt: 1, exp: 1 }),
      "utf8"
    ).toString("base64url");
    const expiredSignature = createHmac(
      "sha256",
      "unit-test-session-secret-with-at-least-32-bytes"
    )
      .update(expiredPayload)
      .digest("base64url");
    assert.equal(
      service.verifyCookie(`kiju_internal_session=${expiredPayload}.${expiredSignature}`),
      null
    );
    assert.equal(service.verifyCookie(`kiju_internal_session=${encodedPayload}`), null);
  } finally {
    if (previousCode === undefined) delete process.env.KIJU_INTERNAL_ACCESS_CODE;
    else process.env.KIJU_INTERNAL_ACCESS_CODE = previousCode;
    if (previousSecret === undefined) delete process.env.KIJU_SESSION_SECRET;
    else process.env.KIJU_SESSION_SECRET = previousSecret;
  }
});
