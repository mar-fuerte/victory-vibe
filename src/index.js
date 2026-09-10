function randomState() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Start TikTok Login
    if (url.pathname === "/auth/tiktok") {
      const state = randomState();

      const authUrl = new URL(
        "https://www.tiktok.com/v2/auth/authorize/"
      );

      authUrl.searchParams.set("client_key", env.TIKTOK_CLIENT_KEY);
      authUrl.searchParams.set(
        "scope",
        "user.info.basic,video.publish"
      );
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set(
        "redirect_uri",
        `${url.origin}/auth/tiktok/callback`
      );
      authUrl.searchParams.set("state", state);

      return new Response(null, {
        status: 302,
        headers: {
          Location: authUrl.toString(),
          "Set-Cookie": `tiktok_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`
        }
      });
    }

    // TikTok OAuth callback
    if (url.pathname === "/auth/tiktok/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (!code) {
        return new Response("Missing authorization code", {
          status: 400
        });
      }

      const cookies = request.headers.get("Cookie") || "";
      const stateCookie = cookies
        .split(";")
        .map(v => v.trim())
        .find(v => v.startsWith("tiktok_oauth_state="));

      const savedState = stateCookie
        ? stateCookie.split("=")[1]
        : null;

      if (!state || state !== savedState) {
        return new Response("Invalid OAuth state", {
          status: 400
        });
      }

      const tokenResponse = await fetch(
        "https://open.tiktokapis.com/v2/oauth/token/",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams({
            client_key: env.TIKTOK_CLIENT_KEY,
            client_secret: env.TIKTOK_CLIENT_SECRET,
            code,
            grant_type: "authorization_code",
            redirect_uri: `${url.origin}/auth/tiktok/callback`
          })
        }
      );

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok || tokenData.error) {
        return Response.json(
          {
            success: false,
            error: tokenData
          },
          { status: 400 }
        );
      }

      await env.TIKTOK_KV.put(
        "tiktok_auth",
        JSON.stringify({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          open_id: tokenData.open_id,
          expires_in: tokenData.expires_in,
          refresh_expires_in: tokenData.refresh_expires_in,
          created_at: Date.now()
        })
      );

      return Response.json({
        success: true,
        message: "TikTok connected successfully",
        open_id: tokenData.open_id
      });
    }

    // KV test
    if (url.pathname === "/api/test-kv") {
      await env.TIKTOK_KV.put("test", "KV is working");

      const value = await env.TIKTOK_KV.get("test");

      return Response.json({
        success: true,
        kv: value
      });
    }

    return env.ASSETS.fetch(request);
  }
};
