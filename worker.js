const DENZGAINS_URL = "https://denzgains.com/api/v2";
const PESAPAL_BASE = "https://pay.pesapal.com/v3";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    function json(data, status = 200) {
      return new Response(JSON.stringify(data), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    // ============================================================
    // DENZGAINS HELPER
    // ============================================================

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

    // ============================================================
    // PESAPAL TOKEN
    // ============================================================

    async function getPesaPalToken() {
      if (
        !env.PESAPAL_CONSUMER_KEY ||
        !env.PESAPAL_CONSUMER_SECRET
      ) {
        throw new Error(
          "PesaPal consumer credentials are not configured"
        );
      }

      const response = await fetch(
        `${PESAPAL_BASE}/api/Auth/RequestToken`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            consumer_key: env.PESAPAL_CONSUMER_KEY,
            consumer_secret: env.PESAPAL_CONSUMER_SECRET
          })
        }
      );

      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          "PesaPal authentication returned an invalid response"
        );
      }

      if (!response.ok || !data.token) {
        throw new Error(
          data?.error?.message ||
          data?.message ||
          "PesaPal authentication failed"
        );
      }

      return data.token;
    }

    // ============================================================
    // PHONE NORMALIZATION
    // ============================================================

    function normalizePhone(phone) {
      let value = String(phone || "").replace(/\s+/g, "");

      if (value.startsWith("+254")) {
        return value.substring(1);
      }

      if (value.startsWith("254")) {
        return value;
      }

      if (value.startsWith("0")) {
        return "254" + value.substring(1);
      }

      return value;
    }

    // ============================================================
    // PESAPAL TRANSACTION STATUS
    // ============================================================

    async function getPesaPalTransactionStatus(trackingId) {
      if (!trackingId) {
        throw new Error("Missing PesaPal tracking ID");
      }

      const token = await getPesaPalToken();

      const response = await fetch(
        `${PESAPAL_BASE}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(
          trackingId
        )}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          }
        }
      );

      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          "PesaPal status endpoint returned invalid JSON"
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.error?.message ||
          data?.message ||
          `PesaPal status HTTP ${response.status}`
        );
      }

      return data;
    }

    // ============================================================
    // CREDIT WALLET
    // ============================================================

    async function creditWallet(trackingId, statusData) {
      const statusCode = Number(statusData?.status_code);

      if (statusCode !== 1) {
        return {
          credited: false,
          reason: "Payment is not completed"
        };
      }

      const payment = await env.DB.prepare(`
        SELECT *
        FROM payments
        WHERE tracking_id = ?
        LIMIT 1
      `)
        .bind(trackingId)
        .first();

      if (!payment) {
        return {
          credited: false,
          reason: "Payment record not found"
        };
      }

      if (Number(payment.credited) === 1) {
        const wallet = await env.DB.prepare(`
          SELECT balance
          FROM wallets
          WHERE phone = ?
          LIMIT 1
        `)
          .bind(payment.phone)
          .first();

        return {
          credited: true,
          already_credited: true,
          balance: Number(wallet?.balance || 0)
        };
      }

      const amount = Number(statusData.amount || payment.amount);

      if (!Number.isFinite(amount) || amount <= 0) {
        return {
          credited: false,
          reason: "Invalid payment amount"
        };
      }

      const phone = payment.phone;

      await env.DB.prepare(`
        INSERT INTO wallets (phone, balance)
        VALUES (?, 0)
        ON CONFLICT(phone) DO NOTHING
      `)
        .bind(phone)
        .run();

      const reference = `PESAPAL:${trackingId}`;

      await env.DB.batch([
        env.DB.prepare(`
          UPDATE wallets
          SET
            balance = balance + ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE phone = ?
        `).bind(amount, phone),

        env.DB.prepare(`
          INSERT INTO wallet_transactions (
            phone,
            type,
            amount,
            reference,
            description
          )
          VALUES (?, 'CREDIT', ?, ?, ?)
          ON CONFLICT(reference) DO NOTHING
        `).bind(
          phone,
          amount,
          reference,
          `PesaPal deposit ${payment.merchant_reference}`
        ),

        env.DB.prepare(`
          UPDATE payments
          SET
            status = 'COMPLETED',
            confirmation_code = ?,
            payment_method = ?,
            credited = 1,
            updated_at = CURRENT_TIMESTAMP
          WHERE tracking_id = ?
          AND credited = 0
        `).bind(
          statusData.confirmation_code || null,
          statusData.payment_method || null,
          trackingId
        )
      ]);

      const wallet = await env.DB.prepare(`
        SELECT balance
        FROM wallets
        WHERE phone = ?
        LIMIT 1
      `)
        .bind(phone)
        .first();

      return {
        credited: true,
        already_credited: false,
        amount,
        balance: Number(wallet?.balance || 0)
      };
    }

    // ============================================================
    // CREATE PESAPAL PAYMENT
    // ============================================================

    if (
      url.pathname === "/api/payment" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();

        const phone = normalizePhone(body.phone);
        const email = String(body.email || "").trim();
        const amount = Number(body.amount);

        if (!phone) {
          return json(
            {
              success: false,
              error: "Phone number is required"
            },
            400
          );
        }

        if (!Number.isFinite(amount) || amount <= 0) {
          return json(
            {
              success: false,
              error: "Enter a valid deposit amount"
            },
            400
          );
        }

        if (amount < 1) {
          return json(
            {
              success: false,
              error: "Minimum deposit is KSh 1"
            },
            400
          );
        }

        const merchantReference =
          `HUPPY-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

        await env.DB.prepare(`
          INSERT INTO payments (
            merchant_reference,
            phone,
            email,
            amount,
            currency,
            status,
            credited
          )
          VALUES (?, ?, ?, ?, 'KES', 'PENDING', 0)
        `)
          .bind(
            merchantReference,
            phone,
            email || null,
            amount
          )
          .run();

        const token = await getPesaPalToken();

        const appUrl =
          env.APP_URL ||
          `${url.protocol}//${url.host}`;

        const callbackUrl =
          `${appUrl}/payment-success`;

        if (!env.PESAPAL_IPN_ID) {
          return json(
            {
              success: false,
              error:
                "PESAPAL_IPN_ID is not configured in Cloudflare"
            },
            500
          );
        }

        const paymentRequest = {
          id: merchantReference,
          currency: "KES",
          amount,
          description: "HUPPY CUBE Wallet Deposit",
          callback_url: callbackUrl,
          cancellation_url: `${appUrl}/`,
          notification_id: env.PESAPAL_IPN_ID,
          billing_address: {
            email_address: email || "",
            phone_number: phone,
            country_code: "KE",
            first_name: "HUPPY",
            middle_name: "",
            last_name: "Customer",
            line_1: "HUPPY CUBE",
            line_2: "",
            city: "Nairobi",
            state: "",
            postal_code: "",
            zip_code: ""
          }
        };

        const response = await fetch(
          `${PESAPAL_BASE}/api/Transactions/SubmitOrderRequest`,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(paymentRequest)
          }
        );

        const text = await response.text();

        let data;

        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(
            "PesaPal returned an invalid payment response"
          );
        }

        if (!response.ok || !data.redirect_url) {
          throw new Error(
            data?.error?.message ||
            data?.message ||
            "Unable to create PesaPal payment"
          );
        }

        await env.DB.prepare(`
          UPDATE payments
          SET
            tracking_id = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE merchant_reference = ?
        `)
          .bind(
            data.order_tracking_id,
            merchantReference
          )
          .run();

        return json({
          success: true,
          merchant_reference: merchantReference,
          tracking_id: data.order_tracking_id,
          redirect_url: data.redirect_url,
          amount
        });

      } catch (error) {
        console.error("PESAPAL PAYMENT ERROR:", error);

        return json(
          {
            success: false,
            error:
              error?.message ||
              "Unable to start PesaPal payment"
          },
          500
        );
      }
    }

    // ============================================================
    // PAYMENT STATUS
    // ============================================================

    if (
      url.pathname === "/api/payment-status" &&
      request.method === "GET"
    ) {
      try {
        const trackingId =
          url.searchParams.get("orderTrackingId") ||
          url.searchParams.get("tracking_id");

        if (!trackingId) {
          return json(
            {
              success: false,
              error: "Missing tracking ID"
            },
            400
          );
        }

        const status =
          await getPesaPalTransactionStatus(trackingId);

        const credit =
          await creditWallet(trackingId, status);

        return json({
          success: true,
          tracking_id: trackingId,
          status: status.payment_status_description,
          status_code: Number(status.status_code),
          amount: Number(status.amount || 0),
          currency: status.currency || "KES",
          confirmation_code:
            status.confirmation_code || null,
          credited: credit.credited,
          balance:
            credit.balance !== undefined
              ? credit.balance
              : null
        });

      } catch (error) {
        console.error(
          "PESAPAL STATUS ERROR:",
          error
        );

        return json(
          {
            success: false,
            error:
              error?.message ||
              "Unable to check payment"
          },
          500
        );
      }
    }

    // ============================================================
    // PESAPAL IPN
    // ============================================================

    if (
      url.pathname === "/api/ipn" &&
      (request.method === "GET" ||
        request.method === "POST")
    ) {
      try {
        let trackingId =
          url.searchParams.get("OrderTrackingId");

        let merchantReference =
          url.searchParams.get(
            "OrderMerchantReference"
          );

        if (request.method === "POST") {
          const contentType =
            request.headers.get("content-type") || "";

          if (contentType.includes("application/json")) {
            const body = await request.json();

            trackingId =
              body.OrderTrackingId ||
              body.orderTrackingId ||
              trackingId;

            merchantReference =
              body.OrderMerchantReference ||
              body.orderMerchantReference ||
              merchantReference;
          } else {
            const form = await request.formData();

            trackingId =
              form.get("OrderTrackingId") ||
              trackingId;

            merchantReference =
              form.get("OrderMerchantReference") ||
              merchantReference;
          }
        }

        if (trackingId) {
          try {
            const status =
              await getPesaPalTransactionStatus(
                trackingId
              );

            await creditWallet(
              trackingId,
              status
            );
          } catch (error) {
            console.error(
              "IPN VERIFICATION ERROR:",
              error
            );
          }
        }

        return json({
          orderNotificationType: "IPNCHANGE",
          orderTrackingId: trackingId,
          orderMerchantReference: merchantReference,
          status: 200
        });

      } catch (error) {
        console.error("IPN ERROR:", error);

        return json({
          status: 500
        });
      }
    }

    // ============================================================
    // WALLET
    // ============================================================

    if (
      url.pathname === "/api/wallet" &&
      request.method === "GET"
    ) {
      const phone = normalizePhone(
        url.searchParams.get("phone")
      );

      if (!phone) {
        return json(
          {
            success: false,
            error: "Phone number is required"
          },
          400
        );
      }

      await env.DB.prepare(`
        INSERT INTO wallets (phone, balance)
        VALUES (?, 0)
        ON CONFLICT(phone) DO NOTHING
      `)
        .bind(phone)
        .run();

      const wallet = await env.DB.prepare(`
        SELECT phone, balance, updated_at
        FROM wallets
        WHERE phone = ?
        LIMIT 1
      `)
        .bind(phone)
        .first();

      return json({
        success: true,
        phone,
        balance: Number(wallet?.balance || 0),
        currency: "KES",
        updated_at: wallet?.updated_at || null
      });
    }

    // ============================================================
    // REGISTER PESAPAL IPN
    // ============================================================

    if (
      url.pathname === "/api/register-ipn" &&
      request.method === "POST"
    ) {
      try {
        const token = await getPesaPalToken();

        const appUrl =
          env.APP_URL ||
          `${url.protocol}//${url.host}`;

        const ipnUrl =
          `${appUrl}/api/ipn`;

        const response = await fetch(
          `${PESAPAL_BASE}/api/URLSetup/RegisterIPN`,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              url: ipnUrl,
              ipn_notification_type: "GET"
            })
          }
        );

        const text = await response.text();

        let data;

        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(
            "PesaPal returned invalid IPN registration response"
          );
        }

        return json(data, response.status);

      } catch (error) {
        return json(
          {
            success: false,
            error:
              error?.message ||
              "Unable to register IPN"
          },
          500
        );
      }
    }

    // ============================================================
    // DENZGAINS SERVICES
    // ============================================================

    if (
      url.pathname === "/api/denzgains/services" &&
      request.method === "GET"
    ) {
      try {
        const services =
          await denzGains("services");

        if (!Array.isArray(services)) {
          return json(
            {
              success: false,
              error:
                "Invalid services response from DenzGains"
            },
            502
          );
        }

        for (const service of services) {
          const supplierRate =
            Number(service.rate || 0);

          if (
            !Number.isFinite(supplierRate) ||
            supplierRate < 0
          ) {
            continue;
          }

          const customerRate =
            supplierRate * 2;

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

        return json({
          success: true,
          count: services.length,
          services: services.map(
            (service) => ({
              service:
                Number(service.service),
              name: service.name,
              type: service.type,
              category: service.category,
              supplier_rate:
                Number(service.rate || 0),
              customer_rate:
                Number(service.rate || 0) * 2,
              min:
                Number(service.min || 0),
              max:
                Number(service.max || 0),
              refill:
                Boolean(service.refill),
              cancel:
                Boolean(service.cancel)
            })
          )
        });

      } catch (error) {
        return json(
          {
            success: false,
            error:
              error?.message ||
              "Unable to load DenzGains services"
          },
          502
        );
      }
    }

    // ============================================================
    // LOCAL SERVICES
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

      return json({
        success: true,
        services: result.results || []
      });
    }

    // ============================================================
    // DENZGAINS BALANCE
    // ============================================================

    if (
      url.pathname === "/api/denzgains/balance" &&
      request.method === "GET"
    ) {
      try {
        const balance =
          await denzGains("balance");

        return json({
          success: true,
          balance: balance.balance,
          currency: balance.currency
        });

      } catch (error) {
        return json(
          {
            success: false,
            error:
              error?.message ||
              "Unable to get DenzGains balance"
          },
          502
        );
      }
    }

    // ============================================================
    // CREATE SMM ORDER
    // ============================================================

    if (
      url.pathname === "/api/smm/order" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();

        const phone =
          normalizePhone(body.phone);

        const serviceId =
          Number(body.service_id);

        const link =
          String(body.link || "").trim();

        const quantity =
          Number(body.quantity);

        if (!phone) {
          return json(
            {
              success: false,
              error: "Phone number is required"
            },
            400
          );
        }

        if (!Number.isInteger(serviceId)) {
          return json(
            {
              success: false,
              error: "Invalid service"
            },
            400
          );
        }

        if (!link) {
          return json(
            {
              success: false,
              error: "Target link is required"
            },
            400
          );
        }

        if (
          !Number.isInteger(quantity) ||
          quantity <= 0
        ) {
          return json(
            {
              success: false,
              error: "Invalid quantity"
            },
            400
          );
        }

        const service =
          await env.DB.prepare(`
            SELECT *
            FROM smm_services
            WHERE service_id = ?
            AND active = 1
            LIMIT 1
          `)
            .bind(serviceId)
            .first();

        if (!service) {
          return json(
            {
              success: false,
              error: "Service not found"
            },
            404
          );
        }

        if (
          quantity <
            Number(service.min_quantity) ||
          quantity >
            Number(service.max_quantity)
        ) {
          return json(
            {
              success: false,
              error:
                `Quantity must be between ${service.min_quantity} and ${service.max_quantity}`
            },
            400
          );
        }

        const customerRate =
          Number(service.customer_rate);

        /*
          Customer price = supplier rate × 2.

          Current calculation assumes the rate is
          expressed per 1,000 units.
        */
        const amount = Number(
          (
            customerRate *
            quantity /
            1000
          ).toFixed(2)
        );

        if (
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          return json(
            {
              success: false,
              error:
                "Unable to calculate order price"
            },
            400
          );
        }

        await env.DB.prepare(`
          INSERT INTO wallets (phone, balance)
          VALUES (?, 0)
          ON CONFLICT(phone) DO NOTHING
        `)
          .bind(phone)
          .run();

        const wallet =
          await env.DB.prepare(`
            SELECT balance
            FROM wallets
            WHERE phone = ?
            LIMIT 1
          `)
            .bind(phone)
            .first();

        const currentBalance =
          Number(wallet?.balance || 0);

        if (currentBalance < amount) {
          return json(
            {
              success: false,
              error:
                "Insufficient wallet balance",
              balance: currentBalance,
              required: amount
            },
            400
          );
        }

        /*
          Create local order before submitting
          to supplier.
        */
        const localOrder =
          await env.DB.prepare(`
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

        const localOrderId =
          localOrder?.id;

        if (!localOrderId) {
          return json(
            {
              success: false,
              error:
                "Could not create local order"
            },
            500
          );
        }

        let supplierResponse;

        try {
          supplierResponse =
            await denzGains("add", {
              service: serviceId,
              link,
              quantity
            });

        } catch (error) {
          await env.DB.prepare(`
            UPDATE smm_orders
            SET
              status = 'Failed',
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `)
            .bind(localOrderId)
            .run();

          return json(
            {
              success: false,
              error:
                error?.message ||
                "DenzGains order failed"
            },
            502
          );
        }

        const supplierOrderId =
          supplierResponse?.order;

        if (!supplierOrderId) {
          await env.DB.prepare(`
            UPDATE smm_orders
            SET
              status = 'Failed',
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `)
            .bind(localOrderId)
            .run();

          return json(
            {
              success: false,
              error:
                "DenzGains did not return an order ID"
            },
            502
          );
        }

        const transactionReference =
          `SMM:${localOrderId}:DENZ:${supplierOrderId}`;

        /*
          Re-check wallet immediately before
          deduction.
        */
        const deduction =
          await env.DB.prepare(`
            UPDATE wallets
            SET
              balance = balance - ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE phone = ?
            AND balance >= ?
          `)
            .bind(
              amount,
              phone,
              amount
            )
            .run();

        if (!deduction.success) {
          return json(
            {
              success: false,
              error:
                "Wallet deduction failed"
            },
            400
          );
        }

        await env.DB.batch([
          env.DB.prepare(`
            INSERT INTO wallet_transactions (
              phone,
              type,
              amount,
              reference,
              description
            )
            VALUES (
              ?,
              'DEBIT',
              ?,
              ?,
              ?
            )
            ON CONFLICT(reference) DO NOTHING
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

        const updatedWallet =
          await env.DB.prepare(`
            SELECT balance
            FROM wallets
            WHERE phone = ?
            LIMIT 1
          `)
            .bind(phone)
            .first();

        return json({
          success: true,
          message:
            "Order submitted successfully",
          order: {
            id: localOrderId,
            supplier_order_id:
              String(supplierOrderId),
            service_id: serviceId,
            service_name:
              service.name,
            quantity,
            amount,
            status: "Pending"
          },
          wallet_balance:
            Number(
              updatedWallet?.balance || 0
            )
        });

      } catch (error) {
        console.error(
          "SMM ORDER ERROR:",
          error
        );

        return json(
          {
            success: false,
            error:
              error?.message ||
              "Unable to create order"
          },
          500
        );
      }
    }

    // ============================================================
    // SMM STATUS
    // ============================================================

    if (
      url.pathname === "/api/smm/status" &&
      request.method === "GET"
    ) {
      try {
        const localOrderId =
          Number(
            url.searchParams.get(
              "order_id"
            )
          );

        if (!Number.isInteger(localOrderId)) {
          return json(
            {
              success: false,
              error: "Invalid order ID"
            },
            400
          );
        }

        const localOrder =
          await env.DB.prepare(`
            SELECT *
            FROM smm_orders
            WHERE id = ?
            LIMIT 1
          `)
            .bind(localOrderId)
            .first();

        if (!localOrder) {
          return json(
            {
              success: false,
              error: "Order not found"
            },
            404
          );
        }

        if (!localOrder.supplier_order_id) {
          return json({
            success: true,
            order: localOrder
          });
        }

        const status =
          await denzGains("status", {
            order:
              localOrder.supplier_order_id
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

        const updated =
          await env.DB.prepare(`
            SELECT *
            FROM smm_orders
            WHERE id = ?
            LIMIT 1
          `)
            .bind(localOrderId)
            .first();

        return json({
          success: true,
          order: updated,
          supplier_status: status
        });

      } catch (error) {
        return json(
          {
            success: false,
            error:
              error?.message ||
              "Unable to check order status"
          },
          502
        );
      }
    }

    // ============================================================
    // REFILL
    // ============================================================

    if (
      url.pathname === "/api/smm/refill" &&
      request.method === "POST"
    ) {
      try {
        const body =
          await request.json();

        const localOrderId =
          Number(body.order_id);

        const order =
          await env.DB.prepare(`
            SELECT *
            FROM smm_orders
            WHERE id = ?
            LIMIT 1
          `)
            .bind(localOrderId)
            .first();

        if (!order) {
          return json(
            {
              success: false,
              error: "Order not found"
            },
            404
          );
        }

        const service =
          await env.DB.prepare(`
            SELECT refill
            FROM smm_services
            WHERE service_id = ?
            LIMIT 1
          `)
            .bind(order.service_id)
            .first();

        if (!service?.refill) {
          return json(
            {
              success: false,
              error:
                "Refill is not available for this service"
            },
            400
          );
        }

        const result =
          await denzGains("refill", {
            order:
              order.supplier_order_id
          });

        return json({
          success: true,
          result
        });

      } catch (error) {
        return json(
          {
            success: false,
            error:
              error?.message ||
              "Unable to refill order"
          },
          502
        );
      }
    }

    // ============================================================
    // CANCEL
    // ============================================================

    if (
      url.pathname === "/api/smm/cancel" &&
      request.method === "POST"
    ) {
      try {
        const body =
          await request.json();

        const localOrderId =
          Number(body.order_id);

        const order =
          await env.DB.prepare(`
            SELECT *
            FROM smm_orders
            WHERE id = ?
            LIMIT 1
          `)
            .bind(localOrderId)
            .first();

        if (!order) {
          return json(
            {
              success: false,
              error: "Order not found"
            },
            404
          );
        }

        const service =
          await env.DB.prepare(`
            SELECT cancel
            FROM smm_services
            WHERE service_id = ?
            LIMIT 1
          `)
            .bind(order.service_id)
            .first();

        if (!service?.cancel) {
          return json(
            {
              success: false,
              error:
                "Cancel is not available for this service"
            },
            400
          );
        }

        const result =
          await denzGains("cancel", {
            order:
              order.supplier_order_id
          });

        return json({
          success: true,
          result
        });

      } catch (error) {
        return json(
          {
            success: false,
            error:
              error?.message ||
              "Unable to cancel order"
          },
          502
        );
      }
    }

    // ============================================================
    // SERVE REACT FRONTEND
    // ============================================================

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response(
      "HUPPY CUBE API",
      {
        status: 200,
        headers: {
          "Content-Type": "text/plain"
        }
      }
    );
  }
};
