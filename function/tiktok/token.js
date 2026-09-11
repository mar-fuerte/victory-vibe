export async function onRequest(context) {
  const { request, env } = context;

  const suppliedSecret =
    request.headers.get("X-N8N-TIKTOK-SECRET");

  if (
    !suppliedSecret ||
    suppliedSecret !== env.N8N_TIKTOK_SECRET
  ) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized"
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  let tokenRecord =
    await env.TIKTOK_KV.get("main", "json");

  if (!tokenRecord) {
    return new Response(
      JSON.stringify({
        error: "TikTok account not connected"
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  const tenMinutes = 10 * 60 * 1000;

  if (
    tokenRecord.expires_at <=
    Date.now() + tenMinutes
  ) {
    const body = new URLSearchParams();

    body.set(
      "client_key",
      env.TIKTOK_CLIENT_KEY
    );

    body.set(
      "client_secret",
      env.TIKTOK_CLIENT_SECRET
    );

    body.set(
      "grant_type",
      "refresh_token"
    );

    body.set(
      "refresh_token",
      tokenRecord.refresh_token
    );

    const refreshResponse = await fetch(
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

    const refreshed =
      await refreshResponse.json();

    if (
      !refreshResponse.ok ||
      !refreshed.access_token
    ) {
      return new Response(
        JSON.stringify({
          error: "TikTok token refresh failed",
          details: refreshed
        }),
        {
          status: 401,
          headers: {
            "Content-Type":
              "application/json"
          }
        }
      );
    }

    tokenRecord = {
      access_token: refreshed.access_token,
      refresh_token:
        refreshed.refresh_token ||
        tokenRecord.refresh_token,
      open_id:
        refreshed.open_id ||
        tokenRecord.open_id,
      scope:
        refreshed.scope ||
        tokenRecord.scope,
      token_type:
        refreshed.token_type ||
        "Bearer",
      expires_at:
        Date.now() +
        Number(refreshed.expires_in) * 1000,
      refresh_expires_at:
        Date.now() +
        Number(refreshed.refresh_expires_in) * 1000
    };

    await env.TIKTOK_KV.put(
      "main",
      JSON.stringify(tokenRecord)
    );
  }

  return new Response(
    JSON.stringify({
      access_token: tokenRecord.access_token,
      open_id: tokenRecord.open_id,
      token_type: tokenRecord.token_type
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );
}
