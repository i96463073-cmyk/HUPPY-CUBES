const PESAPAL_BASE = "https://pay.pesapal.com/v3";
const DENZGAINS_BASE = "https://denzgains.com/api/v2";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "Content-Type, Authorization"
    }
  });
}

function makeMerchantReference() {
  return `HUPPY-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function makeTrackingId() {
  return `HC-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

/* =========================
   PESAPAL
========================= */

async function getPesapalToken(env) {
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

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.token) {
    throw new Error(
      `PesaPal authentication failed: HTTP ${response.status} ${JSON.stringify(data)}`
    );
  }

  return data.token;
}

async function createPesapalOrder(env, order) {
  const token = await getPesapalToken(env);

  const payload = {
    id: order.merchant_reference,
    currency: "KES",
    amount: Number(order.amount),
    description: `HUPPY CUBE - ${order.service_name}`,
    callback_url: order.callback_url,
    notification_id: env.PESAPAL_IPN_ID,
    redirect_mode: "TOP_WINDOW",

    billing_address: {
      email_address:
        order.email || "customer@huppycube.com",
      phone_number: order.phone,
      country_code: "KE",
      first_name: order.full_name || "HUPPY",
      middle_name: "",
      last_name: "CUSTOMER",
      line_1: "",
      line_2: "",
      city: "",
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
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.redirect_url) {
    throw new Error(
      `PesaPal order creation failed: HTTP ${response.status} ${JSON.stringify(data)}`
    );
  }

  return data;
}

async function getPesapalStatus(env, orderTrackingId) {
  const token = await getPesapalToken(env);

  const response = await fetch(
    `${PESAPAL_BASE}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(
      orderTrackingId
    )}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`
      }
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `PesaPal status check failed: HTTP ${response.status} ${JSON.stringify(data)}`
    );
  }

  return data;
}

/* =========================
   DENZGAINS
========================= */

async function getDenzServices(env) {
  const url =
    `${DENZGAINS_BASE}/?key=${encodeURIComponent(
      env.DENZGAINS_API_KEY
    )}&action=services`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  const data = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(
      `DenzGains services request failed: HTTP ${response.status} ${JSON.stringify(data)}`
    );
  }

  if (data.error) {
    throw new Error(
      `DenzGains services request failed: HTTP ${response.status} ${JSON.stringify(data)}`
    );
  }

  return data;
}

async function sendOrderToDenzGains(env, order) {
  const url =
    `${DENZGAINS_BASE}/?action=add` +
    `&service=${encodeURIComponent(order.service_id)}` +
    `&link=${encodeURIComponent(order.link)}` +
    `&quantity=${encodeURIComponent(order.quantity)}` +
    `&key=${encodeURIComponent(env.DENZGAINS_API_KEY)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `DenzGains order failed: HTTP ${response.status} ${JSON.stringify(data)}`
    );
  }

  if (data.error) {
    throw new Error(
      `DenzGains order failed: ${JSON.stringify(data)}`
    );
  }

  return data;
}

/* =========================
   ORDER LOOKUPS
========================= */

async function findOrderByTrackingId(env, trackingId) {
  return await env.DB.prepare(`
    SELECT *
    FROM direct_orders
    WHERE tracking_id = ?
    LIMIT 1
  `)
    .bind(trackingId)
    .first();
}

async function findOrderByMerchantReference(
  env,
  merchantReference
) {
  return await env.DB.prepare(`
    SELECT *
    FROM direct_orders
    WHERE merchant_reference = ?
    LIMIT 1
  `)
    .bind(merchantReference)
    .first();
}

/* =========================
   PROCESS PAID ORDER
========================= */

async function processPaidOrder(env, trackingId) {
  const order = await findOrderByTrackingId(
    env,
    trackingId
  );

  if (!order) {
    throw new Error("Order not found");
  }

  /*
    Prevent duplicate supplier submissions.
  */
  if (order.supplier_order_id) {
    return {
      success: true,
      already_submitted: true,
      order
    };
  }

  if (!order.pesapal_tracking_id) {
    throw new Error(
      "Missing PesaPal tracking ID"
    );
  }

  /*
    Verify payment directly with PesaPal.
  */
  const payment = await getPesapalStatus(
    env,
    order.pesapal_tracking_id
  );

  const paymentStatus = String(
    payment.payment_status_description || ""
  ).toUpperCase();

  const paymentAmount =
    Number(payment.amount || 0);

  const paymentCurrency =
    String(payment.currency || "").toUpperCase();

  if (paymentStatus !== "COMPLETED") {
    await env.DB.prepare(`
      UPDATE direct_orders
      SET
        payment_status = ?,
        order_status = ?,
        updated_at = ?
      WHERE id = ?
    `)
      .bind(
        paymentStatus || "PENDING",
        paymentStatus === "FAILED"
          ? "Payment Failed"
          : "Payment Pending",
        new Date().toISOString(),
        order.id
      )
      .run();

    return {
      success: false,
      payment_completed: false,
      payment_status: paymentStatus
    };
  }

  /*
    Verify currency.
  */
  if (
    paymentCurrency &&
    paymentCurrency !== "KES"
  ) {
    throw new Error(
      "PesaPal currency mismatch"
    );
  }

  /*
    Verify amount.
  */
  if (
    Number.isFinite(paymentAmount) &&
    Math.abs(
      paymentAmount - Number(order.amount)
    ) > 0.01
  ) {
    throw new Error(
      `PesaPal amount mismatch. Expected ${order.amount}, received ${paymentAmount}`
    );
  }

  /*
    Mark payment completed before supplier submission.
  */
  await env.DB.prepare(`
    UPDATE direct_orders
    SET
      payment_status = ?,
      order_status = ?,
      updated_at = ?
    WHERE id = ?
      AND supplier_order_id IS NULL
  `)
    .bind(
      "COMPLETED",
      "Submitting",
      new Date().toISOString(),
      order.id
    )
    .run();

  let supplierResponse;

  try {
    supplierResponse =
      await sendOrderToDenzGains(
        env,
        order
      );
  } catch (error) {
    await env.DB.prepare(`
      UPDATE direct_orders
      SET
        payment_status = ?,
        order_status = ?,
        updated_at = ?
      WHERE id = ?
    `)
      .bind(
        "COMPLETED",
        "Payment Completed - Supplier Error",
        new Date().toISOString(),
        order.id
      )
      .run();

    throw error;
  }

  const supplierOrderId =
    supplierResponse.order ||
    supplierResponse.order_id ||
    supplierResponse.id ||
    null;

  await env.DB.prepare(`
    UPDATE direct_orders
    SET
      supplier_order_id = ?,
      payment_status = ?,
      order_status = ?,
      updated_at = ?
    WHERE id = ?
  `)
    .bind(
      supplierOrderId
        ? String(supplierOrderId)
        : null,
      "COMPLETED",
      "Processing",
      new Date().toISOString(),
      order.id
    )
    .run();

  const updatedOrder =
    await findOrderByTrackingId(
      env,
      trackingId
    );

  return {
    success: true,
    already_submitted: false,
    order: updatedOrder,
    supplier_response: supplierResponse
  };
}

/* =========================
   SERVICES
========================= */

async function handleServices(request, env) {
  try {
    const services =
      await getDenzServices(env);

    return json({
      success: true,
      services
    });
  } catch (error) {
    return json(
      {
        success: false,
        error: error.message
      },
      500
    );
  }
}

/* =========================
   ORDER PAYMENT
========================= */

async function handleOrderPayment(
  request,
  env
) {
  if (request.method !== "POST") {
    return json(
      {
        success: false,
        error: "Method not allowed"
      },
      405
    );
  }

  const body =
    await request.json();

  const fullName =
    String(
      body.full_name ||
      body.fullName ||
      ""
    ).trim();

  const phone =
    String(
      body.phone || ""
    ).trim();

  const email =
    String(
      body.email || ""
    ).trim();

  const platform =
    String(
      body.platform || ""
    ).trim();

  const serviceId =
    String(
      body.service_id ||
      body.serviceId ||
      ""
    ).trim();

  const serviceName =
    String(
      body.service_name ||
      body.serviceName ||
      ""
    ).trim();

  const link =
    String(
      body.link ||
      body.account_link ||
      ""
    ).trim();

  const quantity =
    Number(body.quantity || 0);

  if (
    !fullName ||
    !phone ||
    !serviceId ||
    !link ||
    quantity <= 0
  ) {
    return json(
      {
        success: false,
        error:
          "Full name, phone, service, link and quantity are required."
      },
      400
    );
  }

  const services =
    await getDenzServices(env);

  const service =
    Array.isArray(services)
      ? services.find(
          item =>
            String(
              item.service ||
              item.service_id ||
              item.id
            ) === serviceId
        )
      : null;

  if (!service) {
    return json(
      {
        success: false,
        error:
          "Selected service was not found."
      },
      400
    );
  }

  const supplierRate =
    Number(service.rate || 0);

  if (
    !Number.isFinite(supplierRate) ||
    supplierRate <= 0
  ) {
    return json(
      {
        success: false,
        error:
          "Supplier price unavailable."
      },
      400
    );
  }

  /*
    HUPPY CUBE customer price =
    2 × DenzGains supplier price.
  */
  const customerRate =
    supplierRate * 2;

  const amount =
    Math.round(
      (customerRate * quantity) / 1000
    );

  if (amount < 1) {
    return json(
      {
        success: false,
        error:
          "Payment amount is too low."
      },
      400
    );
  }

  const merchantReference =
    makeMerchantReference();

  const trackingId =
    makeTrackingId();

  const timestamp =
    new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO direct_orders (
      tracking_id,
      merchant_reference,
      service_id,
      service_name,
      quantity,
      link,
      full_name,
      phone,
      email,
      platform,
      amount,
      supplier_rate,
      customer_rate,
      payment_status,
      order_status,
      supplier_order_id,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      trackingId,
      merchantReference,
      String(
        service.service ||
        service.service_id ||
        service.id ||
        serviceId
      ),
      serviceName ||
        service.name ||
        "Social Media Service",
      quantity,
      link,
      fullName,
      phone,
      email,
      platform,
      amount,
      supplierRate,
      customerRate,
      "PENDING",
      "Payment Pending",
      null,
      timestamp,
      timestamp
    )
    .run();

  const workerUrl =
    new URL(request.url).origin;

  const callbackUrl =
    `${workerUrl}/api/pesapal/callback`;

  const pesapal =
    await createPesapalOrder(
      env,
      {
        merchant_reference:
          merchantReference,

        amount,

        service_name:
          serviceName ||
          service.name ||
          "Social Media Service",

        phone,
        email,

        full_name:
          fullName,

        callback_url:
          callbackUrl
      }
    );

  /*
    Save PesaPal tracking ID.
  */
  if (
    pesapal.order_tracking_id
  ) {
    await env.DB.prepare(`
      UPDATE direct_orders
      SET
        pesapal_tracking_id = ?,
        updated_at = ?
      WHERE tracking_id = ?
    `)
      .bind(
        String(
          pesapal.order_tracking_id
        ),
        new Date().toISOString(),
        trackingId
      )
      .run();
  }

  return json({
    success: true,

    merchant_reference:
      merchantReference,

    tracking_id:
      trackingId,

    order_id:
      null,

    amount,

    redirect_url:
      pesapal.redirect_url,

    whatsapp:
      `https://wa.me/254796681162?text=${encodeURIComponent(
        `Hello HUPPY CUBE, I need help with order ${trackingId}`
      )}`
  });
}

/* =========================
   ORDER STATUS
========================= */

async function handleOrderStatus(
  request,
  env
) {
  const url =
    new URL(request.url);

  const trackingId =
    url.searchParams.get(
      "tracking_id"
    );

  if (!trackingId) {
    return json(
      {
        success: false,
        error:
          "tracking_id is required"
      },
      400
    );
  }

  const order =
    await env.DB.prepare(`
      SELECT
        id,
        tracking_id,
        merchant_reference,
        service_name,
        quantity,
        payment_status,
        order_status,
        supplier_order_id,
        created_at,
        updated_at
      FROM direct_orders
      WHERE tracking_id = ?
      LIMIT 1
    `)
      .bind(trackingId)
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

  let currentStep = 1;
  let progress = 25;

  const paymentStatus =
    String(
      order.payment_status || ""
    ).toUpperCase();

  const orderStatus =
    String(
      order.order_status || ""
    ).toLowerCase();

  if (
    paymentStatus === "FAILED" ||
    paymentStatus === "REVERSED"
  ) {
    currentStep = 1;
    progress = 0;
  } else if (
    paymentStatus === "COMPLETED"
  ) {
    currentStep = 2;
    progress = 50;
  }

  if (
    order.supplier_order_id ||
    orderStatus === "processing"
  ) {
    currentStep = 3;
    progress = 75;
  }

  if (
    orderStatus === "completed"
  ) {
    currentStep = 4;
    progress = 100;
  }

  if (
    orderStatus.includes(
      "supplier error"
    )
  ) {
    currentStep = 2;
    progress = 50;
  }

  return json({
    success: true,

    order,

    tracking: {
      current_step:
        currentStep,

      progress,

      payment_received:
        paymentStatus ===
        "COMPLETED",

      order_submitted:
        Boolean(
          order.supplier_order_id
        ),

      processing:
        Boolean(
          order.supplier_order_id &&
          orderStatus ===
            "processing"
        ),

      completed:
        orderStatus ===
        "completed"
    },

    whatsapp: {
      number: "254796681162",

      url:
        `https://wa.me/254796681162?text=${encodeURIComponent(
          `Hello HUPPY CUBE, I need help with order ${trackingId}`
        )}`
    }
  });
}

/* =========================
   PESAPAL CALLBACK
========================= */

async function handlePesapalCallback(
  request,
  env
) {
  const url =
    new URL(request.url);

  const pesapalTrackingId =
    url.searchParams.get(
      "OrderTrackingId"
    );

  const merchantReference =
    url.searchParams.get(
      "OrderMerchantReference"
    );

  if (!pesapalTrackingId) {
    return new Response(
      `
      <!doctype html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>HUPPY CUBE</title>
      </head>
      <body style="font-family:Arial;text-align:center;padding:40px">
        <h2>Payment callback received</h2>
        <p>We could not find the PesaPal tracking ID.</p>
      </body>
      </html>
      `,
      {
        status: 400,
        headers: {
          "content-type":
            "text/html; charset=utf-8"
        }
      }
    );
  }

  let order = null;

  if (merchantReference) {
    order =
      await findOrderByMerchantReference(
        env,
        merchantReference
      );
  }

  if (!order) {
    return new Response(
      `
      <!doctype html>
      <html>
      <body style="font-family:Arial;text-align:center;padding:40px">
        <h2>Order not found</h2>
        <p>Please contact HUPPY CUBE support.</p>
      </body>
      </html>
      `,
      {
        status: 404,
        headers: {
          "content-type":
            "text/html; charset=utf-8"
        }
      }
    );
  }

  try {
    await processPaidOrder(
      env,
      order.tracking_id
    );
  } catch (error) {
    console.error(
      "Callback processing error:",
      error
    );
  }

  /*
    Original-style callback page.
  */
  const trackingUrl =
    `${new URL(request.url).origin}` +
    `/api/order-status?tracking_id=` +
    encodeURIComponent(
      order.tracking_id
    );

  const whatsappUrl =
    `https://wa.me/254796681162?text=` +
    encodeURIComponent(
      `Hello HUPPY CUBE, I need help with order ${order.tracking_id}`
    );

  return new Response(
    `
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta
        name="viewport"
        content="width=device-width,initial-scale=1"
      >
      <title>HUPPY CUBE - Payment</title>

      <style>
        body {
          margin: 0;
          padding: 30px 20px;
          background: #080713;
          color: white;
          font-family: Arial, sans-serif;
          text-align: center;
        }

        .box {
          max-width: 500px;
          margin: 40px auto;
          padding: 30px 20px;
          background: #121020;
          border-radius: 18px;
        }

        h1 {
          margin-bottom: 10px;
        }

        .tracking {
          margin: 20px 0;
          padding: 15px;
          background: #080713;
          border-radius: 12px;
          font-weight: bold;
        }

        a {
          display: block;
          margin: 12px 0;
          padding: 14px;
          border-radius: 10px;
          text-decoration: none;
          color: white;
          background: #673cff;
        }

        .whatsapp {
          background: #168a45;
        }
      </style>
    </head>

    <body>
      <div class="box">

        <h1>Payment Received</h1>

        <p>
          Your HUPPY CUBE order has been received.
        </p>

        <div class="tracking">
          Tracking ID:<br>
          ${order.tracking_id}
        </div>

        <a href="${trackingUrl}">
          Track My Order
        </a>

        <a
          class="whatsapp"
          href="${whatsappUrl}"
        >
          WhatsApp Support
        </a>

      </div>
    </body>
    </html>
    `,
    {
      status: 200,
      headers: {
        "content-type":
          "text/html; charset=utf-8",
        "cache-control":
          "no-store"
      }
    }
  );
}

/* =========================
   PESAPAL IPN
========================= */

async function handlePesapalIPN(
  request,
  env
) {
  const url =
    new URL(request.url);

  const pesapalTrackingId =
    url.searchParams.get(
      "OrderTrackingId"
    );

  const merchantReference =
    url.searchParams.get(
      "OrderMerchantReference"
    );

  if (
    merchantReference
  ) {
    const order =
      await findOrderByMerchantReference(
        env,
        merchantReference
      );

    if (order) {
      try {
        await processPaidOrder(
          env,
          order.tracking_id
        );
      } catch (error) {
        console.error(
          "IPN processing error:",
          error
        );
      }
    }
  }

  return json({
    orderNotificationType:
      "IPNCHANGE",

    orderTrackingId:
      pesapalTrackingId,

    orderMerchantReference:
      merchantReference,

    status: 200
  });
}

/* =========================
   TEST ORDER
========================= */

async function handleTestOrder(
  request,
  env,
  orderId
) {
  const url =
    new URL(request.url);

  const secret =
    url.searchParams.get(
      "secret"
    );

  if (
    !env.TEST_ORDER_SECRET ||
    secret !==
      env.TEST_ORDER_SECRET
  ) {
    return json(
      {
        success: false,
        error: "Unauthorized"
      },
      401
    );
  }

  const order =
    await env.DB.prepare(`
      SELECT *
      FROM direct_orders
      WHERE id = ?
      LIMIT 1
    `)
      .bind(orderId)
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

  /*
    Never submit an order twice.
  */
  if (order.supplier_order_id) {
    return json({
      success: true,
      message:
        "Order already submitted to DenzGains.",
      order
    });
  }

  if (!order.tracking_id) {
    return json(
      {
        success: false,
        error:
          "Order has no tracking ID."
      },
      400
    );
  }

  try {
    const result =
      await processPaidOrder(
        env,
        order.tracking_id
      );

    return json({
      success: true,
      result
    });
  } catch (error) {
    return json(
      {
        success: false,
        error:
          error.message ||
          String(error)
      },
      500
    );
  }
}

/* =========================
   MAIN
========================= */

export default {
  async fetch(request, env) {
    try {
      if (
        request.method === "OPTIONS"
      ) {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin":
              "*",
            "access-control-allow-methods":
              "GET,POST,OPTIONS",
            "access-control-allow-headers":
              "Content-Type, Authorization"
          }
        });
      }

      const url =
        new URL(request.url);

      const pathname =
        url.pathname;

      if (
        pathname === "/" &&
        request.method === "GET"
      ) {
        return json({
          success: true,
          name: "HUPPY CUBE",
          status: "online"
        });
      }

      if (
        pathname === "/api/services"
      ) {
        return handleServices(
          request,
          env
        );
      }

      if (
        pathname === "/api/order-payment"
      ) {
        return handleOrderPayment(
          request,
          env
        );
      }

      if (
        pathname === "/api/order-status"
      ) {
        return handleOrderStatus(
          request,
          env
        );
      }

      if (
        pathname === "/api/pesapal/callback"
      ) {
        return handlePesapalCallback(
          request,
          env
        );
      }

      if (
        pathname === "/api/pesapal/ipn"
      ) {
        return handlePesapalIPN(
          request,
          env
        );
      }

      if (
        pathname.startsWith(
          "/api/test-order/"
        )
      ) {
        const orderId =
          pathname
            .split("/")
            .pop();

        return handleTestOrder(
          request,
          env,
          orderId
        );
      }

      return json(
        {
          success: false,
          error: "Route not found"
        },
        404
      );
    } catch (error) {
      console.error(
        "Worker error:",
        error
      );

      return json(
        {
          success: false,
          error:
            error.message ||
            "Internal server error"
        },
        500
      );
    }
  }
};
