import React, { useEffect, useState } from "react";

/* =========================================================
   ADMIN DASHBOARD
========================================================= */

const REFRESH_MS = 15000;
const LIVE_REFRESH_MS = 3000;
const BALANCE_REFRESH_MS = 60000;

const DATE_RANGES = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "all", label: "All Time" }
];

function readSecretFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return (params.get("secret") || "").trim();
  } catch {
    return "";
  }
}

function formatKES(value) {
  return `KSh ${Number(value || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function nairobiTime(raw) {
  if (!raw) return "—";
  const s = String(raw);
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return s;

  return d.toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function statusColor(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("completed")) return "green";
  if (s.includes("processing")) return "blue";
  if (s.includes("pending")) return "amber";
  if (s.includes("fail") || s.includes("error") || s.includes("cancel"))
    return "red";
  return "gray";
}

// Returns { from, to } in YYYY-MM-DD format based on Nairobi time (UTC+3)
function getDateBounds(rangeKey) {
  if (rangeKey === "all") return { from: "", to: "" };

  const now = new Date();
  // Shift to Nairobi time
  const nairobi = new Date(now.getTime() + 3 * 60 * 60 * 1000);

  // Date string in Nairobi time (YYYY-MM-DD)
  const toStr = nairobi.toISOString().slice(0, 10);

  let fromDate = new Date(nairobi);
  if (rangeKey === "today") {
    // same day
  } else if (rangeKey === "7d") {
    fromDate.setUTCDate(fromDate.getUTCDate() - 6);
  } else if (rangeKey === "30d") {
    fromDate.setUTCDate(fromDate.getUTCDate() - 29);
  }

  const fromStr = fromDate.toISOString().slice(0, 10);

  return { from: fromStr, to: toStr };
}

/* =========================================================
   ORDER ROW
========================================================= */

function OrderRow({ order, expanded, onToggle, onRetry }) {
  return (
    <div className="admin-order-row">
      <div
        className="admin-order-summary"
        onClick={onToggle}
        role="button"
        tabIndex={0}
      >
        <div className="admin-order-main">
          <div className="admin-order-service">
            {order.service_name || "Service"}
          </div>

          <div className="admin-order-meta">
            <span className={`admin-pill ${statusColor(order.order_status)}`}>
              {order.order_status || "—"}
            </span>

            <span className="admin-order-qty">
              Qty {Number(order.quantity || 0).toLocaleString()}
            </span>

            <span className="admin-order-amount">
              {formatKES(order.customer_amount)}
            </span>

            <span className="admin-order-profit">
              +{formatKES(order.profit)}
            </span>
          </div>
        </div>

        <div className="admin-order-time">
          {nairobiTime(order.created_at_nairobi || order.created_at)}
        </div>
      </div>

      {expanded && (
        <div className="admin-order-detail">
          <div className="admin-detail-grid">
            <div>
              <span>Tracking ID</span>
              <strong>{order.tracking_id}</strong>
            </div>
            <div>
              <span>Phone</span>
              <strong>{order.phone || "—"}</strong>
            </div>
            <div>
              <span>Payment</span>
              <strong>{order.payment_status || "—"}</strong>
            </div>
            <div>
              <span>Supplier Order</span>
              <strong>{order.supplier_order_id || "—"}</strong>
            </div>
            <div>
              <span>PesaPal ID</span>
              <strong>{order.pesapal_order_tracking_id || "—"}</strong>
            </div>
            <div>
              <span>Last Update</span>
              <strong>
                {nairobiTime(order.updated_at_nairobi || order.updated_at)}
              </strong>
            </div>

            {order.link && (
              <div className="admin-detail-wide">
                <span>Target Link</span>
                <a href={order.link} target="_blank" rel="noreferrer">
                  {order.link}
                </a>
              </div>
            )}

            {order.error_message && (
              <div className="admin-detail-wide admin-detail-error">
                <span>Error</span>
                <strong>{order.error_message}</strong>
              </div>
            )}
          </div>

          {!order.supplier_order_id && (
            <div className="admin-order-actions">
              <button
                type="button"
                className="admin-retry-btn"
                onClick={() => onRetry(order.tracking_id)}
              >
                Retry Submission
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   ORDERS LIST
========================================================= */

function OrdersList({
  orders,
  loading,
  statusFilter,
  setStatusFilter,
  search,
  setSearch,
  expandedId,
  setExpandedId,
  onRetry
}) {
  const filters = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "processing", label: "Processing" },
    { key: "completed", label: "Completed" },
    { key: "failed", label: "Failed" }
  ];

  return (
    <section className="admin-orders">
      <div className="admin-filter-row">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            className={statusFilter === f.key ? "active" : ""}
            onClick={() => setStatusFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="admin-search-row">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tracking ID, phone, or supplier order..."
        />
      </div>

      {loading && <div className="admin-loading">Loading orders...</div>}

      {!loading && orders.length === 0 && (
        <div className="admin-empty">No orders found.</div>
      )}

      {!loading && orders.length > 0 && (
        <div className="admin-orders-list">
          {orders.map((order) => (
            <OrderRow
              key={order.tracking_id}
              order={order}
              expanded={expandedId === order.tracking_id}
              onToggle={() =>
                setExpandedId(
                  expandedId === order.tracking_id ? null : order.tracking_id
                )
              }
              onRetry={onRetry}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* =========================================================
   TOP SERVICES CARD
========================================================= */

function TopServices({ services }) {
  if (!services || services.length === 0) {
    return null;
  }

  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

  return (
    <section className="admin-top-services">
      <div className="admin-top-services-head">
        <span className="admin-live-dot" />
        <span>Top Selling Services</span>
      </div>

      <div className="admin-top-services-list">
        {services.map((s, i) => (
          <div className="admin-top-service" key={`${s.service_name}-${i}`}>
            <span className="admin-top-medal">{medals[i] || "•"}</span>

            <div className="admin-top-info">
              <div className="admin-top-name">{s.service_name}</div>
              <div className="admin-top-meta">
                {s.order_count} order{s.order_count !== 1 ? "s" : ""} ·{" "}
                {formatKES(s.revenue)} revenue ·{" "}
                {formatKES(s.profit)} profit
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* =========================================================
   LIVE FEED
========================================================= */

function LiveFeed({ events }) {
  return (
    <section className="admin-live">
      <div className="admin-live-header">
        <span className="admin-live-dot" />
        Live order activity (refreshes every 3s)
      </div>

      {events.length === 0 && (
        <div className="admin-empty">No activity yet.</div>
      )}

      {events.length > 0 && (
        <div className="admin-live-list">
          {events.map((e, idx) => (
            <div className="admin-live-event" key={idx}>
              <div className="admin-live-time">
                {nairobiTime(e.updated_at_nairobi || e.updated_at)}
              </div>

              <div className="admin-live-body">
                <div className="admin-live-title">
                  <span className={`admin-pill ${statusColor(e.order_status)}`}>
                    {e.order_status || "—"}
                  </span>
                  <strong>{e.service_name || "Service"}</strong>
                </div>

                <div className="admin-live-meta">
                  Qty {Number(e.quantity || 0).toLocaleString()} ·{" "}
                  {formatKES(e.customer_amount)} · {e.phone || "—"}
                </div>

                {e.error_message && (
                  <div className="admin-live-error">{e.error_message}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
      }/* =========================================================
   MAIN ADMIN COMPONENT
========================================================= */

export default function AdminDashboard() {
  const [secret, setSecret] = useState(readSecretFromUrl());
  const [secretInput, setSecretInput] = useState("");
  const [tab, setTab] = useState("overview");
  const [dateRange, setDateRange] = useState("all");

  const [stats, setStats] = useState(null);
  const [balance, setBalance] = useState(null);
  const [topServices, setTopServices] = useState([]);
  const [orders, setOrders] = useState([]);
  const [events, setEvents] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const [lastLiveTime, setLastLiveTime] = useState(Date.now());

  function buildDateQuery() {
    const { from, to } = getDateBounds(dateRange);
    const parts = [];
    if (from) parts.push(`from=${encodeURIComponent(from)}`);
    if (to) parts.push(`to=${encodeURIComponent(to)}`);
    return parts.join("&");
  }

  async function loadStats() {
    try {
      const r = await fetch(
        `/api/admin-stats?secret=${encodeURIComponent(secret)}&${buildDateQuery()}`,
        { cache: "no-store" }
      );
      const data = await r.json();

      if (!data.success) throw new Error(data.error || "Failed to load stats");
      setStats(data.stats);
    } catch (err) {
      setError(err?.message || "Failed to load stats");
    }
  }

  async function loadBalance() {
    try {
      const r = await fetch(
        `/api/admin-balance?secret=${encodeURIComponent(secret)}`,
        { cache: "no-store" }
      );
      const data = await r.json();
      if (!data.success) return;
      setBalance({ value: data.balance, currency: data.currency });
    } catch (err) {
      // non-critical
    }
  }

  async function loadTopServices() {
    try {
      const r = await fetch(
        `/api/admin-top-services?secret=${encodeURIComponent(secret)}&${buildDateQuery()}`,
        { cache: "no-store" }
      );
      const data = await r.json();
      if (!data.success) return;
      setTopServices(data.services || []);
    } catch (err) {
      // non-critical
    }
  }

  async function loadOrders() {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      params.set("secret", secret);
      params.set("limit", "200");

      const { from, to } = getDateBounds(dateRange);
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      if (statusFilter && statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      if (search.trim()) {
        params.set("search", search.trim());
      }

      const r = await fetch(
        `/api/admin-orders-list?${params.toString()}`,
        { cache: "no-store" }
      );
      const data = await r.json();

      if (!data.success) throw new Error(data.error || "Failed to load orders");
      setOrders(data.orders || []);
      setError("");
    } catch (err) {
      setError(err?.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }

  async function loadLive(sinceMs) {
    try {
      const params = new URLSearchParams();
      params.set("secret", secret);
      if (sinceMs) params.set("since", String(sinceMs));

      const r = await fetch(
        `/api/admin-live?${params.toString()}`,
        { cache: "no-store" }
      );
      const data = await r.json();

      if (!data.success) throw new Error(data.error || "Failed to load feed");
      const incoming = data.events || [];
      setLastLiveTime(data.server_time_ms || Date.now());

      if (sinceMs) {
        setEvents((prev) => [...prev, ...incoming].slice(-200));
      } else {
        setEvents(incoming);
      }
    } catch (err) {
      setError(err?.message || "Failed to load live feed");
    }
  }

  async function retryOrder(trackingId) {
    if (!window.confirm(`Retry order ${trackingId}?`)) return;

    try {
      const r = await fetch(
        `/api/admin-retry?secret=${encodeURIComponent(secret)}&tracking_id=${encodeURIComponent(trackingId)}`,
        { cache: "no-store" }
      );
      const data = await r.json();

      if (!data.success) {
        alert(`Retry failed: ${data.error || "Unknown error"}`);
        return;
      }

      alert("Retry submitted. Refreshing...");
      await loadStats();
      await loadOrders();
      await loadTopServices();
    } catch (err) {
      alert(`Retry error: ${err?.message || err}`);
    }
  }

  // Initial load
  useEffect(() => {
    if (!secret) return;
    loadStats();
    loadBalance();
    loadTopServices();
    loadOrders();
    loadLive(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret]);

  // Reload when filters or date range change
  useEffect(() => {
    if (!secret) return;
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search, dateRange]);

  // Reload stats + top services when date range changes
  useEffect(() => {
    if (!secret) return;
    loadStats();
    loadTopServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  // Auto refresh stats + orders
  useEffect(() => {
    if (!secret) return;
    const t = setInterval(() => {
      loadStats();
      loadOrders();
    }, REFRESH_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret, statusFilter, search, dateRange]);

  // Balance refresh
  useEffect(() => {
    if (!secret) return;
    const t = setInterval(() => {
      loadBalance();
      loadTopServices();
    }, BALANCE_REFRESH_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret, dateRange]);

  // Live feed poll
  useEffect(() => {
    if (!secret) return;
    if (tab !== "live") return;

    const t = setInterval(() => {
      loadLive(lastLiveTime);
    }, LIVE_REFRESH_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret, tab, lastLiveTime]);

  if (!secret) {
    return (
      <div className="admin-shell">
        <div className="admin-login">
          <h1>HUPPY CUBE ADMIN</h1>
          <p>Enter your admin secret to continue.</p>

          <input
            type="password"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            placeholder="Admin secret"
            onKeyDown={(e) => {
              if (e.key === "Enter" && secretInput.trim()) {
                setSecret(secretInput.trim());
              }
            }}
          />

          <button
            type="button"
            disabled={!secretInput.trim()}
            onClick={() => setSecret(secretInput.trim())}
          >
            Enter
          </button>
        </div>
      </div>
    );
  }

  const lowBalance =
    balance && typeof balance.value === "number" && balance.value < 50;

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div>
          <h1>HUPPY CUBE ADMIN</h1>
          <small>
            {stats?.server_time_nairobi
              ? `Server time: ${nairobiTime(stats.server_time_nairobi)}`
              : "Loading..."}
          </small>
        </div>

        <div className="admin-topbar-actions">
          {balance && (
            <div
              className={`admin-balance-badge ${lowBalance ? "low" : ""}`}
              title={
                lowBalance
                  ? "Low balance — top up DenzGains soon"
                  : "DenzGains account balance"
              }
            >
              <span className="admin-balance-label">DenzGains</span>
              <strong>
                {balance.currency} {Number(balance.value).toFixed(2)}
              </strong>
              {lowBalance && <span className="admin-balance-warn">⚠️</span>}
            </div>
          )}

          <button
            type="button"
            className={tab === "overview" ? "active" : ""}
            onClick={() => setTab("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            className={tab === "live" ? "active" : ""}
            onClick={() => setTab("live")}
          >
            Live
          </button>
          <button
            type="button"
            onClick={() => {
              setSecret("");
              window.history.replaceState({}, "", "/");
            }}
          >
            Logout
          </button>
        </div>
      </header>

      {error && <div className="admin-error">{error}</div>}

      {/* DATE RANGE PICKER — visible on overview tab */}
      {tab === "overview" && (
        <div className="admin-date-picker">
          <span className="admin-date-picker-label">Period:</span>
          {DATE_RANGES.map((range) => (
            <button
              key={range.key}
              type="button"
              className={dateRange === range.key ? "active" : ""}
              onClick={() => setDateRange(range.key)}
            >
              {range.label}
            </button>
          ))}
        </div>
      )}

      {tab === "overview" && stats && (
        <section className="admin-stats-grid">
          <div className="admin-stat-card">
            <span>Total Orders</span>
            <strong>{stats.total_orders}</strong>
          </div>

          <div className="admin-stat-card">
            <span>Revenue (KES)</span>
            <strong>{formatKES(stats.total_revenue_kes)}</strong>
          </div>

          <div className="admin-stat-card">
            <span>Cost (KES)</span>
            <strong>{formatKES(stats.total_cost_kes)}</strong>
          </div>

          <div className="admin-stat-card highlight">
            <span>Profit (KES)</span>
            <strong>{formatKES(stats.total_profit_kes)}</strong>
          </div>

          <div className="admin-stat-card">
            <span>Pending</span>
            <strong>{stats.pending}</strong>
          </div>

          <div className="admin-stat-card">
            <span>Processing</span>
            <strong>{stats.processing}</strong>
          </div>

          <div className="admin-stat-card">
            <span>Completed</span>
            <strong>{stats.completed}</strong>
          </div>

          <div className="admin-stat-card">
            <span>Failed</span>
            <strong>{stats.failed}</strong>
          </div>

          <div className="admin-stat-card wide">
            <span>Today</span>
            <strong>
              {stats.today_orders} orders · {formatKES(stats.today_revenue_kes)}{" "}
              revenue · {formatKES(stats.today_profit_kes)} profit
            </strong>
          </div>
        </section>
      )}

      {tab === "overview" && <TopServices services={topServices} />}

      {tab === "overview" && (
        <OrdersList
          orders={orders}
          loading={loading}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          search={search}
          setSearch={setSearch}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          onRetry={retryOrder}
        />
      )}

      {tab === "live" && <LiveFeed events={events} />}
    </div>
  );
          }
