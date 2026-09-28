const PESAPAL_BASE = "https://pay.pesapal.com/v3";
const DENZGAINS_BASE = "https://denzgains.com/api/v2";

const JSON_HEADERS = {
  "Content-Type": "application/json"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
  });
}

function makeTrackingId() {
  return `HUPPY-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().split("-")[0].toUpperCase()}`;
}

function normalizePhone(phone) {
  let value = String(phone || "").trim();

  if (value.startsWith("0")) {
    value = "254" + value.slice(1);
  }

  if (value.startsWith("+")) {
    value = value.slice(1);
  }

  return value;
}

function customerPrice(supplierRate) {
  return Number(supplierRate || 0) * 2;
}

/* =========================================================
   PESAPAL
========================================================= */

async function getPesapalToken(env) {
  const response = await fetch(
    `${PESAPAL_BASE}/api/Auth/RequestToken`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        consumer_key: env.PESAPAL_CONSUMER_KEY,
        consumer_secret: env.PESAPAL_CONSUMER_SECRET
      })
    }
  );

  const data = await response.json();

  if (!response.ok || !data.token) {
    throw new Error(
      `PesaPal authentication failed: ${JSON.stringify(data)}`
    );
  }

  return data.token;
}

async function createPesapalOrder(env, order, origin) {
  const token = await getPesapalToken(env);

  const payload = {
    id: order.tracking_id,
    currency: "KES",
    amount: Number(order.amount),
    description: `HUPPY CUBE - ${order.service_name}`,

    callback_url:
      `${origin}/api/payment-callback?tracking_id=` +
      encodeURIComponent(order.tracking_id),

    notification_id: env.PESAPAL_IPN_ID,

    billing_address: {
      email_address: "customer@huppycube.com",
      phone_number: normalizePhone(order.phone),
      country_code: "KE",
      first_name: String(order.full_name || "HUPPY"),
      last_name: "Customer"
    }
  };

  const response = await fetch(
    `${PESAPAL_BASE}/api/Transactions/SubmitOrderRequest`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json();

  if (!response.ok || !data.redirect_url) {
    throw new Error(
      `PesaPal order creation failed: ${JSON.stringify(data)}`
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
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `PesaPal status check failed: ${JSON.stringify(data)}`
    );
  }

  return data;
}

/* =========================================================
   DENZGAINS
========================================================= */

async function getDenzServices(env) {
  if (!env.DENZGAINS_API_KEY) {
    throw new Error(
      "DENZGAINS_API_KEY is not configured."
    );
  }

  /*
   * IMPORTANT:
   * DENZGAINS_BASE already contains /api/v2.
   * Do NOT add /api/v2 again.
   */

  const url =
    `${DENZGAINS_BASE}?action=services&key=` +
    encodeURIComponent(env.DENZGAINS_API_KEY);

  const response = await fetch(url);

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Invalid JSON returned by DenzGains: ${text.slice(0, 1000)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `DenzGains services failed: ${JSON.stringify({
        status: response.status,
        response: data
      })}`
    );
  }

  if (data?.error) {
    throw new Error(
      `DenzGains services error: ${JSON.stringify(data)}`
    );
  }

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data.services)) {
    return data.services;
  }

  return [];
}

async function sendOrderToDenzGains(
  env,
  serviceId,
  link,
  quantity
) {
  if (!env.DENZGAINS_API_KEY) {
    throw new Error(
      "DENZGAINS_API_KEY is not configured."
    );
  }

  /*
   * IMPORTANT:
   * DENZGAINS_BASE already contains /api/v2.
   * Do NOT add /api/v2 again.
   */

  const url =
    `${DENZGAINS_BASE}?action=add` +
    `&service=${encodeURIComponent(serviceId)}` +
    `&link=${encodeURIComponent(link)}` +
    `&quantity=${encodeURIComponent(quantity)}` +
    `&key=${encodeURIComponent(env.DENZGAINS_API_KEY)}`;

  const response = await fetch(url);

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Invalid JSON returned by DenzGains: ${text.slice(0, 1000)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `DenzGains order failed: ${JSON.stringify({
        status: response.status,
        response: data
      })}`
    );
  }

  if (data?.error) {
    throw new Error(
      `DenzGains order error: ${JSON.stringify(data)}`
    );
  }

  return data;
}

/* =========================================================
   DATABASE
========================================================= */

async function ensureOrdersTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_id TEXT UNIQUE,
      service_id TEXT,
      service_name TEXT,
      quantity INTEGER,
      link TEXT,
      phone TEXT,
      full_name TEXT,
      amount REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'PENDING',
      order_status TEXT DEFAULT 'Pending',
      pesapal_order_tracking_id TEXT,
      pesapal_merchant_reference TEXT,
      supplier_order_id TEXT,
      supplier_response TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

async function getOrderByTrackingId(
  env,
  trackingId
) {
  await ensureOrdersTable(env);

  return env.DB
    .prepare(
      `SELECT *
       FROM orders
       WHERE tracking_id = ?
       LIMIT 1`
    )
    .bind(trackingId)
    .first();
}

async function getOrderById(env, id) {
  await ensureOrdersTable(env);

  return env.DB
    .prepare(
      `SELECT *
       FROM orders
       WHERE id = ?
       LIMIT 1`
    )
    .bind(id)
    .first();
}

async function updateOrder(
  env,
  id,
  fields
) {
  const entries =
    Object.entries(fields);

  if (!entries.length) {
    return;
  }

  const setParts =
    entries.map(
      ([key]) => `${key} = ?`
    );

  const values =
    entries.map(
      ([, value]) => value
    );

  setParts.push(
    "updated_at = CURRENT_TIMESTAMP"
  );

  await env.DB
    .prepare(
      `UPDATE orders
       SET ${setParts.join(", ")}
       WHERE id = ?`
    )
    .bind(
      ...values,
      id
    )
    .run();
}

/* =========================================================
   TRACKING
========================================================= */

function trackingInfo(order) {
  const status =
    String(
      order?.order_status ||
        "Pending"
    ).toLowerCase();

  let currentStep = 1;
  let progress = 25;

  if (
    status.includes(
      "submitting"
    )
  ) {
    currentStep = 2;
    progress = 50;

  } else if (
    status.includes(
      "processing"
    )
  ) {
    currentStep = 3;
    progress = 75;

  } else if (
    status.includes(
      "completed"
    )
  ) {
    currentStep = 4;
    progress = 100;

  } else if (
    status.includes(
      "supplier error"
    )
  ) {
    currentStep = 2;
    progress = 50;
  }

  return {
    current_step:
      currentStep,

    progress
  };
}

/* =========================================================
   PROCESS PAID ORDER
========================================================= */

async function processPaidOrder(
  env,
  order
) {
  if (!order) {
    throw new Error(
      "Order not found."
    );
  }

  /*
   * Never submit the same supplier
   * order twice.
   */

  if (
    order.supplier_order_id
  ) {
    return {
      success: true,

      already_submitted:
        true,

      supplier_order_id:
        order.supplier_order_id
    };
  }

  if (
    order.payment_status ===
      "COMPLETED" &&
    String(
      order.order_status || ""
    )
      .toLowerCase()
      .includes(
        "processing"
      )
  ) {
    return {
      success: true,
      already_processing:
        true
    };
  }

  if (
    !order.pesapal_order_tracking_id
  ) {
    throw new Error(
      "PesaPal transaction tracking ID is missing."
    );
  }

  const payment =
    await getPesapalStatus(
      env,
      order.pesapal_order_tracking_id
    );

  const paymentStatus =
    String(
      payment?.payment_status_description ||
        payment?.status_code ||
        payment?.status ||
        ""
    ).toUpperCase();

  const isCompleted =
    paymentStatus.includes(
      "COMPLETED"
    ) ||
    paymentStatus.includes(
      "PAID"
    ) ||
    Number(
      payment?.status_code
    ) === 1;

  if (!isCompleted) {
    await updateOrder(
      env,
      order.id,
      {
        payment_status:
          paymentStatus ||
          "PENDING",

        order_status:
          "Payment Pending"
      }
    );

    return {
      success: false,
      paid: false,
      payment
    };
  }

  await updateOrder(
    env,
    order.id,
    {
      payment_status:
        "COMPLETED",

      order_status:
        "Submitting"
    }
  );

  const supplierResult =
    await sendOrderToDenzGains(
      env,
      order.service_id,
      order.link,
      order.quantity
    );

  const supplierOrderId =
    supplierResult?.order ||
    supplierResult?.order_id ||
    supplierResult?.id ||
    null;

  if (!supplierOrderId) {
    await updateOrder(
      env,
      order.id,
      {
        order_status:
          "Supplier Error",

        supplier_response:
          JSON.stringify(
            supplierResult
          )
      }
    );

    throw new Error(
      `DenzGains did not return an order ID: ${JSON.stringify(
        supplierResult
      )}`
    );
  }

  await updateOrder(
    env,
    order.id,
    {
      supplier_order_id:
        String(
          supplierOrderId
        ),

      supplier_response:
        JSON.stringify(
          supplierResult
        ),

      order_status:
        "Processing"
    }
  );

  return {
    success: true,
    paid: true,

    supplier_order_id:
      String(
        supplierOrderId
      ),

    supplier_response:
      supplierResult
  };
}

/* =========================================================
   CREATE PAYMENT
========================================================= */

async function handleOrderPayment(
  request,
  env
) {
  await ensureOrdersTable(
    env
  );

  const body =
    await request.json();

  const serviceId =
    String(
      body.service_id || ""
    ).trim();

  const serviceName =
    String(
      body.service_name || ""
    ).trim();

  const quantity =
    Number(
      body.quantity || 0
    );

  const link =
    String(
      body.link || ""
    ).trim();

  const phone =
    String(
      body.phone || ""
    ).trim();

  if (!serviceId) {
    return json(
      {
        error:
          "Service ID is required."
      },
      400
    );
  }

  if (
    !quantity ||
    quantity <= 0
  ) {
    return json(
      {
        error:
          "Valid quantity is required."
      },
      400
    );
  }

  if (!link) {
    return json(
      {
        error:
          "Target link is required."
      },
      400
    );
  }

  if (!phone) {
    return json(
      {
        error:
          "Phone number is required."
      },
      400
    );
  }

  /*
   * Get the real supplier rate.
   */

  const services =
    await getDenzServices(
      env
    );

  const service =
    services.find(
      (item) =>
        String(
          item.service ||
            item.service_id ||
            item.id ||
            ""
        ) === serviceId
    );

  if (!service) {
    return json(
      {
        error:
          "Selected service was not found."
      },
      404
    );
  }

  const supplierRate =
    Number(
      service.rate ||
        service.price ||
        0
    );

  if (!supplierRate) {
    return json(
      {
        error:
          "Supplier price is unavailable for this service."
      },
      400
    );
  }

  const amount =
    (
      customerPrice(
        supplierRate
      ) *
      quantity
    ) / 1000;

  const trackingId =
    makeTrackingId();

  const insert =
    await env.DB
      .prepare(`
        INSERT INTO orders (
          tracking_id,
          service_id,
          service_name,
          quantity,
          link,
          phone,
          full_name,
          amount,
          payment_status,
          order_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        trackingId,
        serviceId,
        serviceName ||
          service.name ||
          `Service ${serviceId}`,
        quantity,
        link,
        phone,
        "Customer",
        amount,
        "PENDING",
        "Pending"
      )
      .run();

  const orderId =
    insert?.meta?.last_row_id;

  if (!orderId) {
    throw new Error(
      "Order was created but its database ID could not be determined."
    );
  }

  const order =
    await getOrderById(
      env,
      orderId
    );

  const origin =
    new URL(
      request.url
    ).origin;

  const payment =
    await createPesapalOrder(
      env,
      order,
      origin
    );

  await updateOrder(
    env,
    orderId,
    {
      pesapal_order_tracking_id:
        payment.order_tracking_id ||
        payment.orderTrackingId ||
        null,

      pesapal_merchant_reference:
        payment.merchant_reference ||
        payment.merchantReference ||
        trackingId
    }
  );

  return json({
    success: true,

    tracking_id:
      trackingId,

    amount,

    redirect_url:
      payment.redirect_url
  });
}

/* =========================================================
   ORDER STATUS
========================================================= */

async function handleOrderStatus(
  request,
  env
) {
  const url =
    new URL(
      request.url
    );

  const trackingId =
    url.searchParams.get(
      "tracking_id"
    );

  if (!trackingId) {
    return json(
      {
        error:
          "Tracking ID is required."
      },
      400
    );
  }

  const order =
    await getOrderByTrackingId(
      env,
      trackingId
    );

  if (!order) {
    return json(
      {
        error:
          "Order not found."
      },
      404
    );
  }

  return json({
    success: true,

    order,

    tracking:
      trackingInfo(
        order
      ),

    whatsapp: {
      url:
        `https://wa.me/254796681162?text=` +
        encodeURIComponent(
          `Hello HUPPY CUBE, I need help with my order. Tracking ID: ${trackingId}`
        )
    }
  });
}

/* =========================================================
   PAYMENT CALLBACK
========================================================= */

async function handlePaymentCallback(
  request,
  env
) {
  const url =
    new URL(
      request.url
    );

  const trackingId =
    url.searchParams.get(
      "tracking_id"
    );

  const merchantReference =
    url.searchParams.get(
      "OrderMerchantReference"
    ) ||
    url.searchParams.get(
      "pesapal_merchant_reference"
    );

  const orderTrackingId =
    url.searchParams.get(
      "OrderTrackingId"
    ) ||
    url.searchParams.get(
      "orderTrackingId"
    ) ||
    url.searchParams.get(
      "pesapal_transaction_tracking_id"
    );

  let order = null;

  if (trackingId) {
    order =
      await getOrderByTrackingId(
        env,
        trackingId
      );
  }

  if (
    !order &&
    merchantReference
  ) {
    order =
      await getOrderByTrackingId(
        env,
        merchantReference
      );
  }

  if (
    order &&
    orderTrackingId
  ) {
    await updateOrder(
      env,
      order.id,
      {
        pesapal_order_tracking_id:
          orderTrackingId
      }
    );

    order =
      await getOrderById(
        env,
        order.id
      );
  }

  if (order) {
    try {
      await processPaidOrder(
        env,
        order
      );
    } catch (error) {
      console.error(
        "Payment callback processing error:",
        error
      );
    }
  }

  const finalTrackingId =
    order?.tracking_id ||
    trackingId ||
    merchantReference ||
    "";

  return Response.redirect(
    `${url.origin}/?tracking_id=${encodeURIComponent(
      finalTrackingId
    )}`,
    302
  );
}

/* =========================================================
   PESAPAL IPN
========================================================= */

async function handlePesapalIpn(
  request,
  env
) {
  const url =
    new URL(
      request.url
    );

  const merchantReference =
    url.searchParams.get(
      "OrderMerchantReference"
    ) ||
    url.searchParams.get(
      "pesapal_merchant_reference"
    );

  const orderTrackingId =
    url.searchParams.get(
      "OrderTrackingId"
    ) ||
    url.searchParams.get(
      "orderTrackingId"
    ) ||
    url.searchParams.get(
      "pesapal_transaction_tracking_id"
    );

  if (!merchantReference) {
    return json({
      orderNotificationType:
        "IPNCHANGE",

      orderTrackingId:
        orderTrackingId || "",

      orderMerchantReference:
        "",

      status:
        "FAILED"
    });
  }

  let order =
    await getOrderByTrackingId(
      env,
      merchantReference
    );

  if (!order) {
    return json({
      orderNotificationType:
        "IPNCHANGE",

      orderTrackingId:
        orderTrackingId || "",

      orderMerchantReference:
        merchantReference,

      status:
        "FAILED"
    });
  }

  if (orderTrackingId) {
    await updateOrder(
      env,
      order.id,
      {
        pesapal_order_tracking_id:
          orderTrackingId
      }
    );

    order =
      await getOrderById(
        env,
        order.id
      );
  }

  try {
    await processPaidOrder(
      env,
      order
    );
  } catch (error) {
    console.error(
      "IPN processing error:",
      error
    );
  }

  return json({
    orderNotificationType:
      "IPNCHANGE",

    orderTrackingId:
      orderTrackingId || "",

    orderMerchantReference:
      merchantReference,

    status:
      "200"
  });
}

/* =========================================================
   TEST EXISTING ORDER
========================================================= */

async function handleTestOrder(
  request,
  env,
  orderId
) {
  const url =
    new URL(
      request.url
    );

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
        error:
          "Unauthorized."
      },
      401
    );
  }

  const order =
    await getOrderById(
      env,
      Number(orderId)
    );

  if (!order) {
    return json(
      {
        error:
          "Order not found."
      },
      404
    );
  }

  if (
    order.supplier_order_id
  ) {
    return json({
      success: true,

      message:
        "This order has already been submitted to DenzGains.",

      order
    });
  }

  try {
    const result =
      await processPaidOrder(
        env,
        order
      );

    const updated =
      await getOrderById(
        env,
        order.id
      );

    return json({
      success: true,
      result,
      order: updated
    });

  } catch (error) {
    return json(
      {
        success: false,

        error:
          error.message ||
          String(error),

        order_id:
          order.id
      },
      500
    );
  }
}

/* =========================================================
   DENZGAINS DIAGNOSTIC
========================================================= */

async function handleDenzTest(
  request,
  env
) {
  const url =
    new URL(
      request.url
    );

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
        error:
          "Unauthorized."
      },
      401
    );
  }

  try {
    const services =
      await getDenzServices(
        env
      );

    return json({
      success: true,

      message:
        "DenzGains connection is working.",

      service_count:
        Array.isArray(
          services
        )
          ? services.length
          : 0
    });

  } catch (error) {
    return json(
      {
        success: false,

        error:
          error.message ||
          String(error)
      },
      502
    );
  }
}

/* =========================================================
   HEALTH
========================================================= */

async function handleHealth() {
  return json({
    success: true,

    service:
      "HUPPY CUBE",

    status:
      "online",

    time:
      new Date().toISOString()
  });
}

/* =========================================================
   MAIN WORKER
========================================================= */

export default {
  async fetch(
    request,
    env,
    ctx
  ) {
    const url =
      new URL(
        request.url
      );

    const {
      pathname
    } = url;

    try {

      /* HEALTH */

      if (
        request.method ===
          "GET" &&
        pathname ===
          "/api/health"
      ) {
        return handleHealth();
      }

      /* SERVICES */

      if (
        request.method ===
          "GET" &&
        pathname ===
          "/api/services"
      ) {
        const services =
          await getDenzServices(
            env
          );

        const mapped =
          services.map(
            (service) => ({
              ...service,

              service_id:
                String(
                  service.service ||
                    service.service_id ||
                    service.id ||
                    ""
                ),

              name:
                service.name ||
                service.description ||
                `Service ${
                  service.service ||
                  service.id ||
                  ""
                }`,

              min_quantity:
                Number(
                  service.min ||
                    service.min_quantity ||
                    0
                ),

              max_quantity:
                Number(
                  service.max ||
                    service.max_quantity ||
                    0
                ),

              supplier_rate:
                Number(
                  service.rate ||
                    service.price ||
                    0
                ),

              customer_rate:
                customerPrice(
                  service.rate ||
                    service.price ||
                    0
                )
            })
          );

        return json(
          mapped
        );
      }

      /* CREATE PAYMENT / ORDER */

      if (
        request.method ===
          "POST" &&
        [
          "/api/order-payment",
          "/api/create-payment",
          "/api/create-order",
          "/api/order",
          "/api/pay"
        ].includes(
          pathname
        )
      ) {
        return await handleOrderPayment(
          request,
          env
        );
      }

      /* ORDER STATUS */

      if (
        request.method ===
          "GET" &&
        pathname ===
          "/api/order-status"
      ) {
        return await handleOrderStatus(
          request,
          env
        );
      }

      /* PAYMENT CALLBACK */

      if (
        pathname ===
          "/api/payment-callback"
      ) {
        return await handlePaymentCallback(
          request,
          env
        );
      }

      /* PESAPAL IPN */

      if (
        pathname ===
          "/api/pesapal-ipn"
      ) {
        return await handlePesapalIpn(
          request,
          env
        );
      }

      /* TEST ORDER */

      if (
        request.method ===
          "GET" &&
        pathname.startsWith(
          "/api/test-order/"
        )
      ) {
        const orderId =
          pathname
            .split("/")
            .pop();

        return await handleTestOrder(
          request,
          env,
          orderId
        );
      }

      /* DENZGAINS TEST */

      if (
        request.method ===
          "GET" &&
        pathname ===
          "/api/denz-test"
      ) {
        return await handleDenzTest(
          request,
          env
        );
      }

      /* FRONTEND */

      if (env.ASSETS) {
        return env.ASSETS.fetch(
          request
        );
      }

      return new Response(
        "HUPPY CUBE Worker is running.",
        {
          status: 200
        }
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
            error?.message ||
            String(error)
        },
        500
      );
    }
  }
};
