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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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
  const rate = Number(supplierRate || 0);
  return rate * 2;
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
   * Therefore we MUST NOT add /api/v2 again.
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
    data = {
      error: "Invalid JSON returned by DenzGains",
      upstream: text
    };
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

  return Array.isArray(data)
    ? data
    : Array.isArray(data.services)
      ? data.services
      : [];
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
    data = {
      error: "Invalid JSON returned by DenzGains",
      upstream: text
    };
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

async function getOrderByTrackingId(env, trackingId) {
  await ensureOrdersTable(env);

  return await env.DB
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

  return await env.DB
    .prepare(
      `SELECT *
       FROM orders
       WHERE id = ?
       LIMIT 1`
    )
    .bind(id)
    .first();
}

async function updateOrder(env, id, fields) {
  const entries = Object.entries(fields);

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
    .prepare(
      `UPDATE orders
       SET ${setParts.join(", ")}
       WHERE id = ?`
    )
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
  } else if (status.includes("processing
