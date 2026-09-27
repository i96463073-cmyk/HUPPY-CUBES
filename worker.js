const DENZGAINS_URL = "https://denzgains.com/api/v2";
const PESAPAL_BASE = "https://pay.pesapal.com/v3";

const SESSION_DAYS = 30;
const PIN_ITERATIONS = 120000;

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      ...extra
    }
  });
}

function normalizePhone(phone) {
  return String(phone || "")
    .trim()
    .replace(/[^\d+]/g, "")
    .replace(/^00/, "+");
}

function validPhone(phone) {
  const p = normalizePhone(phone);
  return /^\+?[1-9]\d{8,14}$/.test(p);
}

function validPin(pin) {
  return /^\d{6}$/.test(String(pin || ""));
}

function randomHex(bytes = 32) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return [...array]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);

  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return out;
}

async function hashPin(pin, saltHex) {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(pin)),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBytes(saltHex),
      iterations: PIN_ITERATIONS,
      hash: "SHA-256"
    },
    key,
    256
  );

  return bytesToHex(bits);
}

async function createPinHash(pin) {
  const salt = randomHex(16);
  const hash = await hashPin(pin, salt);
  return `${salt}:${hash}`;
}

async function verifyPin(pin, stored) {
  try {
    const [salt, expected] = String(stored).split(":");

    if (!salt || !expected) return false;

    const actual = await hashPin(pin, salt);

    if (actual.length !== expected.length) return false;

    let result = 0;

    for (let i = 0; i < actual.length; i++) {
      result |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
    }

    return result === 0;
  } catch {
    return false;
  }
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(digest);
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";

  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");

    if (key === name) {
      return rest.join("=");
    }
  }

  return null;
}

async function createSession(env, userId) {
  const rawToken = randomHex(32);
  const tokenHash = await sha256(rawToken);

  const expires = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  await env.DB.prepare(
    `
    INSERT INTO sessions
    (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
    `
  )
    .bind(userId, tokenHash, expires)
    .run();

  return {
    rawToken,
    expires
  };
}

async function getCurrentUser(request, env) {
  const token = getCookie(request, "huppy_session");

  if (!token) return null;

  const tokenHash = await sha256(token);

  const result = await env.DB.prepare(
    `
    SELECT
      u.id,
      u.name,
      u.phone,
      u.created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
      AND s.expires_at > CURRENT_TIMESTAMP
    LIMIT 1
    `
  )
    .bind(tokenHash)
    .first();

  return result || null;
}

async function requireUser(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    throw new Response(
      JSON.stringify({
        error: "Unauthorized",
        message: "Please login first."
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }

  return user;
}

async function ensureWallet(env, user) {
  let wallet = await env.DB.prepare(
    `
    SELECT *
    FROM wallets
    WHERE user_id = ?
    LIMIT 1
    `
  )
    .bind(user.id)
    .first();

  if (wallet) return wallet;

  const oldWallet = await env.DB.prepare(
    `
    SELECT *
    FROM wallets
    WHERE phone = ?
      AND (user_id IS NULL OR user_id = ?)
    LIMIT 1
    `
  )
    .bind(user.phone, user.id)
    .first();

  if (oldWallet) {
    await env.DB.prepare(
      `
      UPDATE wallets
      SET user_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE phone = ?
      `
    )
      .bind(user.id, user.phone)
      .run();

    return await env.DB.prepare(
      `
      SELECT *
      FROM wallets
      WHERE user_id = ?
      LIMIT 1
      `
    )
      .bind(user.id)
      .first();
  }

  await env.DB.prepare(
    `
    INSERT INTO wallets
    (phone, user_id, balance)
    VALUES (?, ?, 0)
    `
  )
    .bind(user.phone, user.id)
    .run();

  return await env.DB.prepare(
    `
    SELECT *
    FROM wallets
    WHERE user_id = ?
    LIMIT 1
    `
  )
    .bind(user.id)
    .first();
}

async function getWallet(env, user) {
  const wallet = await ensureWallet(env, user);

  return {
    phone: user.phone,
    balance: Number(wallet?.balance || 0),
    currency: "KES"
  };
}

async function denzRequest(params, env) {
  const url = new URL(DENZGAINS_URL);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  url.searchParams.set("key", env.DENZGAINS_API_KEY);

  const response = await fetch(url.toString(), {
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
      `DenzGains returned an invalid response: ${text.slice(0, 300)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
        data?.message ||
        `DenzGains HTTP ${response.status}`
    );
  }

  return data;
}

async function getPesaPalToken(env) {
  const response = await fetch(`${PESAPAL_BASE}/api/Auth/RequestToken`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      consumer_key: env.PESAPAL_CONSUMER_KEY,
      consumer_secret: env.PESAPAL_CONSUMER_SECRET
    })
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `PesaPal authentication returned invalid response: ${text.slice(
        0,
        300
      )}`
    );
  }

  if (!response.ok || !data.token) {
    throw new Error(
      data?.message ||
        data?.error ||
        "Unable to authenticate with PesaPal."
    );
  }

  return data.token;
}

async function pesaPalRequest(env, path, body, token) {
  const response = await fetch(`${PESAPAL_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `PesaPal returned invalid response: ${text.slice(0, 300)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        `PesaPal HTTP ${response.status}`
    );
  }

  return data;
}

async function registerUser(request, env) {
  const body = await request.json();

  const name = String(body.name || "").trim();
  const phone = normalizePhone(body.phone);
  const pin = String(body.pin || "");

  if (name.length < 2) {
    return json(
      {
        error: "Invalid name",
        message: "Enter your name."
      },
      400
    );
  }

  if (!validPhone(phone)) {
    return json(
      {
        error: "Invalid phone",
        message: "Enter a valid phone number."
      },
      400
    );
  }

  if (!validPin(pin)) {
    return json(
      {
        error: "Invalid PIN",
        message: "PIN must contain exactly 6 digits."
      },
      400
    );
  }

  const existing = await env.DB.prepare(
    `
    SELECT id
    FROM users
    WHERE phone = ?
    LIMIT 1
    `
  )
    .bind(phone)
    .first();

  if (existing) {
    return json(
      {
        error: "Account already exists",
        message: "This phone number is already registered. Please login."
      },
      409
    );
  }

  const pinHash = await createPinHash(pin);

  const insert = await env.DB.prepare(
    `
    INSERT INTO users
    (name, phone, pin_hash)
    VALUES (?, ?, ?)
    `
  )
    .bind(name, phone, pinHash)
    .run();

  const userId = insert.meta.last_row_id;

  /*
   * Link old phone-based records to the new user account.
   */
  await env.DB.batch([
    env.DB.prepare(
      `
      UPDATE wallets
      SET user_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE phone = ?
        AND user_id IS NULL
      `
    ).bind(userId, phone),

    env.DB.prepare(
      `
      UPDATE payments
      SET user_id = ?
      WHERE phone = ?
        AND user_id IS NULL
      `
    ).bind(userId, phone),

    env.DB.prepare(
      `
      UPDATE wallet_transactions
      SET user_id = ?
      WHERE phone = ?
        AND user_id IS NULL
      `
    ).bind(userId, phone),

    env.DB.prepare(
      `
      UPDATE smm_orders
      SET user_id = ?
      WHERE phone = ?
        AND user_id IS NULL
      `
    ).bind(userId, phone)
  ]);

  const user = {
    id: userId,
    name,
    phone
  };

  await ensureWallet(env, user);

  const session = await createSession(env, userId);

  return json(
    {
      success: true,
      message: "Account created successfully.",
      user
    },
    201,
    {
      "Set-Cookie": cookie(
        "huppy_session",
        session.rawToken,
        SESSION_DAYS * 24 * 60 * 60
      )
    }
  );
}

async function loginUser(request, env) {
  const body = await request.json();

  const phone = normalizePhone(body.phone);
  const pin = String(body.pin || "");

  if (!validPhone(phone) || !validPin(pin)) {
    return json(
      {
        error: "Invalid login",
        message: "Enter your phone number and 6-digit PIN."
      },
      400
    );
  }

  const user = await env.DB.prepare(
    `
    SELECT
      id,
      name,
      phone,
      pin_hash,
      created_at
    FROM users
    WHERE phone = ?
    LIMIT 1
    `
  )
    .bind(phone)
    .first();

  if (!user) {
    return json(
      {
        error: "Login failed",
        message: "Incorrect phone number or PIN."
      },
      401
    );
  }

  const valid = await verifyPin(pin, user.pin_hash);

  if (!valid) {
    return json(
      {
        error: "Login failed",
        message: "Incorrect phone number or PIN."
      },
      401
    );
  }

  const session = await createSession(env, user.id);

  await ensureWallet(env, user);

  return json(
    {
      success: true,
      message: "Login successful.",
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        created_at: user.created_at
      }
    },
    200,
    {
      "Set-Cookie": cookie(
        "huppy_session",
        session.rawToken,
        SESSION_DAYS * 24 * 60 * 60
      )
    }
  );
}

async function logoutUser(request, env) {
  const token = getCookie(request, "huppy_session");

  if (token) {
    const tokenHash = await sha256(token);

    await env.DB.prepare(
      `
      DELETE FROM sessions
      WHERE token_hash = ?
      `
    )
      .bind(tokenHash)
      .run();
  }

  return json(
    {
      success: true,
      message: "Logged out."
    },
    200,
    {
      "Set-Cookie": clearCookie("huppy_session")
    }
  );
}

async function authMe(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return json({
      authenticated: false,
      user: null
    });
  }

  const wallet = await getWallet(env, user);

  return json({
    authenticated: true,
    user,
    wallet
  });
}

async function createPayment(request, env) {
  const user = await requireUser(request, env);

  const body = await request.json();

  const amount = Number(body.amount);

  if (!Number.isFinite(amount) || amount < 10) {
    return json(
      {
        error: "Invalid amount",
        message: "Minimum deposit is KSh 10."
      },
      400
    );
  }

  if (amount > 1000000) {
    return json(
      {
        error: "Amount too large",
        message: "Deposit amount is too large."
      },
      400
    );
  }

  const merchantReference =
    `HC-${user.id}-${Date.now()}-${randomHex(4)}`.toUpperCase();

  const callbackUrl =
    env.APP_URL ||
    new URL("/payment-success", request.url).toString();

  const ipnId = env.PESAPAL_IPN_ID;

  if (!ipnId) {
    return json(
      {
        error: "PesaPal IPN not configured",
        message: "PESAPAL_IPN_ID is missing."
      },
      500
    );
  }

  const token = await getPesaPalToken(env);

  const paymentRequest = {
    id: merchantReference,
    currency: "KES",
    amount,
    description: "HUPPY CUBE Wallet Deposit",
    callback_url: callbackUrl,
    notification_id: ipnId,
    billing_address: {
      first_name: user.name,
      phone_number: user.phone,
      country_code: "KE"
    }
  };

  const pesa = await pesaPalRequest(
    env,
    "/api/Transactions/SubmitOrderRequest",
    paymentRequest,
    token
  );

  if (!pesa?.redirect_url) {
    return json(
      {
        error: "PesaPal error",
        message:
          pesa?.message ||
          "PesaPal did not return a payment URL.",
        data: pesa
      },
      502
    );
  }

  await env.DB.prepare(
    `
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
    VALUES (?, ?, ?, ?, ?, 'KES', 'PENDING', ?)
    `
  )
    .bind(
      merchantReference,
      pesa.tracking_id || null,
      user.phone,
      null,
      amount,
      user.id
    )
    .run();

  return json({
    success: true,
    merchant_reference: merchantReference,
    tracking_id: pesa.tracking_id || null,
    redirect_url: pesa.redirect_url,
    amount,
    currency: "KES"
  });
}

async function getPaymentStatus(request, env) {
  const user = await requireUser(request, env);

  const url = new URL(request.url);

  const reference =
    url.searchParams.get("reference") ||
    url.searchParams.get("merchant_reference");

  if (!reference) {
    return json(
      {
        error: "Missing reference"
      },
      400
    );
  }

  const payment = await env.DB.prepare(
    `
    SELECT *
    FROM payments
    WHERE merchant_reference = ?
      AND user_id = ?
    LIMIT 1
    `
  )
    .bind(reference, user.id)
    .first();

  if (!payment) {
    return json(
      {
        error: "Payment not found"
      },
      404
    );
  }

  let status = payment.status;

  if (payment.tracking_id) {
    try {
      const token = await getPesaPalToken(env);

      const response = await fetch(
        `${PESAPAL_BASE}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(
          payment.tracking_id
        )}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await response.json();

      if (data?.status === 1 || data?.payment_status_description === "Completed") {
        status = "COMPLETED";
      } else if (
        data?.status === 2 ||
        data?.payment_status_description === "Failed"
      ) {
        status = "FAILED";
      } else if (
        data?.status === 3 ||
        data?.payment_status_description === "Reversed"
      ) {
        status = "REVERSED";
      } else {
        status = "PENDING";
      }

      await env.DB.prepare(
        `
        UPDATE payments
        SET status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `
      )
        .bind(status, payment.id)
        .run();

      if (status === "COMPLETED") {
        await creditPayment(env, payment.id);
      }
    } catch (error) {
      console.error("PesaPal status error:", error);
    }
  }

  const updated = await env.DB.prepare(
    `
    SELECT *
    FROM payments
    WHERE id = ?
    LIMIT 1
    `
  )
    .bind(payment.id)
    .first();

  return json({
    success: true,
    payment: updated
  });
}

async function creditPayment(env, paymentId) {
  const payment = await env.DB.prepare(
    `
    SELECT *
    FROM payments
    WHERE id = ?
    LIMIT 1
    `
  )
    .bind(paymentId)
    .first();

  if (!payment) {
    throw new Error("Payment not found.");
  }

  if (payment.credited === 1) {
    return {
      success: true,
      credited: false,
      message: "Already credited."
    };
  }

  let userId = payment.user_id;

  if (!userId) {
    const user = await env.DB.prepare(
      `
      SELECT id
      FROM users
      WHERE phone = ?
      LIMIT 1
      `
    )
      .bind(payment.phone)
      .first();

    if (!user) {
      throw new Error("User for payment was not found.");
    }

    userId = user.id;

    await env.DB.prepare(
      `
      UPDATE payments
      SET user_id = ?
      WHERE id = ?
      `
    )
      .bind(userId, payment.id)
      .run();
  }

  const wallet = await ensureWallet(env, {
    id: userId,
    phone: payment.phone
  });

  const reference = `DEP-${payment.merchant_reference}`;

  await env.DB.batch([
    env.DB.prepare(
      `
      UPDATE wallets
      SET balance = balance + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
      `
    ).bind(Number(payment.amount), userId),

    env.DB.prepare(
      `
      INSERT OR IGNORE INTO wallet_transactions
      (
        user_id,
        phone,
        type,
        amount,
        reference,
        description
      )
      VALUES (?, ?, 'CREDIT', ?, ?, ?)
      `
    ).bind(
      userId,
      payment.phone,
      Number(payment.amount),
      reference,
      "PesaPal wallet deposit"
    ),

    env.DB.prepare(
      `
      UPDATE payments
      SET credited = 1,
          status = 'COMPLETED',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND credited = 0
      `
    ).bind(payment.id)
  ]);

  return {
    success: true,
    credited: true,
    amount: Number(payment.amount),
    wallet_id: wallet?.phone
  };
}

async function handleIPN(request, env) {
  let body = {};

  try {
    body = await request.json();
  } catch {
    const form = await request.formData().catch(() => null);

    if (form) {
      body = Object.fromEntries(form.entries());
    }
  }

  const trackingId =
    body.OrderTrackingId ||
    body.orderTrackingId ||
    body.tracking_id ||
    body.trackingId;

  const merchantReference =
    body.OrderMerchantReference ||
    body.orderMerchantReference ||
    body.merchant_reference ||
    body.reference;

  if (!trackingId && !merchantReference) {
    return json({
      orderNotificationType: "IPNCHANGE",
      orderTrackingId: "",
      orderMerchantReference: ""
    });
  }

  let payment = null;

  if (trackingId) {
    payment = await env.DB.prepare(
      `
      SELECT *
      FROM payments
      WHERE tracking_id = ?
      LIMIT 1
      `
    )
      .bind(trackingId)
      .first();
  }

  if (!payment && merchantReference) {
    payment = await env.DB.prepare(
      `
      SELECT *
      FROM payments
      WHERE merchant_reference = ?
      LIMIT 1
      `
    )
      .bind(merchantReference)
      .first();
  }

  if (!payment) {
    return json({
      orderNotificationType: "IPNCHANGE",
      orderTrackingId: trackingId || "",
      orderMerchantReference: merchantReference || ""
    });
  }

  try {
    const token = await getPesaPalToken(env);

    const response = await fetch(
      `${PESAPAL_BASE}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(
        payment.tracking_id || trackingId
      )}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`
        }
      }
    );

    const data = await response.json();

    let status = "PENDING";

    if (
      data?.status === 1 ||
      data?.payment_status_description === "Completed"
    ) {
      status = "COMPLETED";
    } else if (
      data?.status === 2 ||
      data?.payment_status_description === "Failed"
    ) {
      status = "FAILED";
    } else if (
      data?.status === 3 ||
      data?.payment_status_description === "Reversed"
    ) {
      status = "REVERSED";
    }

    await env.DB.prepare(
      `
      UPDATE payments
      SET status = ?,
          tracking_id = COALESCE(tracking_id, ?),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `
    )
      .bind(status, trackingId || null, payment.id)
      .run();

    if (status === "COMPLETED") {
      await creditPayment(env, payment.id);
    }
  } catch (error) {
    console.error("IPN processing error:", error);
  }

  return json({
    orderNotificationType: "IPNCHANGE",
    orderTrackingId: trackingId || payment.tracking_id || "",
    orderMerchantReference:
      merchantReference || payment.merchant_reference || ""
  });
}

async function registerIPN(request, env) {
  const token = await getPesaPalToken(env);

  const notificationUrl =
    env.IPN_URL ||
    `${new URL(request.url).origin}/api/ipn`;

  const data = await pesaPalRequest(
    env,
    "/api/URLSetup/RegisterIPN",
    {
      url: notificationUrl,
      ipn_notification_type: "GET"
    },
    token
  );

  return json({
    success: true,
    notification_url: notificationUrl,
    data
  });
}

async function getServices(env) {
  const services = await denzRequest(
    {
      action: "services"
    },
    env
  );

  if (!Array.isArray(services)) {
    return json({
      success: true,
      services: []
    });
  }

  const rows = [];

  for (const service of services) {
    const supplierRate = Number(service.rate || 0);

    if (!service.service || !Number.isFinite(supplierRate)) {
      continue;
    }

    const customerRate = supplierRate * 2;

    rows.push(
      env.DB.prepare(
        `
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
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
        `
      ).bind(
        Number(service.service),
        String(service.name || `Service ${service.service}`),
        String(service.type || ""),
        String(service.category || "Other"),
        supplierRate,
        customerRate,
        Number(service.min || 1),
        Number(service.max || 1000000),
        service.refill ? 1 : 0,
        service.cancel ? 1 : 0
      )
    );
  }

  /*
   * D1 batches have a practical size limit, so sync in chunks.
   */
  for (let i = 0; i < rows.length; i += 50) {
    await env.DB.batch(rows.slice(i, i + 50));
  }

  const local = await env.DB.prepare(
    `
    SELECT
      service_id,
      name,
      type,
      category,
      customer_rate AS rate,
      min_quantity AS min,
      max_quantity AS max,
      refill,
      cancel
    FROM smm_services
    WHERE active = 1
    ORDER BY category, service_id
    `
  ).all();

  return json({
    success: true,
    count: local.results.length,
    services: local.results
  });
}

async function getLocalServices(env) {
  const result = await env.DB.prepare(
    `
    SELECT
      service_id,
      name,
      type,
      category,
      customer_rate AS rate,
      min_quantity AS min,
      max_quantity AS max,
      refill,
      cancel
    FROM smm_services
    WHERE active = 1
    ORDER BY category, service_id
    `
  ).all();

  return json({
    success: true,
    count: result.results.length,
    services: result.results
  });
}

async function getDenzBalance(env) {
  const data = await denzRequest(
    {
      action: "balance"
    },
    env
  );

  return json({
    success: true,
    balance: data
  });
}

async function createSmmOrder(request, env) {
  const user = await requireUser(request, env);

  const body = await request.json();

  const serviceId = Number(body.service_id || body.service);
  const link = String(body.link || "").trim();
  const quantity = Number(body.quantity);

  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    return json(
      {
        error: "Invalid service",
        message: "Select a valid service."
      },
      400
    );
  }

  if (!link) {
    return json(
      {
        error: "Invalid link",
        message: "Enter the target link."
      },
      400
    );
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return json(
      {
        error: "Invalid quantity",
        message: "Enter a valid quantity."
      },
      400
    );
  }

  const service = await env.DB.prepare(
    `
    SELECT *
    FROM smm_services
    WHERE service_id = ?
      AND active = 1
    LIMIT 1
    `
  )
    .bind(serviceId)
    .first();

  if (!service) {
    return json(
      {
        error: "Service not found",
        message: "This service is not available."
      },
      404
    );
  }

  const min = Number(service.min_quantity);
  const max = Number(service.max_quantity);

  if (quantity < min || quantity > max) {
    return json(
      {
        error: "Invalid quantity",
        message: `Quantity must be between ${min} and ${max}.`
      },
      400
    );
  }

  const customerRate = Number(service.customer_rate);

  /*
   * Standard SMM pricing calculation:
   * rate × quantity ÷ 1000
   */
  const amount = Number(
    ((customerRate * quantity) / 1000).toFixed(4)
  );

  if (!Number.isFinite(amount) || amount <= 0) {
    return json(
      {
        error: "Invalid price"
      },
      400
    );
  }

  const wallet = await ensureWallet(env, user);

  const currentBalance = Number(wallet.balance || 0);

  if (currentBalance < amount) {
    return json(
      {
        error: "Insufficient balance",
        message: "Please deposit money into your wallet first.",
        balance: currentBalance,
        required: amount
      },
      402
    );
  }

  /*
   * Create local order first.
   */
  const localOrder = await env.DB.prepare(
    `
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Processing')
    `
  )
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

  const localOrderId = localOrder.meta.last_row_id;

  /*
   * Deduct wallet only if enough money remains.
   * This protects against two simultaneous orders spending
   * the same balance.
   */
  const deduction = await env.DB.prepare(
    `
    UPDATE wallets
    SET balance = balance - ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
      AND balance >= ?
    `
  )
    .bind(amount, user.id, amount)
    .run();

  if (!deduction.meta.changes) {
    await env.DB.prepare(
      `
      UPDATE smm_orders
      SET status = 'Failed',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND user_id = ?
      `
    )
      .bind(localOrderId, user.id)
      .run();

    return json(
      {
        error: "Insufficient balance",
        message: "Your wallet balance is not enough."
      },
      402
    );
  }

  try {
    const supplier = await denzRequest(
      {
        action: "add",
        service: serviceId,
        link,
        quantity
      },
      env
    );

    if (!supplier?.order) {
      throw new Error(
        supplier?.error ||
          supplier?.message ||
          "DenzGains did not create the order."
      );
    }

    const supplierOrderId = String(supplier.order);

    await env.DB.batch([
      env.DB.prepare(
        `
        UPDATE smm_orders
        SET supplier_order_id = ?,
            status = 'Pending',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND user_id = ?
        `
      ).bind(supplierOrderId, localOrderId, user.id),

      env.DB.prepare(
        `
        INSERT INTO wallet_transactions
        (
          user_id,
          phone,
          type,
          amount,
          reference,
          description
        )
        VALUES (?, ?, 'DEBIT', ?, ?, ?)
        `
      ).bind(
        user.id,
        user.phone,
        amount,
        `ORDER-${localOrderId}`,
        `SMM order #${localOrderId}`
      )
    ]);

    const updatedWallet = await getWallet(env, user);

    return json({
      success: true,
      message: "Order created successfully.",
      order: {
        id: localOrderId,
        supplier_order_id: supplierOrderId,
        service_id: serviceId,
        service_name: service.name,
        link,
        quantity,
        amount,
        status: "Pending"
      },
      wallet: updatedWallet
    });
  } catch (error) {
    /*
     * Supplier failed, therefore refund customer.
     */
    await env.DB.batch([
      env.DB.prepare(
        `
        UPDATE wallets
        SET balance = balance + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
        `
      ).bind(amount, user.id),

      env.DB.prepare(
        `
        INSERT INTO wallet_transactions
        (
          user_id,
          phone,
          type,
          amount,
          reference,
          description
        )
        VALUES (?, ?, 'REFUND', ?, ?, ?)
        `
      ).bind(
        user.id,
        user.phone,
        amount,
        `REFUND-${localOrderId}`,
        `Refund for failed SMM order #${localOrderId}`
      ),

      env.DB.prepare(
        `
        UPDATE smm_orders
        SET status = 'Failed',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND user_id = ?
        `
      ).bind(localOrderId, user.id)
    ]);

    return json(
      {
        error: "Order failed",
        message:
          error?.message ||
          "The supplier could not create the order. Your money has been refunded."
      },
      502
    );
  }
}

async function getOrders(request, env) {
  const user = await requireUser(request, env);

  const result = await env.DB.prepare(
    `
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
    LIMIT 200
    `
  )
    .bind(user.id)
    .all();

  return json({
    success: true,
    orders: result.results
  });
}

async function getOwnedOrder(env, user, orderId) {
  const order = await env.DB.prepare(
    `
    SELECT *
    FROM smm_orders
    WHERE id = ?
      AND user_id = ?
    LIMIT 1
    `
  )
    .bind(orderId, user.id)
    .first();

  if (!order) {
    throw new Error("Order not found.");
  }

  return order;
}

async function getSmmStatus(request, env) {
  const user = await requireUser(request, env);

  const url = new URL(request.url);

  const id = Number(
    url.searchParams.get("id") ||
      url.searchParams.get("order")
  );

  if (!Number.isInteger(id) || id <= 0) {
    return json(
      {
        error: "Invalid order ID"
      },
      400
    );
  }

  const order = await getOwnedOrder(env, user, id);

  if (!order.supplier_order_id) {
    return json({
      success: true,
      order
    });
  }

  const supplier = await denzRequest(
    {
      action: "status",
      order: order.supplier_order_id
    },
    env
  );

  const status = String(
    supplier.status ||
      order.status ||
      "Pending"
  );

  const remains =
    supplier.remains !== undefined
      ? Number(supplier.remains)
      : order.remains;

  const startCount =
    supplier.start_count !== undefined
      ? Number(supplier.start_count)
      : order.start_count;

  await env.DB.prepare(
    `
    UPDATE smm_orders
    SET status = ?,
        remains = ?,
        start_count = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND user_id = ?
    `
  )
    .bind(
      status,
      remains ?? null,
      startCount ?? null,
      id,
      user.id
    )
    .run();

  const updated = await getOwnedOrder(env, user, id);

  return json({
    success: true,
    order: updated,
    supplier_status: supplier
  });
}

async function refillOrder(request, env) {
  const user = await requireUser(request, env);

  const body = await request.json();

  const id = Number(body.id || body.order);

  if (!Number.isInteger(id) || id <= 0) {
    return json(
      {
        error: "Invalid order ID"
      },
      400
    );
  }

  const order = await getOwnedOrder(env, user, id);

  if (!order.supplier_order_id) {
    return json(
      {
        error: "Supplier order ID missing"
      },
      400
    );
  }

  const result = await denzRequest(
    {
      action: "refill",
      order: order.supplier_order_id
    },
    env
  );

  return json({
    success: true,
    result
  });
}

async function cancelOrder(request, env) {
  const user = await requireUser(request, env);

  const body = await request.json();

  const id = Number(body.id || body.order);

  if (!Number.isInteger(id) || id <= 0) {
    return json(
      {
        error: "Invalid order ID"
      },
      400
    );
  }

  const order = await getOwnedOrder(env, user, id);

  if (!order.supplier_order_id) {
    return json(
      {
        error: "Supplier order ID missing"
      },
      400
    );
  }

  const result = await denzRequest(
    {
      action: "cancel",
      order: order.supplier_order_id
    },
    env
  );

  await env.DB.prepare(
    `
    UPDATE smm_orders
    SET status = 'Canceled',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND user_id = ?
    `
  )
    .bind(id, user.id)
    .run();

  return json({
    success: true,
    result
  });
}

async function getWalletTransactions(request, env) {
  const user = await requireUser(request, env);

  const result = await env.DB.prepare(
    `
    SELECT
      id,
      type,
      amount,
      reference,
      description,
      created_at
    FROM wallet_transactions
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 100
    `
  )
    .bind(user.id)
    .all();

  return json({
    success: true,
    transactions: result.results
  });
}

async function router(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization",
        "Access-Control-Allow-Methods":
          "GET, POST, PUT, DELETE, OPTIONS"
      }
    });
  }

  try {
    /*
     * AUTH
     */
    if (
      path === "/api/auth/register" &&
      method === "POST"
    ) {
      return await registerUser(request, env);
    }

    if (
      path === "/api/auth/login" &&
      method === "POST"
    ) {
      return await loginUser(request, env);
    }

    if (
      path === "/api/auth/logout" &&
      method === "POST"
    ) {
      return await logoutUser(request, env);
    }

    if (
      path === "/api/auth/me" &&
      method === "GET"
    ) {
      return await authMe(request, env);
    }

    /*
     * WALLET
     */
    if (
      path === "/api/wallet" &&
      method === "GET"
    ) {
      const user = await requireUser(request, env);
      return json(await getWallet(env, user));
    }

    if (
      path === "/api/wallet/transactions" &&
      method === "GET"
    ) {
      return await getWalletTransactions(request, env);
    }

    /*
     * PESAPAL
     */
    if (
      path === "/api/payment" &&
      method === "POST"
    ) {
      return await createPayment(request, env);
    }

    if (
      path === "/api/payment-status" &&
      method === "GET"
    ) {
      return await getPaymentStatus(request, env);
    }

    if (
      path === "/api/ipn" &&
      (method === "POST" || method === "GET")
    ) {
      return await handleIPN(request, env);
    }

    if (
      path === "/api/register-ipn" &&
      method === "POST"
    ) {
      return await registerIPN(request, env);
    }

    /*
     * DENZGAINS SERVICES
     */
    if (
      path === "/api/denzgains/services" &&
      method === "GET"
    ) {
      return await getServices(env);
    }

    if (
      path === "/api/services" &&
      method === "GET"
    ) {
      return await getLocalServices(env);
    }

    if (
      path === "/api/denzgains/balance" &&
      method === "GET"
    ) {
      return await getDenzBalance(env);
    }

    /*
     * SMM ORDERS
     */
    if (
      path === "/api/smm/order" &&
      method === "POST"
    ) {
      return await createSmmOrder(request, env);
    }

    if (
      path === "/api/smm/status" &&
      method === "GET"
    ) {
      return await getSmmStatus(request, env);
    }

    if (
      path === "/api/smm/refill" &&
      method === "POST"
    ) {
      return await refillOrder(request, env);
    }

    if (
      path === "/api/smm/cancel" &&
      method === "POST"
    ) {
      return await cancelOrder(request, env);
    }

    if (
      path === "/api/orders" &&
      method === "GET"
    ) {
      return await getOrders(request, env);
    }

    return null;
  } catch (error) {
    console.error("Worker error:", error);

    if (error instanceof Response) {
      return error;
    }

    return json(
      {
        error: "Server error",
        message: error?.message || "Something went wrong."
      },
      500
    );
  }
}

export default {
  async fetch(request, env) {
    const apiResponse = await router(request, env);

    if (apiResponse) {
      return apiResponse;
    }

    /*
     * Frontend / SPA
     */
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("HUPPY CUBE", {
      status: 200,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }
};
