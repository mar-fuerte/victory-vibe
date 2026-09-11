const REDIRECT_URI =
  "https://victory-vibe.mar-fuerte09.workers.dev/tiktok/callback";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // =========================
    // TIKTOK LOGIN
    // =========================
    if (
      request.method === "GET" &&
      url.pathname === "/tiktok/login"
    ) {
      const state = crypto.randomUUID();

      const authUrl = new URL(
        "https://www.tiktok.com/v2/auth/authorize/"
      );

      authUrl.searchParams.set(
        "client_key",
        env.TIKTOK_CLIENT_KEY
      );

      authUrl.searchParams.set(
        "scope",
        "user.info.basic,video.publish"
      );

      authUrl.searchParams.set(
        "response_type",
        "code"
      );

      authUrl.searchParams.set(
        "redirect_uri",
        REDIRECT_URI
      );

      authUrl.searchParams.set(
        "state",
        state
      );

      return new Response(null, {
        status: 302,
        headers: {
          Location: authUrl.toString(),

          "Set-Cookie":
            `tiktok_state=${encodeURIComponent(state)}; ` +
            `Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax`
        }
      });
    }


    // =========================
    // TIKTOK CALLBACK
    // =========================
    if (
      request.method === "GET" &&
      url.pathname === "/tiktok/callback"
    ) {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      const errorDescription =
        url.searchParams.get("error_description");

      if (error) {
        return new Response(
          `TikTok authorization failed: ${error}\n` +
          `${errorDescription || ""}`,
          {
            status: 400
          }
        );
      }

      if (!code || !state) {
        return new Response(
          "Missing TikTok authorization code or state.",
          {
            status: 400
          }
        );
      }

      const cookies =
        request.headers.get("Cookie") || "";

      const match = cookies.match(
        /(?:^|;\s*)tiktok_state=([^;]+)/
      );

      const savedState = match
        ? decodeURIComponent(match[1])
        : null;

      if (
        !savedState ||
        savedState !== state
      ) {
        return new Response(
          "Invalid TikTok state.",
          {
            status: 403
          }
        );
      }

      const body =
        new URLSearchParams();

      body.set(
        "client_key",
        env.TIKTOK_CLIENT_KEY
      );

      body.set(
        "client_secret",
        env.TIKTOK_CLIENT_SECRET
      );

      body.set(
        "code",
        code
      );

      body.set(
        "grant_type",
        "authorization_code"
      );

      body.set(
        "redirect_uri",
        REDIRECT_URI
      );

      const tokenResponse =
        await fetch(
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

      const tokenData =
        await tokenResponse.json();

      if (
        !tokenResponse.ok ||
        !tokenData.access_token
      ) {
        return new Response(
          JSON.stringify(
            tokenData,
            null,
            2
          ),
          {
            status: 400,

            headers: {
              "Content-Type":
                "application/json"
            }
          }
        );
      }

      const tokenRecord = {
        access_token:
          tokenData.access_token,

        refresh_token:
          tokenData.refresh_token,

        open_id:
          tokenData.open_id,

        scope:
          tokenData.scope,

        token_type:
          tokenData.token_type,

        expires_at:
          Date.now() +
          Number(tokenData.expires_in) *
            1000,

        refresh_expires_at:
          Date.now() +
          Number(
            tokenData.refresh_expires_in
          ) *
            1000
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
            "Content-Type":
              "text/html"
          }
        }
      );
    }


    // =========================
    // N8N TOKEN ENDPOINT
    // =========================
    if (
      request.method === "GET" &&
      url.pathname === "/tiktok/token"
    ) {
      const suppliedSecret =
        request.headers.get(
          "X-N8N-TIKTOK-SECRET"
        );

      if (
        !suppliedSecret ||
        suppliedSecret !==
          env.N8N_TIKTOK_SECRET
      ) {
        return new Response(
          JSON.stringify({
            error: "Unauthorized"
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

      let tokenRecord =
        await env.TIKTOK_KV.get(
          "main",
          "json"
        );

      if (!tokenRecord) {
        return new Response(
          JSON.stringify({
            error:
              "TikTok account not connected"
          }),
          {
            status: 404,

            headers: {
              "Content-Type":
                "application/json"
            }
          }
        );
      }

      const tenMinutes =
        10 * 60 * 1000;

      // Refresh token if access token
      // expires within 10 minutes.
      if (
        tokenRecord.expires_at <=
        Date.now() + tenMinutes
      ) {
        const refreshBody =
          new URLSearchParams();

        refreshBody.set(
          "client_key",
          env.TIKTOK_CLIENT_KEY
        );

        refreshBody.set(
          "client_secret",
          env.TIKTOK_CLIENT_SECRET
        );

        refreshBody.set(
          "grant_type",
          "refresh_token"
        );

        refreshBody.set(
          "refresh_token",
          tokenRecord.refresh_token
        );

        const refreshResponse =
          await fetch(
            "https://open.tiktokapis.com/v2/oauth/token/",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/x-www-form-urlencoded"
              },

              body: refreshBody
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
              error:
                "TikTok token refresh failed",
              details:
                refreshed
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
          access_token:
            refreshed.access_token,

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
            Number(
              refreshed.expires_in
            ) *
              1000,

          refresh_expires_at:
            Date.now() +
            Number(
              refreshed.refresh_expires_in
            ) *
              1000
        };

        await env.TIKTOK_KV.put(
          "main",
          JSON.stringify(tokenRecord)
        );
      }

      return new Response(
        JSON.stringify({
          access_token:
            tokenRecord.access_token,

          open_id:
            tokenRecord.open_id,

          token_type:
            tokenRecord.token_type
        }),
        {
          status: 200,

          headers: {
            "Content-Type":
              "application/json",

            "Cache-Control":
              "no-store"
          }
        }
      );
    }


    // =========================
    // STATIC WEBSITE
    // =========================
    return env.ASSETS.fetch(request);
  }
};
