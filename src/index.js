export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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
