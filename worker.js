const DENZGAINS_URL = "https://denzgains.com/api/v2";
const PESAPAL_BASE = "https://pay.pesapal.com/v3";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders()
        });
      }

      // =========================
      // AUTH
      // =========================

      if (url.pathname === "/api/auth/register" && request.method === "POST") {
        return register(request, env);
      }

      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        return login(request, env);
      }

      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        return logout(request, env);
      }

      if (url.pathname === "/api/auth/me" && request.method === "GET") {
        return me(request, env);
      }

      // =========================
      // WALLET
      // =========================

      if (url.pathname === "/api/wallet" && request.method === "GET") {
        return getWallet(request, env);
      }

      // =========================
      // PESAPAL
      // =========================

      if (url.pathname === "/api/payment" && request.method === "POST") {
        return createPayment(request, env);
      }

      if (
        url.pathname === "/api/payment-status" &&
        request.method === "GET"
      ) {
        return paymentStatus(request, env);
      }

      if (url.pathname === "/api/ipn") {
        return pesapalIPN(request, env);
      }

      if (
        url.pathname === "/api/register-ipn" &&
        request.method === "GET"
      ) {
        return registerIPN(request, env);
      }

      // =========================
      // DENZGAINS
      // =========================

      if (
        url.pathname === "/api/denzgains/services" &&
        request.method === "GET"
      ) {
        return denzServices(request, env);
      }

      if (
        url.pathname === "/api/services" &&
        request.method === "GET"
      ) {
        return denzServices(request, env);
      }

      if (
        url.pathname === "/api/denzgains/balance" &&
        request.method === "GET"
      ) {
        return denzBalance(request, env);
      }

      // =========================
      // SMM ORDERS
      // =========================

      if (
        url.pathname === "/api/smm/order" &&
        request.method === "POST"
      ) {
        return createSmmOrder(request, env);
      }

      if (
        url.pathname === "/api/smm/status" &&
        request.method === "GET"
      ) {
        return smmStatus(request, env);
      }

      if (
        url.pathname === "/api/smm/refill" &&
        request.method === "POST"
      ) {
        return smmRefill(request, env);
      }

      if (
        url.pathname === "/api/smm/cancel" &&
        request.method === "POST"
      ) {
        return smmCancel(request, env);
      }

      if (
        url.pathname === "/api/orders" &&
        request.method === "GET"
      ) {
        return getOrders(request, env);
      }

      // =========================
      // FRONTEND
      // =========================

      return env.ASSETS.fetch(request);

    } catch (error) {
      console.error(error);

      return json(
        {
          success: false,
          error: error.message || "Server error"
        },
        500
      );
    }
  }
};


// ============================================================
// BASIC HELPERS
// ============================================================

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      ...extraHeaders
    }
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function normalizePhone(phone) {
  if (!phone) return "";

  let p = String(phone).trim().replace(/\s+/g, "");

  if (p.startsWith("+254")) {
    return p.substring(1);
  }

  if (p.startsWith("254")) {
    return p;
  }

  if (p.startsWith("0")) {
    return "254" + p.substring(1);
  }

  return p;
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


// ============================================================
// CRYPTO
// ============================================================

function bytesToBase64Url(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  value = value.replace(/-/g, "+").replace(/_/g, "/");

  while (value.length % 4) {
    value += "=";
  }

  const binary = atob(value);

  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);

  const hash = await crypto.subtle.digest(
    "SHA-256",
    data
  );

  return bytesToBase64Url(new Uint8Array(hash));
}

async function hashPassword(password) {
  const iterations = 120000;

  const salt = crypto.getRandomValues(
    new Uint8Array(16)
  );

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256"
    },
    key,
    256
  );

  return `pbkdf2$${iterations}$${bytesToBase64Url(salt)}$${bytesToBase64Url(
    new Uint8Array(bits)
  )}`;
}

async function verifyPassword(password, stored) {
  const parts = stored.split("$");

  if (parts.length !== 4) return false;

  const iterations = Number(parts[1]);
  const salt = base64UrlToBytes(parts[2]);
  const expected = base64UrlToBytes(parts[3]);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256"
    },
    key,
    256
  );

  const actual = new Uint8Array(bits);

  if (actual.length !== expected.length) {
    return false;
  }

  let difference = 0;

  for (let i = 0; i < actual.length; i++) {
    difference |= actual[i] ^ expected[i];
  }

  return difference === 0;
}

async function createSession(env, userId) {
  const rawToken = bytesToBase64Url(
    crypto.getRandomValues(new Uint8Array(32))
  );

  const tokenHash = await sha256(rawToken);

  await env.DB.prepare(`
    INSERT INTO sessions
      (user_id, token_hash, expires_at)
    VALUES
      (?, ?, datetime('now', '+30 days'))
  `)
    .bind(userId, tokenHash)
    .run();

  return rawToken;
}

function sessionCookie(token) {
  return [
    `huppy_session=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=2592000"
  ].join("; ");
}

function clearSessionCookie() {
  return [
    "huppy_session=",
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0"
  ].join("; ");
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie");

  if (!header) return null;

  const cookies = header.split(";");

  for (const cookie of cookies) {
    const [key, ...rest] = cookie.trim().split("=");

    if (key === name) {
      return rest.join("=");
    }
  }

  return null;
}


// ============================================================
// AUTH
// ============================================================

async function requireUser(request, env) {
  const token = getCookie(request, "huppy_session");

  if (!token) {
    throw new Error("Authentication required");
  }

  const tokenHash = await sha256(token);

  const result = await env.DB.prepare(`
    SELECT
      u.id,
      u.name,
      u.email,
      u.phone,
      u.created_at
    FROM sessions s
    JOIN users u
      ON u.id = s.user_id
    WHERE s.token_hash = ?
      AND s.expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `)
    .bind(tokenHash)
    .first();

  if (!result) {
    throw new Error("Session expired. Please login again.");
  }

  return result;
}

async function register(request, env) {
  const body = await readJson(request);

  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = normalizePhone(body.phone);
  const password = String(body.password || "");

  if (!name) {
    return json(
      { success: false, error: "Name is required" },
      400
    );
  }

  if (!validEmail(email)) {
    return json(
      { success: false, error: "Enter a valid email address" },
      400
    );
  }

  if (!phone) {
    return json(
      { success: false, error: "Phone number is required" },
      400
    );
  }

  if (password.length < 8) {
    return json(
      {
        success: false,
        error: "Password must be at least 8 characters"
      },
      400
    );
  }

  const existing = await env.DB.prepare(`
    SELECT id
    FROM users
    WHERE email = ? OR phone = ?
    LIMIT 1
  `)
    .bind(email, phone)
    .first();

  if (existing) {
    return json(
      {
        success: false,
        error: "An account with this email or phone already exists"
      },
      409
    );
  }

  const passwordHash = await hashPassword(password);

  const result = await env.DB.prepare(`
    INSERT INTO users
      (name, email, phone, password_hash)
    VALUES
      (?, ?, ?, ?)
  `)
    .bind(
      name,
      email,
      phone,
      passwordHash
    )
    .run();

  const userId = result.meta.last_row_id;

  // Link an existing wallet using the phone number.
  await env.DB.prepare(`
    UPDATE wallets
    SET user_id = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE phone = ?
      AND (user_id IS NULL OR user_id = ?)
  `)
    .bind(userId, phone, userId)
    .run();

  // Link old payment records.
  await env.DB.prepare(`
    UPDATE payments
    SET user_id = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE phone = ?
      AND user_id IS NULL
  `)
    .bind(userId, phone)
    .run();

  // Link old wallet transactions.
  await env.DB.prepare(`
    UPDATE wallet_transactions
    SET user_id = ?
    WHERE phone = ?
      AND user_id IS NULL
  `)
    .bind(userId, phone)
    .run();

  // Link old SMM orders.
  await env.DB.prepare(`
    UPDATE smm_orders
    SET user_id = ?
    WHERE phone = ?
      AND user_id IS NULL
  `)
    .bind(userId, phone)
    .run();

  const token = await createSession(env, userId);

  return json(
    {
      success: true,
      user: {
        id: userId,
        name,
        email,
        phone
      }
    },
    201,
    {
      "Set-Cookie": sessionCookie(token)
    }
  );
}

async function login(request, env) {
  const body = await readJson(request);

  const email = String(body.email || "")
    .trim()
    .toLowerCase();

  const password = String(body.password || "");

  if (!email || !password) {
    return json(
      {
        success: false,
        error: "Email and password are required"
      },
      400
    );
  }

  const user = await env.DB.prepare(`
    SELECT
      id,
      name,
      email,
      phone,
      password_hash,
      created_at
    FROM users
    WHERE email = ?
    LIMIT 1
  `)
    .bind(email)
    .first();

  if (!user) {
    return json(
      {
        success: false,
        error: "Invalid email or password"
      },
      401
    );
  }

  const valid = await verifyPassword(
    password,
    user.password_hash
  );

  if (!valid) {
    return json(
      {
        success: false,
        error: "Invalid email or password"
      },
      401
    );
  }

  const token = await createSession(
    env,
    user.id
  );

  return json(
    {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        created_at: user.created_at
      }
    },
    200,
    {
      "Set-Cookie": sessionCookie(token)
    }
  );
}

async function logout(request, env) {
  const token = getCookie(
    request,
    "huppy_session"
  );

  if (token) {
    const tokenHash = await sha256(token);

    await env.DB.prepare(`
      DELETE FROM sessions
      WHERE token_hash = ?
    `)
      .bind(tokenHash)
      .run();
  }

  return json(
    { success: true },
    200,
    {
      "Set-Cookie": clearSessionCookie()
    }
  );
}

async function me(request, env) {
  try {
    const user = await requireUser(request, env);

    return json({
      success: true,
      user
    });
  } catch {
    return json(
      {
        success: false,
        user: null
      },
      401
    );
  }
}


// ============================================================
// WALLET
// ============================================================

async function ensureWallet(env, user) {
  let wallet = await env.DB.prepare(`
    SELECT
      phone,
      user_id,
      balance
    FROM wallets
    WHERE user_id = ?
    LIMIT 1
  `)
    .bind(user.id)
    .first();

  if (!wallet) {
    // Link an old wallet using phone.
    await env.DB.prepare(`
      UPDATE wallets
      SET user_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE phone = ?
        AND user_id IS NULL
    `)
      .bind(user.id, user.phone)
      .run();

    wallet = await env.DB.prepare(`
      SELECT
        phone,
        user_id,
        balance
      FROM wallets
      WHERE user_id = ?
      LIMIT 1
    `)
      .bind(user.id)
      .first();
  }

  if (!wallet) {
    await env.DB.prepare(`
      INSERT INTO wallets
        (phone, user_id, balance)
      VALUES
        (?, ?, 0)
    `)
      .bind(user.phone, user.id)
      .run();

    wallet = {
      phone: user.phone,
      user_id: user.id,
      balance: 0
    };
  }

  return wallet;
}

async function getWallet(request, env) {
  try {
    const user = await requireUser(request, env);

    const wallet = await ensureWallet(
      env,
      user
    );

    return json({
      success: true,
      balance: Number(wallet.balance || 0)
    });

  } catch (error) {
    return json(
      {
        success: false,
        error: error.message
      },
      401
    );
  }
}


// ============================================================
// PESAPAL
// ============================================================

async function pesapalToken(env) {
  const consumerKey = env.PESAPAL_CONSUMER_KEY;
  const consumerSecret = env.PESAPAL_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new Error(
      "PesaPal credentials are not configured"
    );
  }

  const response = await fetch(
    `${PESAPAL_BASE}/api/Auth/RequestToken`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        consumer_key: consumerKey,
        consumer_secret: consumerSecret
      })
    }
  );

  const data = await response.json();

  if (!response.ok || !data.token) {
    throw new Error(
      data.message ||
      "Unable to authenticate with PesaPal"
    );
  }

  return data.token;
}

async function createPayment(request, env) {
  try {
    const user = await requireUser(
      request,
      env
    );

    const body = await readJson(request);

    const amount = Number(body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return json(
        {
          success: false,
          error: "Enter a valid deposit amount"
        },
        400
      );
    }

    const token = await pesapalToken(env);

    const merchantReference =
      `HUPPY-${user.id}-${Date.now()}`;

    const appUrl =
      env.APP_URL ||
      new URL(request.url).origin;

    const callbackUrl =
      `${appUrl}/payment-success`;

    const order = {
      id: merchantReference,
      currency: "KES",
      amount: Number(amount.toFixed(2)),
      description: "HUPPY CUBE Wallet Deposit",
      callback_url: callbackUrl,
      notification_id: env.PESAPAL_IPN_ID,
      billing_address: {
        email_address: user.email,
        phone_number: user.phone,
        country_code: "KE",
        first_name: user.name
      }
    };

    const response = await fetch(
      `${PESAPAL_BASE}/api/Transactions/SubmitOrderRequest`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(order)
      }
    );

    const data = await response.json();

    if (!response.ok || !data.order_tracking_id) {
      return json(
        {
          success: false,
          error:
            data.message ||
            "PesaPal payment could not be created",
          pesapal: data
        },
        502
      );
    }

    await env.DB.prepare(`
      INSERT INTO payments
        (
          merchant_reference,
          tracking_id,
          phone,
          email,
          amount,
          currency,
          status,
          user_id
        )
      VALUES
        (?, ?, ?, ?, ?, 'KES', 'PENDING', ?, ?)
    `)
      .bind(
        merchantReference,
        data.order_tracking_id,
        user.phone,
        user.email,
        amount,
        "PENDING",
        user.id
      )
      .run();

    return json({
      success: true,
      merchant_reference: merchantReference,
      order_tracking_id: data.order_tracking_id,
      redirect_url: data.redirect_url
    });

  } catch (error) {
    return json(
      {
        success: false,
        error: error.message
      },
      401
    );
  }
}

async function getPesapalStatus(
  env,
  trackingId
) {
  const token = await pesapalToken(env);

  const response = await fetch(
    `${PESAPAL_BASE}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(
      trackingId
    )}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    }
  );

  const data = await response.json();

  return data;
}

async function creditWallet(
  env,
  trackingId,
  pesapalStatus
) {
  const payment = await env.DB.prepare(`
    SELECT *
    FROM payments
    WHERE tracking_id = ?
    LIMIT 1
  `)
    .bind(trackingId)
    .first();

  if (!payment) {
    throw new Error(
      "Payment record not found"
    );
  }

  if (Number(payment.credited) === 1) {
    return {
      credited: false,
      already_credited: true
    };
  }

  const statusCode = Number(
    pesapalStatus.status_code
  );

  let status = "PENDING";

  if (statusCode === 1) {
    status = "COMPLETED";
  } else if (statusCode === 2) {
    status = "FAILED";
  } else if (statusCode === 3) {
    status = "REVERSED";
  }

  await env.DB.prepare(`
    UPDATE payments
    SET status = ?,
        payment_method = ?,
        confirmation_code = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE tracking_id = ?
  `)
    .bind(
      status,
      pesapalStatus.payment_method || null,
      pesapalStatus.confirmation_code || null,
      trackingId
    )
    .run();

  if (status !== "COMPLETED") {
    return {
      credited: false,
      status
    };
  }

  const wallet = await env.DB.prepare(`
    SELECT *
    FROM wallets
    WHERE user_id = ?
    LIMIT 1
  `)
    .bind(payment.user_id)
    .first();

  if (!wallet) {
    await env.DB.prepare(`
      INSERT INTO wallets
        (phone, user_id, balance)
      VALUES
        (?, ?, 0)
    `)
      .bind(
        payment.phone,
        payment.user_id
      )
      .run();
  }

  const mark = await env.DB.prepare(`
    UPDATE payments
    SET credited = 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE tracking_id = ?
      AND credited = 0
  `)
    .bind(trackingId)
    .run();

  if (!mark.meta.changes) {
    return {
      credited: false,
      already_credited: true
    };
  }

  const reference =
    `DEPOSIT-${trackingId}`;

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE wallets
      SET balance = balance + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `)
      .bind(
        Number(payment.amount),
        payment.user_id
      ),

    env.DB.prepare(`
      INSERT OR IGNORE INTO wallet_transactions
        (
          phone,
          user_id,
          type,
          amount,
          reference,
          description
        )
      VALUES
        (?, ?, 'CREDIT', ?, ?, ?)
    `)
      .bind(
        payment.phone,
        payment.user_id,
        Number(payment.amount),
        reference,
        "PesaPal wallet deposit"
      )
  ]);

  return {
    credited: true,
    amount: Number(payment.amount),
    status: "COMPLETED"
  };
}

async function paymentStatus(request, env) {
  try {
    const user = await requireUser(
      request,
      env
    );

    const url = new URL(request.url);

    const trackingId =
      url.searchParams.get(
        "orderTrackingId"
      );

    if (!trackingId) {
      return json(
        {
          success: false,
          error: "Missing orderTrackingId"
        },
        400
      );
    }

    const payment = await env.DB.prepare(`
      SELECT *
      FROM payments
      WHERE tracking_id = ?
        AND user_id = ?
      LIMIT 1
    `)
      .bind(
        trackingId,
        user.id
      )
      .first();

    if (!payment) {
      return json(
        {
          success: false,
          error: "Payment not found"
        },
        404
      );
    }

    const status =
      await getPesapalStatus(
        env,
        trackingId
      );

    const result =
      await creditWallet(
        env,
        trackingId,
        status
      );

    const wallet =
      await ensureWallet(
        env,
        user
      );

    return json({
      success: true,
      status:
        status.status_code,
      payment: result,
      balance:
        Number(wallet.balance || 0)
    });

  } catch (error) {
    return json(
      {
        success: false,
        error: error.message
      },
      401
    );
  }
}

async function pesapalIPN(request, env) {
  const url = new URL(request.url);

  const trackingId =
    url.searchParams.get(
      "OrderTrackingId"
    );

  if (!trackingId) {
    return json(
      {
        success: false,
        error: "Missing OrderTrackingId"
      },
      400
    );
  }

  try {
    const status =
      await getPesapalStatus(
        env,
        trackingId
      );

    await creditWallet(
      env,
      trackingId,
      status
    );

    return json({
      success: true
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

async function registerIPN(request, env) {
  try {
    const token =
      await pesapalToken(env);

    const appUrl =
      env.APP_URL ||
      new URL(request.url).origin;

    const response = await fetch(
      `${PESAPAL_BASE}/api/URLSetup/RegisterIPN`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          url: `${appUrl}/api/ipn`,
          ipn_notification_type: "GET"
        })
      }
    );

    const data =
      await response.json();

    return json(data, response.status);

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


// ============================================================
// DENZGAINS SERVICES
// ============================================================

async function denzServices(request, env) {
  try {
    if (!env.DENZGAINS_API_KEY) {
      return json(
        {
          success: false,
          error: "DenzGains API key is not configured"
        },
        500
      );
    }

    const response = await fetch(
      `${DENZGAINS_URL}?action=services&key=${encodeURIComponent(
        env.DENZGAINS_API_KEY
      )}`
    );

    const data = await response.json();

    if (!Array.isArray(data)) {
      return json(
        {
          success: false,
          error: "Invalid DenzGains services response",
          data
        },
        502
      );
    }

    for (const service of data) {
      const supplierRate =
        Number(service.rate || 0);

      const customerRate =
        Number(
          (supplierRate * 2).toFixed(6)
        );

      await env.DB.prepare(`
        INSERT INTO smm_services
          (
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
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(service_id)
        DO UPDATE SET
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
          Number(service.min || 1),
          Number(service.max || 1),
          service.refill ? 1 : 0,
          service.cancel ? 1 : 0
        )
        .run();
    }

    const services =
      await env.DB.prepare(`
        SELECT *
        FROM smm_services
        WHERE active = 1
        ORDER BY service_id ASC
      `)
        .all();

    return json({
      success: true,
      services: services.results || []
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

async function denzBalance(request, env) {
  try {
    const response = await fetch(
      `${DENZGAINS_URL}?action=balance&key=${encodeURIComponent(
        env.DENZGAINS_API_KEY
      )}`
    );

    const data =
      await response.json();

    return json(data);

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


// ============================================================
// SMM ORDER
// ============================================================

async function createSmmOrder(request, env) {
  try {
    const user =
      await requireUser(
        request,
        env
      );

    const body =
      await readJson(request);

    const serviceId =
      Number(body.service_id);

    const link =
      String(body.link || "").trim();

    const quantity =
      Number(body.quantity);

    if (!serviceId) {
      return json(
        {
          success: false,
          error: "Service is required"
        },
        400
      );
    }

    if (!link) {
      return json(
        {
          success: false,
          error: "Link is required"
        },
        400
      );
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
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
      Number(service.min_quantity)
    ) {
      return json(
        {
          success: false,
          error:
            `Minimum quantity is ${service.min_quantity}`
        },
        400
      );
    }

    if (
      quantity >
      Number(service.max_quantity)
    ) {
      return json(
        {
          success: false,
          error:
            `Maximum quantity is ${service.max_quantity}`
        },
        400
      );
    }

    const customerRate =
      Number(service.customer_rate);

    const amount =
      Number(
        (
          customerRate *
          quantity /
          1000
        ).toFixed(2)
      );

    const wallet =
      await ensureWallet(
        env,
        user
      );

    const currentBalance =
      Number(wallet.balance || 0);

    if (currentBalance < amount) {
      return json(
        {
          success: false,
          error: "Insufficient wallet balance",
          balance: currentBalance,
          required: amount
        },
        400
      );
    }

    // Create local order first.
    const localOrder =
      await env.DB.prepare(`
        INSERT INTO smm_orders
          (
            phone,
            user_id,
            service_id,
            service_name,
            link,
            quantity,
            supplier_rate,
            customer_rate,
            amount,
            status
          )
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitting')
      `)
        .bind(
          user.phone,
          user.id,
          serviceId,
          service.name,
          link,
          quantity,
          Number(service.supplier_rate),
          customerRate,
          amount
        )
        .run();

    const localOrderId =
      localOrder.meta.last_row_id;

    // Reserve customer funds.
    const deduction =
      await env.DB.prepare(`
        UPDATE wallets
        SET balance = balance - ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
          AND balance >= ?
      `)
        .bind(
          amount,
          user.id,
          amount
        )
        .run();

    if (!deduction.meta.changes) {
      await env.DB.prepare(`
        UPDATE smm_orders
        SET status = 'Failed',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
        .bind(localOrderId)
        .run();

      return json(
        {
          success: false,
          error: "Insufficient wallet balance"
        },
        400
      );
    }

    try {
      const response =
        await fetch(
          `${DENZGAINS_URL}?action=add&service=${encodeURIComponent(
            serviceId
          )}&link=${encodeURIComponent(
            link
          )}&quantity=${encodeURIComponent(
            quantity
          )}&key=${encodeURIComponent(
            env.DENZGAINS_API_KEY
          )}`
        );

      const supplierData =
        await response.json();

      if (
        !supplierData.order
      ) {
        throw new Error(
          supplierData.error ||
          "DenzGains rejected the order"
        );
      }

      const supplierOrderId =
        String(supplierData.order);

      await env.DB.batch([
        env.DB.prepare(`
          UPDATE smm_orders
          SET supplier_order_id = ?,
              status = 'Pending',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
          .bind(
            supplierOrderId,
            localOrderId
          ),

        env.DB.prepare(`
          INSERT INTO wallet_transactions
            (
              phone,
              user_id,
              type,
              amount,
              reference,
              description
            )
          VALUES
            (?, ?, 'DEBIT', ?, ?, ?)
        `)
          .bind(
            user.phone,
            user.id,
            amount,
            `ORDER-${localOrderId}`,
            `SMM order ${supplierOrderId}`
          )
      ]);

      const newWallet =
        await env.DB.prepare(`
          SELECT balance
          FROM wallets
          WHERE user_id = ?
          LIMIT 1
        `)
          .bind(user.id)
          .first();

      return json({
        success: true,
        order_id: localOrderId,
        supplier_order_id:
          supplierOrderId,
        amount,
        balance:
          Number(newWallet.balance || 0),
        status: "Pending"
      });

    } catch (supplierError) {

      // Refund customer if supplier order failed.
      await env.DB.batch([
        env.DB.prepare(`
          UPDATE wallets
          SET balance = balance + ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
        `)
          .bind(
            amount,
            user.id
          ),

        env.DB.prepare(`
          INSERT OR IGNORE INTO wallet_transactions
            (
              phone,
              user_id,
              type,
              amount,
              reference,
              description
            )
          VALUES
            (?, ?, 'REFUND', ?, ?, ?)
        `)
          .bind(
            user.phone,
            user.id,
            amount,
            `REFUND-${localOrderId}`,
            "Refund for failed SMM order"
          ),

        env.DB.prepare(`
          UPDATE smm_orders
          SET status = 'Failed',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
          .bind(localOrderId)
      ]);

      throw supplierError;
    }

  } catch (error) {
    return json(
      {
        success: false,
        error: error.message
      },
      400
    );
  }
}


// ============================================================
// ORDER STATUS
// ============================================================

async function getOwnedOrder(
  env,
  userId,
  localId
) {
  return env.DB.prepare(`
    SELECT *
    FROM smm_orders
    WHERE id = ?
      AND user_id = ?
    LIMIT 1
  `)
    .bind(localId, userId)
    .first();
}

async function smmStatus(request, env) {
  try {
    const user =
      await requireUser(
        request,
        env
      );

    const url =
      new URL(request.url);

    const localId =
      Number(
        url.searchParams.get("id")
      );

    if (!localId) {
      return json(
        {
          success: false,
          error: "Order ID is required"
        },
        400
      );
    }

    const order =
      await getOwnedOrder(
        env,
        user.id,
        localId
      );

    if (!order) {
      return json(
        {
          success: false,
          error: "Order not found"
        },
        404
      );
    }

    if (!order.supplier_order_id) {
      return json({
        success: true,
        status: order.status,
        order
      });
    }

    const response =
      await fetch(
        `${DENZGAINS_URL}?action=status&order=${encodeURIComponent(
          order.supplier_order_id
        )}&key=${encodeURIComponent(
          env.DENZGAINS_API_KEY
        )}`
      );

    const supplier =
      await response.json();

    if (supplier.status) {
      await env.DB.prepare(`
        UPDATE smm_orders
        SET status = ?,
            remains = ?,
            start_count = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND user_id = ?
      `)
        .bind(
          supplier.status,
          supplier.remains ?? null,
          supplier.start_count ?? null,
          localId,
          user.id
        )
        .run();
    }

    return json({
      success: true,
      supplier,
      order: {
        ...order,
        status:
          supplier.status ||
          order.status,
        remains:
          supplier.remains ??
          order.remains,
        start_count:
          supplier.start_count ??
          order.start_count
      }
    });

  } catch (error) {
    return json(
      {
        success: false,
        error: error.message
      },
      401
    );
  }
}


// ============================================================
// REFILL
// ============================================================

async function smmRefill(request, env) {
  try {
    const user =
      await requireUser(
        request,
        env
      );

    const body =
      await readJson(request);

    const localId =
      Number(body.id);

    const order =
      await getOwnedOrder(
        env,
        user.id,
        localId
      );

    if (!order) {
      return json(
        {
          success: false,
          error: "Order not found"
        },
        404
      );
    }

    if (!order.supplier_order_id) {
      return json(
        {
          success: false,
          error: "Supplier order not available"
        },
        400
      );
    }

    const response =
      await fetch(
        `${DENZGAINS_URL}?action=refill&order=${encodeURIComponent(
          order.supplier_order_id
        )}&key=${encodeURIComponent(
          env.DENZGAINS_API_KEY
        )}`,
        {
          method: "GET"
        }
      );

    const data =
      await response.json();

    return json(data);

  } catch (error) {
    return json(
      {
        success: false,
        error: error.message
      },
      401
    );
  }
}


// ============================================================
// CANCEL
// ============================================================

async function smmCancel(request, env) {
  try {
    const user =
      await requireUser(
        request,
        env
      );

    const body =
      await readJson(request);

    const localId =
      Number(body.id);

    const order =
      await getOwnedOrder(
        env,
        user.id,
        localId
      );

    if (!order) {
      return json(
        {
          success: false,
          error: "Order not found"
        },
        404
      );
    }

    if (!order.supplier_order_id) {
      return json(
        {
          success: false,
          error: "Supplier order not available"
        },
        400
      );
    }

    const response =
      await fetch(
        `${DENZGAINS_URL}?action=cancel&order=${encodeURIComponent(
          order.supplier_order_id
        )}&key=${encodeURIComponent(
          env.DENZGAINS_API_KEY
        )}`
      );

    const data =
      await response.json();

    if (data.success) {
      await env.DB.prepare(`
        UPDATE smm_orders
        SET status = 'Canceled',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND user_id = ?
      `)
        .bind(
          localId,
          user.id
        )
        .run();
    }

    return json(data);

  } catch (error) {
    return json(
      {
        success: false,
        error: error.message
      },
      401
    );
  }
}


// ============================================================
// ORDER HISTORY
// ============================================================

async function getOrders(request, env) {
  try {
    const user =
      await requireUser(
        request,
        env
      );

    const result =
      await env.DB.prepare(`
        SELECT
          id,
          service_id,
          service_name,
          link,
          quantity,
          supplier_order_id,
          amount,
          status,
          remains,
          start_count,
          created_at,
          updated_at
        FROM smm_orders
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 100
      `)
        .bind(user.id)
        .all();

    return json({
      success: true,
      orders:
        result.results || []
    });

  } catch (error) {
    return json(
      {
        success: false,
        error: error.message
      },
      401
    );
  }
    }
