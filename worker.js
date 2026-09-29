const PESAPAL_BASE = "https://pay.pesapal.com/v3";
const DENZGAINS_BASE = "https://denzgains.com";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
  });
}

/* =========================================================
   HELPERS
========================================================= */

function makeTrackingId() {
  const part1 = Date.now()
    .toString(36)
    .toUpperCase();

  const part2 = crypto
    .randomUUID()
    .split("-")[0]
    .toUpperCase();

  return `HUPPY-${part1}-${part2}`;
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
  const rate = Number(supplierRate || 0);
  return rate * 2;
}

function safeJsonString(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/* =========================================================
   PESAPAL
========================================================= */

async function getPesapalToken(env) {
  if (
    !env.PESAPAL_CONSUMER_KEY ||
    !env.PESAPAL_CONSUMER_SECRET
  ) {
    throw new Error(
      "PesaPal consumer key or consumer secret is not configured."
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
      `PesaPal authentication returned invalid JSON: ${text.slice(
        0,
        1000
      )}`
    );
  }

  if (!response.ok || !data.token) {
    throw new Error(
      `PesaPal authentication failed: ${safeJsonString(data)}`
    );
  }

  return data.token;
}

async function createPesapalOrder(
  env,
  order,
  origin
) {
  if (!order) {
    throw new Error(
      "Order could not be loaded after database insert."
    );
  }

  if (!order.tracking_id) {
    throw new Error(
      "Order tracking ID was not created."
    );
  }

  console.log(
    `[PAYMENT] PesaPal SubmitOrderRequest started tracking_id=${order.tracking_id}`
  );

  const token = await getPesapalToken(env);

  if (!env.PESAPAL_IPN_ID) {
    throw new Error(
      "PESAPAL_IPN_ID is not configured."
    );
  }

  const payload = {
    id: order.tracking_id,

    currency: "KES",

    amount: Number(order.amount),

    description: `HUPPY CUBE - ${order.service_name}`.slice(
      0,
      100
    ),

    callback_url:
      `${origin}/api/payment-callback?tracking_id=` +
      encodeURIComponent(order.tracking_id),

    notification_id: env.PESAPAL_IPN_ID,

    billing_address: {
      email_address: "customer@huppycube.com",

      phone_number: normalizePhone(order.phone),

      country_code: "KE",

      first_name: String(
        order.full_name || "Customer"
      ).slice(0, 50),

      last_name: "Customer"
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

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `PesaPal order creation returned invalid JSON: ${text.slice(
        0,
        1000
      )}`
    );
  }

  if (!response.ok || !data.redirect_url) {
    throw new Error(
      `PesaPal order creation failed: ${safeJsonString(data)}`
    );
  }

  console.log(
    `[PAYMENT] PesaPal SubmitOrderRequest success tracking_id=${order.tracking_id} order_tracking_id=${data.order_tracking_id || ""}`
  );

  return data;
}

async function getPesapalStatus(
  env,
  orderTrackingId
) {
  if (!orderTrackingId) {
    throw new Error(
      "PesaPal transaction tracking ID is missing."
    );
  }

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

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `PesaPal status returned invalid JSON: ${text.slice(
        0,
        1000
      )}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `PesaPal status check failed: ${safeJsonString(data)}`
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

  const url =
    `${DENZGAINS_BASE}/api/v2?action=services&key=` +
    encodeURIComponent(env.DENZGAINS_API_KEY);

  const response = await fetch(url);

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `DenzGains returned invalid JSON: ${text.slice(
        0,
        1000
      )}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `DenzGains services failed: ${safeJsonString({
        status: response.status,
        response: data
      })}`
    );
  }

  if (data?.error) {
    throw new Error(
      `DenzGains services error: ${safeJsonString(data)}`
    );
  }

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data.services)) {
    return data.services;
  }

  throw new Error(
    `DenzGains returned an unexpected response: ${safeJsonString(
      data
    ).slice(0, 3000)}`
  );
}

/*
 * Send an order to DenzGains.
 *
 * FIXED: Now uses GET method with URL parameters
 * instead of POST with form data, matching the
 * DenzGains v2 API specification and the services
 * endpoint pattern.
 */
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

  if (!serviceId) {
    throw new Error(
      "DenzGains service ID is missing."
    );
  }

  if (!link) {
    throw new Error(
      "DenzGains target link is missing."
    );
  }

  if (!quantity || Number(quantity) <= 0) {
    throw new Error(
      "DenzGains quantity is invalid."
    );
  }

  console.log(
    `[SUPPLIER] DenzGains request started service_id=${serviceId} quantity=${quantity} link_domain=${(() => {
      try {
        return new URL(link).hostname;
      } catch {
        return "invalid";
      }
    })()}`
  );

  /*
   * DenzGains v2 API expects GET requests with
   * query parameters, similar to services endpoint.
   */
  const url =
    `${DENZGAINS_BASE}/api/v2?action=add&service=` +
    encodeURIComponent(String(serviceId)) +
    `&link=` +
    encodeURIComponent(String(link)) +
    `&quantity=` +
    encodeURIComponent(String(quantity)) +
    `&key=` +
    encodeURIComponent(env.DENZGAINS_API_KEY);

  const response = await fetch(url, {
    method: "GET",

    headers: {
      Accept: "application/json"
    }
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `DenzGains returned invalid JSON: ${text.slice(
        0,
        1500
      )}`
    );
  }

  console.log(
    `[SUPPLIER] DenzGains HTTP ${response.status} response_keys=${Object.keys(data || {}).join(",")}`
  );

  if (!response.ok) {
    throw new Error(
      `DenzGains order failed: ${safeJsonString({
        status: response.status,
        response: data
      })}`
    );
  }

  if (data?.error) {
    throw new Error(
      `DenzGains order error: ${safeJsonString(data)}`
    );
  }

  console.log(
    `[SUPPLIER] DenzGains response body: ${safeJsonString(data).slice(0, 500)}`
  );

  return data;
}

/* =========================================================
   DATABASE
========================================================= */

const REQUIRED_ORDER_COLUMNS = {
  tracking_id: "TEXT",
  service_id: "TEXT",
  service_name: "TEXT",
  quantity: "INTEGER",
  link: "TEXT",
  phone: "TEXT",
  full_name: "TEXT",
  amount: "REAL DEFAULT 0",
  payment_status: "TEXT DEFAULT 'PENDING'",
  order_status: "TEXT DEFAULT 'Pending'",
  pesapal_order_tracking_id: "TEXT",
  pesapal_merchant_reference: "TEXT",
  supplier_order_id: "TEXT",
  supplier_response: "TEXT",
  created_at: "TEXT DEFAULT CURRENT_TIMESTAMP",
  updated_at: "TEXT DEFAULT CURRENT_TIMESTAMP"
};

async function ensureOrdersTable(env) {
  if (!env.DB) {
    throw new Error(
      "D1 database binding DB is not configured."
    );
  }

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_id TEXT,
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

  const tableInfo = await env.DB
    .prepare(`PRAGMA table_info(orders)`)
    .all();

  const existingColumns = new Set(
    (tableInfo.results || []).map(
      column => column.name
    )
  );

  for (
    const [
      columnName,
      definition
    ] of Object.entries(
      REQUIRED_ORDER_COLUMNS
    )
  ) {
    if (!existingColumns.has(columnName)) {
      await env.DB
        .prepare(
          `ALTER TABLE orders ADD COLUMN ${columnName} ${definition}`
        )
        .run();
    }
  }

  const oldOrders = await env.DB
    .prepare(`
      SELECT id
      FROM orders
      WHERE tracking_id IS NULL
         OR tracking_id = ''
    `)
    .all();

  for (
    const oldOrder of oldOrders.results || []
  ) {
    const trackingId = makeTrackingId();

    await env.DB
      .prepare(`
        UPDATE orders
        SET tracking_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(
        trackingId,
        oldOrder.id
      )
      .run();
  }

  await env.DB
    .prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS
      idx_orders_tracking_id
      ON orders(tracking_id)
    `)
    .run();
}

async function getOrderByTrackingId(
  env,
  trackingId
) {
  await ensureOrdersTable(env);

  return await env.DB
    .prepare(`
      SELECT *
      FROM orders
      WHERE tracking_id = ?
      LIMIT 1
    `)
    .bind(trackingId)
    .first();
}

async function getOrderById(
  env,
  id
) {
  await ensureOrdersTable(env);

  return await env.DB
    .prepare(`
      SELECT *
      FROM orders
      WHERE id = ?
      LIMIT 1
    `)
    .bind(id)
    .first();
}

async function updateOrder(
  env,
  id,
  fields
) {
  const allowedFields = new Set(
    Object.keys(
      REQUIRED_ORDER_COLUMNS
    )
  );

  const entries = Object.entries(
    fields
  ).filter(
    ([key]) =>
      allowedFields.has(key)
  );

  if (!entries.length) {
    return;
  }

  const setParts = entries.map(
    ([key]) => `${key} = ?`
  );

  const values = entries.map(
    ([, value]) => value
  );

  setParts.push(
    "updated_at = CURRENT_TIMESTAMP"
  );

  await env.DB
    .prepare(`
      UPDATE orders
      SET ${setParts.join(", ")}
      WHERE id = ?
    `)
    .bind(
      ...values,
      id
    )
    .run();

  console.log(
    `[DATABASE] order updated id=${id} fields=${Object.keys(fields).join(",")}`
  );
}

/* =========================================================
   TRACKING
========================================================= */

function trackingInfo(order) {
  const status = String(
    order?.order_status ||
      "Pending"
  ).toLowerCase();

  let currentStep = 1;
  let progress = 25;

  if (
    status.includes("submitting")
  ) {
    currentStep = 2;
    progress = 50;
  } else if (
    status.includes("processing")
  ) {
    currentStep = 3;
    progress = 75;
  } else if (
    status.includes("completed")
  ) {
    currentStep = 4;
    progress = 100;
  } else if (
    status.includes("supplier error")
  ) {
    currentStep = 2;
    progress = 50;
  }

  return {
    current_step: currentStep,
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

  console.log(
    `[SUPPLIER] processPaidOrder started tracking_id=${order.tracking_id} supplier_order_id=${order.supplier_order_id || "null"}`
  );

  /*
   * NEVER submit twice if DenzGains already gave
   * us an order ID.
   */
  if (order.supplier_order_id) {
    console.log(
      `[SUPPLIER] order already submitted supplier_order_id=${order.supplier_order_id}`
    );
    return {
      success: true,
      already_submitted: true,
      supplier_order_id:
        order.supplier_order_id
    };
  }

  if (
    !order.pesapal_order_tracking_id
  ) {
    throw new Error(
      "PesaPal transaction tracking ID is missing."
    );
  }

  console.log(
    `[PESAPAL] status check started tracking_id=${order.tracking_id} pesapal_order_tracking_id=${order.pesapal_order_tracking_id}`
  );

  /*
   * Check payment directly with PesaPal.
   */
  const payment =
    await getPesapalStatus(
      env,
      order.pesapal_order_tracking_id
    );

  console.log(
    `[PESAPAL] status response tracking_id=${order.tracking_id} raw_response=${safeJsonString(payment).slice(0, 500)}`
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

  console.log(
    `[PESAPAL] status parsed tracking_id=${order.tracking_id} status=${paymentStatus} is_completed=${isCompleted}`
  );

  /*
   * Payment is not confirmed yet.
   */
  if (!isCompleted) {
    console.log(
      `[PESAPAL] payment not completed tracking_id=${order.tracking_id} status=${paymentStatus}`
    );

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

  /*
   * Payment is confirmed.
   */
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

  console.log(
    `[SUPPLIER] submission attempt tracking_id=${order.tracking_id} service_id=${order.service_id} quantity=${order.quantity}`
  );

  /*
   * Submit to DenzGains.
   */
  try {
    const supplierResult =
      await sendOrderToDenzGains(
        env,
        order.service_id,
        order.link,
        order.quantity
      );

    console.log(
      `[SUPPLIER] DenzGains response success tracking_id=${order.tracking_id} response_keys=${Object.keys(supplierResult || {}).join(",")}`
    );

    /*
     * Different SMM APIs can return the ID
     * under different property names.
     */
    const supplierOrderId =
      supplierResult?.order ||
      supplierResult?.order_id ||
      supplierResult?.id ||
      supplierResult?.orderId ||
      null;

    console.log(
      `[SUPPLIER] order ID extraction tracking_id=${order.tracking_id} extracted_id=${supplierOrderId || "null"} looked_in=${["order", "order_id", "id", "orderId"].join(",")}`
    );

    if (!supplierOrderId) {
      console.error(
        `[SUPPLIER] no order ID found tracking_id=${order.tracking_id} denzgains_response=${safeJsonString(supplierResult).slice(0, 1000)}`
      );

      await updateOrder(
        env,
        order.id,
        {
          order_status:
            "Supplier Error",

          supplier_response:
            safeJsonString(
              supplierResult
            )
        }
      );

      throw new Error(
        `DenzGains did not return an order ID: ${safeJsonString(
          supplierResult
        )}`
      );
    }

    console.log(
      `[SUPPLIER] order ID saved tracking_id=${order.tracking_id} supplier_order_id=${supplierOrderId}`
    );

    /*
     * SUCCESS:
     * save the supplier order ID immediately.
     */
    await updateOrder(
      env,
      order.id,
      {
        supplier_order_id:
          String(
            supplierOrderId
          ),

        supplier_response:
          safeJsonString(
            supplierResult
          ),

        order_status:
          "Processing"
      }
    );

    console.log(
      `[SUPPLIER] database updated tracking_id=${order.tracking_id} order_status=Processing supplier_order_id=${supplierOrderId}`
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

  } catch (error) {
    console.error(
      `[SUPPLIER] DenzGains error tracking_id=${order.tracking_id} error=${error?.message || String(error)}`
    );

    /*
     * IMPORTANT:
     * Save the actual DenzGains error in D1.
     */
    await updateOrder(
      env,
      order.id,
      {
        order_status:
          "Supplier Error",

        supplier_response:
          safeJsonString({
            error:
              error?.message ||
              String(error),

            time:
              new Date().toISOString()
          })
      }
    );

    throw error;
  }
}

/* =========================================================
   CREATE PAYMENT
========================================================= */

async function handleOrderPayment(
  request,
  env
) {
  await ensureOrdersTable(env);

  const body =
    await request.json();

  const serviceId =
    String(
      body.service_id ||
        ""
    ).trim();

  const serviceName =
    String(
      body.service_name ||
        ""
    ).trim();

  const quantity =
    Number(
      body.quantity ||
        0
    );

  const link =
    String(
      body.link ||
        ""
    ).trim();

  const phone =
    String(
      body.phone ||
        ""
    ).trim();

  const fullName =
    String(
      body.full_name ||
        body.fullName ||
        "Customer"
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

  const services =
    await getDenzServices(env);

  const service =
    services.find(
      item =>
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

  const finalServiceName =
    serviceName ||
    service.name ||
    service.description ||
    `Service ${serviceId}`;

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
        finalServiceName,
        quantity,
        link,
        phone,
        fullName,
        amount,
        "PENDING",
        "Pending"
      )
      .run();

  const orderId =
    insert?.meta?.last_row_id;

  if (
    orderId === undefined ||
    orderId === null
  ) {
    throw new Error(
      "The order was inserted, but D1 did not return its row ID."
    );
  }

  console.log(
    `[ORDER] created tracking_id=${trackingId} order_id=${orderId} service_id=${serviceId} quantity=${quantity} amount=${amount}`
  );

  /*
   * Do not perform a second immediate database read.
   */
  const order = {
    id: orderId,
    tracking_id: trackingId,
    service_id: serviceId,
    service_name: finalServiceName,
    quantity: quantity,
    link: link,
    phone: phone,
    full_name: fullName,
    amount: amount,
    payment_status: "PENDING",
    order_status: "Pending"
  };

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

    amount:
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
  env,
  ctx
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
        error:
          "Tracking ID is required."
      },
      400
    );
  }

  let order =
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

  /*
   * SAFETY NET:
   *
   * If payment is completed but DenzGains
   * submission did not happen, try again.
   *
   * We only do this when there is no supplier
   * order ID, so an already-submitted order
   * cannot be duplicated.
   */
  if (
    order.payment_status ===
      "COMPLETED" &&
    !order.supplier_order_id &&
    order.pesapal_order_tracking_id
  ) {
    try {
      console.log(
        `[ORDER_STATUS] retry attempt tracking_id=${trackingId}`
      );
      await processPaidOrder(
        env,
        order
      );

      order =
        await getOrderByTrackingId(
          env,
          trackingId
        );
    } catch (error) {
      console.error(
        `[ORDER_STATUS] retry failed tracking_id=${trackingId} error=${error?.message || String(error)}`
      );

      order =
        await getOrderByTrackingId(
          env,
          trackingId
        );
    }
  }

  return json({
    success: true,

    order: order,

    tracking:
      trackingInfo(order),

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
    new URL(request.url);

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

  console.log(
    `[CALLBACK] received tracking_id=${trackingId || "null"} merchant_reference=${merchantReference || "null"} pesapal_order_tracking_id=${orderTrackingId || "null"}`
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

  if (!order) {
    console.error(
      `[CALLBACK] order not found tracking_id=${trackingId || "null"} merchant_reference=${merchantReference || "null"}`
    );
  } else {
    console.log(
      `[CALLBACK] order found order_id=${order.id} tracking_id=${order.tracking_id}`
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

    console.log(
      `[CALLBACK] pesapal_order_tracking_id updated order_id=${order.id}`
    );
  }

  /*
   * Process payment and submit to DenzGains.
   */
  if (order) {
    try {
      console.log(
        `[CALLBACK] calling processPaidOrder order_id=${order.id} tracking_id=${order.tracking_id}`
      );
      const result =
        await processPaidOrder(
          env,
          order
        );

      console.log(
        `[CALLBACK] processPaidOrder completed tracking_id=${order.tracking_id} success=${result.success} paid=${result.paid} supplier_order_id=${result.supplier_order_id || "null"}`
      );
    } catch (error) {
      /*
       * The error is already saved in D1.
       *
       * We don't expose internal details
       * to the customer.
       */
      console.error(
        `[CALLBACK] processPaidOrder failed tracking_id=${order.tracking_id} error=${error?.message || String(error)}`
      );
    }
  }

  const finalTrackingId =
    order?.tracking_id ||
    trackingId ||
    merchantReference ||
    "";

  console.log(
    `[CALLBACK] redirecting to_tracking_id=${finalTrackingId}`
  );

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
    new URL(request.url);

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

  console.log(
    `[IPN] received merchant_reference=${merchantReference || "null"} pesapal_order_tracking_id=${orderTrackingId || "null"}`
  );

  if (!merchantReference) {
    console.error(
      `[IPN] no merchant_reference in request`
    );
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
    console.error(
      `[IPN] order not found merchant_reference=${merchantReference}`
    );
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

  console.log(
    `[IPN] order found order_id=${order.id} tracking_id=${order.tracking_id}`
  );

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

    console.log(
      `[IPN] pesapal_order_tracking_id updated order_id=${order.id}`
    );
  }

  try {
    console.log(
      `[IPN] calling processPaidOrder order_id=${order.id} tracking_id=${order.tracking_id}`
    );
    const result =
      await processPaidOrder(
        env,
        order
      );

    console.log(
      `[IPN] processPaidOrder completed tracking_id=${order.tracking_id} success=${result.success} paid=${result.paid} supplier_order_id=${result.supplier_order_id || "null"}`
    );
  } catch (error) {
    console.error(
      `[IPN] processPaidOrder failed tracking_id=${order.tracking_id} error=${error?.message || String(error)}`
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
   TEST ORDER
========================================================= */

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
      success:
        true,

      message:
        "This order has already been submitted to DenzGains.",

      order:
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
      success:
        true,

      result:
        result,

      order:
        updated
    });
  } catch (error) {
    const updated =
      await getOrderById(
        env,
        order.id
      );

    return json(
      {
        success:
          false,

        error:
          error?.message ||
          String(error),

        order_id:
          order.id,

        tracking_id:
          order.tracking_id,

        order_status:
          updated?.order_status ||
          "Supplier Error",

        supplier_response:
          updated?.supplier_response ||
          null
      },
      500
    );
  }
}

/* =========================================================
   DENZGAINS TEST
========================================================= */

async function handleDenzTest(
  request,
  env
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
      success:
        true,

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
        success:
          false,

        error:
          error?.message ||
          String(error)
      },
      502
    );
  }
}

/* =========================================================
   DATABASE TEST
========================================================= */

async function handleDatabaseTest(
  request,
  env
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
        error:
          "Unauthorized."
      },
      401
    );
  }

  try {
    await ensureOrdersTable(
      env
    );

    const tableInfo =
      await env.DB
        .prepare(
          `PRAGMA table_info(orders)`
        )
        .all();

    return json({
      success:
        true,

      message:
        "Orders database is ready.",

      columns:
        tableInfo.results ||
        []
    });
  } catch (error) {
    return json(
      {
        success:
          false,

        error:
          error?.message ||
          String(error)
      },
      500
    );
  }
}

/* =========================================================
   HEALTH
========================================================= */

async function handleHealth() {
  return json({
    success:
      true,

    service:
      "HUPPY CUBE",

    status:
      "online",

    time:
      new Date().toISOString()
  });
}
/* =========================================================
   TEMPORARY DENZGAINS DIAGNOSTIC
   REMOVE AFTER TESTING
========================================================= */

async function handleDenzDiagnosticPage(request, env) {
  const html = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>DenzGains Diagnostic</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #111827;
      color: white;
      padding: 20px;
      max-width: 700px;
      margin: auto;
    }

    h1 {
      font-size: 24px;
    }

    .warning {
      background: #3f1d1d;
      border: 1px solid #ef4444;
      padding: 14px;
      border-radius: 10px;
      margin-bottom: 20px;
    }

    label {
      display: block;
      margin-top: 15px;
      margin-bottom: 6px;
      font-weight: bold;
    }

    input {
      width: 100%;
      box-sizing: border-box;
      padding: 13px;
      border-radius: 8px;
      border: 1px solid #374151;
      background: #1f2937;
      color: white;
      font-size: 16px;
    }

    button {
      margin-top: 20px;
      width: 100%;
      padding: 14px;
      border: 0;
      border-radius: 8px;
      background: #22c55e;
      color: white;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
    }

    button:disabled {
      opacity: .6;
    }

    pre {
      white-space: pre-wrap;
      word-break: break-word;
      background: #000;
      padding: 15px;
      border-radius: 8px;
      margin-top: 20px;
    }
  </style>
</head>

<body>

<h1>DenzGains API Diagnostic</h1>

<div class="warning">
  <strong>Important:</strong>
  This sends a real test order to DenzGains.
  Use the smallest quantity allowed.
</div>

<form id="testForm">

  <label>Test Secret</label>
  <input
    id="secret"
    type="password"
    required
    autocomplete="off"
    placeholder="Enter TEST_ORDER_SECRET"
  >

  <label>DenzGains Service ID</label>
  <input
    id="service"
    type="number"
    value="1"
    min="1"
    required
  >

  <label>Target Link</label>
  <input
    id="link"
    type="url"
    placeholder="https://example.com/..."
    required
  >

  <label>Quantity</label>
  <input
    id="quantity"
    type="number"
    value="10"
    min="1"
    required
  >

  <button id="submitButton" type="submit">
    Send Test Order
  </button>

</form>

<h2>DenzGains Response</h2>

<pre id="result">No test submitted yet.</pre>

<script>
const form = document.getElementById("testForm");
const result = document.getElementById("result");
const button = document.getElementById("submitButton");

form.addEventListener("submit", async function(event) {
  event.preventDefault();

  button.disabled = true;
  button.textContent = "Sending...";
  result.textContent = "Sending request to DenzGains...";

  try {
    const response = await fetch("/api/denz-diagnostic", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        secret: document.getElementById("secret").value,
        service: document.getElementById("service").value,
        link: document.getElementById("link").value,
        quantity: document.getElementById("quantity").value
      })
    });

    const text = await response.text();

    try {
      result.textContent = JSON.stringify(
        JSON.parse(text),
        null,
        2
      );
    } catch {
      result.textContent = text;
    }

  } catch (error) {
    result.textContent =
      "Browser error: " +
      (error?.message || String(error));
  } finally {
    button.disabled = false;
    button.textContent = "Send Test Order";
  }
});
</script>

</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}


async function handleDenzDiagnostic(request, env) {
  if (!env.TEST_ORDER_SECRET) {
    return json({
      success: false,
      error: "TEST_ORDER_SECRET is not configured."
    }, 500);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({
      success: false,
      error: "Invalid JSON request."
    }, 400);
  }

  if (
    !body.secret ||
    body.secret !== env.TEST_ORDER_SECRET
  ) {
    return json({
      success: false,
      error: "Unauthorized."
    }, 401);
  }

  const service = String(body.service || "").trim();
  const link = String(body.link || "").trim();
  const quantity = Number(body.quantity || 0);

  if (!service) {
    return json({
      success: false,
      error: "Service ID is required."
    }, 400);
  }

  if (!link) {
    return json({
      success: false,
      error: "Target link is required."
    }, 400);
  }

  if (!quantity || quantity <= 0) {
    return json({
      success: false,
      error: "Quantity must be greater than zero."
    }, 400);
  }

  try {
    if (!env.DENZGAINS_API_KEY) {
      return json({
        success: false,
        error: "DENZGAINS_API_KEY is not configured."
      }, 500);
    }

    const url =
      `${DENZGAINS_BASE}/api/v2?action=add` +
      `&service=${encodeURIComponent(service)}` +
      `&link=${encodeURIComponent(link)}` +
      `&quantity=${encodeURIComponent(String(quantity))}` +
      `&key=${encodeURIComponent(env.DENZGAINS_API_KEY)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    const responseText = await response.text();

    let parsedResponse;

    try {
      parsedResponse = JSON.parse(responseText);
    } catch {
      parsedResponse = null;
    }

    return json({
      success: true,
      request: {
        endpoint: `${DENZGAINS_BASE}/api/v2`,
        method: "GET",
        action: "add",
        service: service,
        link: link,
        quantity: quantity
      },
      denzgains: {
        http_status: response.status,
        http_ok: response.ok,
        content_type: response.headers.get("content-type"),
        parsed_json: parsedResponse,
        raw_response: responseText
      }
    });

  } catch (error) {
    return json({
      success: false,
      error: error?.message || String(error)
    }, 502);
  }
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
      new URL(request.url);

    const {
      pathname
    } = url;

    /*
     * CORS preflight
     */
    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status:
            204,

          headers:
            JSON_HEADERS
        }
      );
    }

    try {
      /*
       * HEALTH
       */
      if (
        request.method ===
          "GET" &&
        pathname ===
          "/api/health"
      ) {
        return handleHealth();
      }

      /*
       * SERVICES
       */
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
            service => ({
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

        return json(mapped);
      }

      /*
       * CREATE PAYMENT
       */
      if (
        request.method ===
          "POST" &&
        (
          pathname ===
            "/api/order-payment" ||
          pathname ===
            "/api/create-payment" ||
          pathname ===
            "/api/create-order" ||
          pathname ===
            "/api/order" ||
          pathname ===
            "/api/pay"
        )
      ) {
        return await handleOrderPayment(
          request,
          env
        );
      }

      /*
       * ORDER STATUS
       */
      if (
        request.method ===
          "GET" &&
        pathname ===
          "/api/order-status"
      ) {
        return await handleOrderStatus(
          request,
          env,
          ctx
        );
      }

      /*
       * PAYMENT CALLBACK
       */
      if (
        pathname ===
          "/api/payment-callback"
      ) {
        return await handlePaymentCallback(
          request,
          env
        );
      }

      /*
       * PESAPAL IPN
       */
      if (
        pathname ===
          "/api/pesapal-ipn"
      ) {
        return await handlePesapalIpn(
          request,
          env
        );
      }

      /*
       * TEST ORDER
       */
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

      /*
       * DENZGAINS TEST
       */
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

      /*
       * DATABASE TEST
       */if (
  request.method === "GET" &&
  pathname === "/api/denz-diagnostic"
) {
  return await handleDenzDiagnosticPage(request, env);
}

if (
  request.method === "POST" &&
  pathname === "/api/denz-diagnostic"
) {
  return await handleDenzDiagnostic(request, env);
}
      if (
        request.method ===
          "GET" &&
        pathname === export default {
  async fetch(request, env, ctx) {

    // other routes above...

    if (request.method === "GET" && pathname === "/api/denz-test") {
      return await handleDenzTest(request, env);
    }

    if (
      request.method === "GET" &&
      pathname === "/api/denz-diagnostic"
    ) {
      return await handleDenzDiagnosticPage(request, env);
    }

    if (
      request.method === "POST" &&
      pathname === "/api/denz-diagnostic"
    ) {
      return await handleDenzDiagnostic(request, env);
    }

    if (
      request.method === "GET" &&
      pathname === "/api/database-test"
    ) {
      return await handleDatabaseTest(request, env);
    }

    // other routes below...
  return await handleDenzTest(request, env);
}

if (
  request.method === "GET" &&
  pathname === "/api/denz-diagnostic"
) {
  return await handleDenzDiagnosticPage(request, env);
}

if (
  request.method === "POST" &&
  pathname === "/api/denz-diagnostic"
) {
  return await handleDenzDiagnostic(request, env);
}

if (
  request.method === "GET" &&
  pathname === "/api/database-test"
) {
  return await handleDatabaseTest(request, env);
}
  return await handleDenzTest(request, env);
}

if (
  request.method === "GET" &&
  pathname === "/api/denz-diagnostic"
) {
  return await handleDenzDiagnosticPage(request, env);
}

if (
  request.method === "POST" &&
  pathname === "/api/denz-diagnostic"
) {
  return await handleDenzDiagnostic(request, env);
}

if (
  request.method === "GET" &&
  pathname === "/api/database-test"
) {
  return await handleDatabaseTest(request, env);
          }
  return await handleDenzTest(request, env);
}

if (
  request.method === "GET" &&
  pathname === "/api/denz-diagnostic"
) {
  return await handleDenzDiagnosticPage(request, env);
}

if (
  request.method === "POST" &&
  pathname === "/api/denz-diagnostic"
) {
  return await handleDenzDiagnostic(request, env);
}

if (
  request.method === "GET" &&
  pathname === "/api/database-test"
) {
  return await handleDatabaseTest(request, env);
}
  return await handleDenzTest(request, env);
}

if (
  request.method === "GET" &&
  pathname === "/api/denz-diagnostic"
) {
  return await handleDenzDiagnosticPage(request, env);
}

if (
  request.method === "POST" &&
  pathname === "/api/denz-diagnostic"
) {
  return await handleDenzDiagnostic(request, env);
}

if (
  request.method === "GET" &&
  pathname === "/api/database-test"
) {
  return await handleDatabaseTest(request, env);
}
  return await handleDenzTest(request, env);
}

/* DenzGains Diagnostic */
if (
  request.method === "GET" &&
  pathname === "/api/denz-diagnostic"
) {
  return await handleDenzDiagnosticPage(request, env);
}

if (
  request.method === "POST" &&
  pathname === "/api/denz-diagnostic"
) {
  return await handleDenzDiagnostic(request, env);
}

/* Database Test */
if (
  request.method === "GET" &&
  pathname === "/api/database-test"
) {
  return await handleDatabaseTest(request, env);
}
  return await handleDenzTest(request, env);
}

/* DenzGains Diagnostic */
if (
  request.method === "GET" &&
  pathname === "/api/denz-diagnostic"
) {
  return await handleDenzDiagnosticPage(request, env);
}

if (
  request.method === "POST" &&
  pathname === "/api/denz-diagnostic"
) {
  return await handleDenzDiagnostic(request, env);
}

/* Database Test */
if (
  request.method === "GET" &&
  pathname === "/api/database-test"
) {
  return await handleDatabaseTest(request, env);
    }
          "/api/database-test"
      ) {
        return await handleDatabaseTest(
          request,
          env
        );
      }

      /*
       * FRONTEND
       */
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
          success:
            false,

          error:
            error?.message ||
            String(error)
        },
        500
      );
    }
  }
};
