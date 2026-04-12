/**
 * HTTP actions for the OAuth2 authorization code flow.
 *
 * Flow:
 *  1. Frontend calls POST /api/integrations/create → creates a pending_auth row
 *  2. Frontend calls GET  /api/auth/start?bank=<bank>&integrationId=xxx → redirects to bank
 *  3. Bank redirects back to GET /api/auth/callback?code=xxx&state=integrationId
 *  4. Callback exchanges code for tokens, encrypts, stores, closes window
 */

import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { getProvider } from "./banks/registry";
import { encrypt } from "./lib/crypto";

function siteUrl(): string {
  const url = process.env.CONVEX_SITE_URL ?? process.env.VITE_CONVEX_SITE_URL;
  if (!url) throw new Error("CONVEX_SITE_URL not set");
  return url.replace(/\/$/, "");
}

function callbackUrl(): string {
  return `${siteUrl()}/api/auth/callback`;
}

/** GET /api/auth/start?bank=<bank>&integrationId=xxx — redirect to bank login */
export const start = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const bank = url.searchParams.get("bank");
  const integrationId = url.searchParams.get("integrationId") as any;

  if (!bank || !integrationId) {
    return new Response("Missing bank or integrationId", { status: 400 });
  }

  try {
    const provider = getProvider(bank);
    const authUrl = provider.getAuthUrl(integrationId, callbackUrl());
    return Response.redirect(authUrl, 302);
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
});

/** GET /api/auth/callback?code=xxx&state=integrationId — exchange code for tokens */
export const callback = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const integrationId = url.searchParams.get("state") as any;
  const error = url.searchParams.get("error");

  if (error) {
    return htmlResponse(`Authorization failed: ${error}`, true);
  }
  if (!code || !integrationId) {
    return htmlResponse("Missing code or state parameter", true);
  }

  try {
    const encKey = process.env.TOKEN_ENCRYPTION_KEY;
    if (!encKey) throw new Error("TOKEN_ENCRYPTION_KEY not set");

    const integration = await ctx.runQuery(api.integrations.get, { id: integrationId });
    if (!integration) throw new Error("Integration not found");

    const provider = getProvider(integration.bank);
    const tokens = await provider.exchangeCode(code, callbackUrl());

    await ctx.runMutation(api.integrations.storeTokens, {
      id: integrationId,
      encryptedRefreshToken: await encrypt(tokens.refreshToken, encKey),
      encryptedAccessToken: await encrypt(tokens.accessToken, encKey),
      accessTokenExpiry: tokens.accessTokenExpiry,
    });

    // Kick off an immediate sync so accounts/transactions appear right away
    await ctx.runAction(api.bankSync.syncIntegration, { integrationId });

    return htmlResponse("Connected successfully! You can close this window.", false);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await ctx.runMutation(api.integrations.markError, {
        id: integrationId,
        error: msg,
      });
    } catch {}
    return htmlResponse(`Error: ${msg}`, true);
  }
});

function htmlResponse(message: string, isError: boolean): Response {
  const color = isError ? "#f38ba8" : "#a6e3a1";
  const html = `<!DOCTYPE html>
<html>
<head><title>Finance Tracker</title>
<style>
  body { font-family: system-ui; background: #11111b; color: #cdd6f4;
         display: flex; align-items: center; justify-content: center;
         height: 100vh; margin: 0; }
  .box { background: #181825; border-radius: 12px; padding: 32px 40px; text-align: center; }
  .msg { color: ${color}; font-size: 18px; margin-bottom: 16px; }
  .sub { color: #64748b; font-size: 13px; }
</style>
</head>
<body>
  <div class="box">
    <div class="msg">${message}</div>
    <div class="sub">You can close this window</div>
  </div>
  <script>
    // Notify opener and close after a short delay
    if (window.opener) { window.opener.postMessage('auth_complete', '*'); }
    setTimeout(() => window.close(), 2000);
  </script>
</body>
</html>`;
  return new Response(html, {
    status: isError ? 400 : 200,
    headers: { "Content-Type": "text/html" },
  });
}
