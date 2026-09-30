// ============================================================
// HUPPY CUBE - COMPLETE CLOUDFLARE WORKER
// React + Cloudflare Pages + D1 + PesaPal + DenzGains
// ============================================================

const PESAPAL_LIVE_BASE = "https://pay.pesapal.com/v3";
const PESAPAL_SANDBOX_BASE = "https://cybqa.pesapal.com/pesapalv3";

const DENZGAINS_BASE = "https://denzgains.com/api/v2";

const WHATSAPP_NUMBER = "254796681162";

// ------------------------------------------------------------
// GENERAL HELPERS
// ------------------------------------------------------------

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function corsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
  };
}

function corsJson(data, status = 200, origin = "*") {
  return json(data, status, corsHeaders(origin));
}

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function randomId(prefix = "HUPPY") {
  const random =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()
      : Math.random().toString(36).slice(2, 14).toUpperCase();

  return `${prefix}-${Date.now()}-${random}`;
}

function normalizePhone(phone) {
  let p = text(phone).replace(/[^\d+]/g, "");

  if (p.startsWith("+254")) {
    p = "254" + p.slice(4);
  } else if (p.startsWith("254")) {
    // already correct
  } else if (p.startsWith("0")) {
    p = "254" + p.slice(1);
  }

  return p;
}

function isValidPhone(phone) {
  return /^2547\d{8}$/.test(phone) || /^2541\d{8}$/.test(phone);
}

function maskSecret(value) {
  const v = text(value);
  if (!v) return "";
  if (v.length <= 8) return "********";
  return `${v.slice(0, 4)}********${v.slice(-4)}`;
}

function errorMessage(error) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  return (
    error.message ||
    error.error?.message ||
    error.error_description ||
    JSON.stringify(error)
  );
}

function getOrigin(request) {
  return new URL(request.url).origin;
}

function getEnvOrigin(env, request) {
  return (
    text(env.PUBLIC_BASE_URL).replace(/\/$/, "") ||
    getOrigin(request)
  );
}

// ------------------------------------------------------------
// D1 DATABASE SETUP
// ------------------------------------------------------------

const REQUIRED_ORDER_COLUMNS = {
  tracking_id: "TEXT",
  service_id: "TEXT",
  service_name: "TEXT",
  link: "TEXT",
  quantity: "INTEGER",
  phone: "TEXT",

  supplier_rate: "REAL",
  customer_rate: "REAL",
  supplier_amount: "REAL",
  customer_amount: "REAL",

  payment_status: "TEXT",
  order_status: "TEXT",

  pesapal_order_tracking_id: "TEXT",
  pesapal_merchant_reference: "TEXT",

  supplier_order_id: "TEXT",
  supplier_response: "TEXT",

  error_message: "TEXT",

  created_at: "TEXT",
  updated_at: "TEXT",
};

async function ensureOrdersTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_id TEXT UNIQUE NOT NULL,

      service_id TEXT,
      service_name TEXT,
      link TEXT,
      quantity INTEGER,
      phone TEXT,

      supplier_rate REAL DEFAULT 0,
      customer_rate REAL DEFAULT 0,
      supplier_amount REAL DEFAULT 0,
      customer_amount REAL DEFAULT 0,

      payment_status TEXT DEFAULT 'PENDING',
      order_status TEXT DEFAULT 'Pending',

      pesapal_order_tracking_id TEXT,
      pesapal_merchant_reference TEXT,

      supplier_order_id TEXT,
      supplier_response TEXT,

      error_message TEXT,

      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  const tableInfo = await env.DB.prepare(
    `PRAGMA table_info(orders)`
  ).all();

  const existing = new Set(
    (tableInfo.results || []).map((row) => row.name)
  );

  for (const [column, definition] of Object.entries(
    REQUIRED_ORDER_COLUMNS
  )) {
    if (existing.has(column)) continue;

    // IMPORTANT:
    // SQLite can reject ALTER TABLE ADD COLUMN when a non-constant
    // DEFAULT is used. Therefore timestamps are added without
    // CURRENT_TIMESTAMP defaults.
    await env.DB.prepare(
      `ALTER TABLE orders ADD COLUMN ${column} ${definition}`
    ).run();
  }
}

async function backfillOrderTimestamps(env) {
  try {
    await env.DB.prepare(`
      UPDATE orders
      SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP)
      WHERE created_at IS NULL OR created_at = ''
    `).run();

    await env.DB.prepare(`
      UPDATE orders
      SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
      WHERE updated_at IS NULL OR updated_at = ''
    `).run();
  } catch {
    // Existing installations may already have valid timestamps.
  }
}

// ------------------------------------------------------------
// D1 ORDER HELPERS
// ------------------------------------------------------------

async function getOrderByTrackingId(env, trackingId) {
  if (!trackingId) return null;

  return await env.DB.prepare(`
    SELECT *
    FROM orders
    WHERE tracking_id = ?
    LIMIT 1
  `)
    .bind(trackingId)
    .first();
}

async function getOrderByPesapalTrackingId(env, pesapalTrackingId) {
  if (!pesapalTrackingId) return null;

  return await env.DB.prepare(`
    SELECT *
    FROM orders
    WHERE pesapal_order_tracking_id = ?
    LIMIT 1
  `)
    .bind(pesapalTrackingId)
    .first();
}

async function getOrderByMerchantReference(env, merchantReference) {
  if (!merchantReference) return null;

  return await env.DB.prepare(`
    SELECT *
    FROM orders
    WHERE pesapal_merchant_reference = ?
       OR tracking_id = ?
    LIMIT 1
  `)
    .bind(merchantReference, merchantReference)
    .first();
}

async function updateOrder(env, trackingId, values) {
  const entries = Object.entries(values || {}).filter(
    ([, value]) => value !== undefined
  );

  if (!entries.length) return;

  const assignments = entries
    .map(([key]) => `${key} = ?`)
    .join(", ");

  const params = entries.map(([, value]) => value);

  await env.DB.prepare(`
    UPDATE orders
    SET ${assignments},
        updated_at = CURRENT_TIMESTAMP
    WHERE tracking_id = ?
  `)
    .bind(...params, trackingId)
    .run();
}

// ------------------------------------------------------------
// ATOMIC SUPPLIER SUBMISSION LOCK
// ------------------------------------------------------------
//
// This is important.
//
// The customer browser polls /api/order-status.
// PesaPal also calls the callback.
// PesaPal also calls the IPN.
//
// Without this lock, two of those requests could both call
// DenzGains "action=add" and create duplicate supplier orders.
//

async function claimSupplierSubmission(env, trackingId) {
  const result = await env.DB.prepare(`
    UPDATE orders
    SET
      payment_status = 'COMPLETED',
      order_status = 'Submitting',
      error_message = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE tracking_id = ?
      AND supplier_order_id IS NULL
      AND (
        order_status IS NULL
        OR order_status != 'Submitting'
      )
  `)
    .bind(trackingId)
    .run();

  return Number(result?.meta?.changes || 0) > 0;
}

// ------------------------------------------------------------
// DENZGAINS API
// ------------------------------------------------------------

async function denzGainsRequest(env, payload) {
  const apiKey = text(env.DENZGAINS_API_KEY);

  if (!apiKey) {
    throw new Error("DENZGAINS_API_KEY is not configured.");
  }

  const params = new URLSearchParams();

  params.set("key", apiKey);

  for (const [key, value] of Object.entries(payload || {})) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      params.set(key, String(value));
    }
  }

  const url = `${DENZGAINS_BASE}?${params.toString()}`;

  console.log("DenzGains request:", {
    action: payload?.action,
    service: payload?.service,
    order: payload?.order,
    quantity: payload?.quantity,
    link: payload?.link,
    apiKey: maskSecret(apiKey),
  });

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "HUPPY-CUBE/1.0",
    },
  });

  const raw = await response.text();

  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    data = {
      raw,
    };
  }

  if (!response.ok) {
    throw new Error(
      `DenzGains HTTP ${response.status}: ${raw.slice(0, 1000)}`
    );
  }

  if (
    data &&
    (
      data.error ||
      data.errors ||
      data.success === false
    )
  ) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : data.error?.message ||
          data.message ||
          data.errors?.message ||
          JSON.stringify(data)
    );
  }

  return data;
}

async function getDenzGainsServices(env) {
  const response = await denzGainsRequest(env, {
    action: "services",
  });

  if (!Array.isArray(response)) {
    if (Array.isArray(response?.services)) {
      return response.services;
    }

    throw new Error(
      `DenzGains services response is not an array: ${JSON.stringify(
        response
      ).slice(0, 1000)}`
    );
  }

  return response;
}

function normalizeSupplierService(service) {
  const serviceId =
    service?.service ??
    service?.service_id ??
    service?.id;

  const rate =
    service?.rate ??
    service?.price ??
    service?.cost ??
    0;

  const min =
    service?.min ??
    service?.minimum ??
    service?.min_quantity ??
    1;

  const max =
    service?.max ??
    service?.maximum ??
    service?.max_quantity ??
    1000000;

  return {
    service_id: String(serviceId ?? ""),
    name: text(service?.name),
    rate: number(rate),
    min: number(min, 1),
    max: number(max, 1000000),
    min_quantity: number(min, 1),
    max_quantity: number(max, 1000000),

    category: text(service?.category),
    type: text(service?.type),
    refill: service?.refill,
    cancel: service?.cancel,

    raw: service,
  };
}

async function findSupplierService(env, serviceId) {
  const services = await getDenzGainsServices(env);

  const requested = String(serviceId);

  const found = services.find((service) => {
    const id =
      service?.service ??
      service?.service_id ??
      service?.id;

    return String(id) === requested;
  });

  if (!found) {
    throw new Error(
      `DenzGains service ${requested} was not found.`
    );
  }

  return normalizeSupplierService(found);
}

async function addDenzGainsOrder(
  env,
  serviceId,
  link,
  quantity
) {
  return await denzGainsRequest(env, {
    action: "add",
    service: String(serviceId),
    link: String(link),
    quantity: Number(quantity),
  });
}

async function getDenzGainsOrderStatus(
  env,
  supplierOrderId
) {
  return await denzGainsRequest(env, {
    action: "status",
    order: String(supplierOrderId),
  });
}

function extractSupplierOrderId(response) {
  if (!response) return "";

  const candidates = [
    response.order,
    response.order_id,
    response.id,
    response.orderId,
    response.supplier_order_id,
  ];

  for (const value of candidates) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return String(value).trim();
    }
  }

  return "";
}

// ------------------------------------------------------------
// PESAPAL
// ------------------------------------------------------------

function getPesapalBase(env) {
  const mode = text(env.PESAPAL_MODE).toLowerCase();

  if (
    mode === "sandbox" ||
    mode === "test" ||
    mode === "demo"
  ) {
    return PESAPAL_SANDBOX_BASE;
  }

  return PESAPAL_LIVE_BASE;
}

async function pesapalAuth(env) {
  const consumerKey = text(env.PESAPAL_CONSUMER_KEY);
  const consumerSecret = text(env.PESAPAL_CONSUMER_SECRET);

  if (!consumerKey || !consumerSecret) {
    throw new Error(
      "PESAPAL_CONSUMER_KEY or PESAPAL_CONSUMER_SECRET is missing."
    );
  }

  const base = getPesapalBase(env);

  const response = await fetch(
    `${base}/api/Auth/RequestToken`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
      }),
    }
  );

  const raw = await response.text();

  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    data = {
      raw,
    };
  }

  if (!response.ok) {
    throw new Error(
      `PesaPal authentication HTTP ${response.status}: ${raw.slice(
        0,
        1000
      )}`
    );
  }

  const token =
    data?.token ||
    data?.access_token;

  if (!token) {
    throw new Error(
      `PesaPal authentication failed: ${JSON.stringify(data).slice(
        0,
        1000
      )}`
    );
  }

  return token;
}

async function pesapalRequest(
  env,
  path,
  options = {}
) {
  const token = await pesapalAuth(env);
  const base = getPesapalBase(env);

  const response = await fetch(`${base}${path}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
    body:
      options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
  });

  const raw = await response.text();

  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    data = {
      raw,
    };
  }

  if (!response.ok) {
    throw new Error(
      `PesaPal HTTP ${response.status}: ${raw.slice(0, 1500)}`
    );
  }

  if (data?.error) {
    throw new Error(
      data.error?.message ||
      data.error_description ||
      JSON.stringify(data.error)
    );
  }

  return data;
}

async function submitPesapalOrder(
  env,
  {
    merchantReference,
    amount,
    description,
    callbackUrl,
    cancellationUrl,
    phone,
    firstName,
    lastName,
  }
) {
  const notificationId = text(env.PESAPAL_IPN_ID);

  if (!notificationId) {
    throw new Error(
      "PESAPAL_IPN_ID is not configured."
    );
  }

  if (!merchantReference) {
    throw new Error(
      "Missing PesaPal merchant reference."
    );
  }

  if (!amount || amount <= 0) {
    throw new Error(
      "Invalid PesaPal payment amount."
    );
  }

  const billingPhone = normalizePhone(phone);

  const billingAddress = {
    email_address:
      text(env.PESAPAL_BILLING_EMAIL) ||
      "customer@huppycube.com",

    phone_number: billingPhone,

    country_code: "KE",

    first_name:
      text(firstName) || "HUPPY",

    middle_name: "",

    last_name:
      text(lastName) || "Customer",

    line_1: "HUPPY CUBE",
    line_2: "",
    city: "Nairobi",
    state: "",
    postal_code: "",
    zip_code: "",
  };

  return await pesapalRequest(
    env,
    "/api/Transactions/SubmitOrderRequest",
    {
      method: "POST",
      body: {
        id: merchantReference,
        currency: "KES",
        amount: roundMoney(amount),
        description: String(description).slice(0, 100),
        callback_url: callbackUrl,
        cancellation_url:
          cancellationUrl || callbackUrl,
        redirect_mode: "TOP_WINDOW",
        notification_id: notificationId,
        billing_address: billingAddress,
      },
    }
  );
}

async function getPesapalTransactionStatus(
  env,
  pesapalTrackingId
) {
  if (!pesapalTrackingId) {
    throw new Error(
      "Missing PesaPal OrderTrackingId."
    );
  }

  return await pesapalRequest(
    env,
    `/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(
      pesapalTrackingId
    )}`,
    {
      method: "GET",
    }
  );
}

// ------------------------------------------------------------
// PESAPAL NOTIFICATION PARSER
// ------------------------------------------------------------
//
// PesaPal can send the IPN as GET OR POST.
//
// POST may be JSON.
// POST may also be form encoded.
//
// The old Worker only checked URL query parameters.
// That is the important bug fixed here.
//

async function readPesapalNotification(request) {
  const url = new URL(request.url);

  let body = {};

  if (request.method.toUpperCase() === "POST") {
    const contentType =
      request.headers.get("content-type") || "";

    try {
      if (
        contentType
          .toLowerCase()
          .includes("application/json")
      ) {
        body = await request.json();
      } else if (
        contentType
          .toLowerCase()
          .includes(
            "application/x-www-form-urlencoded"
          )
      ) {
        const form = await request.formData();
        body = Object.fromEntries(form.entries());
      } else {
        const raw = await request.text();

        if (raw) {
          const parsedJson = safeJsonParse(
            raw,
            null
          );

          if (parsedJson) {
            body = parsedJson;
          } else {
            const params = new URLSearchParams(raw);
            body = Object.fromEntries(
              params.entries()
            );
          }
        }
      }
    } catch (error) {
      console.error(
        "Could not parse PesaPal notification:",
        error
      );
    }
  }

  const pick = (...keys) => {
    for (const key of keys) {
      const fromUrl =
        url.searchParams.get(key);

      if (
        fromUrl !== null &&
        String(fromUrl).trim() !== ""
      ) {
        return String(fromUrl).trim();
      }

      const fromBody = body?.[key];

      if (
        fromBody !== undefined &&
        fromBody !== null &&
        String(fromBody).trim() !== ""
      ) {
        return String(fromBody).trim();
      }
    }

    return "";
  };

  return {
    merchantReference: pick(
      "OrderMerchantReference",
      "orderMerchantReference",
      "pesapal_merchant_reference"
    ),

    orderTrackingId: pick(
      "OrderTrackingId",
      "orderTrackingId",
      "pesapal_transaction_tracking_id"
    ),

    notificationType: pick(
      "OrderNotificationType",
      "orderNotificationType",
      "pesapal_notification_type"
    ),
  };
}

// ------------------------------------------------------------
// PAYMENT STATUS NORMALIZATION
// ------------------------------------------------------------

function pesapalStatusCode(data) {
  const value =
    data?.status_code ??
    data?.statusCode ??
    data?.payment_status_code;

  if (
    value !== undefined &&
    value !== null &&
    String(value) !== ""
  ) {
    return Number(value);
  }

  return null;
}

function pesapalStatusDescription(data) {
  return text(
    data?.payment_status_description ||
    data?.paymentStatusDescription ||
    data?.description ||
    data?.status_description
  ).toUpperCase();
}

function isPesapalCompleted(data) {
  const code = pesapalStatusCode(data);
  const description =
    pesapalStatusDescription(data);

  return (
    code === 1 ||
    description === "COMPLETED" ||
    description.includes("COMPLETED")
  );
}

function isPesapalFailed(data) {
  const code = pesapalStatusCode(data);
  const description =
    pesapalStatusDescription(data);

  return (
    code === 2 ||
    description === "FAILED" ||
    description.includes("FAILED")
  );
}

function isPesapalReversed(data) {
  const code = pesapalStatusCode(data);
  const description =
    pesapalStatusDescription(data);

  return (
    code === 3 ||
    description === "REVERSED" ||
    description.includes("REVERSED")
  );
}

// ------------------------------------------------------------
// PAYMENT VERIFICATION
// ------------------------------------------------------------

async function verifyPesapalPayment(
  env,
  order
) {
  if (!order?.pesapal_order_tracking_id) {
    throw new Error(
      "This order does not have a PesaPal tracking ID yet."
    );
  }

  const status =
    await getPesapalTransactionStatus(
      env,
      order.pesapal_order_tracking_id
    );

  const returnedMerchantReference = text(
    status?.merchant_reference
  );

  if (
    returnedMerchantReference &&
    order.pesapal_merchant_reference &&
    returnedMerchantReference !==
      order.pesapal_merchant_reference
  ) {
    throw new Error(
      "PesaPal merchant reference does not match this order."
    );
  }

  const returnedCurrency = text(
    status?.currency
  ).toUpperCase();

  if (
    returnedCurrency &&
    returnedCurrency !== "KES"
  ) {
    throw new Error(
      `Unexpected PesaPal currency: ${returnedCurrency}`
    );
  }

  return status;
}

// ------------------------------------------------------------
// PROCESS A PAID ORDER
// ------------------------------------------------------------

async function processPaidOrder(
  env,
  originalOrder
) {
  let order = originalOrder;

  if (!order) {
    return {
      success: false,
      message: "Order not found.",
    };
  }

  // Already submitted successfully.
  if (order.supplier_order_id) {
    return {
      success: true,
      paid: true,
      submitted: true,
      supplier_order_id:
        order.supplier_order_id,
      order_status:
        order.order_status || "Processing",
    };
  }

  // Another callback/IPN/browser poll is currently
  // submitting this order.
  //
  // Do NOT call DenzGains again.
  if (
    String(order.order_status || "").toLowerCase() ===
    "submitting"
  ) {
    return {
      success: true,
      paid: true,
      submitting: true,
      tracking_id: order.tracking_id,
      order_status: "Submitting",
    };
  }

  if (!order.pesapal_order_tracking_id) {
    return {
      success: false,
      paid: false,
      pending: true,
      message:
        "Waiting for PesaPal tracking ID.",
    };
  }

  let payment;

  try {
    payment =
      await verifyPesapalPayment(
        env,
        order
      );
  } catch (error) {
    console.error(
      "PesaPal verification error:",
      error
    );

    await updateOrder(env, order.tracking_id, {
      error_message: errorMessage(error),
    });

    throw error;
  }

  console.log(
    "PesaPal transaction status:",
    JSON.stringify(payment)
  );

  // ----------------------------------------------------------
  // PAYMENT COMPLETED
  // ----------------------------------------------------------

  if (isPesapalCompleted(payment)) {
    const paidAmount = number(
      payment?.amount,
      0
    );

    const expectedAmount = number(
      order.customer_amount,
      0
    );

    // Verify amount when PesaPal gives us one.
    if (
      paidAmount > 0 &&
      expectedAmount > 0 &&
      Math.abs(
        paidAmount - expectedAmount
      ) > 0.01
    ) {
      const message =
        `Payment amount mismatch. Expected KES ${expectedAmount}, ` +
        `received KES ${paidAmount}.`;

      await updateOrder(env, order.tracking_id, {
        payment_status: "PAYMENT_MISMATCH",
        order_status: "Payment Error",
        error_message: message,
        supplier_response:
          JSON.stringify(payment),
      });

      throw new Error(message);
    }

    // --------------------------------------------------------
    // ATOMIC CLAIM
    // --------------------------------------------------------
    //
    // Only ONE Worker invocation can move the order into
    // "Submitting".
    //
    // The others will get changes=0 and must stop.
    //

    const claimed =
      await claimSupplierSubmission(
        env,
        order.tracking_id
      );

    if (!claimed) {
      const latest =
        await getOrderByTrackingId(
          env,
          order.tracking_id
        );

      if (
        latest?.supplier_order_id
      ) {
        return {
          success: true,
          paid: true,
          submitted: true,
          supplier_order_id:
            latest.supplier_order_id,
          order_status:
            latest.order_status,
        };
      }

      return {
        success: true,
        paid: true,
        submitting: true,
        tracking_id:
          order.tracking_id,
        order_status:
          latest?.order_status ||
          "Submitting",
      };
    }

    // Reload after acquiring the lock.
    order =
      await getOrderByTrackingId(
        env,
        order.tracking_id
      );

    if (!order) {
      throw new Error(
        "Order disappeared after submission lock."
      );
    }

    // --------------------------------------------------------
    // SEND ORDER TO DENZGAINS
    // --------------------------------------------------------

    let supplierResponse;

    try {
      supplierResponse =
        await addDenzGainsOrder(
          env,
          order.service_id,
          order.link,
          order.quantity
        );
    } catch (error) {
      const message =
        errorMessage(error);

      console.error(
        "DenzGains order submission failed:",
        message
      );

      await updateOrder(
        env,
        order.tracking_id,
        {
          payment_status: "COMPLETED",
          order_status: "Supplier Error",
          error_message: message,
          supplier_response: JSON.stringify({
            error: message,
          }),
        }
      );

      throw error;
    }

    console.log(
      "DenzGains add response:",
      JSON.stringify(
        supplierResponse
      )
    );

    const supplierOrderId =
      extractSupplierOrderId(
        supplierResponse
      );

    if (!supplierOrderId) {
      const message =
        "DenzGains accepted the request but did not return a supplier order ID.";

      await updateOrder(
        env,
        order.tracking_id,
        {
          payment_status: "COMPLETED",
          order_status: "Supplier Error",
          error_message: message,
          supplier_response:
            JSON.stringify(
              supplierResponse
            ),
        }
      );

      throw new Error(message);
    }

    // --------------------------------------------------------
    // SAVE SUPPLIER ORDER
    // --------------------------------------------------------

    await updateOrder(
      env,
      order.tracking_id,
      {
        payment_status: "COMPLETED",
        order_status: "Processing",
        supplier_order_id:
          supplierOrderId,
        supplier_response:
          JSON.stringify(
            supplierResponse
          ),
        error_message: null,
      }
    );

    return {
      success: true,
      paid: true,
      submitted: true,
      supplier_order_id:
        supplierOrderId,
      order_status: "Processing",
    };
  }

  // ----------------------------------------------------------
  // PAYMENT FAILED
  // ----------------------------------------------------------

  if (isPesapalFailed(payment)) {
    await updateOrder(env, order.tracking_id, {
      payment_status: "FAILED",
      order_status: "Payment Failed",
      supplier_response:
        JSON.stringify(payment),
      error_message:
        text(payment?.description) ||
        "PesaPal payment failed.",
    });

    return {
      success: false,
      paid: false,
      failed: true,
      order_status: "Payment Failed",
      payment_status: "FAILED",
    };
  }

  // ----------------------------------------------------------
  // PAYMENT REVERSED
  // ----------------------------------------------------------

  if (isPesapalReversed(payment)) {
    await updateOrder(env, order.tracking_id, {
      payment_status: "REVERSED",
      order_status: "Payment Reversed",
      supplier_response:
        JSON.stringify(payment),
      error_message:
        text(payment?.description) ||
        "PesaPal payment was reversed.",
    });

    return {
      success: false,
      paid: false,
      reversed: true,
      order_status: "Payment Reversed",
      payment_status: "REVERSED",
    };
  }

  // ----------------------------------------------------------
  // PAYMENT STILL PENDING
  // ----------------------------------------------------------

  await updateOrder(env, order.tracking_id, {
    payment_status: "PENDING",
    order_status: "Payment Pending",
    supplier_response:
      JSON.stringify(payment),
  });

  return {
    success: true,
    paid: false,
    pending: true,
    order_status: "Payment Pending",
    payment_status: "PENDING",
  };
}

// ------------------------------------------------------------
// GET SERVICES
// ------------------------------------------------------------

async function handleServices(
  env,
  request
) {
  try {
    const services =
      await getDenzGainsServices(env);

    const normalized =
      services
        .map(normalizeSupplierService)
        .filter(
          (service) =>
            service.service_id &&
            service.name
        );

    return corsJson(
      {
        success: true,
        services: normalized.map(
          (service) => ({
            service_id:
              service.service_id,

            name:
              service.name,

            category:
              service.category,

            type:
              service.type,

            rate:
              service.rate,

            // Both names are returned so the
            // current React frontend works.
            min:
              service.min,

            max:
              service.max,

            min_quantity:
              service.min_quantity,

            max_quantity:
              service.max_quantity,

            refill:
              service.refill,

            cancel:
              service.cancel,
          })
        ),
      },
      200,
      request.headers.get("Origin") || "*"
    );
  } catch (error) {
    console.error(
      "Services error:",
      error
    );

    return corsJson(
      {
        success: false,
        error: errorMessage(error),
      },
      500,
      request.headers.get("Origin") || "*"
    );
  }
}

// ------------------------------------------------------------
// CREATE ORDER + CREATE PESAPAL PAYMENT
// ------------------------------------------------------------

async function handleOrderPayment(
  env,
  request
) {
  let body;

  try {
    body = await request.json();
  } catch {
    return corsJson(
      {
        success: false,
        error: "Invalid JSON request.",
      },
      400
    );
  }

  const serviceId = text(
    body?.service_id
  );

  const serviceName = text(
    body?.service_name
  );

  const link = text(body?.link);

  const phone = normalizePhone(
    body?.phone
  );

  const quantity = Math.floor(
    number(body?.quantity, 0)
  );

  if (!serviceId) {
    return corsJson(
      {
        success: false,
        error: "Service ID is required.",
      },
      400
    );
  }

  if (!link) {
    return corsJson(
      {
        success: false,
        error: "Service link is required.",
      },
      400
    );
  }

  if (!quantity || quantity <= 0) {
    return corsJson(
      {
        success: false,
        error: "A valid quantity is required.",
      },
      400
    );
  }

  if (!isValidPhone(phone)) {
    return corsJson(
      {
        success: false,
        error:
          "Enter a valid Kenyan phone number.",
      },
      400
    );
  }

  // Always get the LIVE supplier service.
  // Never trust the frontend's rate.
  let supplierService;

  try {
    supplierService =
      await findSupplierService(
        env,
        serviceId
      );
  } catch (error) {
    return corsJson(
      {
        success: false,
        error: errorMessage(error),
      },
      400
    );
  }

  const min =
    number(
      supplierService.min_quantity,
      1
    );

  const max =
    number(
      supplierService.max_quantity,
      1000000
    );

  if (
    quantity < min ||
    quantity > max
  ) {
    return corsJson(
      {
        success: false,
        error:
          `Quantity must be between ${min} and ${max}.`,
        min_quantity: min,
        max_quantity: max,
      },
      400
    );
  }

  const supplierRate =
    number(
      supplierService.rate,
      0
    );

  if (
    !Number.isFinite(supplierRate) ||
    supplierRate <= 0
  ) {
    return corsJson(
      {
        success: false,
        error:
          "Supplier returned an invalid service rate.",
      },
      400
    );
  }

  // HUPPY CUBE pricing:
  // CUSTOMER RATE = SUPPLIER RATE × 2
  const customerRate =
    supplierRate * 2;

  // SMM supplier rates are normally per 1000.
  const supplierAmount =
    roundMoney(
      (supplierRate *
        quantity) /
        1000
    );

  const customerAmount =
    roundMoney(
      (customerRate *
        quantity) /
        1000
    );

  if (
    !customerAmount ||
    customerAmount <= 0
  ) {
    return corsJson(
      {
        success: false,
        error:
          "Calculated payment amount is invalid.",
      },
      400
    );
  }

  await ensureOrdersTable(env);
  await backfillOrderTimestamps(env);

  const trackingId =
    randomId("HUPPY");

  // PesaPal merchant reference must be <= 50 characters
  // and contain only supported characters.
  const merchantReference =
    trackingId.slice(0, 48);

  await env.DB.prepare(`
    INSERT INTO orders (
      tracking_id,
      service_id,
      service_name,
      link,
      quantity,
      phone,

      supplier_rate,
      customer_rate,
      supplier_amount,
      customer_amount,

      payment_status,
      order_status,

      pesapal_merchant_reference,

      created_at,
      updated_at
    )
    VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      'PENDING',
      'Pending',
      ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `)
    .bind(
      trackingId,
      supplierService.service_id,
      serviceName ||
        supplierService.name,
      link,
      quantity,
      phone,

      supplierRate,
      customerRate,
      supplierAmount,
      customerAmount,

      merchantReference
    )
    .run();

  const origin =
    getEnvOrigin(env, request);

  const callbackUrl =
    `${origin}/api/payment-callback?tracking_id=${encodeURIComponent(
      trackingId
    )}`;

  const cancellationUrl =
    `${origin}/?tracking_id=${encodeURIComponent(
      trackingId
    )}&payment=cancelled`;

  let pesapal;

  try {
    pesapal =
      await submitPesapalOrder(
        env,
        {
          merchantReference,
          amount: customerAmount,
          description:
            `HUPPY CUBE - ${(
              serviceName ||
              supplierService.name
            ).slice(0, 70)}`,
          callbackUrl,
          cancellationUrl,
          phone,
          firstName: "HUPPY",
          lastName: "Customer",
        }
      );
  } catch (error) {
    const message =
      errorMessage(error);

    console.error(
      "PesaPal order creation failed:",
      message
    );

    await updateOrder(
      env,
      trackingId,
      {
        payment_status:
          "PAYMENT_SETUP_FAILED",
        order_status:
          "Payment Setup Error",
        error_message: message,
      }
    );

    return corsJson(
      {
        success: false,
        tracking_id: trackingId,
        error:
          "Could not create the PesaPal payment.",
        details: message,
      },
      500
    );
  }

  const pesapalTrackingId = text(
    pesapal?.order_tracking_id ||
    pesapal?.orderTrackingId
  );

  const redirectUrl = text(
    pesapal?.redirect_url ||
    pesapal?.redirectUrl
  );

  const returnedMerchantReference =
    text(
      pesapal?.merchant_reference ||
      pesapal?.merchantReference
    );

  if (!pesapalTrackingId) {
    const message =
      `PesaPal did not return an order tracking ID: ${JSON.stringify(
        pesapal
      ).slice(0, 1000)}`;

    await updateOrder(
      env,
      trackingId,
      {
        payment_status:
          "PAYMENT_SETUP_FAILED",
        order_status:
          "Payment Setup Error",
        error_message: message,
        supplier_response:
          JSON.stringify(pesapal),
      }
    );

    return corsJson(
      {
        success: false,
        tracking_id: trackingId,
        error:
          "PesaPal did not return a tracking ID.",
        details: message,
      },
      500
    );
  }

  await updateOrder(
    env,
    trackingId,
    {
      pesapal_order_tracking_id:
        pesapalTrackingId,

      pesapal_merchant_reference:
        returnedMerchantReference ||
        merchantReference,

      payment_status:
        "PENDING",

      order_status:
        "Payment Pending",

      error_message: null,
    }
  );

  return corsJson(
    {
      success: true,

      tracking_id:
        trackingId,

      pesapal_order_tracking_id:
        pesapalTrackingId,

      merchant_reference:
        returnedMerchantReference ||
        merchantReference,

      redirect_url:
        redirectUrl,

      amount:
        customerAmount,

      currency:
        "KES",

      service_id:
        supplierService.service_id,

      service_name:
        supplierService.name,

      quantity,

      min_quantity: min,
      max_quantity: max,
    },
    200,
    request.headers.get("Origin") || "*"
  );
}

// ------------------------------------------------------------
// ORDER STATUS
// ------------------------------------------------------------

async function handleOrderStatus(
  env,
  request
) {
  const url =
    new URL(request.url);

  const trackingId =
    text(
      url.searchParams.get(
        "tracking_id"
      )
    );

  if (!trackingId) {
    return corsJson(
      {
        success: false,
        error:
          "tracking_id is required.",
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
    return corsJson(
      {
        success: false,
        error: "Order not found.",
      },
      404
    );
  }

  // If already submitted, optionally synchronize
  // the supplier status.
  if (order.supplier_order_id) {
    try {
      const supplierStatus =
        await getDenzGainsOrderStatus(
          env,
          order.supplier_order_id
        );

      const supplierStatusText =
        text(
          supplierStatus?.status
        );

      let localStatus =
        order.order_status ||
        "Processing";

      const normalized =
        supplierStatusText.toLowerCase();

      if (
        normalized.includes("completed")
      ) {
        localStatus = "Completed";
      } else if (
        normalized.includes("partial")
      ) {
        localStatus = "Partial";
      } else if (
        normalized.includes("cancel")
      ) {
        localStatus = "Cancelled";
      } else if (
        normalized.includes("processing")
      ) {
        localStatus = "Processing";
      } else if (
        normalized.includes("pending")
      ) {
        localStatus = "Processing";
      }

      await updateOrder(
        env,
        trackingId,
        {
          order_status:
            localStatus,
          supplier_response:
            JSON.stringify(
              supplierStatus
            ),
          error_message: null,
        }
      );
    } catch (error) {
      console.error(
        "Supplier status sync failed:",
        errorMessage(error)
      );
    }
  }

  let latest =
    await getOrderByTrackingId(
      env,
      trackingId
    );

  // ----------------------------------------------------------
  // If PesaPal payment has been created but the order has not
  // yet been submitted, verify payment.
  // ----------------------------------------------------------

  if (
    latest?.pesapal_order_tracking_id &&
    !latest?.supplier_order_id &&
    String(
      latest?.order_status || ""
    ).toLowerCase() !== "submitting"
  ) {
    try {
      await processPaidOrder(
        env,
        latest
      );
    } catch (error) {
      console.error(
        "Order status payment processing:",
        errorMessage(error)
      );
    }
  }

  latest =
    await getOrderByTrackingId(
      env,
      trackingId
    );

  return corsJson(
    {
      success: true,

      order: {
        tracking_id:
          latest.tracking_id,

        service_id:
          latest.service_id,

        service_name:
          latest.service_name,

        quantity:
          latest.quantity,

        link:
          latest.link,

        phone:
          latest.phone,

        customer_amount:
          latest.customer_amount,

        currency:
          "KES",

        payment_status:
          latest.payment_status,

        order_status:
          latest.order_status,

        pesapal_order_tracking_id:
          latest.pesapal_order_tracking_id,

        supplier_order_id:
          latest.supplier_order_id,

        error_message:
          latest.error_message,

        created_at:
          latest.created_at,

        updated_at:
          latest.updated_at,
      },
    },
    200,
    request.headers.get("Origin") || "*"
  );
}

// ------------------------------------------------------------
// PESAPAL CALLBACK
// ------------------------------------------------------------

async function handlePaymentCallback(
  env,
  request
) {
  const notification =
    await readPesapalNotification(
      request
    );

  let order = null;

  // First use our HUPPY tracking ID.
  if (notification.merchantReference) {
    order =
      await getOrderByTrackingId(
        env,
        notification.merchantReference
      );
  }

  // Then try merchant reference.
  if (!order && notification.merchantReference) {
    order =
      await getOrderByMerchantReference(
        env,
        notification.merchantReference
      );
  }

  // Finally try PesaPal tracking ID.
  if (!order && notification.orderTrackingId) {
    order =
      await getOrderByPesapalTrackingId(
        env,
        notification.orderTrackingId
      );
  }

  if (
    order &&
    notification.orderTrackingId
  ) {
    await updateOrder(
      env,
      order.tracking_id,
      {
        pesapal_order_tracking_id:
          notification.orderTrackingId,

        pesapal_merchant_reference:
          notification.merchantReference ||
          order.pesapal_merchant_reference,
      }
    );

    order =
      await getOrderByTrackingId(
        env,
        order.tracking_id
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
        "Callback payment processing:",
        errorMessage(error)
      );
    }
  }

  const redirectTrackingId =
    order?.tracking_id ||
    notification.merchantReference ||
    "";

  const origin =
    getEnvOrigin(env, request);

  const redirectUrl =
    `${origin}/?tracking_id=${encodeURIComponent(
      redirectTrackingId
    )}`;

  return Response.redirect(
    redirectUrl,
    302
  );
}

// ------------------------------------------------------------
// PESAPAL IPN
// ------------------------------------------------------------

async function handlePesapalIpn(
  env,
  request
) {
  const notification =
    await readPesapalNotification(
      request
    );

  console.log(
    "PesaPal IPN:",
    JSON.stringify({
      method: request.method,
      notification,
    })
  );

  if (
    !notification.orderTrackingId &&
    !notification.merchantReference
  ) {
    return json(
      {
        orderNotificationType:
          notification.notificationType ||
          "IPNCHANGE",

        orderTrackingId:
          notification.orderTrackingId ||
          "",

        orderMerchantReference:
          notification.merchantReference ||
          "",

        status: 500,

        message:
          "Missing PesaPal notification identifiers.",
      },
      400
    );
  }

  let order = null;

  if (notification.merchantReference) {
    order =
      await getOrderByMerchantReference(
        env,
        notification.merchantReference
      );
  }

  if (
    !order &&
    notification.orderTrackingId
  ) {
    order =
      await getOrderByPesapalTrackingId(
        env,
        notification.orderTrackingId
      );
  }

  if (!order) {
    console.error(
      "PesaPal IPN: order not found",
      notification
    );

    // Acknowledge receipt so PesaPal does not keep
    // retrying an unknown order forever.
    return json({
      orderNotificationType:
        notification.notificationType ||
        "IPNCHANGE",

      orderTrackingId:
        notification.orderTrackingId,

      orderMerchantReference:
        notification.merchantReference,

      status: 200,

      message:
        "Notification received; order not found.",
    });
  }

  if (notification.orderTrackingId) {
    await updateOrder(
      env,
      order.tracking_id,
      {
        pesapal_order_tracking_id:
          notification.orderTrackingId,

        pesapal_merchant_reference:
          notification.merchantReference ||
          order.pesapal_merchant_reference,
      }
    );
  }

  try {
    const latest =
      await getOrderByTrackingId(
        env,
        order.tracking_id
      );

    await processPaidOrder(
      env,
      latest
    );

    return json({
      orderNotificationType:
        notification.notificationType ||
        "IPNCHANGE",

      orderTrackingId:
        notification.orderTrackingId,

      orderMerchantReference:
        notification.merchantReference,

      status: 200,
    });
  } catch (error) {
    console.error(
      "PesaPal IPN processing failed:",
      errorMessage(error)
    );

    // The IPN itself was received, but our internal
    // processing failed. We still return a useful response.
    //
    // A later browser poll/callback can retry the order
    // because "Supplier Error" is NOT "Submitting".
    return json({
      orderNotificationType:
        notification.notificationType ||
        "IPNCHANGE",

      orderTrackingId:
        notification.orderTrackingId,

      orderMerchantReference:
        notification.merchantReference,

      status: 200,

      message:
        "IPN received but order processing failed.",
    });
  }
}

// ------------------------------------------------------------
// HEALTH CHECK
// ------------------------------------------------------------

async function handleHealth(
  env,
  request
) {
  let database = false;

  try {
    await env.DB.prepare(
      "SELECT 1 AS ok"
    ).first();

    database = true;
  } catch (error) {
    console.error(
      "Health D1 error:",
      error
    );
  }

  return corsJson(
    {
      success: true,
      online: true,
      service: "HUPPY CUBE",
      database,
      timestamp:
        new Date().toISOString(),
    },
    200,
    request.headers.get("Origin") || "*"
  );
}

// ------------------------------------------------------------
// DENZGAINS TEST
// ------------------------------------------------------------

async function handleDenzGainsTest(
  env,
  request
) {
  const url =
    new URL(request.url);

  const secret =
    text(
      url.searchParams.get(
        "secret"
      )
    );

  const expectedSecret =
    text(env.TEST_ORDER_SECRET);

  if (
    !expectedSecret ||
    secret !== expectedSecret
  ) {
    return json(
      {
        success: false,
        error: "Unauthorized.",
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
      denzgains: "connected",
      service_count:
        services.length,
      sample_services:
        services
          .slice(0, 5)
          .map(
            normalizeSupplierService
          ),
    });
  } catch (error) {
    return json(
      {
        success: false,
        denzgains: "error",
        error:
          errorMessage(error),
      },
      500
    );
  }
}

// ------------------------------------------------------------
// CURRENCY TEST
// ------------------------------------------------------------

async function handleCurrencyTest(
  env,
  request
) {
  return json({
    success: true,
    currency: "KES",
    customer_markup: "2x supplier rate",
    example: {
      supplier_rate_per_1000: 140,
      customer_rate_per_1000: 280,
    },
  });
}

// ------------------------------------------------------------
// DATABASE TEST
// ------------------------------------------------------------

async function handleDatabaseTest(
  env,
  request
) {
  const url =
    new URL(request.url);

  const secret =
    text(
      url.searchParams.get(
        "secret"
      )
    );

  const expectedSecret =
    text(env.TEST_ORDER_SECRET);

  if (
    !expectedSecret ||
    secret !== expectedSecret
  ) {
    return json(
      {
        success: false,
        error: "Unauthorized.",
      },
      401
    );
  }

  try {
    await ensureOrdersTable(env);
    await backfillOrderTimestamps(env);

    const result =
      await env.DB.prepare(`
        SELECT
          COUNT(*) AS total_orders
        FROM orders
      `).first();

    return json({
      success: true,
      database: "connected",
      total_orders:
        Number(
          result?.total_orders || 0
        ),
    });
  } catch (error) {
    return json(
      {
        success: false,
        database: "error",
        error:
          errorMessage(error),
      },
      500
    );
  }
}

// ------------------------------------------------------------
// ORDER LOOKUP FOR DEBUGGING
// ------------------------------------------------------------

async function handleDebugOrder(
  env,
  request
) {
  const url =
    new URL(request.url);

  const secret =
    text(
      url.searchParams.get(
        "secret"
      )
    );

  const trackingId =
    text(
      url.searchParams.get(
        "tracking_id"
      )
    );

  const expectedSecret =
    text(env.TEST_ORDER_SECRET);

  if (
    !expectedSecret ||
    secret !== expectedSecret
  ) {
    return json(
      {
        success: false,
        error: "Unauthorized.",
      },
      401
    );
  }

  if (!trackingId) {
    return json(
      {
        success: false,
        error:
          "tracking_id is required.",
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
        success: false,
        error: "Order not found.",
      },
      404
    );
  }

  return json({
    success: true,
    order,
  });
}

// ------------------------------------------------------------
// ADMIN ORDER LIST
// ------------------------------------------------------------

async function handleAdminOrders(
  env,
  request
) {
  const url =
    new URL(request.url);

  const secret =
    text(
      url.searchParams.get(
        "secret"
      )
    );

  const expectedSecret =
    text(env.TEST_ORDER_SECRET);

  if (
    !expectedSecret ||
    secret !== expectedSecret
  ) {
    return json(
      {
        success: false,
        error: "Unauthorized.",
      },
      401
    );
  }

  const limit = Math.min(
    Math.max(
      number(
        url.searchParams.get(
          "limit"
        ),
        50
      ),
      1
    ),
    200
  );

  const result =
    await env.DB.prepare(`
      SELECT *
      FROM orders
      ORDER BY id DESC
      LIMIT ?
    `)
      .bind(limit)
      .all();

  return json({
    success: true,
    orders:
      result.results || [],
  });
}

// ------------------------------------------------------------
// RETRY SUPPLIER ORDER
// ------------------------------------------------------------
//
// This is useful if a payment completed but DenzGains
// temporarily failed.
//
// It requires TEST_ORDER_SECRET.
//

async function handleRetryOrder(
  env,
  request
) {
  const url =
    new URL(request.url);

  const secret =
    text(
      url.searchParams.get(
        "secret"
      )
    );

  const trackingId =
    text(
      url.searchParams.get(
        "tracking_id"
      )
    );

  const expectedSecret =
    text(env.TEST_ORDER_SECRET);

  if (
    !expectedSecret ||
    secret !== expectedSecret
  ) {
    return json(
      {
        success: false,
        error: "Unauthorized.",
      },
      401
    );
  }

  if (!trackingId) {
    return json(
      {
        success: false,
        error:
          "tracking_id is required.",
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
        success: false,
        error: "Order not found.",
      },
      404
    );
  }

  if (order.supplier_order_id) {
    return json({
      success: true,
      message:
        "Supplier order already exists.",
      supplier_order_id:
        order.supplier_order_id,
    });
  }

  // Reset only the local supplier error.
  await updateOrder(
    env,
    trackingId,
    {
      order_status:
        "Payment Pending",
      error_message: null,
    }
  );

  order =
    await getOrderByTrackingId(
      env,
      trackingId
    );

  try {
    const result =
      await processPaidOrder(
        env,
        order
      );

    return json({
      success: true,
      result,
    });
  } catch (error) {
    return json(
      {
        success: false,
        error:
          errorMessage(error),
      },
      500
    );
  }
}

// ------------------------------------------------------------
// ROOT / API INFO
// ------------------------------------------------------------

async function handleApiInfo() {
  return json({
    success: true,
    name: "HUPPY CUBE API",
    version: "1.0.0",
    currency: "KES",

    routes: {
      health:
        "/api/health",

      services:
        "/api/services",

      order_payment:
        "/api/order-payment",

      order_status:
        "/api/order-status?tracking_id=HUPPY-...",

      pesapal_callback:
        "/api/payment-callback",

      pesapal_ipn:
        "/api/pesapal-ipn",
    },
  });
}

// ------------------------------------------------------------
// MAIN WORKER
// ------------------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    const url =
      new URL(request.url);

    const method =
      request.method.toUpperCase();

    const origin =
      request.headers.get(
        "Origin"
      ) || "*";

    // --------------------------------------------------------
    // CORS PREFLIGHT
    // --------------------------------------------------------

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers:
          corsHeaders(origin),
      });
    }

    try {
      // Make sure the D1 table exists.
      await ensureOrdersTable(env);

      // ------------------------------------------------------
      // API ROUTES
      // ------------------------------------------------------

      if (
        url.pathname === "/api/health" &&
        method === "GET"
      ) {
        return await handleHealth(
          env,
          request
        );
      }

      if (
        url.pathname === "/api/services" &&
        method === "GET"
      ) {
        return await handleServices(
          env,
          request
        );
      }

      if (
        url.pathname === "/api/order-payment" &&
        method === "POST"
      ) {
        return await handleOrderPayment(
          env,
          request
        );
      }

      if (
        url.pathname === "/api/order-status" &&
        method === "GET"
      ) {
        return await handleOrderStatus(
          env,
          request
        );
      }

      if (
        url.pathname === "/api/payment-callback"
      ) {
        return await handlePaymentCallback(
          env,
          request
        );
      }

      if (
        url.pathname === "/api/pesapal-ipn"
      ) {
        return await handlePesapalIpn(
          env,
          request
        );
      }

      if (
        url.pathname === "/api/denzgains-test" &&
        method === "GET"
      ) {
        return await handleDenzGainsTest(
          env,
          request
        );
      }

      if (
        url.pathname === "/api/currency-test" &&
        method === "GET"
      ) {
        return await handleCurrencyTest(
          env,
          request
        );
      }

      if (
        url.pathname === "/api/database-test" &&
        method === "GET"
      ) {
        return await handleDatabaseTest(
          env,
          request
        );
      }

      if (
        url.pathname === "/api/debug-order" &&
        method === "GET"
      ) {
        return await handleDebugOrder(
          env,
          request
        );
      }

      if (
        url.pathname === "/api/admin-orders" &&
        method === "GET"
      ) {
        return await handleAdminOrders(
          env,
          request
        );
      }

      if (
        url.pathname === "/api/retry-order" &&
        method === "GET"
      ) {
        return await handleRetryOrder(
          env,
          request
        );
      }

      if (
        url.pathname === "/api" &&
        method === "GET"
      ) {
        return await handleApiInfo();
      }

      // ------------------------------------------------------
      // FRONTEND ASSETS
      // ------------------------------------------------------

      if (env.ASSETS) {
        return await env.ASSETS.fetch(
          request
        );
      }

      return json(
        {
          success: false,
          error: "Not found.",
        },
        404
      );
    } catch (error) {
      console.error(
        "Worker unhandled error:",
        error
      );

      // API errors should be JSON.
      if (
        url.pathname.startsWith(
          "/api/"
        )
      ) {
        return corsJson(
          {
            success: false,
            error:
              errorMessage(error),
          },
          500,
          origin
        );
      }

      // Frontend asset fallback.
      if (env.ASSETS) {
        try {
          return await env.ASSETS.fetch(
            request
          );
        } catch {
          // continue
        }
      }

      return new Response(
        "HUPPY CUBE server error.",
        {
          status: 500,
          headers: {
            "Content-Type":
              "text/plain; charset=utf-8",
          },
        }
      );
    }
  },
};
