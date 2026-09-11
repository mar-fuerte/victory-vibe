export async function onRequest(context) {
  const { env, request } = context;

  const state = crypto.randomUUID();

  const redirectUri =
    "https://victory-vibe.mar-fuerte09.workers.dev/tiktok/callback";

  const authUrl = new URL(
    "https://www.tiktok.com/v2/auth/authorize/"
  );

  authUrl.searchParams.set("client_key", env.TIKTOK_CLIENT_KEY);
  authUrl.searchParams.set(
    "scope",
    "user.info.basic,video.publish"
  );
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      "Set-Cookie":
        `tiktok_state=${state}; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax`
    }
  });
}
