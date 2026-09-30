const PESAPAL_BASE = "https://pay.pesapal.com/v3";
const DENZGAINS_BASE = "https://denzgains.com/api/v2";

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

  if (value.startsWith("+")) {
    value = value.slice(1);
  }

  if (value.startsWith("00")) {
    value = value.slice(2);
  }

  if (value.startsWith("0")) {
    value = "254" + value.slice(1);
  }

  return value;
}

function safeJsonString(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/* =========================================================
   HUPPY CUBE PRICING

   DenzGains rate = KES per 1,000
   HUPPY CUBE customer rate = supplier rate × 2
========================================================= */

function customerPrice(supplierRate) {
  return Number(supplierRate || 0) * 2;
}

function calculateOrderAmount(ratePer1000, quantity) {
  return (
    Number(ratePer1000 || 0) *
    Number(quantity || 0)
  ) / 1000;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatKES(amount) {
  return `KSh ${Number(amount || 0).toFixed(2)}`;
}

/* =========================================================
   CURRENCY
========================================================= */

function getCurrencyFromPhone() {
  return {
    country: "KE",
    currency: "KES",
    symbol: "KSh"
  };
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
      `PesaPal authentication returned invalid JSON: ${text.slice(0, 1000)}`
    );
  }

  if (!response.ok || !data.token) {
    throw new Error(
      `PesaPal authentication failed: ${safeJsonString(data)}`
    );
  }

  return data.token;
}

/* =========================================================
   CREATE PESAPAL ORDER
========================================================= */

async function createPesapalOrder(env, order, origin) {
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

  const token = await getPesapalToken(env);

  if (!env.PESAPAL_IPN_ID) {
    throw new Error(
      "PESAPAL_IPN_ID is not configured."
    );
  }

  const currency = "KES";
  const amount = roundMoney(order.amount);

  const payload = {
    id: order.tracking_id,

    currency,

    amount,

    description:
      `HUPPY CUBE - ${order.service_name}`.slice(0, 100),

    callback_url:
      `${origin}/api/payment-callback?tracking_id=` +
      encodeURIComponent(order.tracking_id),

    notification_id:
      env.PESAPAL_IPN_ID,

    billing_address: {
      email_address:
        order.email || "customer@huppycube.com",

      phone_number:
        normalizePhone(order.phone),

      country_code:
        "KE",

      first_name:
        String(order.full_name || "Customer").slice(0, 50),

      last_name:
        "Customer"
    }
  };

  console.log(
    "Sending order to PesaPal:",
    safeJsonString(payload)
  );

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
      `PesaPal order creation returned invalid JSON: ${text.slice(0, 1000)}`
    );
  }

  console.log(
    "PesaPal SubmitOrderRequest response:",
    safeJsonString(data)
  );

  if (!response.ok) {
    throw new Error(
      `PesaPal order creation failed (${response.status}): ${safeJsonString(data)}`
    );
  }

  if (!data.redirect_url) {
    throw new Error(
      `PesaPal did not return redirect_url: ${safeJsonString(data)}`
    );
  }

  /*
    PesaPal API 3.0 normally returns:

    order_tracking_id
    merchant_reference
    redirect_url

    We REQUIRE order_tracking_id because it is needed
    later to check payment status.
  */

  const pesapalTrackingId =
    data.order_tracking_id ||
    data.orderTrackingId ||
    data.OrderTrackingId ||
    null;

  if (!pesapalTrackingId) {
    throw new Error(
      `PesaPal created the payment request but did not return order_tracking_id: ${safeJsonString(data)}`
    );
  }

  return {
    ...data,

    order_tracking_id:
      pesapalTrackingId,

    merchant_reference:
      data.merchant_reference ||
      data.merchantReference ||
      data.OrderMerchantReference ||
      order.tracking_id
  };
}

/* =========================================================
   GET PESAPAL PAYMENT STATUS
========================================================= */

async function getPesapalStatus(env, orderTrackingId) {
  if (!orderTrackingId) {
    throw new Error(
      "PesaPal transaction tracking ID is missing."
    );
  }

  const token = await getPesapalToken(env);

  const response = await fetch(
    `${PESAPAL_BASE}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
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
      `PesaPal status returned invalid JSON: ${text.slice(0, 1000)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `PesaPal status check failed: ${safeJsonString(data)}`
    );
  }

  console.log(
    "PesaPal payment status:",
    safeJsonString(data)
  );

  return data;
}

/* =========================================================
   DENZGAINS
========================================================= */

async function denzGainsRequest(env, payload) {
  if (!env.DENZGAINS_API_KEY) {
    throw new Error(
      "DENZGAINS_API_KEY is not configured."
    );
  }

  const params = new URLSearchParams();

  params.set(
    "key",
    String(env.DENZGAINS_API_KEY)
  );

  for (
    const [key, value] of Object.entries(payload || {})
  ) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      params.set(
        key,
        String(value)
      );
    }
  }

  const url =
    `${DENZGAINS_BASE}?${params.toString()}`;

  console.log(
    "DenzGains request:",
    url.replace(
      String(env.DENZGAINS_API_KEY),
      "***HIDDEN***"
    )
  );

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
      `DenzGains returned invalid JSON: ${text.slice(0, 1500)}`
    );
  }

  console.log(
    "DenzGains response:",
    safeJsonString(data)
  );

  if (!response.ok) {
    throw new Error(
      `DenzGains request failed (${response.status}): ${safeJsonString(data)}`
    );
  }

  if (data?.error) {
    throw new Error(
      `DenzGains API error: ${safeJsonString(data)}`
    );
  }

  return data;
}

/* =========================================================
   DENZGAINS SERVICES
========================================================= */

async function getDenzGainsServices(env) {
  const data =
    await denzGainsRequest(
      env,
      {
        action: "services"
      }
    );

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data.services)) {
    return data.services;
  }

  throw new Error(
    `DenzGains returned an unexpected services response: ${safeJsonString(data).slice(0, 3000)}`
  );
}

/* =========================================================
   SEND ORDER TO DENZGAINS
========================================================= */

async function sendOrderToDenzGains(
  env,
  serviceId,
  link,
  quantity
) {
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

  if (
    !quantity ||
    Number(quantity) <= 0
  ) {
    throw new Error(
      "DenzGains quantity is invalid."
    );
  }

  return await denzGainsRequest(
    env,
    {
      action: "add",

      service:
        String(serviceId),

      link:
        String(link),

      quantity:
        Number(quantity)
    }
  );
}

/* =========================================================
   GET DENZGAINS ORDER STATUS
========================================================= */

async function getDenzGainsOrderStatus(
  env,
  supplierOrderId
) {
  if (!supplierOrderId) {
    throw new Error(
      "DenzGains order ID is missing."
    );
  }

  return await denzGainsRequest(
    env,
    {
      action: "status",

      order:
        String(supplierOrderId)
    }
  );
}

/* =========================================================
   NORMALIZE SUPPLIER STATUS
========================================================= */

function normalizeSupplierStatus(status) {
  const value =
    String(status || "")
      .toLowerCase()
      .trim();

  if (
    value.includes("complete") ||
    value === "completed"
  ) {
    return "Completed";
  }

  if (
    value.includes("cancel") ||
    value.includes("refund")
  ) {
    return "Cancelled";
  }

  if (
    value.includes("partial")
  ) {
    return "Partial";
  }

  if (
    value.includes("fail") ||
    value.includes("error")
  ) {
    return "Supplier Error";
  }

  if (
    value.includes("process") ||
    value.includes("progress") ||
    value.includes("pending") ||
    value.includes("start")
  ) {
    return "Processing";
  }

  return "Processing";
}

/* =========================================================
   DENZGAINS TEST
========================================================= */

async function handleDenzGainsTest(
  request,
  env
) {
  const url =
    new URL(request.url);

  const secret =
    url.searchParams.get("secret");

  if (
    !env.TEST_ORDER_SECRET ||
    secret !== env.TEST_ORDER_SECRET
  ) {
    return json(
      {
        success: false,
        error: "Unauthorized."
      },
      401
    );
  }

  try {
    const services =
      await getDenzGainsServices(
        env
      );

    return json({
      success: true,

      message:
        "DenzGains API connection is working.",

      service_count:
        services.length,

      services
    });

  } catch (error) {
    return json(
      {
        success: false,

        message:
          "DenzGains rejected the services request.",

        error:
          error?.message ||
          String(error)
      },
      502
    );
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
  email: "TEXT",
  country_code: "TEXT",
  currency: "TEXT DEFAULT 'KES'",
  amount: "REAL DEFAULT 0",
  supplier_amount: "REAL DEFAULT 0",
  profit_amount: "REAL DEFAULT 0",
  payment_status:
    "TEXT DEFAULT 'PENDING'",
  order_status:
    "TEXT DEFAULT 'Pending'",
  pesapal_order_tracking_id:
    "TEXT",
  pesapal_merchant_reference:
    "TEXT",
  supplier_order_id:
    "TEXT",
  supplier_response:
    "TEXT",
  created_at:
    "TEXT DEFAULT CURRENT_TIMESTAMP",
  updated_at:
    "TEXT DEFAULT CURRENT_TIMESTAMP"
};

/* =========================================================
   ENSURE DATABASE
========================================================= */

async function ensureOrdersTable(env) {
  if (!env.DB) {
    throw new Error(
      "D1 database binding DB is not configured."
    );
  }

  await env.DB
    .prepare(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tracking_id TEXT,
        service_id TEXT,
        service_name TEXT,
        quantity INTEGER,
        link TEXT,
        phone TEXT,
        full_name TEXT,
        email TEXT,
        country_code TEXT,
        currency TEXT DEFAULT 'KES',
        amount REAL DEFAULT 0,
        supplier_amount REAL DEFAULT 0,
        profit_amount REAL DEFAULT 0,
        payment_status TEXT DEFAULT 'PENDING',
        order_status TEXT DEFAULT 'Pending',
        pesapal_order_tracking_id TEXT,
        pesapal_merchant_reference TEXT,
        supplier_order_id TEXT,
        supplier_response TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)
    .run();

  const tableInfo =
    await env.DB
      .prepare(
        `PRAGMA table_info(orders)`
      )
      .all();

  const existingColumns =
    new Set(
      (tableInfo.results || [])
        .map(
          column =>
            column.name
        )
    );

  for (
    const [
      columnName,
      definition
    ]
    of Object.entries(
      REQUIRED_ORDER_COLUMNS
    )
  ) {
    if (
      !existingColumns.has(
        columnName
      )
    ) {
      await env.DB
        .prepare(
          `ALTER TABLE orders ADD COLUMN ${columnName} ${definition}`
        )
        .run();
    }
  }

  /*
    Give old orders a tracking ID if they
    do not have one.
  */

  const oldOrders =
    await env.DB
      .prepare(`
        SELECT *
        FROM orders
        WHERE tracking_id IS NULL
           OR tracking_id = ''
      `)
      .all();

  for (
    const oldOrder
    of oldOrders.results || []
  ) {
    const newTrackingId =
      makeTrackingId();

    await env.DB
      .prepare(`
        UPDATE orders
        SET tracking_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(
        newTrackingId,
        oldOrder.id
      )
      .run();
  }

  /*
    Create unique tracking index if possible.
  */

  try {
    await env.DB
      .prepare(`
        CREATE UNIQUE INDEX IF NOT EXISTS
        idx_orders_tracking_id
        ON orders(tracking_id)
      `)
      .run();
  } catch (error) {
    console.error(
      "Tracking ID index warning:",
      error
    );
  }
}

/* =========================================================
   GET ORDER BY HUPPY TRACKING ID
========================================================= */

async function getOrderByTrackingId(
  env,
  trackingId
) {
  await ensureOrdersTable(
    env
  );

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

/* =========================================================
   GET ORDER BY DATABASE ID
========================================================= */

async function getOrderById(
  env,
  id
) {
  await ensureOrdersTable(
    env
  );

  if (
    id === undefined ||
    id === null
  ) {
    return null;
  }

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

/* =========================================================
   UPDATE ORDER

   IMPORTANT FIX:
   We primarily update orders by HUPPY tracking_id.

   This avoids depending on legacy D1 rows where
   the numeric id may be NULL or unreliable.
========================================================= */

async function updateOrder(
  env,
  identifier,
  fields
) {
  const allowedFields =
    new Set(
      Object.keys(
        REQUIRED_ORDER_COLUMNS
      )
    );

  const entries =
    Object.entries(fields)
      .filter(
        ([key]) =>
          allowedFields.has(key)
      );

  if (!entries.length) {
    return;
  }

  const setParts =
    entries.map(
      ([key]) =>
        `${key} = ?`
    );

  const values =
    entries.map(
      ([, value]) =>
        value
    );

  setParts.push(
    "updated_at = CURRENT_TIMESTAMP"
  );

  /*
    HUPPY tracking ID.
  */

  if (
    typeof identifier === "string" &&
    identifier.startsWith("HUPPY-")
  ) {
    await env.DB
      .prepare(`
        UPDATE orders
        SET ${setParts.join(", ")}
        WHERE tracking_id = ?
      `)
      .bind(
        ...values,
        identifier
      )
      .run();

    return;
  }

  /*
    Fallback to numeric ID for older internal calls.
  */

  if (
    identifier !== undefined &&
    identifier !== null
  ) {
    await env.DB
      .prepare(`
        UPDATE orders
        SET ${setParts.join(", ")}
        WHERE id = ?
      `)
      .bind(
        ...values,
        identifier
      )
      .run();
  }
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
    status.includes("submitting")
  ) {
    currentStep = 2;
    progress = 50;
  }

  else if (
    status.includes("processing") ||
    status.includes("partial")
  ) {
    currentStep = 3;
    progress = 75;
  }

  else if (
    status.includes("completed")
  ) {
    currentStep = 4;
    progress = 100;
  }

  else if (
    status.includes("cancel")
  ) {
    currentStep = 3;
    progress = 75;
  }

  else if (
    status.includes("supplier error")
  ) {
    currentStep = 2;
    progress = 50;
  }

  else if (
    status.includes("payment")
  ) {
    currentStep = 1;
    progress = 25;
  }

  return {
    current_step:
      currentStep,

    progress
  };
}

/* =========================================================
   PROCESS PAID ORDER

   PAYMENT
      ↓
   VERIFY PESAPAL
      ↓
   DENZGAINS
      ↓
   SAVE SUPPLIER ORDER
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
    Already submitted.
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

  /*
    Previously processed response.
  */

  if (
    order.supplier_response &&
    (
      order.order_status ===
        "Processing" ||
      order.order_status ===
        "Partial" ||
      order.order_status ===
        "Completed"
    )
  ) {
    return {
      success: true,

      already_submitted:
        true,

      supplier_order_id:
        null,

      supplier_response:
        order.supplier_response
    };
  }

  /*
    We cannot check payment without
    PesaPal's transaction tracking ID.
  */

  if (
    !order.pesapal_order_tracking_id
  ) {
    throw new Error(
      "PesaPal transaction tracking ID is missing."
    );
  }

  /*
    ALWAYS verify payment directly with PesaPal.
  */

  const payment =
    await getPesapalStatus(
      env,
      order.pesapal_order_tracking_id
    );

  const paymentDescription =
    String(
      payment?.payment_status_description ||
      ""
    ).toUpperCase();

  const statusCode =
    Number(
      payment?.status_code
    );

  const paymentStatus =
    paymentDescription ||
    (
      Number.isFinite(statusCode)
        ? String(statusCode)
        : ""
    ) ||
    "PENDING";

  /*
    PesaPal API:
      0 = INVALID
      1 = COMPLETED
      2 = FAILED
      3 = REVERSED
  */

  const isCompleted =
    paymentDescription ===
      "COMPLETED" ||
    statusCode === 1;

  /*
    Payment failed.
  */

  if (
    paymentDescription ===
      "FAILED" ||
    statusCode === 2
  ) {
    await updateOrder(
      env,
      order.tracking_id,
      {
        payment_status:
          "FAILED",

        order_status:
          "Payment Failed",

        supplier_response:
          safeJsonString({
            pesapal:
              payment
          })
      }
    );

    return {
      success:
        false,

      paid:
        false,

      payment:
        payment
    };
  }

  /*
    Payment reversed.
  */

  if (
    paymentDescription ===
      "REVERSED" ||
    statusCode === 3
  ) {
    await updateOrder(
      env,
      order.tracking_id,
      {
        payment_status:
          "REVERSED",

        order_status:
          "Payment Reversed",

        supplier_response:
          safeJsonString({
            pesapal:
              payment
          })
      }
    );

    return {
      success:
        false,

      paid:
        false,

      payment:
        payment
    };
  }

  /*
    Payment not yet completed.
  */

  if (!isCompleted) {
    await updateOrder(
      env,
      order.tracking_id,
      {
        payment_status:
          "PENDING",

        order_status:
          "Payment Pending"
      }
    );

    return {
      success:
        false,

      paid:
        false,

      payment:
        payment
    };
  }

  /*
    PAYMENT CONFIRMED.
    Now submit to DenzGains.
  */

  await updateOrder(
    env,
    order.tracking_id,
    {
      payment_status:
        "COMPLETED",

      order_status:
        "Submitting"
    }
  );

  try {
    console.log(
      "Submitting order to DenzGains:",
      safeJsonString({
        service_id:
          order.service_id,

        link:
          order.link,

        quantity:
          order.quantity,

        tracking_id:
          order.tracking_id
      })
    );

    const supplierResult =
      await sendOrderToDenzGains(
        env,

        order.service_id,

        order.link,

        order.quantity
      );

    console.log(
      "DenzGains response:",
      safeJsonString(
        supplierResult
      )
    );

    /*
      DenzGains may return the order ID
      under different property names.
    */

    const supplierOrderId =
      supplierResult?.order ||
      supplierResult?.order_id ||
      supplierResult?.id ||
      supplierResult?.orderId ||
      null;

    /*
      Save supplier response even if
      DenzGains does not provide an ID.
    */

    if (!supplierOrderId) {
      const returnedStatus =
        supplierResult?.status ||
        supplierResult?.order_status ||
        supplierResult?.state ||
        "";

      const normalizedStatus =
        returnedStatus
          ? normalizeSupplierStatus(
              returnedStatus
            )
          : "Processing";

      await updateOrder(
        env,
        order.tracking_id,
        {
          supplier_response:
            safeJsonString(
              supplierResult
            ),

          order_status:
            normalizedStatus
        }
      );

      return {
        success:
          true,

        paid:
          true,

        supplier_order_id:
          null,

        supplier_response:
          supplierResult
      };
    }

    /*
      DenzGains returned an order ID.
    */

    await updateOrder(
      env,
      order.tracking_id,
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
          normalizeSupplierStatus(
            supplierResult?.status ||
            "Processing"
          )
      }
    );

    return {
      success:
        true,

      paid:
        true,

      supplier_order_id:
        String(
          supplierOrderId
        ),

      supplier_response:
        supplierResult
    };

  } catch (error) {
    console.error(
      "DenzGains submission failed:",
      error
    );

    await updateOrder(
      env,
      order.tracking_id,
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
   SUPPLIER STATUS SYNC
========================================================= */

async function syncSupplierStatus(
  env,
  order
) {
  if (
    !order ||
    !order.supplier_order_id
  ) {
    return order;
  }

  try {
    const supplier =
      await getDenzGainsOrderStatus(
        env,
        order.supplier_order_id
      );

    const supplierStatus =
      supplier?.status ||
      supplier?.order_status ||
      supplier?.state ||
      "";

    const normalized =
      normalizeSupplierStatus(
        supplierStatus
      );

    await updateOrder(
      env,
      order.tracking_id,
      {
        order_status:
          normalized,

        supplier_response:
          safeJsonString(
            supplier
          )
      }
    );

    return await getOrderByTrackingId(
      env,
      order.tracking_id
    );

  } catch (error) {
    console.error(
      "DenzGains status check failed:",
      error
    );

    return order;
  }
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

  let body;

  try {
    body =
      await request.json();
  } catch {
    return json(
      {
        error:
          "Invalid JSON request."
      },
      400
    );
  }

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

  const fullName =
    String(
      body.full_name ||
      body.fullName ||
      "Customer"
    ).trim();

  const email =
    String(
      body.email || ""
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

  const currencyInfo =
    getCurrencyFromPhone(
      phone
    );

  const currency =
    currencyInfo.currency;

  const countryCode =
    currencyInfo.country;

  /*
    Get LIVE DenzGains services.
  */

  const services =
    await getDenzGainsServices(
      env
    );

  /*
    Find exact selected service.
  */

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
          "Selected service was not found in the DenzGains catalog.",

        requested_service_id:
          serviceId
      },
      404
    );
  }

  /*
    DenzGains rate is KES per 1,000.
  */

  const supplierRate =
    Number(
      service.rate ||
      service.price ||
      0
    );

  if (
    !Number.isFinite(
      supplierRate
    ) ||
    supplierRate <= 0
  ) {
    return json(
      {
        error:
          "DenzGains KES price is unavailable for this service."
      },
      400
    );
  }

  const supplierMin =
    Number(
      service.min ||
      service.min_quantity ||
      0
    );

  const supplierMax =
    Number(
      service.max ||
      service.max_quantity ||
      0
    );

  if (
    supplierMin > 0 &&
    quantity < supplierMin
  ) {
    return json(
      {
        error:
          `Minimum quantity for this service is ${supplierMin}.`
      },
      400
    );
  }

  if (
    supplierMax > 0 &&
    quantity > supplierMax
  ) {
    return json(
      {
        error:
          `Maximum quantity for this service is ${supplierMax}.`
      },
      400
    );
  }

  /*
    Supplier rate.
  */

  const supplierRateKES =
    supplierRate;

  /*
    HUPPY CUBE rate = supplier × 2.
  */

  const customerRateKES =
    customerPrice(
      supplierRateKES
    );

  /*
    Supplier cost.
  */

  const supplierAmount =
    roundMoney(
      calculateOrderAmount(
        supplierRateKES,
        quantity
      )
    );

  /*
    Customer payment.
  */

  const amount =
    roundMoney(
      calculateOrderAmount(
        customerRateKES,
        quantity
      )
    );

  /*
    Profit.
  */

  const profitAmount =
    roundMoney(
      amount -
      supplierAmount
    );

  /*
    HUPPY tracking ID.
  */

  const trackingId =
    makeTrackingId();

  const finalServiceName =
    serviceName ||
    service.name ||
    service.description ||
    `Service ${serviceId}`;

  /*
    Insert order.

    We DO NOT depend on the returned numeric id
    after this point.
  */

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
        email,
        country_code,
        currency,
        amount,
        supplier_amount,
        profit_amount,
        payment_status,
        order_status
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
    `)
    .bind(
      trackingId,
      serviceId,
      finalServiceName,
      quantity,
      link,
      phone,
      fullName,
      email,
      countryCode,
      currency,
      amount,
      supplierAmount,
      profitAmount,
      "PENDING",
      "Pending"
    )
    .run();

  /*
    Immediately reload the order by its HUPPY
    tracking ID.
  */

  let order =
    await getOrderByTrackingId(
      env,
      trackingId
    );

  if (!order) {
    throw new Error(
      "The order was inserted but could not be loaded using its HUPPY tracking ID."
    );
  }

  /*
    PesaPal payment.
  */

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

  /*
    IMPORTANT FIX:
    Save PesaPal's real order_tracking_id
    using the HUPPY tracking ID.
  */

  const pesapalTrackingId =
    payment.order_tracking_id ||
    payment.orderTrackingId ||
    payment.OrderTrackingId ||
    null;

  const pesapalMerchantReference =
    payment.merchant_reference ||
    payment.merchantReference ||
    payment.OrderMerchantReference ||
    trackingId;

  if (!pesapalTrackingId) {
    throw new Error(
      `PesaPal did not provide a transaction tracking ID. Response: ${safeJsonString(payment)}`
    );
  }

  await updateOrder(
    env,
    trackingId,
    {
      pesapal_order_tracking_id:
        pesapalTrackingId,

      pesapal_merchant_reference:
        pesapalMerchantReference
    }
  );

  /*
    Reload after saving PesaPal information.
  */

  order =
    await getOrderByTrackingId(
      env,
      trackingId
    );

  return json({
    success:
      true,

    tracking_id:
      trackingId,

    amount,

    currency:
      "KES",

    currency_symbol:
      "KSh",

    formatted_amount:
      formatKES(amount),

    supplier_rate:
      supplierRateKES,

    customer_rate:
      customerRateKES,

    supplier_cost:
      supplierAmount,

    profit:
      profitAmount,

    quantity,

    pesapal_order_tracking_id:
      pesapalTrackingId,

    pesapal_merchant_reference:
      pesapalMerchantReference,

    redirect_url:
      payment.redirect_url
  });
}

/* =========================================================
   SERVICES
========================================================= */

async function handleServices(
  request,
  env
) {
  const services =
    await getDenzGainsServices(
      env
    );

  const sortedServices =
    [...services].sort(
      (a, b) =>
        Number(
          a.rate ||
          a.price ||
          0
        ) -
        Number(
          b.rate ||
          b.price ||
          0
        )
    );

  const mapped =
    sortedServices.map(
      service => {
        const supplierRate =
          Number(
            service.rate ||
            service.price ||
            0
          );

        const customerRate =
          customerPrice(
            supplierRate
          );

        return {
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

          type:
            service.type ||
            "",

          category:
            service.category ||
            "",

          min:
            Number(
              service.min ||
              service.min_quantity ||
              0
            ),

          max:
            Number(
              service.max ||
              service.max_quantity ||
              0
            ),

          refill:
            service.refill ??
            false,

          cancel:
            service.cancel ??
            false,

          supplier_rate:
            supplierRate,

          customer_rate:
            roundMoney(
              customerRate
            ),

          currency:
            "KES",

          currency_symbol:
            "KSh",

          supplier_rate_formatted:
            formatKES(
              supplierRate
            ),

          customer_rate_formatted:
            formatKES(
              customerRate
            )
        };
      }
    );

  return json({
    success:
      true,

    currency:
      "KES",

    currency_symbol:
      "KSh",

    country:
      "KE",

    services:
      mapped
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
    If PesaPal tracking ID exists and
    supplier order has not yet been created,
    verify payment and submit to DenzGains.
  */

  if (
    order.pesapal_order_tracking_id &&
    !order.supplier_order_id
  ) {
    try {
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
        "Failed to process paid order:",
        error
      );

      order =
        await getOrderByTrackingId(
          env,
          trackingId
        );

      return json({
        success:
          true,

        order,

        tracking:
          trackingInfo(
            order
          ),

        processing_error:
          error?.message ||
          String(error),

        whatsapp: {
          url:
            `https://wa.me/254796681162?text=` +
            encodeURIComponent(
              `Hello HUPPY CUBE, I need help with my order. Tracking ID: ${trackingId}`
            )
        }
      });
    }
  }

  /*
    If supplier order exists,
    synchronize its latest status.
  */

  if (
    order &&
    order.supplier_order_id
  ) {
    order =
      await syncSupplierStatus(
        env,
        order
      );
  }

  return json({
    success:
      true,

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
    new URL(request.url);

  const trackingId =
    url.searchParams.get(
      "tracking_id"
    );

  /*
    PesaPal API 3 callback parameters.
  */

  const merchantReference =
    url.searchParams.get(
      "OrderMerchantReference"
    ) ||
    url.searchParams.get(
      "orderMerchantReference"
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
    "PesaPal callback:",
    safeJsonString({
      trackingId,
      merchantReference,
      orderTrackingId
    })
  );

  let order = null;

  /*
    First try our HUPPY tracking ID.
  */

  if (trackingId) {
    order =
      await getOrderByTrackingId(
        env,
        trackingId
      );
  }

  /*
    If not found, try PesaPal merchant reference.
  */

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

  /*
    Save PesaPal transaction ID.
  */

  if (
    order &&
    orderTrackingId
  ) {
    await updateOrder(
      env,
      order.tracking_id,
      {
        pesapal_order_tracking_id:
          orderTrackingId,

        pesapal_merchant_reference:
          merchantReference ||
          order.tracking_id
      }
    );

    order =
      await getOrderByTrackingId(
        env,
        order.tracking_id
      );
  }

  /*
    Verify payment and submit supplier order.
  */

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

  /*
    Return customer to website.
  */

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

  /*
    PesaPal API 3 IPN parameters.
  */

  const merchantReference =
    url.searchParams.get(
      "OrderMerchantReference"
    ) ||
    url.searchParams.get(
      "orderMerchantReference"
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
    "PesaPal IPN:",
    safeJsonString({
      merchantReference,
      orderTrackingId
    })
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

  /*
    Save PesaPal tracking ID.
  */

  if (orderTrackingId) {
    await updateOrder(
      env,
      order.tracking_id,
      {
        pesapal_order_tracking_id:
          orderTrackingId,

        pesapal_merchant_reference:
          merchantReference
      }
    );

    order =
      await getOrderByTrackingId(
        env,
        order.tracking_id
      );
  }

  /*
    Verify payment and submit to DenzGains.
  */

  try {
    await processPaidOrder(
      env,
      order
    );
  } catch (error) {
    console.error(
      "PesaPal IPN processing error:",
      error
    );
  }

  /*
    PesaPal expects an acknowledgement.
  */

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
        tableInfo.results || []
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

    supplier:
      "DenzGains",

    currency:
      "KES",

    markup:
      "2x",

    status:
      "online",

    time:
      new Date().toISOString()
  });
}

/* =========================================================
   CURRENCY TEST
========================================================= */

async function handleCurrencyTest(
  request,
  env
) {
  const url =
    new URL(request.url);

  const amount =
    Number(
      url.searchParams.get(
        "amount"
      ) || 1
    );

  return json({
    success:
      true,

    currency:
      "KES",

    symbol:
      "KSh",

    amount,

    formatted:
      formatKES(amount),

    message:
      "HUPPY CUBE uses DenzGains KES pricing directly. No USD conversion is applied."
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
      new URL(request.url);

    const pathname =
      url.pathname;

    /*
      CORS
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
      /* =====================================================
         HEALTH
      ===================================================== */

      if (
        request.method === "GET" &&
        pathname === "/api/health"
      ) {
        return handleHealth();
      }

      /* =====================================================
         DENZGAINS TEST
      ===================================================== */

      if (
        request.method === "GET" &&
        pathname === "/api/denzgains-test"
      ) {
        return await handleDenzGainsTest(
          request,
          env
        );
      }

      /* =====================================================
         CURRENCY TEST
      ===================================================== */

      if (
        request.method === "GET" &&
        pathname === "/api/currency-test"
      ) {
        return await handleCurrencyTest(
          request,
          env
        );
      }

      /* =====================================================
         SERVICES
      ===================================================== */

      if (
        request.method === "GET" &&
        pathname === "/api/services"
      ) {
        return await handleServices(
          request,
          env
        );
      }

      /* =====================================================
         CREATE PAYMENT
      ===================================================== */

      if (
        request.method === "POST" &&
        (
          pathname === "/api/order-payment" ||
          pathname === "/api/create-payment" ||
          pathname === "/api/create-order" ||
          pathname === "/api/order" ||
          pathname === "/api/pay"
        )
      ) {
        return await handleOrderPayment(
          request,
          env
        );
      }

      /* =====================================================
         ORDER STATUS
      ===================================================== */

      if (
        request.method === "GET" &&
        pathname === "/api/order-status"
      ) {
        return await handleOrderStatus(
          request,
          env
        );
      }

      /* =====================================================
         PAYMENT CALLBACK
      ===================================================== */

      if (
        pathname ===
        "/api/payment-callback"
      ) {
        return await handlePaymentCallback(
          request,
          env
        );
      }

      /* =====================================================
         PESAPAL IPN
      ===================================================== */

      if (
        pathname ===
        "/api/pesapal-ipn"
      ) {
        return await handlePesapalIpn(
          request,
          env
        );
      }

      /* =====================================================
         DATABASE TEST
      ===================================================== */

      if (
        request.method === "GET" &&
        pathname === "/api/database-test"
      ) {
        return await handleDatabaseTest(
          request,
          env
        );
      }

      /* =====================================================
         FRONTEND
      ===================================================== */

      if (env.ASSETS) {
        return env.ASSETS.fetch(
          request
        );
      }

      return new Response(
        "HUPPY CUBE Worker is running.",
        {
          status:
            200
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
