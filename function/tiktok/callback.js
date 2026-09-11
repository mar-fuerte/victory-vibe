export async function onRequest(context) {
  const { request, env } = context;

  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    return new Response(
      `TikTok authorization failed: ${error}\n${errorDescription || ""}`,
      { status: 400 }
    );
  }

  if (!code || !state) {
    return new Response(
      "Missing TikTok authorization code or state.",
      { status: 400 }
    );
  }

  const cookies = request.headers.get("Cookie") || "";

  const stateMatch = cookies.match(
    /(?:^|;\s*)tiktok_state=([^;]+)/
  );

  const savedState = stateMatch
    ? decodeURIComponent(stateMatch[1])
    : null;

  if (!savedState || savedState !== state) {
    return new Response(
      "Invalid TikTok state.",
      { status: 403 }
    );
  }

  const redirectUri =
    "https://victory-vibe.mar-fuerte09.workers.dev/tiktok/callback";

  const body = new URLSearchParams();

  body.set("client_key", env.TIKTOK_CLIENT_KEY);
  body.set("client_secret", env.TIKTOK_CLIENT_SECRET);
  body.set("code", code);
  body.set("grant_type", "authorization_code");
  body.set("redirect_uri", redirectUri);

  const tokenResponse = await fetch(
    "https://open.tiktokapis.com/v2/oauth/token/",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },
      body
    }
  );

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenData.access_token) {
    return new Response(
      JSON.stringify(tokenData, null, 2),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  const tokenRecord = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    open_id: tokenData.open_id,
    scope: tokenData.scope,
    token_type: tokenData.token_type,
    expires_at:
      Date.now() + Number(tokenData.expires_in) * 1000,
    refresh_expires_at:
      Date.now() +
      Number(tokenData.refresh_expires_in) * 1000
  };

  await env.TIKTOK_KV.put(
    "main",
    JSON.stringify(tokenRecord)
  );

  return new Response(
    `
    <html>
      <head>
        <title>TikTok Connected</title>
      </head>
      <body>
        <h2>✅ TikTok Connected Successfully</h2>
        <p>Your TikTok account is now connected.</p>
        <p>You can close this window.</p>
      </body>
    </html>
    `,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html"
      }
    }
  );
}
