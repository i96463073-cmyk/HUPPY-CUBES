const DENZGAINS_URL = "https://denzgains.com/api/v2";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      // -----------------------------
      // DenzGains API helper
      // -----------------------------
      async function denzGains(action, params = {}) {
        if (!env.DENZGAINS_API_KEY) {
          throw new Error("DENZGAINS_API_KEY is not configured");
        }

        const body = new URLSearchParams();

        body.set("key", env.DENZGAINS_API_KEY);
        body.set("action", action);

        for (const [key, value] of Object.entries(params)) {
          body.set(key, String(value));
        }

        const response = await fetch(DENZGAINS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body
        });

        const text = await response.text();

        let data;

        try {
          data = JSON.parse(text);
        } catch {
          throw new Error("DenzGains returned an invalid response");
        }

        if (!response.ok) {
          throw new Error(
            data?.error ||
            data?.message ||
            `DenzGains HTTP ${response.status}`
          );
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        return data;
      }

      // -----------------------------
      // JSON response helper
      // -----------------------------
      function json(data, status = 200) {
        return new Response(JSON.stringify(data), {
          status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
          }
        });
      }

      // -----------------------------
      // CORS
      // -----------------------------
      function withCors(response) {
        const headers = new Headers(response.headers);

        headers.set("Access-Control-Allow-Origin", "*");
        headers.set(
          "Access-Control-Allow-Methods",
          "GET, POST, OPTIONS"
        );
        headers.set(
          "Access-Control-Allow-Headers",
          "Content-Type"
        );

        return new Response(response.body, {
          status: response.status,
          headers
        });
      }

      if (request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }));
      }

      // ============================================================
      // DENZGAINS: GET SERVICES
      // ============================================================
      if (
        url.pathname === "/api/denzgains/services" &&
        request.method === "GET"
      ) {
        const services = await denzGains("services");

        if (!Array.isArray(services)) {
          return withCors(
            json(
              {
                success: false,
                error: "Invalid services response from DenzGains"
              },
              502
            )
          );
        }

        // Save/update services in D1.
        for (const service of services) {
          const supplierRate = Number(service.rate || 0);

          if (!Number.isFinite(supplierRate) || supplierRate < 0) {
            continue;
          }

          // Customer price = supplier price × 2
          const customerRate = supplierRate * 2;

          await env.DB.prepare(`
            INSERT INTO smm_services (
              service_id,
              name,
              type,
              category,
              supplier_rate,
              customer_rate,
              min_quantity,
              max_quantity,
              refill,
              cancel,
              active,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(service_id) DO UPDATE SET
              name = excluded.name,
              type = excluded.type,
              category = excluded.category,
              supplier_rate = excluded.supplier_rate,
              customer_rate = excluded.customer_rate,
              min_quantity = excluded.min_quantity,
              max_quantity = excluded.max_quantity,
              refill = excluded.refill,
              cancel = excluded.cancel,
              active = 1,
              updated_at = CURRENT_TIMESTAMP
          `)
            .bind(
              Number(service.service),
              service.name || "",
              service.type || "",
              service.category || "",
              supplierRate,
              customerRate,
              Number(service.min || 0),
              Number(service.max || 0),
              service.refill ? 1 : 0,
              service.cancel ? 1 : 0
            )
            .run();
        }

        return withCors(
          json({
            success: true,
            count: services.length,
            services: services.map((service) => ({
              service: Number(service.service),
              name: service.name,
              type: service.type,
              category: service.category,
              supplier_rate: Number(service.rate || 0),
              customer_rate: Number(service.rate || 0) * 2,
              min: Number(service.min || 0),
              max: Number(service.max || 0),
              refill: Boolean(service.refill),
              cancel: Boolean(service.cancel)
            }))
          })
        );
      }

      // ============================================================
      // HUPPY CUBE: LOCAL SERVICES
      // ============================================================
      if (
        url.pathname === "/api/services" &&
        request.method === "GET"
      ) {
        const result = await env.DB.prepare(`
          SELECT
            service_id,
            name,
            type,
            category,
            customer_rate,
            min_quantity,
            max_quantity,
            refill,
            cancel
          FROM smm_services
          WHERE active = 1
          ORDER BY category, service_id
        `).all();

        return withCors(
          json({
            success: true,
            services: result.results || []
          })
        );
      }

      // ============================================================
      // DENZGAINS BALANCE
      // ============================================================
      if (
        url.pathname === "/api/denzgains/balance" &&
        request.method === "GET"
      ) {
        const balance = await denzGains("balance");

        return withCors(
          json({
            success: true,
            balance: balance.balance,
            currency: balance.currency
          })
        );
      }

      // ============================================================
      // CREATE SMM ORDER
      // ============================================================
      if (
        url.pathname === "/api/smm/order" &&
        request.method === "POST"
      ) {
        const body = await request.json();

        const phone = String(body.phone || "").trim();
        const serviceId = Number(body.service_id);
        const link = String(body.link || "").trim();
        const quantity = Number(body.quantity);

        if (!phone) {
          return withCors(
            json(
              {
                success: false,
                error: "Phone number is required"
              },
              400
            )
          );
        }

        if (!Number.isInteger(serviceId)) {
          return withCors(
            json(
              {
                success: false,
                error: "Invalid service"
              },
              400
            )
          );
        }

        if (!link) {
          return withCors(
            json(
              {
                success: false,
                error: "Target link is required"
              },
              400
            )
          );
        }

        if (!Number.isInteger(quantity) || quantity <= 0) {
          return withCors(
            json(
              {
                success: false,
                error: "Invalid quantity"
              },
              400
            )
          );
        }

        // Find service
        const service = await env.DB.prepare(`
          SELECT *
          FROM smm_services
          WHERE service_id = ?
          AND active = 1
          LIMIT 1
        `)
          .bind(serviceId)
          .first();

        if (!service) {
          return withCors(
            json(
              {
                success: false,
                error: "Service not found"
              },
              404
            )
          );
        }

        // Quantity validation
        if (
          quantity < Number(service.min_quantity) ||
          quantity > Number(service.max_quantity)
        ) {
          return withCors(
            json(
              {
                success: false,
                error: `Quantity must be between ${service.min_quantity} and ${service.max_quantity}`
              },
              400
            )
          );
        }

        /*
          IMPORTANT:
          The service rate is the supplier's rate.

          We apply ×2 pricing for the customer.

          If DenzGains' rate represents the price for the
          standard API quantity unit, this calculation is:

              customer amount =
              customer_rate × quantity / 1000

          If DenzGains confirms its rate is NOT per 1,000,
          this formula should be changed.
        */

        const customerRate = Number(service.customer_rate);

        const amount = Number(
          ((customerRate * quantity) / 1000).toFixed(2)
        );

        if (!Number.isFinite(amount) || amount <= 0) {
          return withCors(
            json(
              {
                success: false,
                error: "Unable to calculate order price"
              },
              400
            )
          );
        }

        // ----------------------------------------------------------
        // Make sure wallet exists
        // ----------------------------------------------------------
        await env.DB.prepare(`
          INSERT INTO wallets (phone, balance)
          VALUES (?, 0)
          ON CONFLICT(phone) DO NOTHING
        `)
          .bind(phone)
          .run();

        const wallet = await env.DB.prepare(`
          SELECT balance
          FROM wallets
          WHERE phone = ?
          LIMIT 1
        `)
          .bind(phone)
          .first();

        const currentBalance = Number(wallet?.balance || 0);

        if (currentBalance < amount) {
          return withCors(
            json(
              {
                success: false,
                error: "Insufficient wallet balance",
                balance: currentBalance,
                required: amount
              },
              400
            )
          );
        }

        // ----------------------------------------------------------
        // Create local pending order FIRST
        // ----------------------------------------------------------
        const localOrder = await env.DB.prepare(`
          INSERT INTO smm_orders (
            phone,
            service_id,
            service_name,
            link,
            quantity,
            supplier_rate,
            customer_rate,
            amount,
            status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Submitting')
          RETURNING id
        `)
          .bind(
            phone,
            serviceId,
            service.name,
            link,
            quantity,
            Number(service.supplier_rate),
            customerRate,
            amount
          )
          .first();

        const localOrderId = localOrder?.id;

        if (!localOrderId) {
          return withCors(
            json(
              {
                success: false,
                error: "Could not create local order"
              },
              500
            )
          );
        }

        // ----------------------------------------------------------
        // Submit to DenzGains
        // ----------------------------------------------------------
        let supplierResponse;

        try {
          supplierResponse = await denzGains("add", {
            service: serviceId,
            link,
            quantity
          });
        } catch (error) {
          await env.DB.prepare(`
            UPDATE smm_orders
            SET status = 'Failed',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `)
            .bind(localOrderId)
            .run();

          return withCors(
            json(
              {
                success: false,
                error: error.message || "DenzGains order failed"
              },
              502
            )
          );
        }

        const supplierOrderId = supplierResponse?.order;

        if (!supplierOrderId) {
          await env.DB.prepare(`
            UPDATE smm_orders
            SET status = 'Failed',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `)
            .bind(localOrderId)
            .run();

          return withCors(
            json(
              {
                success: false,
                error: "DenzGains did not return an order ID"
              },
              502
            )
          );
        }

        // ----------------------------------------------------------
        // Deduct wallet + record transaction
        // ----------------------------------------------------------
        const transactionReference =
          `SMM:${localOrderId}:DENZ:${supplierOrderId}`;

        await env.DB.batch([
          env.DB.prepare(`
            UPDATE wallets
            SET balance = balance - ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE phone = ?
            AND balance >= ?
          `).bind(
            amount,
            phone,
            amount
          ),

          env.DB.prepare(`
            INSERT INTO wallet_transactions (
              phone,
              type,
              amount,
              reference,
              description
            )
            VALUES (?, 'DEBIT', ?, ?, ?)
          `).bind(
            phone,
            amount,
            transactionReference,
            `SMM order #${localOrderId} - ${service.name}`
          ),

          env.DB.prepare(`
            UPDATE smm_orders
            SET
              supplier_order_id = ?,
              status = 'Pending',
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(
            String(supplierOrderId),
            localOrderId
          )
        ]);

        // Verify final wallet balance
        const updatedWallet = await env.DB.prepare(`
          SELECT balance
          FROM wallets
          WHERE phone = ?
          LIMIT 1
        `)
          .bind(phone)
          .first();

        return withCors(
          json({
            success: true,
            message: "Order submitted successfully",
            order: {
              id: localOrderId,
              supplier_order_id: String(supplierOrderId),
              service_id: serviceId,
              service_name: service.name,
              quantity,
              amount,
              status: "Pending"
            },
            wallet_balance: Number(updatedWallet?.balance || 0)
          })
        );
      }

      // ============================================================
      // ORDER STATUS
      // ============================================================
      if (
        url.pathname === "/api/smm/status" &&
        request.method === "GET"
      ) {
        const localOrderId = Number(
          url.searchParams.get("order_id")
        );

        if (!Number.isInteger(localOrderId)) {
          return withCors(
            json(
              {
                success: false,
                error: "Invalid order ID"
              },
              400
            )
          );
        }

        const localOrder = await env.DB.prepare(`
          SELECT *
          FROM smm_orders
          WHERE id = ?
          LIMIT 1
        `)
          .bind(localOrderId)
          .first();

        if (!localOrder) {
          return withCors(
            json(
              {
                success: false,
                error: "Order not found"
              },
              404
            )
          );
        }

        if (!localOrder.supplier_order_id) {
          return withCors(
            json({
              success: true,
              order: localOrder
            })
          );
        }

        const status = await denzGains("status", {
          order: localOrder.supplier_order_id
        });

        if (status?.status) {
          await env.DB.prepare(`
            UPDATE smm_orders
            SET
              status = ?,
              remains = ?,
              start_count = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `)
            .bind(
              status.status,
              status.remains != null
                ? Number(status.remains)
                : null,
              status.start_count != null
                ? Number(status.start_count)
                : null,
              localOrderId
            )
            .run();
        }

        const updated = await env.DB.prepare(`
          SELECT *
          FROM smm_orders
          WHERE id = ?
          LIMIT 1
        `)
          .bind(localOrderId)
          .first();

        return withCors(
          json({
            success: true,
            order: updated,
            supplier_status: status
          })
        );
      }

      // ============================================================
      // REFILL
      // ============================================================
      if (
        url.pathname === "/api/smm/refill" &&
        request.method === "POST"
      ) {
        const body = await request.json();

        const localOrderId = Number(body.order_id);

        if (!Number.isInteger(localOrderId)) {
          return withCors(
            json(
              {
                success: false,
                error: "Invalid order ID"
              },
              400
            )
          );
        }

        const order = await env.DB.prepare(`
          SELECT *
          FROM smm_orders
          WHERE id = ?
          LIMIT 1
        `)
          .bind(localOrderId)
          .first();

        if (!order) {
          return withCors(
            json(
              {
                success: false,
                error: "Order not found"
              },
              404
            )
          );
        }

        const service = await env.DB.prepare(`
          SELECT refill
          FROM smm_services
          WHERE service_id = ?
          LIMIT 1
        `)
          .bind(order.service_id)
          .first();

        if (!service?.refill) {
          return withCors(
            json(
              {
                success: false,
                error: "Refill is not available for this service"
              },
              400
            )
          );
        }

        const result = await denzGains("refill", {
          order: order.supplier_order_id
        });

        return withCors(
          json({
            success: true,
            result
          })
        );
      }

      // ============================================================
      // CANCEL
      // ============================================================
      if (
        url.pathname === "/api/smm/cancel" &&
        request.method === "POST"
      ) {
        const body = await request.json();

        const localOrderId = Number(body.order_id);

        const order = await env.DB.prepare(`
          SELECT *
          FROM smm_orders
          WHERE id = ?
          LIMIT 1
        `)
          .bind(localOrderId)
          .first();

        if (!order) {
          return withCors(
            json(
              {
                success: false,
                error: "Order not found"
              },
              404
            )
          );
        }

        const service = await env.DB.prepare(`
          SELECT cancel
          FROM smm_services
          WHERE service_id = ?
          LIMIT 1
        `)
          .bind(order.service_id)
          .first();

        if (!service?.cancel) {
          return withCors(
            json(
              {
                success: false,
                error: "Cancel is not available for this service"
              },
              400
            )
          );
        }

        const result = await denzGains("cancel", {
          order: order.supplier_order_id
        });

        return withCors(
          json({
            success: true,
            result
          })
        );
      }

      // ============================================================
      // EXISTING FRONTEND / ASSETS
      // ============================================================
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return new Response("HUPPY CUBE API", {
        status: 200,
        headers: {
          "Content-Type": "text/plain"
        }
      });

    } catch (error) {
      console.error("HUPPY CUBE ERROR:", error);

      return withCors(
        json(
          {
            success: false,
            error: error?.message || "Internal server error"
          },
          500
        )
      );
    }
  }
};
