// ============================================================
// HUPPY CUBE - COMPLETE CLOUDFLARE WORKER (PESAPAL + MPESA)
// ============================================================

const PESAPAL_LIVE_BASE = "https://pay.pesapal.com/v3";
const PESAPAL_SANDBOX_BASE = "https://cybqa.pesapal.com/pesapalv3";
const DENZGAINS_BASE = "https://denzgains.com/api/v2";
const WHATSAPP_NUMBER = "254796681162";

// Default markup: 2x supplier rate
const DEFAULT_MARKUP = 2.0;

/* =========================================================
   REFERRAL CONFIG
========================================================= */

const REFERRAL_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const REFERRAL_CODE_LENGTH = 6;
const REFERRAL_WINDOW_HOURS = 24;
const REFERRAL_MAX_WINDOW_HOURS = 24 * 7; // 7-day rolling cap
const REFERRAL_DISCOUNT_PCT = 10;
const MIN_CHARGE_KES = 4;

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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
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
  try { return JSON.parse(value); } catch { return fallback; }
}

function randomId(prefix = "HUPPY") {
  const random = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()
    : Math.random().toString(36).slice(2, 14).toUpperCase();
  return `${prefix}-${Date.now()}-${random}`;
}

function normalizePhone(phone) {
  let p = text(phone).replace(/[^\d+]/g, "");
  if (p.startsWith("+254")) p = "254" + p.slice(4);
  else if (p.startsWith("254")) { /* ok */ }
  else if (p.startsWith("0")) p = "254" + p.slice(1);
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
  return error.message || error.error?.message || error.error_description || JSON.stringify(error);
}

function getOrigin(request) { return new URL(request.url).origin; }

function getEnvOrigin(env, request) {
  return text(env.PUBLIC_BASE_URL).replace(/\/$/, "") || getOrigin(request);
}

function isAdminAuthorized(env, request) {
  const url = new URL(request.url);
  const provided = text(url.searchParams.get("secret"));
  const expected = text(env.TEST_ORDER_SECRET);
  if (!expected) return false;
  if (!provided) return false;
  return provided === expected;
}

function adminUnauthorized() {
  return json({ success: false, error: "Unauthorized." }, 401);
}

function buildDateFilter(url) {
  const from = text(url.searchParams.get("from"));
  const to = text(url.searchParams.get("to"));
  const wheres = [];
  const binds = [];
  if (from) { wheres.push(`date(created_at, '+3 hours') >= ?`); binds.push(from); }
  if (to) { wheres.push(`date(created_at, '+3 hours') <= ?`); binds.push(to); }
  return { wheres, binds };
}

function toNairobiISO(utcString) {
  if (!utcString) return "";
  const raw = String(utcString);
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T") + "Z";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return raw;
  return new Date(ms + 3 * 60 * 60 * 1000).toISOString().replace("Z", "+03:00");
}

function normalizeSupplierStatus(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "completed") return "Completed";
  if (s === "partial") return "Partial";
  if (s === "canceled" || s === "cancelled") return "Cancelled";
  if (s === "fail" || s === "failed") return "Failed";
  if (s === "in progress" || s === "inprogress" || s === "processing") return "Processing";
  if (s === "awaiting" || s === "pending") return "Pending";
  return null;
}

function isTerminalStatus(status) {
  const s = String(status || "").toLowerCase();
  return s.includes("completed") || s.includes("partial") || s.includes("cancel")
    || s.includes("failed") || s.includes("reversed");
}

function recentlyFailedSubmission(order) {
  if (!order?.error_message) return false;
  if (!order?.updated_at) return false;
  const raw = String(order.updated_at);
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T") + "Z";
  const updated = Date.parse(iso);
  if (!Number.isFinite(updated)) return false;
  return Date.now() - updated < 60_000;
}

const REQUIRED_ORDER_COLUMNS = {
  tracking_id: "TEXT", service_id: "TEXT", service_name: "TEXT", link: "TEXT",
  quantity: "INTEGER", phone: "TEXT",
  supplier_rate: "REAL", customer_rate: "REAL", supplier_amount: "REAL", customer_amount: "REAL",
  payment_status: "TEXT", order_status: "TEXT",
  pesapal_order_tracking_id: "TEXT", pesapal_merchant_reference: "TEXT",
  mpesa_checkout_request_id: "TEXT", mpesa_receipt_number: "TEXT",
  supplier_order_id: "TEXT", supplier_response: "TEXT",
  error_message: "TEXT", created_at: "TEXT", updated_at: "TEXT",
  referral_code: "TEXT", discount_pct: "INTEGER DEFAULT 0",
  original_amount: "REAL", referral_referrer_phone: "TEXT",
};

let ORDERS_TABLE_READY = false;

async function ensureOrdersTable(env) {
  if (ORDERS_TABLE_READY) return;

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_id TEXT UNIQUE NOT NULL,
      service_id TEXT, service_name TEXT, link TEXT, quantity INTEGER, phone TEXT,
      supplier_rate REAL DEFAULT 0, customer_rate REAL DEFAULT 0,
      supplier_amount REAL DEFAULT 0, customer_amount REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'PENDING', order_status TEXT DEFAULT 'Pending',
      pesapal_order_tracking_id TEXT, pesapal_merchant_reference TEXT,
      supplier_order_id TEXT, supplier_response TEXT, error_message TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  const tableInfo = await env.DB.prepare(`PRAGMA table_info(orders)`).all();
  const existing = new Set((tableInfo.results || []).map((row) => row.name));

  for (const [column, definition] of Object.entries(REQUIRED_ORDER_COLUMNS)) {
    if (existing.has(column)) continue;
    await env.DB.prepare(`ALTER TABLE orders ADD COLUMN ${column} ${definition}`).run();
  }

  ORDERS_TABLE_READY = true;
}

/* =========================================================
   SETTINGS & REFERRALS
========================================================= */

let SETTINGS_TABLE_READY = false;
async function ensureSettingsTable(env) {
  if (SETTINGS_TABLE_READY) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  SETTINGS_TABLE_READY = true;
}

async function getSetting(env, key, fallback = null) {
  try {
    const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ? LIMIT 1`).bind(key).first();
    return row?.value ?? fallback;
  } catch { return fallback; }
}

async function setSetting(env, key, value) {
  await env.DB.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).bind(key, String(value)).run();
}

async function getMarkupMultiplier(env) {
  const raw = await getSetting(env, "markup_multiplier", null);
  if (raw === null || raw === undefined || raw === "") return DEFAULT_MARKUP;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MARKUP;
}

let REFERRAL_TABLES_READY = false;
async function ensureReferralTables(env) {
  if (REFERRAL_TABLES_READY) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS referral_codes (phone TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS referrals (id INTEGER PRIMARY KEY AUTOINCREMENT, referrer_phone TEXT NOT NULL, referee_phone TEXT NOT NULL, referral_code TEXT NOT NULL, referee_order_tracking_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(referrer_phone, referee_phone))`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_phone)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_referrals_referee ON referrals(referee_phone)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS referral_discounts (phone TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`).run();

  try {
    const info = await env.DB.prepare(`PRAGMA table_info(orders)`).all();
    const existing = new Set((info.results || []).map((r) => r.name));
    const wanted = { referral_code: "TEXT", discount_pct: "INTEGER DEFAULT 0", original_amount: "REAL", referral_referrer_phone: "TEXT" };
    for (const [col, def] of Object.entries(wanted)) {
      if (!existing.has(col)) await env.DB.prepare(`ALTER TABLE orders ADD COLUMN ${col} ${def}`).run();
    }
  } catch (e) { console.error("Referral column setup failed:", e); }
  REFERRAL_TABLES_READY = true;
}

function generateReferralCode() {
  const bytes = new Uint8Array(REFERRAL_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) out += REFERRAL_CODE_ALPHABET[bytes[i] % REFERRAL_CODE_ALPHABET.length];
  return out;
}

async function getOrCreateReferralCode(env, phone) {
  const p = normalizePhone(phone);
  if (!isValidPhone(p)) return null;
  const existing = await env.DB.prepare(`SELECT code FROM referral_codes WHERE phone = ? LIMIT 1`).bind(p).first();
  if (existing?.code) return existing.code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      await env.DB.prepare(`INSERT INTO referral_codes (phone, code, created_at) VALUES (?, ?, ?)`).bind(p, code, Date.now()).run();
      return code;
    } catch {
      const again = await env.DB.prepare(`SELECT code FROM referral_codes WHERE phone = ? LIMIT 1`).bind(p).first();
      if (again?.code) return again.code;
    }
  }
  throw new Error("Could not generate a unique referral code.");
}

async function resolveReferralCode(env, code) {
  const c = text(code).toUpperCase();
  if (!c) return null;
  const row = await env.DB.prepare(`SELECT phone FROM referral_codes WHERE code = ? LIMIT 1`).bind(c).first();
  return row?.phone || null;
}

async function getReferralDiscount(env, phone) {
  const p = normalizePhone(phone);
  if (!p) return null;
  const row = await env.DB.prepare(`SELECT expires_at FROM referral_discounts WHERE phone = ? LIMIT 1`).bind(p).first();
  if (!row) return null;
  const expires = Number(row.expires_at || 0);
  return { active: expires > Date.now(), expires_at: expires };
}

async function extendReferralDiscount(env, phone) {
  const p = normalizePhone(phone);
  if (!p) return null;
  const now = Date.now();
  const addMs = REFERRAL_WINDOW_HOURS * 60 * 60 * 1000;
  const capMs = REFERRAL_MAX_WINDOW_HOURS * 60 * 60 * 1000;
  const existing = await env.DB.prepare(`SELECT expires_at FROM referral_discounts WHERE phone = ? LIMIT 1`).bind(p).first();
  const currentExpiry = Number(existing?.expires_at || 0);
  const base = Math.max(currentExpiry, now);
  let next = base + addMs;
  if (next - now > capMs) next = now + capMs;
  await env.DB.prepare(`
    INSERT INTO referral_discounts (phone, expires_at, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET expires_at = excluded.expires_at, updated_at = excluded.updated_at
  `).bind(p, next, now).run();
  return next;
}

async function hasOrderedBefore(env, phone) {
  const p = normalizePhone(phone);
  if (!p) return false;
  const row = await env.DB.prepare(`
    SELECT 1 AS hit FROM orders WHERE phone = ? AND (payment_status IS NULL OR payment_status != 'PAYMENT_SETUP_FAILED') LIMIT 1
  `).bind(p).first();
  return Boolean(row?.hit);
}

async function creditReferrerForOrder(env, order) {
  if (!order) return { credited: false };
  const referrer = normalizePhone(order.referral_referrer_phone);
  const referee = normalizePhone(order.phone);
  const code = text(order.referral_code);
  if (!referrer || !referee || !code || referrer === referee) return { credited: false };

  const flip = await env.DB.prepare(`
    UPDATE referrals SET status = 'CONFIRMED', updated_at = ?
    WHERE referrer_phone = ? AND referee_phone = ? AND status = 'PENDING'
  `).bind(Date.now(), referrer, referee).run();

  if (Number(flip?.meta?.changes || 0) === 0) return { credited: false, already: true };
  const expiresAt = await extendReferralDiscount(env, referrer);
  return { credited: true, expires_at: expiresAt, referrer };
}

/* =========================================================
   DENZGAINS
========================================================= */

async function getDenzGainsServices(env) {
  const response = await denzGainsRequest(env, { action: "services" });
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.services)) return response.services;
  throw new Error(`DenzGains services response is not an array`);
}

async function getOrderByTrackingId(env, trackingId) {
  if (!trackingId) return null;
  return await env.DB.prepare(`SELECT * FROM orders WHERE tracking_id = ? LIMIT 1`).bind(trackingId).first();
}

async function getOrderByPesapalTrackingId(env, pesapalTrackingId) {
  if (!pesapalTrackingId) return null;
  return await env.DB.prepare(`SELECT * FROM orders WHERE pesapal_order_tracking_id = ? LIMIT 1`).bind(pesapalTrackingId).first();
}

async function getOrderByMerchantReference(env, merchantReference) {
  if (!merchantReference) return null;
  return await env.DB.prepare(`SELECT * FROM orders WHERE pesapal_merchant_reference = ? OR tracking_id = ? LIMIT 1`).bind(merchantReference, merchantReference).first();
}

async function getOrderByMpesaCheckoutId(env, checkoutId) {
  if (!checkoutId) return null;
  return await env.DB.prepare(`SELECT * FROM orders WHERE mpesa_checkout_request_id = ? LIMIT 1`).bind(checkoutId).first();
}

async function updateOrder(env, trackingId, values) {
  const entries = Object.entries(values || {}).filter(([, value]) => value !== undefined);
  if (!entries.length) return;
  const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
  const params = entries.map(([, value]) => value);
  await env.DB.prepare(`UPDATE orders SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE tracking_id = ?`).bind(...params, trackingId).run();
}

async function claimSupplierSubmission(env, trackingId) {
  const result = await env.DB.prepare(`
    UPDATE orders SET payment_status = 'COMPLETED', order_status = 'Submitting', error_message = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE tracking_id = ? AND supplier_order_id IS NULL AND (order_status IS NULL OR order_status != 'Submitting')
  `).bind(trackingId).run();
  return Number(result?.meta?.changes || 0) > 0;
}

async function denzGainsRequest(env, payload) {
  const apiKey = text(env.DENZGAINS_API_KEY);
  if (!apiKey) throw new Error("DENZGAINS_API_KEY is not configured.");

  const params = new URLSearchParams();
  params.set("key", apiKey);
  for (const [key, value] of Object.entries(payload || {})) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }

  const response = await fetch(`${DENZGAINS_BASE}?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json", "User-Agent": "HUPPY-CUBE/1.0" },
  });

  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { raw }; }

  if (!response.ok) throw new Error(`DenzGains HTTP ${response.status}: ${raw.slice(0, 1000)}`);
  if (data && (data.error || data.errors || data.success === false)) {
    throw new Error(typeof data.error === "string" ? data.error : data.error?.message || data.message || data.errors?.message || JSON.stringify(data));
  }
  return data;
}

function normalizeSupplierService(service) {
  const serviceId = service?.service ?? service?.service_id ?? service?.id;
  const rate = service?.rate ?? service?.price ?? service?.cost ?? 0;
  const min = service?.min ?? service?.minimum ?? service?.min_quantity ?? 1;
  const max = service?.max ?? service?.maximum ?? service?.max_quantity ?? 1000000;
  return {
    service_id: String(serviceId ?? ""), name: text(service?.name), rate: number(rate),
    min: number(min, 1), max: number(max, 1000000), min_quantity: number(min, 1), max_quantity: number(max, 1000000),
    category: text(service?.category), type: text(service?.type), refill: service?.refill, cancel: service?.cancel, raw: service,
  };
}

async function findSupplierService(env, serviceId) {
  const services = await getDenzGainsServices(env);
  const requested = String(serviceId);
  const found = services.find((service) => String(service?.service ?? service?.service_id ?? service?.id) === requested);
  if (!found) throw new Error(`DenzGains service ${requested} was not found.`);
  return normalizeSupplierService(found);
}

async function addDenzGainsOrder(env, serviceId, link, quantity) {
  return await denzGainsRequest(env, { action: "add", service: String(serviceId), link: String(link), quantity: Number(quantity) });
}

async function getDenzGainsOrderStatus(env, supplierOrderId) {
  return await denzGainsRequest(env, { action: "status", order: String(supplierOrderId) });
}

async function getDenzGainsBalance(env) {
  return await denzGainsRequest(env, { action: "balance" });
}

function extractSupplierOrderId(response) {
  if (!response) return "";
  const candidates = [response.order, response.order_id, response.id, response.orderId, response.supplier_order_id];
  for (const value of candidates) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

/* =========================================================
   M-PESA DARAJA (STK PUSH)
========================================================= */

function getMpesaBase(env) {
  return text(env.MPESA_ENVIRONMENT).toLowerCase() === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
}

function getMpesaTimestamp() {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}${h}${min}${s}`;
}

async function getMpesaToken(env) {
  const auth = btoa(`${text(env.MPESA_CONSUMER_KEY)}:${text(env.MPESA_CONSUMER_SECRET)}`);
  const response = await fetch(`${getMpesaBase(env)}/oauth/v1/generate?grant_type=client_credentials`, {
    method: "GET", headers: { Authorization: `Basic ${auth}`, Accept: "application/json" }
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { raw }; }
  if (!response.ok || !data.access_token) throw new Error(`M-Pesa Auth Failed: ${raw.slice(0, 1000)}`);
  return data.access_token;
}

async function initiateMpesaStkPush(env, phone, amount, accountRef, description, callbackUrl) {
  const token = await getMpesaToken(env);
  const timestamp = getMpesaTimestamp();
  const shortcode = text(env.MPESA_SHORTCODE);
  const passkey = text(env.MPESA_PASSKEY);
  const password = btoa(`${shortcode}${passkey}${timestamp}`);

  // FIXED: Math.max ensures the amount is NEVER less than 1 KES.
  // FIXED: Math.ceil rounds up (e.g., 1.2 -> 2) so you don't underpay.
  const mpesaAmount = Math.max(1, Math.ceil(amount));

  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline", 
    Amount: mpesaAmount,
    PartyA: phone,
    PartyB: shortcode,
    PhoneNumber: phone,
    CallBackURL: callbackUrl,
    AccountReference: accountRef.slice(0, 12),
    TransactionDesc: description.slice(0, 13)
  };

  const response = await fetch(`${getMpesaBase(env)}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { raw }; }
  if (!response.ok) throw new Error(`STK Push Error: ${raw.slice(0, 1000)}`);
  return data;
}

async function handleMpesaCallback(env, request) {
  const body = await request.json().catch(() => ({}));
  const stkCallback = body?.Body?.stkCallback;
  const ackResponse = { ResultCode: 0, ResultDesc: "Accepted" };

  if (!stkCallback) return json(ackResponse, 200);

  const checkoutId = stkCallback.CheckoutRequestID;
  const resultCode = stkCallback.ResultCode;

  if (resultCode !== 0) {
    console.log(`M-Pesa Failed: ${stkCallback.ResultDesc}`);
    const order = await getOrderByMpesaCheckoutId(env, checkoutId);
    if (order) await updateOrder(env, order.tracking_id, { payment_status: "FAILED", order_status: "Payment Failed", error_message: stkCallback.ResultDesc });
    return json(ackResponse, 200);
  }

  const items = stkCallback.CallbackMetadata?.Item || [];
  const getVal = (name) => items.find(i => i.Name === name)?.Value;
  const mpesaReceipt = getVal("MpesaReceiptNumber");
  const amountPaid = getVal("Amount");

  const order = await getOrderByMpesaCheckoutId(env, checkoutId);
  if (!order) return json(ackResponse, 200);

  if (amountPaid >= order.customer_amount) {
    await updateOrder(env, order.tracking_id, { mpesa_receipt_number: mpesaReceipt });
    const claimed = await claimSupplierSubmission(env, order.tracking_id);
    
    if (claimed) {
      try { await creditReferrerForOrder(env, order); } catch (e) {}
      try {
        const supplierResponse = await addDenzGainsOrder(env, order.service_id, order.link, order.quantity);
        const supplierOrderId = extractSupplierOrderId(supplierResponse);
        await updateOrder(env, order.tracking_id, { 
          order_status: supplierOrderId ? "Processing" : "Supplier Error",
          supplier_order_id: supplierOrderId || null,
          supplier_response: JSON.stringify(supplierResponse) 
        });
      } catch (err) {
        await updateOrder(env, order.tracking_id, { order_status: "Supplier Error", error_message: errorMessage(err) });
      }
    }
  } else {
    await updateOrder(env, order.tracking_id, { payment_status: "PAYMENT_MISMATCH", order_status: "Payment Error", error_message: "Amount mismatch" });
  }

  return json(ackResponse, 200);
}

/* =========================================================
   PESAPAL
========================================================= */

function getPesapalBase(env) {
  const mode = text(env.PESAPAL_MODE).toLowerCase();
  if (mode === "sandbox" || mode === "test" || mode === "demo") return PESAPAL_SANDBOX_BASE;
  return PESAPAL_LIVE_BASE;
}

async function pesapalAuth(env) {
  const consumerKey = text(env.PESAPAL_CONSUMER_KEY);
  const consumerSecret = text(env.PESAPAL_CONSUMER_SECRET);
  if (!consumerKey || !consumerSecret) throw new Error("PESAPAL_CONSUMER_KEY or PESAPAL_CONSUMER_SECRET is missing.");

  const response = await fetch(`${getPesapalBase(env)}/api/Auth/RequestToken`, {
    method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ consumer_key: consumerKey, consumer_secret: consumerSecret }),
  });

  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { raw }; }

  if (!response.ok) throw new Error(`PesaPal authentication HTTP ${response.status}: ${raw.slice(0, 1000)}`);
  const token = data?.token || data?.access_token;
  if (!token) throw new Error(`PesaPal authentication failed: ${JSON.stringify(data).slice(0, 1000)}`);
  return token;
}

async function pesapalRequest(env, path, options = {}) {
  const token = await pesapalAuth(env);
  const response = await fetch(`${getPesapalBase(env)}${path}`, {
    method: options.method || "GET",
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { raw }; }

  if (!response.ok) throw new Error(`PesaPal HTTP ${response.status}: ${raw.slice(0, 1500)}`);
  const errMsg = data?.error?.message || data?.error_description || (typeof data?.error === "string" ? data.error : null);
  if (errMsg) throw new Error(errMsg);
  return data;
}

async function submitPesapalOrder(env, { merchantReference, amount, description, callbackUrl, cancellationUrl, phone, firstName, lastName }) {
  const notificationId = text(env.PESAPAL_IPN_ID);
  if (!notificationId) throw new Error("PESAPAL_IPN_ID is not configured.");
  if (!merchantReference) throw new Error("Missing PesaPal merchant reference.");
  if (!amount || amount <= 0) throw new Error("Invalid PesaPal payment amount.");

  return await pesapalRequest(env, "/api/Transactions/SubmitOrderRequest", {
    method: "POST",
    body: {
      id: merchantReference, currency: "KES", amount: roundMoney(amount),
      description: String(description).slice(0, 100), callback_url: callbackUrl,
      cancellation_url: cancellationUrl || callbackUrl, redirect_mode: "TOP_WINDOW",
      notification_id: notificationId,
      billing_address: {
        email_address: text(env.PESAPAL_BILLING_EMAIL) || "customer@huppycube.com",
        phone_number: normalizePhone(phone), country_code: "KE",
        first_name: text(firstName) || "HUPPY", middle_name: "", last_name: text(lastName) || "Customer",
        line_1: "HUPPY CUBE", line_2: "", city: "Nairobi", state: "", postal_code: "", zip_code: "",
      },
    },
  });
}

async function getPesapalTransactionStatus(env, pesapalTrackingId) {
  if (!pesapalTrackingId) throw new Error("Missing PesaPal OrderTrackingId.");
  return await pesapalRequest(env, `/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(pesapalTrackingId)}`, { method: "GET" });
}

async function readPesapalNotification(request) {
  const url = new URL(request.url);
  let body = {};
  if (request.method.toUpperCase() === "POST") {
    const contentType = request.headers.get("content-type") || "";
    try {
      if (contentType.toLowerCase().includes("application/json")) body = await request.json();
      else if (contentType.toLowerCase().includes("application/x-www-form-urlencoded")) body = Object.fromEntries((await request.formData()).entries());
      else {
        const raw = await request.text();
        const parsedJson = safeJsonParse(raw, null);
        body = parsedJson || Object.fromEntries(new URLSearchParams(raw).entries());
      }
    } catch (error) { console.error("Could not parse PesaPal notification:", error); }
  }

  const pick = (...keys) => {
    for (const key of keys) {
      const fromUrl = url.searchParams.get(key);
      if (fromUrl !== null && String(fromUrl).trim() !== "") return String(fromUrl).trim();
      const fromBody = body?.[key];
      if (fromBody !== undefined && fromBody !== null && String(fromBody).trim() !== "") return String(fromBody).trim();
    }
    return "";
  };

  return {
    merchantReference: pick("OrderMerchantReference", "orderMerchantReference", "pesapal_merchant_reference"),
    orderTrackingId: pick("OrderTrackingId", "orderTrackingId", "pesapal_transaction_tracking_id"),
    notificationType: pick("OrderNotificationType", "orderNotificationType", "pesapal_notification_type"),
  };
}

function pesapalStatusCode(data) { return number(data?.status_code ?? data?.statusCode ?? data?.payment_status_code, null); }
function pesapalStatusDescription(data) { return text(data?.payment_status_description || data?.paymentStatusDescription || data?.description || data?.status_description).toUpperCase(); }
function isPesapalCompleted(data) { return pesapalStatusCode(data) === 1 || pesapalStatusDescription(data).includes("COMPLETED"); }
function isPesapalFailed(data) { return pesapalStatusCode(data) === 2 || pesapalStatusDescription(data).includes("FAILED"); }
function isPesapalReversed(data) { return pesapalStatusCode(data) === 3 || pesapalStatusDescription(data).includes("REVERSED"); }

async function verifyPesapalPayment(env, order) {
  if (!order?.pesapal_order_tracking_id) throw new Error("This order does not have a PesaPal tracking ID yet.");
  const status = await getPesapalTransactionStatus(env, order.pesapal_order_tracking_id);
  const returnedMerchantReference = text(status?.merchant_reference);
  if (returnedMerchantReference && order.pesapal_merchant_reference && returnedMerchantReference !== order.pesapal_merchant_reference) throw new Error("PesaPal merchant reference does not match this order.");
  if (text(status?.currency).toUpperCase() !== "KES" && status?.currency) throw new Error(`Unexpected PesaPal currency: ${status.currency}`);
  return status;
}

async function processPaidOrder(env, originalOrder) {
  let order = originalOrder;
  if (!order) return { success: false, message: "Order not found." };
  if (order.supplier_order_id) return { success: true, paid: true, submitted: true, supplier_order_id: order.supplier_order_id, order_status: order.order_status || "Processing" };
  if (String(order.order_status || "").toLowerCase() === "submitting") return { success: true, paid: true, submitting: true, tracking_id: order.tracking_id, order_status: "Submitting" };
  if (!order.pesapal_order_tracking_id) return { success: false, paid: false, pending: true, message: "Waiting for PesaPal tracking ID." };

  let payment;
  try { payment = await verifyPesapalPayment(env, order); } catch (error) { await updateOrder(env, order.tracking_id, { error_message: errorMessage(error) }); throw error; }

  if (isPesapalCompleted(payment)) {
    const paidAmount = number(payment?.amount, 0);
    const expectedAmount = number(order.customer_amount, 0);
    const difference = paidAmount - expectedAmount;
    if (paidAmount > 0 && expectedAmount > 0 && (difference < -1.0 || difference > 5.0)) {
      await updateOrder(env, order.tracking_id, { payment_status: "PAYMENT_MISMATCH", order_status: "Payment Error", error_message: `Mismatch: Expected ${expectedAmount}, received ${paidAmount}.`, supplier_response: JSON.stringify(payment) });
      throw new Error("Payment amount mismatch.");
    }

    if (paidAmount > 0 && Math.abs(difference) > 0.01) await updateOrder(env, order.tracking_id, { customer_amount: paidAmount });
    
    const claimed = await claimSupplierSubmission(env, order.tracking_id);
    if (!claimed) return { success: true, paid: true, submitting: true, tracking_id: order.tracking_id, order_status: "Submitting" };

    try { await creditReferrerForOrder(env, order); } catch (refErr) {}
    order = await getOrderByTrackingId(env, order.tracking_id);

    let supplierResponse;
    try { supplierResponse = await addDenzGainsOrder(env, order.service_id, order.link, order.quantity); } catch (error) {
      await updateOrder(env, order.tracking_id, { payment_status: "COMPLETED", order_status: "Supplier Error", error_message: errorMessage(error), supplier_response: JSON.stringify({ error: errorMessage(error) }) });
      throw error;
    }

    const supplierOrderId = extractSupplierOrderId(supplierResponse);
    if (!supplierOrderId) {
      await updateOrder(env, order.tracking_id, { payment_status: "COMPLETED", order_status: "Supplier Error", error_message: "No supplier order ID returned.", supplier_response: JSON.stringify(supplierResponse) });
      throw new Error("No supplier ID.");
    }

    await updateOrder(env, order.tracking_id, { payment_status: "COMPLETED", order_status: "Processing", supplier_order_id: supplierOrderId, supplier_response: JSON.stringify(supplierResponse), error_message: null });
    return { success: true, paid: true, submitted: true, supplier_order_id: supplierOrderId, order_status: "Processing" };
  }

  if (isPesapalFailed(payment)) {
    await updateOrder(env, order.tracking_id, { payment_status: "FAILED", order_status: "Payment Failed", supplier_response: JSON.stringify(payment), error_message: text(payment?.description) || "Failed." });
    return { success: false, paid: false, failed: true, order_status: "Payment Failed", payment_status: "FAILED" };
  }

  if (isPesapalReversed(payment)) {
    await updateOrder(env, order.tracking_id, { payment_status: "REVERSED", order_status: "Payment Reversed", supplier_response: JSON.stringify(payment), error_message: text(payment?.description) || "Reversed." });
    return { success: false, paid: false, reversed: true, order_status: "Payment Reversed", payment_status: "REVERSED" };
  }

  await updateOrder(env, order.tracking_id, { payment_status: "PENDING", order_status: "Payment Pending", supplier_response: JSON.stringify(payment) });
  return { success: true, paid: false, pending: true, order_status: "Payment Pending", payment_status: "PENDING" };
}

/* =========================================================
   ROUTE HANDLERS
========================================================= */

async function handleServices(env, request) {
  try {
    const services = await getDenzGainsServices(env);
    const markup = await getMarkupMultiplier(env);
    const normalized = services.map(normalizeSupplierService).filter((s) => s.service_id && s.name);
    return corsJson({
      success: true, markup,
      services: normalized.map((s) => ({ service_id: s.service_id, name: s.name, category: s.category, type: s.type, rate: roundMoney(s.rate * markup), min: s.min, max: s.max, min_quantity: s.min_quantity, max_quantity: s.max_quantity, refill: s.refill, cancel: s.cancel })),
    }, 200, request.headers.get("Origin") || "*");
  } catch (error) { return corsJson({ success: false, error: errorMessage(error) }, 500, request.headers.get("Origin") || "*"); }
}

async function handleReferralInfo(env, request) {
  try {
    const url = new URL(request.url);
    const phone = normalizePhone(url.searchParams.get("phone"));
    if (!isValidPhone(phone)) return corsJson({ success: false, error: "Enter a valid Kenyan phone number." }, 400, request.headers.get("Origin") || "*");
    const code = await getOrCreateReferralCode(env, phone);
    if (!code) return corsJson({ success: false, error: "Could not create referral code." }, 500, request.headers.get("Origin") || "*");
    const discount = await getReferralDiscount(env, phone);
    const totals = await env.DB.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed FROM referrals WHERE referrer_phone = ?`).bind(phone).first();
    return corsJson({
      success: true, phone, code, share_url: `${getEnvOrigin(env, request)}/r/${code}`,
      discount: { active: Boolean(discount?.active), percent: REFERRAL_DISCOUNT_PCT, expires_at: discount?.expires_at || 0 },
      referrals: { total: Number(totals?.total || 0), confirmed: Number(totals?.confirmed || 0) },
    }, 200, request.headers.get("Origin") || "*");
  } catch (error) { return corsJson({ success: false, error: errorMessage(error) }, 500, request.headers.get("Origin") || "*"); }
}

async function handleOrderPayment(env, request) {
  let body;
  try { body = await request.json(); } catch { return corsJson({ success: false, error: "Invalid JSON request." }, 400); }

  const serviceId = text(body?.service_id);
  const serviceName = text(body?.service_name);
  const link = text(body?.link);
  const phone = normalizePhone(body?.phone);
  const quantity = Math.floor(number(body?.quantity, 0));
  const refCodeIn = text(body?.ref_code).toUpperCase();
  const paymentMethod = text(body?.payment_method).toLowerCase() || "pesapal";

  if (!serviceId || !link || !quantity || quantity <= 0 || !isValidPhone(phone)) {
    return corsJson({ success: false, error: "Missing or invalid order details." }, 400);
  }

  let supplierService;
  try { supplierService = await findSupplierService(env, serviceId); } catch (error) { return corsJson({ success: false, error: errorMessage(error) }, 400); }

  const min = number(supplierService.min_quantity, 1);
  const max = number(supplierService.max_quantity, 1000000);
  if (quantity < min || quantity > max) return corsJson({ success: false, error: `Quantity must be between ${min} and ${max}.` }, 400);

  const supplierRate = number(supplierService.rate, 0);
  if (!Number.isFinite(supplierRate) || supplierRate <= 0) return corsJson({ success: false, error: "Supplier returned an invalid service rate." }, 400);

  const markup = await getMarkupMultiplier(env);
  const customerRate = supplierRate * markup;
  const supplierAmount = roundMoney((supplierRate * quantity) / 1000);
  let customerAmount = roundMoney((customerRate * quantity) / 1000);

  let discountPct = 0;
  let originalAmount = customerAmount;
  try {
    const myDiscount = await getReferralDiscount(env, phone);
    if (myDiscount?.active) {
      const candidate = roundMoney(customerAmount * (100 - REFERRAL_DISCOUNT_PCT) / 100);
      if (candidate >= MIN_CHARGE_KES) { discountPct = REFERRAL_DISCOUNT_PCT; originalAmount = customerAmount; customerAmount = candidate; }
    }
  } catch (e) {}

  // FIXED: Prevent M-Pesa errors by ensuring the total is at least 1 KES
  if (customerAmount < 1) {
    return corsJson({ success: false, error: "Minimum order amount is 1 KES. Please increase the quantity." }, 400);
  }

  let referralReferrerPhone = null;
  let referralCodeUsed = null;
  if (refCodeIn) {
    try {
      const referrerPhone = await resolveReferralCode(env, refCodeIn);
      if (referrerPhone && referrerPhone !== phone && !(await hasOrderedBefore(env, phone))) {
        const existing = await env.DB.prepare(`SELECT status FROM referrals WHERE referrer_phone = ? AND referee_phone = ? LIMIT 1`).bind(referrerPhone, phone).first();
        if (!existing) { referralReferrerPhone = referrerPhone; referralCodeUsed = refCodeIn; }
      }
    } catch (e) {}
  }

  await ensureOrdersTable(env);
  const trackingId = randomId("HUPPY");
  const merchantReference = trackingId.slice(0, 48);

  await env.DB.prepare(`
    INSERT INTO orders (
      tracking_id, service_id, service_name, link, quantity, phone, supplier_rate, customer_rate, supplier_amount, customer_amount,
      payment_status, order_status, pesapal_merchant_reference, referral_code, discount_pct, original_amount, referral_referrer_phone, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'Pending', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind(
    trackingId, supplierService.service_id, serviceName || supplierService.name, link, quantity, phone,
    supplierRate, customerRate, supplierAmount, customerAmount, merchantReference, referralCodeUsed, discountPct, originalAmount, referralReferrerPhone
  ).run();

  if (referralCodeUsed && referralReferrerPhone) {
    try { await env.DB.prepare(`INSERT INTO referrals (referrer_phone, referee_phone, referral_code, referee_order_tracking_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`).bind(referralReferrerPhone, phone, referralCodeUsed, trackingId, Date.now(), Date.now()).run(); } catch (e) {}
  }

  const origin = getEnvOrigin(env, request);

  // ==========================================
  // MPESA FLOW
  // ==========================================
  if (paymentMethod === "mpesa") {
    const callbackUrl = `${origin}/api/mpesa-callback`;
    try {
      const stkResponse = await initiateMpesaStkPush(env, phone, customerAmount, trackingId, `HUPPY CUBE - ${supplierService.name}`, callbackUrl);
      
      const checkoutRequestId = text(stkResponse?.CheckoutRequestID);
      if (!checkoutRequestId) throw new Error("M-Pesa did not return a CheckoutRequestID.");

      await updateOrder(env, trackingId, { mpesa_checkout_request_id: checkoutRequestId, order_status: "Payment Pending (STK Push Sent)" });

      return corsJson({
        success: true, tracking_id: trackingId, payment_method: "mpesa", message: "STK Push sent. Please enter your M-Pesa PIN.", amount: customerAmount
      }, 200, request.headers.get("Origin") || "*");

    } catch (error) {
      const message = errorMessage(error);
      await updateOrder(env, trackingId, { payment_status: "PAYMENT_SETUP_FAILED", order_status: "Payment Setup Error", error_message: message });
      return corsJson({ success: false, tracking_id: trackingId, error: "Could not initiate M-Pesa payment.", details: message }, 500, request.headers.get("Origin") || "*");
    }
  }

  // ==========================================
  // PESAPAL FLOW (Default fallback)
  // ==========================================
  const callbackUrl = `${origin}/api/payment-callback?tracking_id=${encodeURIComponent(trackingId)}`;
  const cancellationUrl = `${origin}/?tracking_id=${encodeURIComponent(trackingId)}&payment=cancelled`;

  let pesapal;
  try {
    pesapal = await submitPesapalOrder(env, {
      merchantReference, amount: customerAmount, description: `HUPPY CUBE - ${(serviceName || supplierService.name).slice(0, 70)}`,
      callbackUrl, cancellationUrl, phone, firstName: "HUPPY", lastName: "Customer",
    });
  } catch (error) {
    const message = errorMessage(error);
    await updateOrder(env, trackingId, { payment_status: "PAYMENT_SETUP_FAILED", order_status: "Payment Setup Error", error_message: message });
    if (referralCodeUsed && referralReferrerPhone) { try { await env.DB.prepare(`DELETE FROM referrals WHERE referrer_phone = ? AND referee_phone = ? AND status = 'PENDING'`).bind(referralReferrerPhone, phone).run(); } catch (e) {} }
    return corsJson({ success: false, tracking_id: trackingId, error: "Could not create the PesaPal payment.", details: message }, 500);
  }

  const pesapalTrackingId = text(pesapal?.order_tracking_id || pesapal?.orderTrackingId || pesapal?.tracking_id || pesapal?.data?.order_tracking_id);
  const redirectUrl = text(pesapal?.redirect_url || pesapal?.redirectUrl || pesapal?.data?.redirect_url);
  const returnedMerchantReference = text(pesapal?.merchant_reference || pesapal?.merchantReference);

  if (!pesapalTrackingId) {
    await updateOrder(env, trackingId, { payment_status: "PAYMENT_SETUP_FAILED", order_status: "Payment Setup Error", error_message: "No tracking ID returned.", supplier_response: JSON.stringify(pesapal) });
    return corsJson({ success: false, tracking_id: trackingId, error: "PesaPal did not return a tracking ID." }, 500);
  }

  await updateOrder(env, trackingId, { pesapal_order_tracking_id: pesapalTrackingId, pesapal_merchant_reference: returnedMerchantReference || merchantReference, payment_status: "PENDING", order_status: "Payment Pending", error_message: null });

  return corsJson({
    success: true, tracking_id: trackingId, payment_method: "pesapal", pesapal_order_tracking_id: pesapalTrackingId, merchant_reference: returnedMerchantReference || merchantReference,
    redirect_url: redirectUrl, amount: customerAmount, currency: "KES", original_amount: originalAmount, discount_pct: discountPct, service_id: supplierService.service_id, service_name: supplierService.name, quantity, min_quantity: min, max_quantity: max,
  }, 200, request.headers.get("Origin") || "*");
}

async function handleOrderStatus(env, request) {
  const url = new URL(request.url);
  const trackingId = text(url.searchParams.get("tracking_id"));
  if (!trackingId) return corsJson({ success: false, error: "tracking_id is required." }, 400);

  let order = await getOrderByTrackingId(env, trackingId);
  if (!order) return corsJson({ success: false, error: "Order not found." }, 404);

  if (order.supplier_order_id && !isTerminalStatus(order.order_status)) {
    try {
      const supplierStatus = await getDenzGainsOrderStatus(env, order.supplier_order_id);
      const rawStatus = text(supplierStatus?.status ?? supplierStatus?.order_status);
      const normalized = normalizeSupplierStatus(rawStatus);
      const updates = { supplier_response: JSON.stringify(supplierStatus), error_message: null };
      if (normalized) updates.order_status = normalized;
      await updateOrder(env, trackingId, updates);
      order = await getOrderByTrackingId(env, trackingId);
    } catch (error) { await updateOrder(env, trackingId, { error_message: `Supplier status check failed: ${errorMessage(error)}` }); order = await getOrderByTrackingId(env, trackingId); }
  }

  if (order?.pesapal_order_tracking_id && !order?.supplier_order_id && String(order?.order_status || "").toLowerCase() !== "submitting" && !recentlyFailedSubmission(order)) {
    try { await processPaidOrder(env, order); } catch (error) {}
    order = await getOrderByTrackingId(env, trackingId);
  }

  if (!order) return corsJson({ success: false, error: "Order not found." }, 404);
  return corsJson({
    success: true,
    order: {
      tracking_id: order.tracking_id, service_id: order.service_id, service_name: order.service_name, quantity: order.quantity, link: order.link, phone: order.phone,
      customer_amount: order.customer_amount, currency: "KES", original_amount: order.original_amount, discount_pct: order.discount_pct,
      payment_status: order.payment_status, order_status: order.order_status, pesapal_order_tracking_id: order.pesapal_order_tracking_id,
      mpesa_checkout_request_id: order.mpesa_checkout_request_id, mpesa_receipt_number: order.mpesa_receipt_number,
      supplier_order_id: order.supplier_order_id, error_message: order.error_message, created_at: order.created_at, updated_at: order.updated_at,
    },
  }, 200, request.headers.get("Origin") || "*");
}

async function handlePaymentCallback(env, request) {
  const notification = await readPesapalNotification(request);
  let order = null;

  if (notification.merchantReference) order = await getOrderByTrackingId(env, notification.merchantReference);
  if (!order && notification.merchantReference) order = await getOrderByMerchantReference(env, notification.merchantReference);
  if (!order && notification.orderTrackingId) order = await getOrderByPesapalTrackingId(env, notification.orderTrackingId);

  if (order && notification.orderTrackingId) {
    await updateOrder(env, order.tracking_id, { pesapal_order_tracking_id: notification.orderTrackingId, pesapal_merchant_reference: notification.merchantReference || order.pesapal_merchant_reference });
    order = await getOrderByTrackingId(env, order.tracking_id);
  }
  if (order) { try { await processPaidOrder(env, order); } catch (error) {} }
  return Response.redirect(`${getEnvOrigin(env, request)}/?tracking_id=${encodeURIComponent(order?.tracking_id || notification.merchantReference || "")}`, 302);
}

async function handlePesapalIpn(env, request) {
  const notification = await readPesapalNotification(request);
  if (!notification.orderTrackingId && !notification.merchantReference) return json({ status: 400 }, 400);

  let order = null;
  if (notification.merchantReference) order = await getOrderByMerchantReference(env, notification.merchantReference);
  if (!order && notification.orderTrackingId) order = await getOrderByPesapalTrackingId(env, notification.orderTrackingId);
  if (!order) return json({ status: 200, message: "Order not found." });

  if (notification.orderTrackingId) await updateOrder(env, order.tracking_id, { pesapal_order_tracking_id: notification.orderTrackingId, pesapal_merchant_reference: notification.merchantReference || order.pesapal_merchant_reference });

  try { await processPaidOrder(env, await getOrderByTrackingId(env, order.tracking_id)); return json({ status: 200 }); } 
  catch (error) { return json({ status: 200, message: "IPN failed processing." }); }
}

/* =========================================================
   ADMIN & HEALTH ROUTES (Preserved)
========================================================= */

async function handleAdminBalance(env, request) {
  if (!isAdminAuthorized(env, request)) return adminUnauthorized();
  try { return json({ success: true, balance: Number((await getDenzGainsBalance(env))?.balance ?? 0), currency: "KES" }); } catch (e) { return json({ success: false, error: errorMessage(e) }, 500); }
}
async function handleAdminGetSettings(env, request) {
  if (!isAdminAuthorized(env, request)) return adminUnauthorized();
  try { await ensureSettingsTable(env); return json({ success: true, settings: { markup_multiplier: await getMarkupMultiplier(env) } }); } catch (e) { return json({ success: false, error: errorMessage(e) }, 500); }
}
async function handleAdminUpdateSettings(env, request) {
  if (!isAdminAuthorized(env, request)) return adminUnauthorized();
  try {
    const body = await request.json().catch(() => ({}));
    const markup = Number(body?.markup_multiplier);
    if (!markup || markup < 1) return json({ success: false, error: "Markup must be >= 1.0" }, 400);
    await setSetting(env, "markup_multiplier", Math.round(markup * 100) / 100);
    return json({ success: true, message: "Markup updated." });
  } catch (e) { return json({ success: false, error: errorMessage(e) }, 500); }
}
async function handleAdminStats(env, request) {
  if (!isAdminAuthorized(env, request)) return adminUnauthorized();
  try {
    const { wheres, binds } = buildDateFilter(new URL(request.url));
    const whereClause = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";
    const totals = await env.DB.prepare(`SELECT COUNT(*) AS total_orders, SUM(CASE WHEN LOWER(payment_status) = 'completed' THEN customer_amount ELSE 0 END) AS total_revenue FROM orders ${whereClause}`).bind(...binds).first();
    return json({ success: true, stats: totals });
  } catch (e) { return json({ success: false, error: errorMessage(e) }, 500); }
}
async function handleAdminTopServices(env, request) {
  if (!isAdminAuthorized(env, request)) return adminUnauthorized();
  try { return json({ success: true, services: [] }); } catch (e) { return json({ success: false, error: errorMessage(e) }, 500); }
}
async function handleAdminOrdersList(env, request) {
  if (!isAdminAuthorized(env, request)) return adminUnauthorized();
  try {
    const { wheres, binds } = buildDateFilter(new URL(request.url));
    let sql = `SELECT * FROM orders` + (wheres.length ? ` WHERE ${wheres.join(" AND ")}` : "") + ` ORDER BY id DESC LIMIT 100`;
    const rows = (await env.DB.prepare(sql).bind(...binds).all()).results || [];
    return json({ success: true, count: rows.length, orders: rows });
  } catch (e) { return json({ success: false, error: errorMessage(e) }, 500); }
}
async function handleAdminLive(env, request) { if (!isAdminAuthorized(env, request)) return adminUnauthorized(); return json({ success: true, events: [] }); }
async function handleAdminRetry(env, request) {
  if (!isAdminAuthorized(env, request)) return adminUnauthorized();
  try {
    const trackingId = new URL(request.url).searchParams.get("tracking_id");
    const order = await getOrderByTrackingId(env, trackingId);
    if (!order || order.supplier_order_id) return json({ success: false, error: "Invalid order." }, 400);
    await updateOrder(env, trackingId, { order_status: "Payment Pending", error_message: null });
    return json({ success: true, result: await processPaidOrder(env, await getOrderByTrackingId(env, trackingId)) });
  } catch (e) { return json({ success: false, error: errorMessage(e) }, 500); }
}

async function handleHealth(env, request) {
  let database = false;
  try { await env.DB.prepare("SELECT 1 AS ok").first(); database = true; } catch (e) {}
  return corsJson({ success: true, online: true, service: "HUPPY CUBE", database, timestamp: new Date().toISOString() }, 200, request.headers.get("Origin") || "*");
}

/* =========================================================
   MAIN WORKER
========================================================= */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const origin = request.headers.get("Origin") || "*";

    if (method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

    // Short link handler
    const match = url.pathname.match(/^\/r\/([A-Za-z0-9]{4,12})\/?$/);
    if (match) {
      const target = new URL("/", url.origin);
      target.searchParams.set("ref", match[1].toUpperCase());
      return Response.redirect(target.toString(), 302);
    }

    try {
      await ensureOrdersTable(env);
      await ensureSettingsTable(env);
      await ensureReferralTables(env);

      if (url.pathname === "/api/health" && method === "GET") return await handleHealth(env, request);
      if (url.pathname === "/api/services" && method === "GET") return await handleServices(env, request);
      if (url.pathname === "/api/order-payment" && method === "POST") return await handleOrderPayment(env, request);
      if (url.pathname === "/api/order-status" && method === "GET") return await handleOrderStatus(env, request);
      if (url.pathname === "/api/referral-info" && method === "GET") return await handleReferralInfo(env, request);
      
      // Payment Callbacks
      if (url.pathname === "/api/payment-callback") return await handlePaymentCallback(env, request);
      if (url.pathname === "/api/pesapal-ipn") return await handlePesapalIpn(env, request);
      if (url.pathname === "/api/mpesa-callback" && method === "POST") return await handleMpesaCallback(env, request);

      // Admin routes
      if (url.pathname === "/api/admin-balance" && method === "GET") return await handleAdminBalance(env, request);
      if (url.pathname === "/api/admin-settings" && method === "GET") return await handleAdminGetSettings(env, request);
      if (url.pathname === "/api/admin-settings" && method === "POST") return await handleAdminUpdateSettings(env, request);
      if (url.pathname === "/api/admin-stats" && method === "GET") return await handleAdminStats(env, request);
      if (url.pathname === "/api/admin-top-services" && method === "GET") return await handleAdminTopServices(env, request);
      if (url.pathname === "/api/admin-orders-list" && method === "GET") return await handleAdminOrdersList(env, request);
      if (url.pathname === "/api/admin-live" && method === "GET") return await handleAdminLive(env, request);
      if (url.pathname === "/api/admin-retry" && method === "GET") return await handleAdminRetry(env, request);

      if (env.ASSETS) return await env.ASSETS.fetch(request);
      return json({ success: false, error: "Not found." }, 404);

    } catch (error) {
      console.error("Worker unhandled error:", error);
      if (url.pathname.startsWith("/api/")) return corsJson({ success: false, error: errorMessage(error) }, 500, origin);
      if (env.ASSETS) { try { return await env.ASSETS.fetch(request); } catch {} }
      return new Response("HUPPY CUBE server error.", { status: 500 });
    }
  },
};
