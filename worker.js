const PESAPAL_BASE = "https://pay.pesapal.com/v3";
const DENZGAINS_BASE = "https://denzgains.com";
const SMM_AFRICA_BASE = "https://smm.africa/api/v3";

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
  const part1 = Date.now().toString(36).toUpperCase();
  const part2 = crypto.randomUUID().split("-")[0].toUpperCase();

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
  return Number(supplierRate || 0) * 2;
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

async function createPesapalOrder(env, order, origin) {
  if (!order) {
    throw new Error("Order could not be loaded after database insert.");
  }

  if (!order.tracking_id) {
    throw new Error("Order tracking ID was not created.");
  }

  const token = await getPesapalToken(env);

  if (!env.PESAPAL_IPN_ID) {
    throw new Error("PESAPAL_IPN_ID is not configured.");
  }

  const payload = {
    id: order.tracking_id,
    currency: "KES",
    amount: Number(order.amount),

    description:
      `HUPPY CUBE - ${order.service_name}`.slice(0, 100),

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

  return data;
}

async function getPesapalStatus(env, orderTrackingId) {
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

  const url =
    `${DENZGAINS_BASE}/api/v2?action=add` +
    `&service=${encodeURIComponent(String(serviceId))}` +
    `&link=${encodeURIComponent(String(link))}` +
    `&quantity=${encodeURIComponent(String(quantity))}` +
    `&key=${encodeURIComponent(env.DENZGAINS_API_KEY)}`;

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

  return data;
}

/* =========================================================
   SMM AFRICA
   TEMPORARY CONNECTION TEST
========================================================= */

async function getSmmAfricaServices(env) {
  if (!env.SMM_AFRICA_KEY) {
    throw new Error(
      "SMM_AFRICA_KEY is not configured."
    );
  }

  const response = await fetch(
    SMM_AFRICA_BASE,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        key: env.SMM_AFRICA_KEY,
        action: "services"
      })
    }
  );

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `SMM Africa returned invalid JSON: ${text.slice(
        0,
        2000
      )}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `SMM Africa services request failed: ${safeJsonString({
        status: response.status,
        response: data
      })}`
    );
  }

  if (data?.error) {
    throw new Error(
      `SMM Africa API error: ${safeJsonString(data)}`
    );
  }

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data.services)) {
    return data.services;
  }

  throw new Error(
    `SMM Africa returned an unexpected response: ${safeJsonString(
      data
    ).slice(0, 5000)}`
  );
}

async function handleSmmTest(request, env) {
  const url = new URL(request.url);

  const secret = url.searchParams.get("secret");

  if (
    !env.TEST_ORDER_SECRET ||
    secret !== env.TEST_ORDER_SECRET
  ) {
    return json({
      success: false,
      error: "Unauthorized."
    }, 401);
  }

  try {
    const services =
      await getSmmAfricaServices(env);

    return json({
      success: true,
      provider: "SMM Africa",
      action: "services",
      service_count: Array.isArray(services)
        ? services.length
        : 0,
      services
    });

  } catch (error) {
    return json({
      success: false,
      error:
        error?.message ||
        String(error)
    }, 502);
  }
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
    const [columnName, definition] of Object.entries(
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

  for (const oldOrder of oldOrders.results || []) {
    await env.DB
      .prepare(`
        UPDATE orders
        SET tracking_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(
        makeTrackingId(),
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

async function getOrderByTrackingId(env, trackingId) {
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

async function getOrderById(env, id) {
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

async function updateOrder(env, id, fields) {
  const allowedFields = new Set(
    Object.keys(REQUIRED_ORDER_COLUMNS)
  );

  const entries = Object.entries(fields).filter(
    ([key]) => allowedFields.has(key)
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
    .bind(...values, id)
    .run();
}

/* =========================================================
   TRACKING
========================================================= */

function trackingInfo(order) {
  const status = String(
    order?.order_status || "Pending"
  ).toLowerCase();

  let currentStep = 1;
  let progress = 25;

  if (status.includes("submitting")) {
    currentStep = 2;
    progress = 50;
  } else if (status.includes("processing")) {
    currentStep = 3;
    progress = 75;
  } else if (status.includes("completed")) {
    currentStep = 4;
    progress = 100;
  } else if (status.includes("supplier error")) {
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

async function processPaidOrder(env, order) {
  if (!order) {
    throw new Error("Order not found.");
  }

  if (order.supplier_order_id) {
    return {
      success: true,
      already_submitted: true,
      supplier_order_id: order.supplier_order_id
    };
  }

  if (!order.pesapal_order_tracking_id) {
    throw new Error(
      "PesaPal transaction tracking ID is missing."
    );
  }

  const payment = await getPesapalStatus(
    env,
    order.pesapal_order_tracking_id
  );

  const paymentStatus = String(
    payment?.payment_status_description ||
      payment?.status_code ||
      payment?.status ||
      ""
  ).toUpperCase();

  const isCompleted =
    paymentStatus.includes("COMPLETED") ||
    paymentStatus.includes("PAID") ||
    Number(payment?.status_code) === 1;

  if (!isCompleted) {
    await updateOrder(env, order.id, {
      payment_status:
        paymentStatus || "PENDING",
      order_status:
        "Payment Pending"
    });

    return {
      success: false,
      paid: false,
      payment
    };
  }

  await updateOrder(env, order.id, {
    payment_status: "COMPLETED",
    order_status: "Submitting"
  });

  try {
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
      supplierResult?.orderId ||
      null;

    if (!supplierOrderId) {
      await updateOrder(env, order.id, {
        order_status: "Supplier Error",
        supplier_response:
          safeJsonString(supplierResult)
      });

      throw new Error(
        `DenzGains did not return an order ID: ${safeJsonString(
          supplierResult
        )}`
      );
    }

    await updateOrder(env, order.id, {
      supplier_order_id:
        String(supplierOrderId),

      supplier_response:
        safeJsonString(supplierResult),

      order_status:
        "Processing"
    });

    return {
      success: true,
      paid: true,
      supplier_order_id:
        String(supplierOrderId),
      supplier_response:
        supplierResult
    };
  } catch (error) {
    await updateOrder(env, order.id, {
      order_status: "Supplier Error",
      supplier_response:
        safeJsonString({
          error:
            error?.message ||
            String(error),
          time:
            new Date().toISOString()
        })
    });

    throw error;
  }
}

/* =========================================================
   CREATE PAYMENT
========================================================= */

async function handleOrderPayment(request, env) {
  await ensureOrdersTable(env);

  const body = await request.json();

  const serviceId =
    String(body.service_id || "").trim();

  const serviceName =
    String(body.service_name || "").trim();

  const quantity =
    Number(body.quantity || 0);

  const link =
    String(body.link || "").trim();

  const phone =
    String(body.phone || "").trim();

  const fullName =
    String(
      body.full_name ||
        body.fullName ||
        "Customer"
    ).trim();

  if (!serviceId) {
    return json({
      error: "Service ID is required."
    }, 400);
  }

  if (!quantity || quantity <= 0) {
    return json({
      error: "Valid quantity is required."
    }, 400);
  }

  if (!link) {
    return json({
      error: "Target link is required."
    }, 400);
  }

  if (!phone) {
    return json({
      error: "Phone number is required."
    }, 400);
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
    return json({
      error:
        "Selected service was not found."
    }, 404);
  }

  const supplierRate =
    Number(
      service.rate ||
        service.price ||
        0
    );

  if (!supplierRate) {
    return json({
      error:
        "Supplier price is unavailable for this service."
    }, 400);
  }

  const amount =
    (
      customerPrice(supplierRate) *
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
     
