export type WebhookAuthFailure = {
  ok: false;
  code: number;
  message: string;
};

export type WebhookAuthSuccess = { ok: true };

export function verifyKornitxWebhookAuth(
  request: Request,
): WebhookAuthSuccess | WebhookAuthFailure {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader) {
    return {
      ok: false,
      code: 401,
      message: "Unauthorised transaction request",
    };
  }

  if (authHeader.startsWith("Basic ")) {
    const expectedUser = process.env.KORNITX_WEBHOOK_BASIC_USER;
    const expectedPass = process.env.KORNITX_WEBHOOK_BASIC_PASSWORD;

    if (!expectedUser || !expectedPass) {
      return {
        ok: false,
        code: 401,
        message: "Webhook basic auth is not configured",
      };
    }

    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    const user = separator >= 0 ? decoded.slice(0, separator) : decoded;
    const pass = separator >= 0 ? decoded.slice(separator + 1) : "";

    if (user === expectedUser && pass === expectedPass) {
      return { ok: true };
    }

    return {
      ok: false,
      code: 401,
      message: "Unauthorised transaction request",
    };
  }

  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const expected = process.env.KORNITX_WEBHOOK_OAUTH_TOKEN;

    if (expected && token === expected) {
      return { ok: true };
    }

    return {
      ok: false,
      code: 401,
      message: "Unauthorised transaction request",
    };
  }

  return {
    ok: false,
    code: 401,
    message: "Unauthorised transaction request",
  };
}
