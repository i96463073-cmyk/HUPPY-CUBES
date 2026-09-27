import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Facebook,
  History,
  Instagram,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  User,
  UserPlus,
  Wallet,
  X,
  Youtube
} from "lucide-react";

import "./index.css";

const WHATSAPP = "254796681162";

const PLATFORM_CONFIG = {
  Facebook: {
    icon: Facebook,
    color: "#1877f2",
    keywords: ["facebook", "fb"]
  },
  Instagram: {
    icon: Instagram,
    color: "#e1306c",
    keywords: ["instagram", "ig"]
  },
  TikTok: {
    icon: Activity,
    color: "#25f4ee",
    keywords: ["tiktok"]
  },
  YouTube: {
    icon: Youtube,
    color: "#ff0000",
    keywords: ["youtube", "yt"]
  },
  Telegram: {
    icon: Send,
    color: "#229ed9",
    keywords: ["telegram", "tg"]
  },
  WhatsApp: {
    icon: MessageCircle,
    color: "#25d366",
    keywords: ["whatsapp", "wa"]
  },
  X: {
    icon: ArrowUpRight,
    color: "#ffffff",
    keywords: ["twitter", "x.com"]
  },
  Spotify: {
    icon: Activity,
    color: "#1ed760",
    keywords: ["spotify"]
  },
  Other: {
    icon: Sparkles,
    color: "#a855f7",
    keywords: []
  }
};

function money(value) {
  return `KSh ${Number(value || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function classifyService(service) {
  const text =
    `${service.name || ""} ${service.category || ""} ${service.type || ""}`
      .toLowerCase();

  for (const [platform, config] of Object.entries(PLATFORM_CONFIG)) {
    if (
      config.keywords.some((keyword) =>
        text.includes(keyword.toLowerCase())
      )
    ) {
      return platform;
    }
  }

  return "Other";
}

function App() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [authMode, setAuthMode] = useState("login");
  const [authLoading, setAuthLoading] = useState(false);

  const [services, setServices] = useState([]);
  const [orders, setOrders] = useState([]);
  const [balance, setBalance] = useState(0);

  const [activePage, setActivePage] = useState("dashboard");
  const [selectedPlatform, setSelectedPlatform] = useState("All");

  const [search, setSearch] = useState("");
  const [selectedService, setSelectedService] = useState(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [depositAmount, setDepositAmount] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);

  const [loadingServices, setLoadingServices] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const [notice, setNotice] = useState(null);

  const [stats, setStats] = useState({
    totalOrders: 0,
    pendingOrders: 0,
    completedOrders: 0,
    totalSpent: 0
  });

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (!notice) return;

    const timer = setTimeout(() => {
      setNotice(null);
    }, 4500);

    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!user) return;

    loadWallet();
    loadServices();
    loadOrders();

    if (window.location.pathname === "/payment-success") {
      handlePaymentCallback();
    }
  }, [user]);

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "include",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    let data;

    try {
      data = await response.json();
    } catch {
      data = {
        success: false,
        error: "Invalid server response"
      };
    }

    if (!response.ok) {
      throw new Error(
        data.message ||
          data.error ||
          "Request failed"
      );
    }

    return data;
  }

  function showNotice(type, message) {
    setNotice({
      type,
      message
    });
  }

  async function checkAuth() {
    try {
      const data = await api("/api/auth/me");

      if (data.authenticated && data.user) {
        setUser(data.user);

        if (data.wallet) {
          setBalance(Number(data.wallet.balance || 0));
        }
      }
    } catch {
      setUser(null);
    } finally {
      setCheckingAuth(false);
    }
  }

  async function handleLogin(form) {
    setAuthLoading(true);

    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          phone: form.phone,
          pin: form.pin
        })
      });

      setUser(data.user);

      showNotice(
        "success",
        `Welcome back, ${data.user.name}!`
      );
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRegister(form) {
    setAuthLoading(true);

    try {
      const data = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          pin: form.pin
        })
      });

      setUser(data.user);

      showNotice(
        "success",
        "Your HUPPY CUBE account has been created."
      );
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function logout() {
    try {
      await api("/api/auth/logout", {
        method: "POST"
      });
    } catch {}

    setUser(null);
    setServices([]);
    setOrders([]);
    setBalance(0);
    setActivePage("dashboard");
  }

  async function loadWallet() {
    try {
      const data = await api("/api/wallet");

      if (data.balance !== undefined) {
        setBalance(Number(data.balance || 0));
      }
    } catch (error) {
      showNotice("error", error.message);
    }
  }

  async function loadServices() {
    setLoadingServices(true);

    try {
      const data = await api("/api/services");

      if (data.success) {
        setServices(
          Array.isArray(data.services)
            ? data.services
            : []
        );
      }
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setLoadingServices(false);
    }
  }

  async function loadOrders() {
    setLoadingOrders(true);

    try {
      const data = await api("/api/orders");

      if (data.success) {
        const list = Array.isArray(data.orders)
          ? data.orders
          : [];

        setOrders(list);

        const totalSpent = list.reduce(
          (sum, order) =>
            sum + Number(order.amount || 0),
          0
        );

        const pending = list.filter((order) =>
          [
            "Pending",
            "Processing",
            "In progress",
            "Submitting"
          ].includes(order.status)
        ).length;

        const completed = list.filter((order) =>
          String(order.status || "")
            .toLowerCase()
            .includes("complete")
        ).length;

        setStats({
          totalOrders: list.length,
          pendingOrders: pending,
          completedOrders: completed,
          totalSpent
        });
      }
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setLoadingOrders(false);
    }
  }

  async function handlePaymentCallback() {
    const params = new URLSearchParams(
      window.location.search
    );

    const reference =
      params.get("OrderMerchantReference") ||
      params.get("orderMerchantReference") ||
      params.get("reference");

    const trackingId =
      params.get("OrderTrackingId") ||
      params.get("orderTrackingId");

    if (!reference && !trackingId) return;

    try {
      const query = reference
        ? `reference=${encodeURIComponent(reference)}`
        : `reference=${encodeURIComponent(trackingId)}`;

      const data = await api(
        `/api/payment-status?${query}`
      );

      if (
        data.success &&
        data.payment?.status === "COMPLETED"
      ) {
        await loadWallet();

        showNotice(
          "success",
          "Payment completed and your wallet has been updated."
        );
      } else {
        showNotice(
          "error",
          "Payment is still pending or was not completed."
        );
      }
    } catch (error) {
      showNotice("error", error.message);
    }

    window.history.replaceState(
      {},
      document.title,
      "/"
    );
  }

  async function startDeposit() {
    const amount = Number(depositAmount);

    if (!Number.isFinite(amount) || amount < 10) {
      showNotice(
        "error",
        "Minimum deposit is KSh 10."
      );
      return;
    }

    setDepositLoading(true);

    try {
      const data = await api("/api/payment", {
        method: "POST",
        body: JSON.stringify({
          amount
        })
      });

      if (data.success && data.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }

      throw new Error(
        data.message ||
          data.error ||
          "Could not create payment."
      );
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setDepositLoading(false);
    }
  }

  async function refreshAll() {
    await Promise.all([
      loadWallet(),
      loadOrders(),
      loadServices()
    ]);

    showNotice(
      "success",
      "Dashboard refreshed."
    );
  }

  function openWhatsApp() {
    window.open(
      `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(
        "Hello HUPPY CUBE Support, I need help."
      )}`,
      "_blank"
    );
  }

  const filteredServices = useMemo(() => {
    const query = search.trim().toLowerCase();

    return services.filter((service) => {
      const platform = classifyService(service);

      const platformMatch =
        selectedPlatform === "All" ||
        platform === selectedPlatform;

      const searchMatch =
        !query ||
        String(service.name || "")
          .toLowerCase()
          .includes(query) ||
        String(service.category || "")
          .toLowerCase()
          .includes(query) ||
        String(service.type || "")
          .toLowerCase()
          .includes(query);

      return platformMatch && searchMatch;
    });
  }, [
    services,
    selectedPlatform,
    search
  ]);

  const platformCounts = useMemo(() => {
    const counts = {
      All: services.length
    };

    Object.keys(PLATFORM_CONFIG).forEach(
      (platform) => {
        counts[platform] = services.filter(
          (service) =>
            classifyService(service) === platform
        ).length;
      }
    );

    return counts;
  }, [services]);

  if (checkingAuth) {
    return (
      <div className="loading-screen">
        <div className="loading-orb">
          <Sparkles size={30} />
        </div>

        <h2>HUPPY CUBE</h2>
        <p>Loading your workspace...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AuthScreen
          mode={authMode}
          setMode={setAuthMode}
          onLogin={handleLogin}
          onRegister={handleRegister}
          loading={authLoading}
        />

        {notice && (
          <Notice
            notice={notice}
            onClose={() => setNotice(null)}
          />
        )}
      </>
    );
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="ambient ambient-three" />

      <Sidebar
        activePage={activePage}
        setActivePage={(page) => {
          setActivePage(page);
          setSidebarOpen(false);
        }}
        user={user}
        onLogout={logout}
        open={sidebarOpen}
        close={() => setSidebarOpen(false)}
      />

      <main className="main-area">
        <Header
          user={user}
          balance={balance}
          onMenu={() => setSidebarOpen(true)}
          onRefresh={refreshAll}
          onDeposit={() => setActivePage("wallet")}
        />

        {activePage === "dashboard" && (
          <Dashboard
            user={user}
            balance={balance}
            stats={stats}
            orders={orders}
            onDeposit={() => setActivePage("wallet")}
            onServices={() => setActivePage("services")}
            onOrders={() => setActivePage("orders")}
            onSupport={openWhatsApp}
          />
        )}

        {activePage === "services" && (
          <ServicesPage
            services={filteredServices}
            platformCounts={platformCounts}
            selectedPlatform={selectedPlatform}
            setSelectedPlatform={setSelectedPlatform}
            search={search}
            setSearch={setSearch}
            loading={loadingServices}
            onRefresh={loadServices}
            onSelect={setSelectedService}
          />
        )}

        {activePage === "orders" && (
          <OrdersPage
            orders={orders}
            loading={loadingOrders}
            onRefresh={loadOrders}
          />
        )}

        {activePage === "wallet" && (
          <WalletPage
            balance={balance}
            depositAmount={depositAmount}
            setDepositAmount={setDepositAmount}
            loading={depositLoading}
            onDeposit={startDeposit}
            onRefresh={loadWallet}
          />
        )}

        {activePage === "profile" && (
          <ProfilePage
            user={user}
            onLogout={logout}
          />
        )}
      </main>

      <button
        className="whatsapp-float"
        onClick={openWhatsApp}
        title="WhatsApp Support"
      >
        <MessageCircle size={24} />
      </button>

      {selectedService && (
        <OrderModal
          service={selectedService}
          balance={balance}
          onClose={() => setSelectedService(null)}
          onSuccess={async () => {
            setSelectedService(null);
            await loadWallet();
            await loadOrders();
            setActivePage("orders");
          }}
          api={api}
          showNotice={showNotice}
        />
      )}

      {notice && (
        <Notice
          notice={notice}
          onClose={() => setNotice(null)}
        />
      )}
    </div>
  );
}


// ============================================================
// AUTH
// ============================================================

function AuthScreen({
  mode,
  setMode,
  onLogin,
  onRegister,
  loading
}) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    pin: "",
    confirmPin: ""
  });

  function update(key, value) {
    setForm((old) => ({
      ...old,
      [key]: value
    }));
  }

  function submit(event) {
    event.preventDefault();

    if (mode === "register") {
      if (form.pin !== form.confirmPin) {
        return;
      }

      onRegister(form);
    } else {
      onLogin(form);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-glow glow-a" />
      <div className="auth-glow glow-b" />

      <div className="auth-layout">
        <div className="auth-brand">
          <div className="brand-logo large">
            <Sparkles size={30} />
          </div>

          <div>
            <div className="brand-name">
              HUPPY <span>CUBE</span>
            </div>

            <div className="brand-subtitle">
              SOCIAL GROWTH PLATFORM
            </div>
          </div>

          <div className="auth-promo">
            <span>
              <Sparkles size={15} />
              Powerful social growth
            </span>

            <h1>
              Grow your social
              <br />
              presence.
            </h1>

            <p>
              One powerful workspace for
              social media services,
              instant ordering and wallet
              management.
            </p>

            <div className="promo-points">
              <div>
                <CheckCircle2 size={18} />
                Fast service delivery
              </div>

              <div>
                <CheckCircle2 size={18} />
                Secure customer accounts
              </div>

              <div>
                <CheckCircle2 size={18} />
                Easy wallet payments
              </div>
            </div>
          </div>
        </div>

        <div className="auth-card glass-card">
          <div className="auth-card-top">
            <div className="auth-icon">
              {mode === "login" ? (
                <LogIn size={22} />
              ) : (
                <UserPlus size={22} />
              )}
            </div>

            <div>
              <h2>
                {mode === "login"
                  ? "Welcome back"
                  : "Create account"}
              </h2>

              <p>
                {mode === "login"
                  ? "Sign in with your phone and PIN."
                  : "Create your free HUPPY CUBE account."}
              </p>
            </div>
          </div>

          <form
            className="auth-form"
            onSubmit={submit}
          >
            {mode === "register" && (
              <label>
                Full name

                <input
                  value={form.name}
                  onChange={(e) =>
                    update(
                      "name",
                      e.target.value
                    )
                  }
                  placeholder="Your full name"
                  required
                />
              </label>
            )}

            <label>
              Phone number

              <input
                type="tel"
                value={form.phone}
                onChange={(e) =>
                  update(
                    "phone",
                    e.target.value
                  )
                }
                placeholder="07XXXXXXXX"
                inputMode="tel"
                required
              />
            </label>

            <label>
              6-digit PIN

              <input
                type="password"
                value={form.pin}
                onChange={(e) =>
                  update(
                    "pin",
                    e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 6)
                  )
                }
                placeholder="••••••"
                inputMode="numeric"
                maxLength={6}
                pattern="[0-9]{6}"
                required
              />
            </label>

            {mode === "register" && (
              <label>
                Confirm PIN

                <input
                  type="password"
                  value={form.confirmPin}
                  onChange={(e) =>
                    update(
                      "confirmPin",
                      e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 6)
                    )
                  }
                  placeholder="••••••"
                  inputMode="numeric"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  required
                />

                {form.confirmPin &&
                  form.pin !==
                    form.confirmPin && (
                    <small className="field-error">
                      PINs do not match.
                    </small>
                  )}
              </label>
            )}

            <button
              className="primary-button auth-submit"
              disabled={
                loading ||
                form.pin.length !== 6 ||
                (mode === "register" &&
                  form.pin !== form.confirmPin)
              }
            >
              {loading ? (
                <>
                  <RefreshCw
                    size={18}
                    className="spin"
                  />
                  Please wait...
                </>
              ) : mode === "login" ? (
                <>
                  <LogIn size={18} />
                  Sign in
                </>
              ) : (
                <>
                  <UserPlus size={18} />
                  Create account
                </>
              )}
            </button>
          </form>

          <div className="auth-switch">
            {mode === "login" ? (
              <>
                Don't have an account?
                <button
                  onClick={() =>
                    setMode("register")
                  }
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?
                <button
                  onClick={() =>
                    setMode("login")
                  }
                >
                  Sign in
                </button>
              </>
            )}
          </div>

          <div className="auth-security">
            <ShieldCheck size={15} />
            Secure phone + PIN authentication.
          </div>
        </div>
      </div>
    </div>
  );
}


// ============================================================
// SIDEBAR
// ============================================================

function Sidebar({
  activePage,
  setActivePage,
  user,
  onLogout,
  open,
  close
}) {
  const items = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard
    },
    {
      id: "services",
      label: "Services",
      icon: ShoppingCart
    },
    {
      id: "orders",
      label: "My Orders",
      icon: History
    },
    {
      id: "wallet",
      label: "Wallet",
      icon: Wallet
    },
    {
      id: "profile",
      label: "Profile",
      icon: User
    }
  ];

  return (
    <>
      {open && (
        <div
          className="mobile-overlay"
          onClick={close}
        />
      )}

      <aside
        className={`sidebar ${
          open ? "sidebar-open" : ""
        }`}
      >
        <div className="sidebar-brand">
          <div className="brand-logo">
            <Sparkles size={21} />
          </div>

          <div>
            <div className="brand-name">
              HUPPY <span>CUBE</span>
            </div>

            <div className="brand-subtitle">
              SOCIAL GROWTH
            </div>
          </div>

          <button
            className="sidebar-close"
            onClick={close}
          >
            <X size={19} />
          </button>
        </div>

        <div className="sidebar-user">
          <div className="avatar">
            {user.name
              ?.charAt(0)
              .toUpperCase()}
          </div>

          <div className="sidebar-user-info">
            <strong>{user.name}</strong>
            <span>{user.phone}</span>
          </div>
        </div>

        <div className="nav-label">
          MAIN MENU
        </div>

        <nav className="sidebar-nav">
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                className={
                  activePage === item.id
                    ? "nav-item active"
                    : "nav-item"
                }
                onClick={() =>
                  setActivePage(item.id)
                }
              >
                <Icon size={19} />
                <span>{item.label}</span>

                {activePage === item.id && (
                  <ChevronRight
                    size={16}
                    className="nav-arrow"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-support">
          <Sparkles size={18} />

          <div>
            <strong>Need help?</strong>
            <span>WhatsApp support available.</span>
          </div>
        </div>

        <button
          className="logout-button"
          onClick={onLogout}
        >
          <LogOut size={18} />
          Sign out
        </button>

        <div className="sidebar-footer">
          HUPPY CUBE © 2026
        </div>
      </aside>
    </>
  );
}


// ============================================================
// HEADER
// ============================================================

function Header({
  user,
  balance,
  onMenu,
  onRefresh,
  onDeposit
}) {
  return (
    <header className="topbar">
      <button
        className="mobile-menu"
        onClick={onMenu}
      >
        <Menu size={22} />
      </button>

      <div className="topbar-title">
        <span className="eyebrow">
          CONTROL CENTER
        </span>

        <h1>
          Good day,{" "}
          <span>
            {user.name?.split(" ")[0]}
          </span>

          <span className="wave">✦</span>
        </h1>
      </div>

      <div className="topbar-actions">
        <button
          className="icon-button"
          onClick={onRefresh}
          title="Refresh"
        >
          <RefreshCw size={18} />
        </button>

        <button
          className="balance-pill"
          onClick={onDeposit}
        >
          <div className="balance-icon">
            <Wallet size={17} />
          </div>

          <div>
            <span>Wallet</span>
            <strong>{money(balance)}</strong>
          </div>

          <Plus size={17} />
        </button>
      </div>
    </header>
  );
}


// ============================================================
// DASHBOARD
// ============================================================

function Dashboard({
  user,
  balance,
  stats,
  orders,
  onDeposit,
  onServices,
  onOrders,
  onSupport
}) {
  const latestOrders = orders.slice(0, 5);

  return (
    <section className="content">
      <div className="hero-card">
        <div className="hero-content">
          <div className="hero-badge">
            <Sparkles size={14} />
            HUPPY CUBE
          </div>

          <h2>
            Your social growth,
            <br />
            <span>powered by you.</span>
          </h2>

          <p>
            Manage your services, orders
            and wallet from one powerful
            dashboard.
          </p>

          <div className="hero-buttons">
            <button
              className="primary-button"
              onClick={onServices}
            >
              <ShoppingCart size={18} />
              Browse services
            </button>

            <button
              className="ghost-button"
              onClick={onDeposit}
            >
              <Plus size={18} />
              Add funds
            </button>
          </div>
        </div>

        <div className="hero-visual">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />

          <div className="hero-orb">
            <Sparkles size={48} />
          </div>

          <div className="floating-stat stat-top">
            <TrendingUp size={16} />
            <span>Growing</span>
          </div>

          <div className="floating-stat stat-bottom">
            <CheckCircle2 size={16} />
            <span>Orders active</span>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard
          icon={Wallet}
          title="Wallet Balance"
          value={money(balance)}
          description="Available to spend"
          onClick={onDeposit}
        />

        <StatCard
          icon={Package}
          title="Total Orders"
          value={stats.totalOrders}
          description="All your orders"
          onClick={onOrders}
        />

        <StatCard
          icon={Clock3}
          title="Pending"
          value={stats.pendingOrders}
          description="Currently processing"
        />

        <StatCard
          icon={CircleDollarSign}
          title="Total Spent"
          value={money(stats.totalSpent)}
          description="Across your orders"
        />
      </div>

      <div className="dashboard-grid">
        <div className="section-card">
          <div className="section-heading">
            <div>
              <span className="section-kicker">
                QUICK START
              </span>

              <h3>Popular platforms</h3>
            </div>

            <button
              className="text-button"
              onClick={onServices}
            >
              View all
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="platform-grid">
            {[
              "Facebook",
              "Instagram",
              "TikTok",
              "YouTube",
              "Telegram",
              "WhatsApp"
            ].map((platform) => {
              const config =
                PLATFORM_CONFIG[platform];

              const Icon = config.icon;

              return (
                <button
                  className="platform-card"
                  key={platform}
                  onClick={onServices}
                >
                  <div
                    className="platform-icon"
                    style={{
                      "--platform":
                        config.color
                    }}
                  >
                    <Icon size={22} />
                  </div>

                  <div>
                    <strong>{platform}</strong>
                    <span>Social services</span>
                  </div>

                  <ChevronRight size={16} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="section-card balance-card">
          <div className="balance-glow" />

          <div className="section-kicker">
            YOUR WALLET
          </div>

          <h3>Available balance</h3>

          <div className="big-balance">
            {money(balance)}
          </div>

          <p>
            Add funds through PesaPal and
            start ordering instantly.
          </p>

          <button
            className="primary-button full"
            onClick={onDeposit}
          >
            <ArrowDownToLine size={18} />
            Deposit funds
          </button>
        </div>
      </div>

      <div className="section-card">
        <div className="section-heading">
          <div>
            <span className="section-kicker">
              RECENT ACTIVITY
            </span>

            <h3>Recent orders</h3>
          </div>

          <button
            className="text-button"
            onClick={onOrders}
          >
            View orders
            <ChevronRight size={16} />
          </button>
        </div>

        {latestOrders.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No orders yet"
            description="Your recent orders will appear here."
            button="Browse services"
            onClick={onServices}
          />
        ) : (
          <OrderList orders={latestOrders} />
        )}
      </div>

      <div className="support-banner">
        <div className="support-icon">
          <MessageCircle size={24} />
        </div>

        <div>
          <strong>Need help with an order?</strong>
          <span>
            Contact HUPPY CUBE support directly
            on WhatsApp.
          </span>
        </div>

        <button
          className="ghost-button"
          onClick={onSupport}
        >
          Chat with support
          <ArrowUpRight size={16} />
        </button>
      </div>
    </section>
  );
}

function StatCard({
  icon: Icon,
  title,
  value,
  description,
  onClick
}) {
  return (
    <button
      className={`stat-card ${
        onClick ? "clickable" : ""
      }`}
      onClick={onClick}
    >
      <div className="stat-icon">
        <Icon size={19} />
      </div>

      <div className="stat-info">
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{description}</small>
      </div>
    </button>
  );
}


// ============================================================
// SERVICES
// ============================================================

function ServicesPage({
  services,
  platformCounts,
  selectedPlatform,
  setSelectedPlatform,
  search,
  setSearch,
  loading,
  onRefresh,
  onSelect
}) {
  return (
    <section className="content">
      <PageIntro
        kicker="SERVICE MARKETPLACE"
        title="Choose a service"
        description="Select a platform, choose a service and place your order instantly."
      />

      <div className="service-toolbar">
        <div className="search-box">
          <Search size={18} />

          <input
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            placeholder="Search services..."
          />

          {search && (
            <button
              onClick={() => setSearch("")}
            >
              <X size={16} />
            </button>
          )}
        </div>

        <button
          className="icon-button"
          onClick={onRefresh}
          title="Refresh services"
        >
          <RefreshCw
            size={18}
            className={loading ? "spin" : ""}
          />
        </button>
      </div>

      <div className="platform-tabs">
        <PlatformTab
          name="All"
          count={platformCounts.All || 0}
          active={selectedPlatform === "All"}
          onClick={() =>
            setSelectedPlatform("All")
          }
        />

        {Object.keys(PLATFORM_CONFIG).map(
          (platform) => (
            <PlatformTab
              key={platform}
              name={platform}
              count={
                platformCounts[platform] || 0
              }
              active={
                selectedPlatform === platform
              }
              onClick={() =>
                setSelectedPlatform(platform)
              }
            />
          )
        )}
      </div>

      {loading ? (
        <ServiceSkeleton />
      ) : services.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No services found"
          description="Try another search or refresh the services."
          button="Clear search"
          onClick={() => {
            setSearch("");
            setSelectedPlatform("All");
          }}
        />
      ) : (
        <>
          <div className="service-result-bar">
            <span>
              Showing{" "}
              <strong>{services.length}</strong>{" "}
              services
            </span>

            <span className="service-note">
              Customer prices shown
            </span>
          </div>

          <div className="services-grid">
            {services.map((service) => (
              <ServiceCard
                key={service.service_id}
                service={service}
                onSelect={onSelect}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function PlatformTab({
  name,
  count,
  active,
  onClick
}) {
  const config = PLATFORM_CONFIG[name];
  const Icon = config?.icon || Sparkles;

  return (
    <button
      className={`platform-tab ${
        active ? "active" : ""
      }`}
      onClick={onClick}
    >
      <Icon size={16} />
      <span>{name}</span>
      <b>{count}</b>
    </button>
  );
}

function ServiceCard({
  service,
  onSelect
}) {
  const platform = classifyService(service);
  const config = PLATFORM_CONFIG[platform];
  const Icon = config.icon;

  /*
   * New backend returns `rate`,
   * not customer_rate.
   */
  const customerRate = Number(
    service.rate || 0
  );

  return (
    <div className="service-card">
      <div className="service-card-top">
        <div
          className="service-platform-icon"
          style={{
            "--platform": config.color
          }}
        >
          <Icon size={20} />
        </div>

        <span className="service-type">
          {service.type || "Social service"}
        </span>
      </div>

      <h3>{service.name}</h3>

      <div className="service-meta">
        <span>
          Min{" "}
          {Number(
            service.min || 0
          ).toLocaleString()}
        </span>

        <span>
          Max{" "}
          {Number(
            service.max || 0
          ).toLocaleString()}
        </span>
      </div>

      <div className="service-price">
        <div>
          <strong>
            {money(customerRate)}
          </strong>

          <span>/ 1,000</span>
        </div>

        <button
          className="order-button"
          onClick={() => onSelect(service)}
        >
          Order
          <ArrowUpRight size={16} />
        </button>
      </div>
    </div>
  );
}


// ============================================================
// ORDER MODAL
// ============================================================

function OrderModal({
  service,
  balance,
  onClose,
  onSuccess,
  api,
  showNotice
}) {
  const [link, setLink] = useState("");

  const [quantity, setQuantity] = useState(
    Number(service.min || 100)
  );

  const [loading, setLoading] = useState(false);

  const rate = Number(service.rate || 0);

  const cost = Number(
    (
      rate *
      Number(quantity || 0) /
      1000
    ).toFixed(2)
  );

  const insufficient = balance < cost;

  async function submit(event) {
    event.preventDefault();

    if (!link.trim()) {
      showNotice(
        "error",
        "Enter the target link."
      );
      return;
    }

    if (quantity < Number(service.min)) {
      showNotice(
        "error",
        `Minimum quantity is ${Number(
          service.min
        ).toLocaleString()}.`
      );
      return;
    }

    if (quantity > Number(service.max)) {
      showNotice(
        "error",
        `Maximum quantity is ${Number(
          service.max
        ).toLocaleString()}.`
      );
      return;
    }

    if (insufficient) {
      showNotice(
        "error",
        "Your wallet balance is too low."
      );
      return;
    }

    setLoading(true);

    try {
      const data = await api("/api/smm/order", {
        method: "POST",
        body: JSON.stringify({
          service_id: Number(
            service.service_id
          ),
          link: link.trim(),
          quantity: Number(quantity)
        })
      });

      if (!data.success) {
        throw new Error(
          data.message ||
            data.error ||
            "Order failed"
        );
      }

      showNotice(
        "success",
        `Order #${
          data.order?.id || ""
        } created successfully.`
      );

      await onSuccess();
    } catch (error) {
      showNotice("error", error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="order-modal glass-card">
        <button
          className="modal-close"
          onClick={onClose}
        >
          <X size={20} />
        </button>

        <div className="modal-heading">
          <div className="modal-service-icon">
            <Sparkles size={21} />
          </div>

          <div>
            <span>
              SERVICE #{service.service_id}
            </span>

            <h2>{service.name}</h2>
          </div>
        </div>

        <div className="order-price-box">
          <div>
            <span>Your price</span>

            <strong>
              {money(rate)}
              <small>/ 1,000</small>
            </strong>
          </div>

          <div>
            <span>Wallet</span>

            <strong>
              {money(balance)}
            </strong>
          </div>
        </div>

        <form
          className="order-form"
          onSubmit={submit}
        >
          <label>
            Target link

            <input
              value={link}
              onChange={(e) =>
                setLink(e.target.value)
              }
              placeholder="https://..."
              required
            />
          </label>

          <label>
            Quantity

            <input
              type="number"
              value={quantity}
              min={service.min}
              max={service.max}
              onChange={(e) =>
                setQuantity(
                  Number(e.target.value)
                )
              }
              required
            />

            <small className="input-help">
              Min{" "}
              {Number(
                service.min
              ).toLocaleString()}
              {" "}— Max{" "}
              {Number(
                service.max
              ).toLocaleString()}
            </small>
          </label>

          <div className="order-summary">
            <span>Order total</span>
            <strong>{money(cost)}</strong>
          </div>

          {insufficient && (
            <div className="warning-box">
              <Wallet size={17} />

              <span>
                You need{" "}
                {money(cost - balance)}{" "}
                more in your wallet.
              </span>
            </div>
          )}

          <button
            className="primary-button full"
            disabled={loading || insufficient}
          >
            {loading ? (
              <>
                <RefreshCw
                  size={18}
                  className="spin"
                />
                Placing order...
              </>
            ) : (
              <>
                <ShoppingCart size={18} />
                Place order
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}


// ============================================================
// ORDERS
// ============================================================

function OrdersPage({
  orders,
  loading,
  onRefresh
}) {
  return (
    <section className="content">
      <PageIntro
        kicker="ORDER MANAGEMENT"
        title="My orders"
        description="Track all your HUPPY CUBE orders from one place."
        action={
          <button
            className="icon-button"
            onClick={onRefresh}
          >
            <RefreshCw
              size={18}
              className={loading ? "spin" : ""}
            />
          </button>
        }
      />

      {orders.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No orders yet"
          description="Once you place an order, it will appear here."
        />
      ) : (
        <div className="orders-card section-card">
          <div className="orders-table-wrap">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Service</th>
                  <th>Quantity</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>

              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <strong>
                        #{order.id}
                      </strong>
                    </td>

                    <td>
                      <div className="order-service">
                        <div className="mini-icon">
                          <Sparkles size={14} />
                        </div>

                        <span>
                          {order.service_name}
                        </span>
                      </div>
                    </td>

                    <td>
                      {Number(
                        order.quantity || 0
                      ).toLocaleString()}
                    </td>

                    <td>
                      <strong>
                        {money(order.amount)}
                      </strong>
                    </td>

                    <td>
                      <StatusBadge
                        status={order.status}
                      />
                    </td>

                    <td>
                      {formatDate(
                        order.created_at
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function OrderList({ orders }) {
  return (
    <div className="recent-orders">
      {orders.map((order) => (
        <div
          className="recent-order"
          key={order.id}
        >
          <div className="recent-order-icon">
            <Package size={18} />
          </div>

          <div className="recent-order-info">
            <strong>
              #{order.id} · {order.service_name}
            </strong>

            <span>
              {Number(
                order.quantity || 0
              ).toLocaleString()}{" "}
              units
            </span>
          </div>

          <div className="recent-order-right">
            <strong>
              {money(order.amount)}
            </strong>

            <StatusBadge
              status={order.status}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  const value = String(
    status || "Pending"
  );

  const normalized = value.toLowerCase();

  let className =
    "status-badge pending";

  if (normalized.includes("complete")) {
    className =
      "status-badge completed";
  } else if (
    normalized.includes("fail") ||
    normalized.includes("cancel")
  ) {
    className =
      "status-badge failed";
  } else if (
    normalized.includes("process")
  ) {
    className =
      "status-badge processing";
  }

  return (
    <span className={className}>
      <span className="status-dot" />
      {value}
    </span>
  );
}


// ============================================================
// WALLET
// ============================================================

function WalletPage({
  balance,
  depositAmount,
  setDepositAmount,
  loading,
  onDeposit,
  onRefresh
}) {
  const quickAmounts = [
    100,
    250,
    500,
    1000,
    2500
  ];

  return (
    <section className="content">
      <PageIntro
        kicker="WALLET"
        title="Manage your funds"
        description="Deposit funds through PesaPal and use your balance for instant orders."
        action={
          <button
            className="icon-button"
            onClick={onRefresh}
          >
            <RefreshCw size={18} />
          </button>
        }
      />

      <div className="wallet-grid">
        <div className="wallet-main-card">
          <div className="wallet-card-glow" />

          <div className="wallet-card-header">
            <div>
              <span>AVAILABLE BALANCE</span>

              <h2>{money(balance)}</h2>
            </div>

            <div className="wallet-large-icon">
              <Wallet size={26} />
            </div>
          </div>

          <div className="wallet-card-footer">
            <span>Ready to spend</span>

            <div className="wallet-secure">
              <ShieldCheck size={15} />
              Secure wallet
            </div>
          </div>
        </div>

        <div className="deposit-card section-card">
          <div className="section-kicker">
            ADD FUNDS
          </div>

          <h3>Deposit with PesaPal</h3>

          <p>
            Enter the amount you want to add
            to your HUPPY CUBE wallet.
          </p>

          <label className="deposit-input">
            <span>KSh</span>

            <input
              type="number"
              min="10"
              value={depositAmount}
              onChange={(e) =>
                setDepositAmount(
                  e.target.value
                )
              }
              placeholder="0.00"
            />
          </label>

          <div className="quick-amounts">
            {quickAmounts.map((amount) => (
              <button
                key={amount}
                onClick={() =>
                  setDepositAmount(
                    String(amount)
                  )
                }
              >
                KSh{" "}
                {amount.toLocaleString()}
              </button>
            ))}
          </div>

          <button
            className="primary-button full"
            onClick={onDeposit}
            disabled={loading}
          >
            {loading ? (
              <>
                <RefreshCw
                  size={18}
                  className="spin"
                />
                Connecting to PesaPal...
              </>
            ) : (
              <>
                <ArrowDownToLine size={18} />
                Continue to PesaPal
              </>
            )}
          </button>
        </div>
      </div>

      <div className="payment-info-grid">
        <InfoCard
          icon={ShieldCheck}
          title="Secure payments"
          text="Payments are handled through PesaPal."
        />

        <InfoCard
          icon={Clock3}
          title="Fast crediting"
          text="Completed deposits are added to your wallet."
        />

        <InfoCard
          icon={CircleDollarSign}
          title="KES wallet"
          text="Your HUPPY CUBE balance is maintained in Kenyan Shillings."
        />
      </div>
    </section>
  );
}

function InfoCard({
  icon: Icon,
  title,
  text
}) {
  return (
    <div className="info-card">
      <div className="info-icon">
        <Icon size={18} />
      </div>

      <div>
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
    </div>
  );
}


// ============================================================
// PROFILE
// ============================================================

function ProfilePage({
  user,
  onLogout
}) {
  return (
    <section className="content">
      <PageIntro
        kicker="ACCOUNT"
        title="Your profile"
        description="Your HUPPY CUBE account information."
      />

      <div className="profile-card section-card">
        <div className="profile-header">
          <div className="profile-avatar">
            {user.name
              ?.charAt(0)
              .toUpperCase()}
          </div>

          <div>
            <h2>{user.name}</h2>

            <span>
              HUPPY CUBE customer
            </span>
          </div>
        </div>

        <div className="profile-fields">
          <ProfileField
            icon={User}
            label="Full name"
            value={user.name}
          />

          <ProfileField
            icon={MessageCircle}
            label="Phone number"
            value={user.phone}
          />
        </div>

        <button
          className="danger-button"
          onClick={onLogout}
        >
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </section>
  );
}

function ProfileField({
  icon: Icon,
  label,
  value
}) {
  return (
    <div className="profile-field">
      <div className="profile-field-icon">
        <Icon size={17} />
      </div>

      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}


// ============================================================
// COMMON
// ============================================================

function PageIntro({
  kicker,
  title,
  description,
  action
}) {
  return (
    <div className="page-intro">
      <div>
        <span className="section-kicker">
          {kicker}
        </span>

        <h2>{title}</h2>

        <p>{description}</p>
      </div>

      {action && (
        <div className="page-intro-action">
          {action}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  button,
  onClick
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={27} />
      </div>

      <h3>{title}</h3>

      <p>{description}</p>

      {button && onClick && (
        <button
          className="primary-button"
          onClick={onClick}
        >
          {button}
        </button>
      )}
    </div>
  );
}

function ServiceSkeleton() {
  return (
    <div className="services-grid">
      {Array.from({ length: 8 }).map(
        (_, index) => (
          <div
            className="service-skeleton"
            key={index}
          >
            <div />
            <div />
            <div />
            <div />
          </div>
        )
      )}
    </div>
  );
}

function Notice({
  notice,
  onClose
}) {
  return (
    <div
      className={`notice ${
        notice.type === "success"
          ? "notice-success"
          : "notice-error"
      }`}
    >
      {notice.type === "success" ? (
        <CheckCircle2 size={19} />
      ) : (
        <X size={19} />
      )}

      <span>{notice.message}</span>

      <button onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(
    String(value).replace(" ", "T") + "Z"
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(
    "en-KE",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );
}

createRoot(
  document.getElementById("root")
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
