export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      // Let API routes be handled by the Worker
      if (url.pathname.startsWith("/api/")) {
        return new Response(
          JSON.stringify({
            ok: true,
            message: "HUPPY CUBE Worker API is running",
            path: url.pathname
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      // Everything else goes to the Vite/React assets
      return await env.ASSETS.fetch(request);

    } catch (error) {
      console.error("WORKER ERROR:", error);

      return new Response(
        "HUPPY CUBE Worker Error:\n\n" +
        (error?.stack || error?.message || String(error)),
        {
          status: 500,
          headers: {
            "content-type": "text/plain; charset=utf-8"
          }
        }
      );
    }
  }
};
