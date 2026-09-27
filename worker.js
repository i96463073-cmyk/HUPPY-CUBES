const DENZGAINS_BASE = "https://denzgains.com/api/v2";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      // ==============================
      // GET DenzGains services
      // ==============================
      if (url.pathname === "/api/services" && request.method === "GET") {
        if (!env.DENZGAINS_API_KEY) {
          return json(
            { error: "DENZGAINS_API_KEY is not configured." },
            500
          );
        }

        const apiUrl =
          `${DENZGAINS_BASE}?action=services` +
          `&key=${encodeURIComponent(env.DENZGAINS_API_KEY)}`;

        const response = await fetch(apiUrl);

        const text = await response.text();

        if (!response.ok) {
          console.error("DenzGains HTTP error:", response.status, text);

          return json(
            {
              error: "DenzGains API request failed.",
              status: response.status
            },
            502
          );
        }

        let data;

        try {
          data = JSON.parse(text);
        } catch {
          console.error("Invalid DenzGains response:", text);

          return json(
            { error: "DenzGains returned invalid JSON." },
            502
          );
        }

        if (!Array.isArray(data)) {
          console.error("Unexpected DenzGains response:", data);

          return json(
            {
              error: "Unexpected services response from DenzGains."
            },
            502
          );
        }

        // Convert DenzGains services into the structure
        // expected by the HUPPY CUBE frontend.
        const services = data
          .map((service) => {
            const supplierRate = Number(service.rate || 0);

            return {
              service_id: Number(service.service),
              name: String(service.name || ""),
              type: service.type || "",
              category: service.category || "",
              supplier_rate: supplierRate,

              // Customer price = supplier rate × 2
              customer_rate: supplierRate * 2,

              min_quantity: Number(service.min || 0),
              max_quantity: Number(service.max || 0),

              refill: service.refill ? 1 : 0,
              cancel: service.cancel ? 1 : 0,
              active: 1
            };
          })
          .filter(
            (service) =>
              service.service_id &&
              service.name &&
              service.customer_rate > 0
          );

        return json({
          services
        });
      }

      // ==============================
      // Temporary test for other API
      // ==============================
      if (url.pathname.startsWith("/api/")) {
        return json(
          {
            ok: true,
            message: "HUPPY CUBE Worker API is running",
            path: url.pathname
          },
          200
        );
      }

      // ==============================
      // React/Vite assets
      // ==============================
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
