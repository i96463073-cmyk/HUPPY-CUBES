const PESAPAL_BASE = "https://pay.pesapal.com/v3";
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

/*
  YOUR PRICING RULE:

  Supplier cost = 30
  Your profit   = 30
  Customer pays = 60

  Therefore:

  customer price = supplier price × 2
*/

function customerPrice(supplierRate) {
  return Number(supplierRate || 0) * 2;
}

/* =========================================================
   CURRENCY
========================================================= */

/*
  Phone country-code detection.

  The storefront can send the customer's phone number.
  We use the country code to select the default currency.

  If no country can be detected, KES is used.
*/

const COUNTRY_CURRENCIES = [
  { prefix: "254", country: "KE", currency: "KES", symbol: "KSh" },
  { prefix: "255", country: "TZ", currency: "TZS", symbol: "TSh" },
  { prefix: "256", country: "UG", currency: "UGX", symbol: "USh" },
  { prefix: "250", country: "RW", currency: "RWF", symbol: "FRw" },
  { prefix: "257", country: "BI", currency: "BIF", symbol: "FBu" },
  { prefix: "211", country: "SS", currency: "SSP", symbol: "£" },
  { prefix: "252", country: "SO", currency: "SOS", symbol: "S" },
  { prefix: "255", country: "TZ", currency: "TZS", symbol: "TSh" },
  { prefix: "260", country: "ZM", currency: "ZMW", symbol: "ZK" },
  { prefix: "263", country: "ZW", currency: "ZWL", symbol: "Z$" },
  { prefix: "265", country: "MW", currency: "MWK", symbol: "MK" },
  { prefix: "258", country: "MZ", currency: "MZN", symbol: "MT" },
  { prefix: "264", country: "NA", currency: "NAD", symbol: "N$" },
  { prefix: "267", country: "BW", currency: "BWP", symbol: "P" },
  { prefix: "266", country: "LS", currency: "LSL", symbol: "L" },
  { prefix: "268", country: "SZ", currency: "SZL", symbol: "E" },
  { prefix: "27", country: "ZA", currency: "ZAR", symbol: "R" },

  { prefix: "234", country: "NG", currency: "NGN", symbol: "₦" },
  { prefix: "233", country: "GH", currency: "GHS", symbol: "GH₵" },
  { prefix: "225", country: "CI", currency: "XOF", symbol: "CFA" },
  { prefix: "221", country: "SN", currency: "XOF", symbol: "CFA" },
  { prefix: "223", country: "ML", currency: "XOF", symbol: "CFA" },
  { prefix: "226", country: "BF", currency: "XOF", symbol: "CFA" },
  { prefix: "227", country: "NE", currency: "XOF", symbol: "CFA" },
  { prefix: "228", country: "TG", currency: "XOF", symbol: "CFA" },
  { prefix: "229", country: "BJ", currency: "XOF", symbol: "CFA" },
  { prefix: "237", country: "CM", currency: "XAF", symbol: "FCFA" },
  { prefix: "243", country: "CD", currency: "CDF", symbol: "FC" },
  { prefix: "212", country: "MA", currency: "MAD", symbol: "DH" },
  { prefix: "20", country: "EG", currency: "EGP", symbol: "E£" },
  { prefix: "249", country: "SD", currency: "SDG", symbol: "ج.س" },
  { prefix: "251", country: "ET", currency: "ETB", symbol: "Br" },

  { prefix: "1", country: "US", currency: "USD", symbol: "$" },
  { prefix: "44", country: "GB", currency: "GBP", symbol: "£" },
  { prefix: "33", country: "FR", currency: "EUR", symbol: "€" },
  { prefix: "49", country: "DE", currency: "EUR", symbol: "€" },
  { prefix: "39", country: "IT", currency: "EUR", symbol: "€" },
  { prefix: "34", country: "ES", currency: "EUR", symbol: "€" },
  { prefix: "31", country: "NL", currency: "EUR", symbol: "€" },
  { prefix: "32", country: "BE", currency: "EUR", symbol: "€" },
  { prefix: "351", country: "PT", currency: "EUR", symbol: "€" },
  { prefix: "353", country: "IE", currency: "EUR", symbol: "€" },
  { prefix: "358", country: "FI", currency: "EUR", symbol: "€" },
  { prefix: "30", country: "GR", currency: "EUR", symbol: "€" },

  { prefix: "91", country: "IN", currency: "INR", symbol: "₹" },
  { prefix: "92", country: "PK", currency: "PKR", symbol: "₨" },
  { prefix: "880", country: "BD", currency: "BDT", symbol: "৳" },
  { prefix: "94", country: "LK", currency: "LKR", symbol: "Rs" },
  { prefix: "971", country: "AE", currency: "AED", symbol: "د.إ" },
  { prefix: "966", country: "SA", currency: "SAR", symbol: "﷼" },
  { prefix: "974", country: "QA", currency: "QAR", symbol: "﷼" },
  { prefix: "965", country: "KW", currency: "KWD", symbol: "د.ك" },
  { prefix: "972", country: "IL", currency: "ILS", symbol: "₪" },
  { prefix: "90", country: "TR", currency: "TRY", symbol: "₺" },
  { prefix: "86", country: "CN", currency: "CNY", symbol: "¥" },
  { prefix: "81", country: "JP", currency: "JPY", symbol: "¥" },
  { prefix: "82", country: "KR", currency: "KRW", symbol: "₩" },
  { prefix: "62", country: "ID", currency: "IDR", symbol: "Rp" },
  { prefix: "60", country: "MY", currency: "MYR", symbol: "RM" },
  { prefix: "65", country: "SG", currency: "SGD", symbol: "S$" },
  { prefix: "66", country: "TH", currency: "THB", symbol: "฿" },

  { prefix: "61", country: "AU", currency: "AUD", symbol: "A$" },
  { prefix: "64", country: "NZ", currency: "NZD", symbol: "NZ$" },
  { prefix: "1", country: "CA", currency: "CAD", symbol: "C$" },

  { prefix: "7", country: "RU", currency: "RUB", symbol: "₽" },
  { prefix: "55", country: "BR", currency: "BRL", symbol: "R$" },
  { prefix: "52", country: "MX", currency: "MXN", symbol: "MX$" },
  { prefix: "54", country: "AR", currency: "ARS", symbol: "$" },
  { prefix: "56", country: "CL", currency: "CLP", symbol: "$" },
  { prefix: "57", country: "CO", currency: "COP", symbol: "$" }
];

function getCurrencyFromPhone(phone) {
  const normalized = normalizePhone(phone);

  for (const item of COUNTRY_CURRENCIES) {
    if (normalized.startsWith(item.prefix)) {
      return item;
    }
  }

  return {
    prefix: "254",
    country: "KE",
    currency: "KES",
    symbol: "KSh"
  };
}

/*
  Approximate USD exchange rates.

  IMPORTANT:
  SMM Africa catalog rates are treated as the supplier's
  base rate. For your current catalog, we use USD as the
  supplier base currency.

  KES is kept around 130 per USD by default.

  You can override USD_TO_KES through a Cloudflare variable
  later without changing this code.
*/

const DEFAULT_FX = {
  USD: 1,
  KES: 130,
  TZS: 2500,
  UGX: 3700,
  RWF: 1450,
  BIF: 2900,
  SSP: 130,
  SOS: 570,
  ZMW: 23,
  ZWL: 25,
  MWK: 1750,
  MZN: 64,
  NAD: 17,
  BWP: 13.5,
  LSL: 17,
  SZL: 17,
  ZAR: 17,

  NGN: 1500,
  GHS: 12.5,
  XOF: 600,
  XAF: 600,
  CDF: 2800,
  MAD: 10,
  EGP: 48,
  SDG: 600,
  ETB: 145,

  GBP: 0.75,
  EUR: 0.86,
  INR: 88,
  PKR: 280,
  BDT: 122,
  LKR: 310,
  AED: 3.67,
  SAR: 3.75,
  QAR: 3.64,
  KWD: 0.31,
  ILS: 3.3,
  TRY: 43,

  CNY: 7.1,
  JPY: 150,
  KRW: 1450,
  IDR: 16500,
  MYR: 4.2,
  SGD: 1.28,
  THB: 32,

  AUD: 1.5,
  NZD: 1.75,
  CAD: 1.38,

  RUB: 80,
  BRL: 5.3,
  MXN: 18.5,
  ARS: 1450,
  CLP: 950,
  COP: 3900
};

function getFxRate(currency, env) {
  const code = String(currency || "KES").toUpperCase();

  if (code === "KES" && env.USD_TO_KES) {
    const custom = Number(env.USD_TO_KES);

    if (Number.isFinite(custom) && custom > 0) {
      return custom;
    }
  }

  return Number(DEFAULT_FX[code] || 1);
}

function usdToCurrency(amountUsd, currency, env) {
  const rate = getFxRate(currency, env);
  return Number(amountUsd || 0) * rate;
}

function roundMoney(value, currency) {
  const code = String(currency || "").toUpperCase();

  /*
    Most currencies can safely display 2 decimals.
    Zero-decimal currencies are rounded to whole units.
  */

  const zeroDecimal = new Set([
    "JPY",
    "KRW",
    "UGX",
    "TZS",
    "RWF",
    "BIF",
    "XOF",
    "XAF",
    "VND",
    "CLP",
    "COP"
  ]);

  if (zeroDecimal.has(code)) {
    return Math.round(Number(value || 0));
  }

  return Math.round(
    Number(value || 0) * 100
  ) / 100;
}

function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat(
      "en",
      {
        style: "currency",
        currency
      }
    ).format(amount);
  } catch {
    return `${currency} ${amount}`;
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

  const token =
    await getPesapalToken(env);

  if (!env.PESAPAL_IPN_ID) {
    throw new Error(
      "PESAPAL_IPN_ID is not configured."
    );
  }

  const currency =
    order.currency || "KES";

  const amount =
    Number(order.amount || 0);

  const payload = {
    id: order.tracking_id,

    currency,

    amount,

    description:
      `HUPPY CUBE - ${order.service_name}`.slice(
        0,
        100
      ),

    callback_url:
      `${origin}/api/payment-callback?tracking_id=` +
      encodeURIComponent(
        order.tracking_id
      ),

    notification_id:
      env.PESAPAL_IPN_ID,

    billing_address: {
      email_address:
        order.email ||
        "customer@huppycube.com",

      phone_number:
        normalizePhone(order.phone),

      country_code:
        order.country_code || "KE",

      first_name:
        String(
          order.full_name ||
          "Customer"
        ).slice(0, 50),

      last_name:
        "Customer"
    }
  };

  const response =
    await fetch(
      `${PESAPAL_BASE}/api/Transactions/SubmitOrderRequest`,
      {
        method: "POST",
        headers: {
          Accept:
            "application/json",
          "Content-Type":
            "application/json",
          Authorization:
            `Bearer ${token}`
        },
        body:
          JSON.stringify(payload)
      }
    );

  const text =
    await response.text();

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

  if (
    !response.ok ||
    !data.redirect_url
  ) {
    throw new Error(
      `PesaPal order creation failed: ${safeJsonString(
        data
      )}`
    );
  }

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

  const token =
    await getPesapalToken(env);

  const response =
    await fetch(
      `${PESAPAL_BASE}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(
        orderTrackingId
      )}`,
      {
        method: "GET",
        headers: {
          Accept:
            "application/json",
          Authorization:
            `Bearer ${token}`
        }
      }
    );

  const text =
    await response.text();

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
      `PesaPal status check failed: ${safeJsonString(
        data
      )}`
    );
  }

  return data;
}

/* =========================================================
   SMM AFRICA
========================================================= */

async function smmAfricaRequest(
  env,
  payload
) {
  if (!env.SMM_AFRICA_API_KEY) {
    throw new Error(
      "SMM_AFRICA_API_KEY is not configured."
    );
  }

  const response =
    await fetch(
      SMM_AFRICA_BASE,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Accept:
            "application/json"
        },
        body:
          JSON.stringify({
            key:
              env.SMM_AFRICA_API_KEY,
            ...payload
          })
      }
    );

  const text =
    await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `SMM Africa returned invalid JSON: ${text.slice(
        0,
        1500
      )}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `SMM Africa request failed (${response.status}): ${safeJsonString(
        data
      )}`
    );
  }

  if (data?.error) {
    throw new Error(
      `SMM Africa API error: ${safeJsonString(
        data
      )}`
    );
  }

  return data;
}

async function getSmmServices(env) {
  const data =
    await smmAfricaRequest(
      env,
      {
        action:
          "services"
      }
    );

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data.services)) {
    return data.services;
  }

  throw new Error(
    `SMM Africa returned an unexpected services response: ${safeJsonString(
      data
    ).slice(0, 3000)}`
  );
}

async function sendOrderToSmmAfrica(
  env,
  serviceId,
  link,
  quantity,
  idempotencyKey
) {
  if (!serviceId) {
    throw new Error(
      "SMM Africa service ID is missing."
    );
  }

  if (!link) {
    throw new Error(
      "SMM Africa target link is missing."
    );
  }

  if (
    !quantity ||
    Number(quantity) <= 0
  ) {
    throw new Error(
      "SMM Africa quantity is invalid."
    );
  }

  if (!idempotencyKey) {
    throw new Error(
      "SMM Africa idempotency key is missing."
    );
  }

  return await smmAfricaRequest(
    env,
    {
      action:
        "add",

      service:
        Number(serviceId),

      link:
        String(link),

      quantity:
        Number(quantity),

      idempotency_key:
        String(idempotencyKey)
    }
  );
}

async function getSmmOrderStatus(
  env,
  supplierOrderId
) {
  if (!supplierOrderId) {
    throw new Error(
      "SMM Africa order ID is missing."
    );
  }

  return await smmAfricaRequest(
    env,
    {
      action:
        "status",

      order:
        String(supplierOrderId)
    }
  );
}

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
   SMM AFRICA TEST
========================================================= */

async function handleSmmTest(
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
    secret !== env.TEST_ORDER_SECRET
  ) {
    return json({
      success: false,
      error:
        "Unauthorized."
    }, 401);
  }

  try {
    const services =
      await getSmmServices(
        env
      );

    return json({
      success: true,

      message:
        "SMM Africa API connection is working.",

      service_count:
        services.length,

      services
    });
  } catch (error) {
    return json({
      success: false,

      message:
        "SMM Africa rejected the services request.",

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
  email: "TEXT",
  country_code: "TEXT",
  currency: "TEXT DEFAULT 'KES'",
  amount: "REAL DEFAULT 0",
  supplier_amount: "REAL DEFAULT 0",
  profit_amount: "REAL DEFAULT 0",
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
  `).run();

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
    ] of Object.entries(
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

  const oldOrders =
    await env.DB
      .prepare(`
        SELECT id
        FROM orders
        WHERE tracking_id IS NULL
           OR tracking_id = ''
      `)
      .all();

  for (
    const oldOrder
    of oldOrders.results || []
  ) {
    await env.DB
      .prepare(`
        UPDATE orders
        SET tracking_id = ?,
            updated_at =
              CURRENT_TIMESTAMP
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

async function getOrderById(
  env,
  id
) {
  await ensureOrdersTable(
    env
  );

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
          allowedFields.has(
            key
          )
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
      "cancel"
    )
  ) {
    currentStep = 3;
    progress = 75;
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

  try {
    /*
      IMPORTANT:
      We use the HUPPY tracking ID as the idempotency key.

      If the request needs to be retried, the same logical
      order gets the same idempotency key.
    */

    const supplierResult =
      await sendOrderToSmmAfrica(
        env,

        order.service_id,

        order.link,

        order.quantity,

        order.tracking_id
      );

    const supplierOrderId =
      supplierResult?.order ||
      supplierResult?.order_id ||
      supplierResult?.id ||
      supplierResult?.orderId ||
      null;

    if (!supplierOrderId) {
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
        `SMM Africa did not return an order ID: ${safeJsonString(
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
          safeJsonString(
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

  } catch (error) {
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
              new Date()
                .toISOString()
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
      await getSmmOrderStatus(
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
      order.id,
      {
        order_status:
          normalized,

        supplier_response:
          safeJsonString(
            supplier
          )
      }
    );

    return await getOrderById(
      env,
      order.id
    );

  } catch {
    /*
      A status-check failure does not erase the existing
      order status.
    */

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
    return json({
      error:
        "Invalid JSON request."
    }, 400);
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
    return json({
      error:
        "Service ID is required."
    }, 400);
  }

  if (
    !quantity ||
    quantity <= 0
  ) {
    return json({
      error:
        "Valid quantity is required."
    }, 400);
  }

  if (!link) {
    return json({
      error:
        "Target link is required."
    }, 400);
  }

  if (!phone) {
    return json({
      error:
        "Phone number is required."
    }, 400);
  }

  /*
    Detect customer currency from phone country code.
  */

  const currencyInfo =
    getCurrencyFromPhone(
      phone
    );

  const currency =
    currencyInfo.currency;

  const countryCode =
    currencyInfo.country;

  /*
    Get SMM Africa catalog.
  */

  const services =
    await getSmmServices(
      env
    );

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
        "Selected service was not found in the SMM Africa catalog."
    }, 404);
  }

  /*
    SMM Africa service rate is the supplier's price
    per 1,000 units.

    We double it for your selling price.

    Example:

    Supplier = 30
    Customer = 60
    Profit = 30
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
    return json({
      error:
        "Supplier price is unavailable for this service."
    }, 400);
  }

  /*
    Supplier catalog is treated as USD-based.

    supplierAmountUsd:
      supplier's actual cost

    customerAmountUsd:
      supplier cost × 2

    profitAmountUsd:
      customer - supplier
  */

  const supplierAmountUsd =
    (
      supplierRate *
      quantity
    ) / 1000;

  const customerAmountUsd =
    (
      customerPrice(
        supplierRate
      ) *
      quantity
    ) / 1000;

  const profitAmountUsd =
    customerAmountUsd -
    supplierAmountUsd;

  /*
    Convert customer price and supplier cost to the
    customer's detected currency.
  */

  const supplierAmount =
    roundMoney(
      usdToCurrency(
        supplierAmountUsd,
        currency,
        env
      ),
      currency
    );

  const amount =
    roundMoney(
      usdToCurrency(
        customerAmountUsd,
        currency,
        env
      ),
      currency
    );

  const profitAmount =
    roundMoney(
      usdToCurrency(
        profitAmountUsd,
        currency,
        env
      ),
      currency
    );

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

  const order = {
    id:
      orderId,

    tracking_id:
      trackingId,

    service_id:
      serviceId,

    service_name:
      finalServiceName,

    quantity,

    link,

    phone,

    full_name:
      fullName,

    email,

    country_code:
      countryCode,

    currency,

    amount,

    supplier_amount:
      supplierAmount,

    profit_amount:
      profitAmount,

    payment_status:
      "PENDING",

    order_status:
      "Pending"
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

    amount,

    currency,

    currency_symbol:
      currencyInfo.symbol,

    formatted_amount:
      formatMoney(
        amount,
        currency
      ),

    profit:
      profitAmount,

    supplier_cost:
      supplierAmount,

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
  const url =
    new URL(request.url);

  const phone =
    url.searchParams.get(
      "phone"
    ) || "";

  const currencyInfo =
    getCurrencyFromPhone(
      phone
    );

  const currency =
    currencyInfo.currency;

  const services =
    await getSmmServices(
      env
    );

  const mapped =
    services.map(
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

        const localRate =
          roundMoney(
            usdToCurrency(
              customerRate,
              currency,
              env
            ),
            currency
          );

        return {
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
            supplierRate,

          /*
            Customer selling price per 1,000
            in the detected currency.
          */

          customer_rate:
            localRate,

          currency,

          currency_symbol:
            currencyInfo.symbol,

          customer_rate_formatted:
            formatMoney(
              localRate,
              currency
            )
        };
      }
    );

  return json({
    success: true,

    currency,

    currency_symbol:
      currencyInfo.symbol,

    country:
      currencyInfo.country,

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
    return json({
      error:
        "Tracking ID is required."
    }, 400);
  }

  let order =
    await getOrderByTrackingId(
      env,
      trackingId
    );

  if (!order) {
    return json({
      error:
        "Order not found."
    }, 404);
  }

  /*
    If payment is complete but the supplier order has not
    yet been created, submit it.
  */

  if (
    order.payment_status ===
      "COMPLETED" &&
    !order.supplier_order_id &&
    order.pesapal_order_tracking_id
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

    } catch {
      order =
        await getOrderByTrackingId(
          env,
          trackingId
        );
    }
  }

  /*
    If SMM Africa already gave us an order ID, check the
    latest supplier status.
  */

  if (
    order?.supplier_order_id
  ) {
    order =
      await syncSupplierStatus(
        env,
        order
      );
  }

  return json({
    success: true,

    order,

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
    } catch {
      /*
        Supplier/payment error is stored in D1.
      */
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
  } catch {
    /*
      Error stored in D1.
    */
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
    secret !== env.TEST_ORDER_SECRET
  ) {
    return json({
      error:
        "Unauthorized."
    }, 401);
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
      success: true,

      message:
        "Orders database is ready.",

      columns:
        tableInfo.results || []
    });
  } catch (error) {
    return json({
      success: false,

      error:
        error?.message ||
        String(error)
    }, 500);
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

    supplier:
      "SMM Africa",

    status:
      "online",

    time:
      new Date()
        .toISOString()
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

  const phone =
    url.searchParams.get(
      "phone"
    ) || "";

  const info =
    getCurrencyFromPhone(
      phone
    );

  const exampleUsd =
    Number(
      url.searchParams.get(
        "amount"
      ) || 1
    );

  const localAmount =
    roundMoney(
      usdToCurrency(
        exampleUsd,
        info.currency,
        env
      ),
      info.currency
    );

  return json({
    success: true,

    phone_received:
      phone,

    country:
      info.country,

    currency:
      info.currency,

    symbol:
      info.symbol,

    example_usd:
      exampleUsd,

    converted_amount:
      localAmount,

    formatted:
      formatMoney(
        localAmount,
        info.currency
      )
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
          status: 204,
          headers:
            JSON_HEADERS
        }
      );
    }

    try {

      /* HEALTH */

      if (
        request.method === "GET" &&
        pathname ===
          "/api/health"
      ) {
        return handleHealth();
      }

      /* SMM AFRICA TEST */

      if (
        request.method === "GET" &&
        pathname ===
          "/api/smm-test"
      ) {
        return await handleSmmTest(
          request,
          env
        );
      }

      /* CURRENCY TEST */

      if (
        request.method === "GET" &&
        pathname ===
          "/api/currency-test"
      ) {
        return await handleCurrencyTest(
          request,
          env
        );
      }

      /* SERVICES */

      if (
        request.method === "GET" &&
        pathname ===
          "/api/services"
      ) {
        return await handleServices(
          request,
          env
        );
      }

      /* CREATE PAYMENT */

      if (
        request.method === "POST" &&
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

      /* ORDER STATUS */

      if (
        request.method === "GET" &&
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

      /* DATABASE TEST */

      if (
        request.method === "GET" &&
        pathname ===
          "/api/database-test"
      ) {
        return await handleDatabaseTest(
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

      return json({
        success: false,

        error:
          error?.message ||
          String(error)
      }, 500);
    }
  }
};
