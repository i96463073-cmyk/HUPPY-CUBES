import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import AdminDashboard from "./AdminDashboard.jsx";

import {
  Search,
  ShoppingCart,
  Instagram,
  Music2,
  Facebook,
  Youtube,
  Send,
  Twitter,
  MessageCircle,
  Gamepad2,
  Globe,
  Sparkles,
  X,
  CheckCircle2,
  Loader2,
  Phone,
  Link as LinkIcon,
  Hash,
  ChevronRight,
  ChevronLeft,
  Headphones,
  CreditCard,
  PackageCheck,
  Clock3,
  Heart,
  Eye,
  MessageSquare,
  Users,
  Bookmark,
  Share2,
  Radio,
  Timer,
  Gift
} from "lucide-react";

const WHATSAPP_NUMBER = "254796681162";

const PLATFORM_ORDER = [
  "All",
  "Instagram",
  "TikTok",
  "Facebook",
  "YouTube",
  "Telegram",
  "Twitter / X",
  "WhatsApp",
  "Spotify",
  "Gaming",
  "Other"
];

const PLATFORM_ICONS = {
  Instagram,
  TikTok: Music2,
  Facebook,
  YouTube: Youtube,
  Telegram: Send,
  "Twitter / X": Twitter,
  WhatsApp: MessageCircle,
  Spotify: Headphones,
  Gaming: Gamepad2,
  Other: Globe
};

/* =========================================================
   SERVICE TYPE BUCKETS
========================================================= */

const TYPE_ORDER = [
  "Likes",
  "Views",
  "Comments",
  "Followers",
  "Saves",
  "Shares",
  "Live Stream",
  "Watch Time",
  "Accounts & Bundles",
  "Other"
];

const TYPE_META = {
  Likes: { emoji: "❤️", icon: Heart },
  Views: { emoji: "👁️", icon: Eye },
  Comments: { emoji: "💬", icon: MessageSquare },
  Followers: { emoji: "👥", icon: Users },
  Saves: { emoji: "🔖", icon: Bookmark },
  Shares: { emoji: "🔁", icon: Share2 },
  "Live Stream": { emoji: "📡", icon: Radio },
  "Watch Time": { emoji: "⏱️", icon: Timer },
  "Accounts & Bundles": { emoji: "🎁", icon: Gift },
  Other: { emoji: "📦", icon: PackageCheck }
};

function detectPlatform(service) {
  const text = `${service?.name || ""} ${
    service?.category || ""
  } ${service?.type || ""}`.toLowerCase();

  if (text.includes("instagram") || text.includes("ig ") || text.includes(" ig"))
    return "Instagram";
  if (text.includes("tiktok") || text.includes("tik tok") || text.includes("tt "))
    return "TikTok";
  if (
    text.includes("facebook") ||
    text.includes("fb ") ||
    text.includes("fb post") ||
    text.includes("fb group")
  )
    return "Facebook";
  if (text.includes("youtube") || text.includes("yt ") || text.includes("yt-"))
    return "YouTube";
  if (text.includes("telegram") || text.includes("tg ")) return "Telegram";
  if (
    text.includes("twitter") ||
    text.includes(" x ") ||
    text.startsWith("x ") ||
    text.includes(" x/") ||
    text.includes("x (") ||
    text.includes(" x.com")
  )
    return "Twitter / X";
  if (
    text.includes("whatsapp") ||
    text.includes("wa chan") ||
    text.includes("wa poll")
  )
    return "WhatsApp";
  if (text.includes("spotify")) return "Spotify";
  if (
    text.includes("boomplay") ||
    text.includes("gaming") ||
    text.includes("game ") ||
    text.includes("twitch")
  )
    return "Gaming";

  return "Other";
}

function detectServiceType(service) {
  const name = String(service?.name || "").toLowerCase();
  const category = String(service?.category || "").toLowerCase();
  const type = String(service?.type || "").toLowerCase();
  const combined = `${name} ${category} ${type}`;

  if (
    type === "package" ||
    combined.includes("premium accounts") ||
    combined.includes("netflix") ||
    combined.includes("chat gpt") ||
    combined.includes("chatgpt") ||
    combined.includes("capcut") ||
    combined.includes("prime video") ||
    combined.includes("account ") ||
    combined.includes("vpn") ||
    combined.includes("whatsapp numbers") ||
    combined.includes("telegram numbers") ||
    combined.includes("safaricom") ||
    combined.includes("data bundles") ||
    combined.includes("google maps reviews") ||
    combined.includes("verification")
  ) {
    return "Accounts & Bundles";
  }

  if (
    combined.includes("live stream") ||
    combined.includes("live video") ||
    combined.includes("live views") ||
    combined.includes("live likes") ||
    combined.includes("live reaction") ||
    combined.includes("live pk") ||
    combined.includes("battle points")
  ) {
    return "Live Stream";
  }

  if (
    combined.includes("watchtime") ||
    combined.includes("watch time") ||
    combined.includes("watch-time")
  ) {
    return "Watch Time";
  }

  if (
    combined.includes("like") ||
    combined.includes("reaction") ||
    combined.includes("react") ||
    combined.includes("heart")
  ) {
    return "Likes";
  }

  if (
    combined.includes("view") ||
    combined.includes("views") ||
    combined.includes("play") ||
    combined.includes("plays") ||
    combined.includes("impression") ||
    combined.includes("reach") ||
    combined.includes("visits") ||
    combined.includes("traffic") ||
    combined.includes("stream") ||
    combined.includes("listener")
  ) {
    return "Views";
  }

  if (combined.includes("comment") || combined.includes("mention")) {
    return "Comments";
  }

  if (
    combined.includes("follower") ||
    combined.includes("subscriber") ||
    combined.includes("member") ||
    combined.includes("subs") ||
    combined.includes("sub ") ||
    combined.includes("bot start")
  ) {
    return "Followers";
  }

  if (combined.includes("save") || combined.includes("bookmark")) {
    return "Saves";
  }

  if (
    combined.includes("share") ||
    combined.includes("repost") ||
    combined.includes("retweet")
  ) {
    return "Shares";
  }

  return "Other";
}

/* =========================================================
   PRICE HELPERS
========================================================= */

function getCustomerRate(service) {
  return Number(
    service?.customer_rate ?? service?.price ?? service?.rate ?? 0
  );
}

function formatKES(value) {
  return `KSh ${Number(value || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function priceFor(service, quantity) {
  const rate = getCustomerRate(service);
  const qty = Number(quantity || 0);
  return (rate * qty) / 1000;
}

function getWhatsAppUrl(trackingId = "") {
  const message = trackingId
    ? `Hello HUPPY CUBE, I need help with my order. Tracking ID: ${trackingId}`
    : "Hello HUPPY CUBE, I need help with my order.";

  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

/* =========================================================
   STATUS LABEL
========================================================= */

function statusLabel(status) {
  if (!status) return "Awaiting Payment";

  const v = String(status).toLowerCase().trim();

  if (v.includes("completed")) return "Completed";
  if (v.includes("partial")) return "Partially Completed";
  if (v.includes("cancel")) return "Cancelled";
  if (v.includes("processing")) return "Processing";
  if (v.includes("submitting")) return "Submitting to Supplier";
  if (v.includes("supplier error")) return "Supplier Error";
  if (v.includes("payment mismatch")) return "Payment Amount Mismatch";
  if (v.includes("payment error")) return "Payment Error";
  if (v.includes("payment failed")) return "Payment Failed";
  if (v.includes("reversed")) return "Payment Reversed";
  if (v.includes("payment pending")) return "Awaiting Payment";
  if (v === "pending") return "Order Created";
  if (v.includes("failed")) return "Failed";

  return status;
}

/* =========================================================
   PROGRESS DERIVATION
========================================================= */

const STATUS_PROGRESS = {
  "payment pending": { current_step: 1, progress: 15 },
  pending: { current_step: 1, progress: 20 },
  "payment received": { current_step: 1, progress: 20 },
  "payment failed": { current_step: 1, progress: 10 },
  "payment error": { current_step: 1, progress: 10 },
  "payment mismatch": { current_step: 1, progress: 10 },
  "payment reversed": { current_step: 1, progress: 10 },
  submitting: { current_step: 2, progress: 45 },
  "supplier error": { current_step: 2, progress: 35 },
  processing: { current_step: 3, progress: 70 },
  completed: { current_step: 4, progress: 100 },
  partial: { current_step: 4, progress: 100 },
  cancelled: { current_step: 4, progress: 100 },
  failed: { current_step: 4, progress: 100 }
};

function deriveTracking(order) {
  const key = String(order?.order_status || "payment pending")
    .toLowerCase()
    .trim();

  const direct = STATUS_PROGRESS[key];
  if (direct) {
    return {
      current_step: direct.current_step,
      progress: direct.progress,
      status_label: statusLabel(order?.order_status)
    };
  }

  const matched = Object.entries(STATUS_PROGRESS).find(([k]) =>
    key.includes(k)
  );

  const match = matched?.[1] || { current_step: 1, progress: 15 };

  return {
    current_step: match.current_step,
    progress: match.progress,
    status_label: statusLabel(order?.order_status)
  };
    }/* =========================================================
   TRACKING PROGRESS
========================================================= */

function TrackingProgress({ tracking }) {
  const currentStep = Number(tracking?.current_step || 1);

  const steps = [
    { number: 1, title: "Payment Received", icon: CreditCard },
    { number: 2, title: "Order Submitted", icon: PackageCheck },
    { number: 3, title: "Processing", icon: Loader2 },
    { number: 4, title: "Completed", icon: CheckCircle2 }
  ];

  return (
    <div className="tracking-progress">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const active = currentStep >= step.number;
        const current = currentStep === step.number;

        return (
          <React.Fragment key={step.number}>
            <div
              className={`tracking-step ${
                active ? "active" : ""
              } ${current ? "current" : ""}`}
            >
              <div className="tracking-step-icon">
                <Icon size={19} />
              </div>
              <span>{step.title}</span>
            </div>

            {index < steps.length - 1 && (
              <div
                className={`tracking-line ${
                  currentStep > step.number ? "active" : ""
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* =========================================================
   ORDER TRACKING
========================================================= */

function OrderTracking({ trackingId, initialData, onClose }) {
  const [trackingData, setTrackingData] = useState(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [trackingError, setTrackingError] = useState("");

  async function loadTracking(showLoader = false) {
    try {
      if (showLoader) setLoading(true);
      setTrackingError("");

      if (!trackingId) throw new Error("Tracking ID is missing.");

      const response = await fetch(
        `/api/order-status?tracking_id=${encodeURIComponent(trackingId)}`,
        {
          credentials: "same-origin",
          cache: "no-store"
        }
      );

      const responseText = await response.text();

      let data = null;
      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch {
        throw new Error("The tracking server returned an invalid response.");
      }

      if (!response.ok || !data || !data.success) {
        throw new Error(data?.error || "Unable to load order status.");
      }

      setTrackingData(data);
    } catch (err) {
      setTrackingError(err?.message || "Unable to load order status.");
    } finally {
      setLoading(false);
    }
  }

  const order = trackingData?.order;
  const tracking = trackingData?.tracking || deriveTracking(order);

  const orderStatusKey = String(order?.order_status || "").toLowerCase();
  const terminal =
    orderStatusKey.includes("completed") ||
    orderStatusKey.includes("partial") ||
    orderStatusKey.includes("cancel") ||
    orderStatusKey.includes("failed") ||
    orderStatusKey.includes("reversed") ||
    orderStatusKey.includes("supplier error");

  useEffect(() => {
    loadTracking(true);

    if (terminal) return;

    const interval = setInterval(() => loadTracking(false), 15000);
    return () => clearInterval(interval);
  }, [trackingId, terminal]);

  const whatsappUrl =
    trackingData?.whatsapp?.url || getWhatsAppUrl(trackingId);

  if (loading && !trackingData) {
    return (
      <div className="tracking-screen">
        <div className="tracking-loading">
          <Loader2 className="spin" size={35} />
          <h2>Loading your order...</h2>
          <p>Please wait while we check your order status.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tracking-screen">
      <div className="tracking-header">
        <button type="button" className="tracking-back" onClick={onClose}>
          <X size={19} />
          Close
        </button>

        <div className="tracking-title">
          <span className="section-kicker">ORDER TRACKING</span>
          <h2>Track your order</h2>
          <p>Your order status updates automatically.</p>
        </div>
      </div>

      {trackingError && (
        <div className="form-error">
          <span>{trackingError}</span>
          <button type="button" onClick={() => loadTracking(true)}>
            Try Again
          </button>
        </div>
      )}

      {order && (
        <>
          <div className="tracking-id-box">
            <div>
              <span>Tracking ID</span>
              <strong>{order.tracking_id}</strong>
            </div>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(order.tracking_id)}
            >
              Copy
            </button>
          </div>

          <div className="tracking-status-card">
            <div className="tracking-status-top">
              <div>
                <span>Current status</span>
                <strong>{statusLabel(order.order_status)}</strong>
              </div>
              <div className="tracking-percent">
                {Number(tracking?.progress || 0)}%
              </div>
            </div>

            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${Number(tracking?.progress || 0)}%` }}
              />
            </div>
          </div>

          <TrackingProgress tracking={tracking} />

          <div className="tracking-details">
            <div className="tracking-detail">
              <span>Service</span>
              <strong>{order.service_name}</strong>
            </div>
            <div className="tracking-detail">
              <span>Quantity</span>
              <strong>{Number(order.quantity || 0).toLocaleString()}</strong>
            </div>
            <div className="tracking-detail">
              <span>Payment</span>
              <strong>{order.payment_status || "Pending"}</strong>
            </div>
            <div className="tracking-detail">
              <span>Supplier Order</span>
              <strong>{order.supplier_order_id || "Being submitted"}</strong>
            </div>
          </div>

          {order.error_message && (
            <div className="form-error">
              <span>{order.error_message}</span>
            </div>
          )}

          <div className="tracking-auto">
            <Clock3 size={17} />
            <span>
              {terminal
                ? "This order is complete. No further updates expected."
                : "Status checks automatically every 15 seconds."}
            </span>
            <button type="button" onClick={() => loadTracking(true)}>
              Refresh
            </button>
          </div>

          <a
            className="whatsapp-help"
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={20} />
            <div>
              <strong>WhatsApp Help</strong>
              <span>Need help with this order?</span>
            </div>
            <ChevronRight size={19} />
          </a>
        </>
      )}
    </div>
  );
}

/* =========================================================
   MAIN APP
========================================================= */

function App() {
  const [services, setServices] = useState([]);
  const [selectedPlatform, setSelectedPlatform] = useState("All");
  const [selectedType, setSelectedType] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedService, setSelectedService] = useState(null);
  const [quantity, setQuantity] = useState("");
  const [link, setLink] = useState("");
  const [phone, setPhone] = useState("");
  const [loadingServices, setLoadingServices] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [orderResult, setOrderResult] = useState(null);
  const [trackingId, setTrackingId] = useState("");
  const [error, setError] = useState("");
  const [showTracking, setShowTracking] = useState(false);

  useEffect(() => {
    loadServices();

    const params = new URLSearchParams(window.location.search);
    const returnedTrackingId = params.get("tracking_id");

    if (returnedTrackingId) {
      setTrackingId(returnedTrackingId);
      try {
        localStorage.setItem("huppy_cube_tracking_id", returnedTrackingId);
      } catch {}
      setShowTracking(true);
    }
  }, []);

  async function loadServices() {
    try {
      setLoadingServices(true);
      setError("");

      const response = await fetch("/api/services", {
        credentials: "same-origin",
        cache: "no-store"
      });

      const responseText = await response.text();

      let data = null;
      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch {
        throw new Error("The services server returned an invalid response.");
      }

      if (!response.ok) {
        throw new Error(data?.error || "Unable to load services");
      }

      const serviceList = Array.isArray(data)
        ? data
        : Array.isArray(data?.services)
        ? data.services
        : [];

      setServices(serviceList);
    } catch (err) {
      setError(err?.message || "Unable to load services");
    } finally {
      setLoadingServices(false);
    }
  }

  const enrichedServices = useMemo(() => {
    return services.map((service) => ({
      ...service,
      platform: detectPlatform(service),
      serviceType: detectServiceType(service)
    }));
  }, [services]);

  const platformServices = useMemo(() => {
    return enrichedServices.filter((service) => {
      if (selectedPlatform === "All") return true;
      return service.platform === selectedPlatform;
    });
  }, [enrichedServices, selectedPlatform]);

  const availableTypes = useMemo(() => {
    const counts = {};

    for (const s of platformServices) {
      const t = s.serviceType || "Other";
      counts[t] = (counts[t] || 0) + 1;
    }

    return TYPE_ORDER.filter((t) => counts[t] > 0).map((t) => ({
      type: t,
      count: counts[t],
      ...TYPE_META[t]
    }));
  }, [platformServices]);

  const shouldSkipTypeStage = availableTypes.length <= 1;

  const filteredServices = useMemo(() => {
    const query = search.trim().toLowerCase();

    const activeType = shouldSkipTypeStage
      ? availableTypes[0]?.type || null
      : selectedType;

    const matched = platformServices.filter((service) => {
      const matchesType = !activeType || service.serviceType === activeType;

      const matchesSearch =
        !query ||
        `${service.name} ${service.category} ${service.type} ${service.platform}`
          .toLowerCase()
          .includes(query);

      return matchesType && matchesSearch;
    });

    return matched.sort((a, b) => {
      const ra = Number(getCustomerRate(a) || 0);
      const rb = Number(getCustomerRate(b) || 0);
      return ra - rb;
    });
  }, [
    platformServices,
    availableTypes,
    shouldSkipTypeStage,
    selectedType,
    search
  ]);

  useEffect(() => {
    setSelectedType(null);
    setSearch("");
  }, [selectedPlatform]);

  function openOrder(service) {
    setSelectedService(service);
    setQuantity(String(service.min_quantity ?? service.min ?? ""));
    setLink("");
    setPhone("");
    setError("");
    setOrderResult(null);
  }

  function closeOrder() {
    if (ordering) return;
    setSelectedService(null);
    setOrderResult(null);
    setError("");
  }

  function openTracking(id = trackingId) {
    if (!id) {
      setError("Your tracking number has not been created yet.");
      return;
    }

    setTrackingId(id);
    setShowTracking(true);
    setSelectedService(null);
    setOrderResult(null);
    setError("");
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (!selectedService) return;

    const qty = Number(quantity);
    const minimum = Number(
      selectedService.min_quantity ?? selectedService.min ?? 0
    );
    const maximum = Number(
      selectedService.max_quantity ?? selectedService.max ?? 0
    );

    if (!qty || qty < minimum) {
      setError(`Minimum quantity is ${minimum.toLocaleString()}`);
      return;
    }

    if (maximum && qty > maximum) {
      setError(`Maximum quantity is ${maximum.toLocaleString()}`);
      return;
    }

    if (!link.trim()) {
      setError("Please enter the target link.");
      return;
    }

    if (!phone.trim()) {
      setError("Please enter your phone number.");
      return;
    }

    setError("");
    setOrdering(true);

    try {
      const response = await fetch("/api/order-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          service_id: selectedService.service_id,
          service_name: selectedService.name,
          quantity: qty,
          link: link.trim(),
          phone: phone.trim()
        })
      });

      const responseText = await response.text();

      let data = null;
      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch {
        throw new Error(
          `The payment server returned an invalid response: ${responseText.slice(
            0,
            300
          )}`
        );
      }

      if (!data || typeof data !== "object") {
        throw new Error(
          "The payment server returned an empty response. Please try again."
        );
      }

      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Unable to create payment.");
      }

      if (!data.tracking_id) {
        throw new Error(
          "Payment was created without a tracking ID. Please contact support before trying again."
        );
      }

      setTrackingId(data.tracking_id);
      try {
        localStorage.setItem("huppy_cube_tracking_id", data.tracking_id);
      } catch {}

      if (data.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }

      setOrderResult(data);
    } catch (err) {
      console.error("Order payment error:", err);
      setError(
        err?.message || "Something went wrong while creating your order."
      );
    } finally {
      setOrdering(false);
    }
  }

  useEffect(() => {
    if (trackingId) return;
    try {
      const saved = localStorage.getItem("huppy_cube_tracking_id");
      if (saved) setTrackingId(saved);
    } catch {}
  }, [trackingId]);

  if (showTracking && trackingId) {
    return (
      <div className="app-shell">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <div className="ambient ambient-three" />

        <header className="topbar">
          <div className="brand">
            <div className="brand-icon">
              <Sparkles size={22} />
            </div>
            <div>
              <div className="brand-name">HUPPY CUBE</div>
              <div className="brand-subtitle">SOCIAL MEDIA SERVICES</div>
            </div>
          </div>

          <a
            className="support-button"
            href={getWhatsAppUrl(trackingId)}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={18} />
            <span>WhatsApp Help</span>
          </a>
        </header>

        <main className="main-content">
          <OrderTracking
            trackingId={trackingId}
            onClose={() => {
              setShowTracking(false);
              window.history.replaceState({}, "", window.location.pathname);
            }}
          />
        </main>
      </div>
    );
  }

  if (selectedPlatform === "All" && !selectedType) {
    return (
      <div className="app-shell">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <div className="ambient ambient-three" />

        <header className="topbar">
          <div className="brand">
            <div className="brand-icon">
              <Sparkles size={22} />
            </div>
            <div>
              <div className="brand-name">HUPPY CUBE</div>
              <div className="brand-subtitle">SOCIAL MEDIA SERVICES</div>
            </div>
          </div>

          <div className="header-actions">
            {trackingId && (
              <button
                type="button"
                className="track-button"
                onClick={() => openTracking()}
              >
                <PackageCheck size={18} />
                <span>Track Order</span>
              </button>
            )}

            <a
              className="support-button"
              href={getWhatsAppUrl()}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={18} />
              <span>Support</span>
            </a>
          </div>
        </header>

        <main className="main-content">
          <section className="hero-section">
            <div className="hero-glow">
              <Sparkles size={18} />
              Fast • Simple • Secure
            </div>

            <h1>
              Grow your<span> social presence.</span>
            </h1>

            <p>
              Choose a platform, select your service, enter your details and
              complete your order in seconds.
            </p>

            <div className="hero-stats">
              <div className="hero-stat">
                <strong>{services.length || "500+"}</strong>
                <span>Services</span>
              </div>

              <div className="hero-stat">
                <strong>24/7</strong>
                <span>Ordering</span>
              </div>

              <div className="hero-stat">
                <strong>⚡</strong>
                <span>Fast Delivery</span>
              </div>
            </div>
          </section>

          <section className="services-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">EXPLORE</span>
                <h2>Choose a platform</h2>
              </div>

              <div className="service-count">
                {enrichedServices.length} services
              </div>
            </div>

            <div className="platform-grid">
              {PLATFORM_ORDER.map((platform) => {
                if (platform === "All") return null;

                const Icon = PLATFORM_ICONS[platform] || Globe;

                const count = enrichedServices.filter(
                  (service) => service.platform === platform
                ).length;

                return (
                  <button
                    key={platform}
                    type="button"
                    className="platform-card"
                    onClick={() => setSelectedPlatform(platform)}
                  >
                    <span className="platform-icon">
                      <Icon size={21} />
                    </span>

                    <span className="platform-info">
                      <strong>{platform}</strong>
                      <small>{count} services</small>
                    </span>

                    <ChevronRight size={17} className="platform-arrow" />
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: "20px", textAlign: "center" }}>
              <button
                type="button"
                className="track-button"
                onClick={() => setSelectedPlatform("All")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <Globe size={16} />
                Show all services
              </button>
            </div>
          </section>
        </main>

        <footer className="footer">
          <span>© {new Date().getFullYear()} HUPPY CUBE</span>
          <span>Secure payments • Fast delivery</span>
        </footer>
      </div>
    );
  }

  if (!shouldSkipTypeStage && !selectedType && selectedPlatform !== "All") {
    return (
      <div className="app-shell">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <div className="ambient ambient-three" />

        <header className="topbar">
          <div className="brand">
            <div className="brand-icon">
              <Sparkles size={22} />
            </div>
            <div>
              <div className="brand-name">HUPPY CUBE</div>
              <div className="brand-subtitle">SOCIAL MEDIA SERVICES</div>
            </div>
          </div>

          <div className="header-actions">
            {trackingId && (
              <button
                type="button"
                className="track-button"
                onClick={() => openTracking()}
              >
                <PackageCheck size={18} />
                <span>Track Order</span>
              </button>
            )}

            <a
              className="support-button"
              href={getWhatsAppUrl()}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={18} />
              <span>Support</span>
            </a>
          </div>
        </header>

        <main className="main-content">
          <section className="services-section">
            <div className="section-heading">
              <div>
                <button
                  type="button"
                  className="tracking-back"
                  onClick={() => {
                    setSelectedPlatform("All");
                    setSelectedType(null);
                  }}
                  style={{ marginBottom: "12px" }}
                >
                  <ChevronLeft size={16} />
                  Back to platforms
                </button>

                <span className="section-kicker">EXPLORE</span>
                <h2>{selectedPlatform}</h2>
                <p style={{ marginTop: "6px", opacity: 0.7 }}>
                  What type of engagement do you need?
                </p>
              </div>
            </div>

            <div className="type-grid">
              {availableTypes.map((t) => {
                const Icon = t.icon;

                return (
                  <button
                    key={t.type}
                    type="button"
                    className="type-card"
                    onClick={() => setSelectedType(t.type)}
                  >
                    <span className="type-emoji">{t.emoji}</span>

                    <span className="type-info">
                      <strong>
                        <Icon size={17} />
                        {t.type}
                      </strong>
                      <small>{t.count} services</small>
                    </span>

                    <ChevronRight size={18} className="type-arrow" />
                  </button>
                );
              })}
            </div>
          </section>
        </main>

        <footer className="footer">
          <span>© {new Date().getFullYear()} HUPPY CUBE</span>
          <span>Secure payments • Fast delivery</span>
        </footer>
      </div>
    );
  }

  const activeType = shouldSkipTypeStage
    ? availableTypes[0]?.type || null
    : selectedType;

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="ambient ambient-three" />

      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <Sparkles size={22} />
          </div>
          <div>
            <div className="brand-name">HUPPY CUBE</div>
            <div className="brand-subtitle">SOCIAL MEDIA SERVICES</div>
          </div>
        </div>

        <div className="header-actions">
          {trackingId && (
            <button
              type="button"
              className="track-button"
              onClick={() => openTracking()}
            >
              <PackageCheck size={18} />
              <span>Track Order</span>
            </button>
          )}

          <a
            className="support-button"
            href={getWhatsAppUrl()}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle size={18} />
            <span>Support</span>
          </a>
        </div>
      </header>

      <main className="main-content">
        <section className="services-section">
          <div className="section-heading">
            <div>
              <button
                type="button"
                className="tracking-back"
                onClick={() => {
                  if (shouldSkipTypeStage) {
                    setSelectedPlatform("All");
                  } else {
                    setSelectedType(null);
                  }
                }}
                style={{ marginBottom: "12px" }}
              >
                <ChevronLeft size={16} />
                {shouldSkipTypeStage
                  ? "Back to platforms"
                  : `Back to ${selectedPlatform} types`}
              </button>

              <span className="section-kicker">
                {selectedPlatform.toUpperCase()}
              </span>
              <h2>
                {activeType
                  ? `${TYPE_META[activeType]?.emoji || ""} ${activeType}`
                  : selectedPlatform}
              </h2>
            </div>

            <div className="service-count">
              {filteredServices.length} services
            </div>
          </div>

          <div className="search-box">
            <Search size={20} />

            <input
              type="text"
              placeholder={`Search ${activeType || "services"}...`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            {search && (
              <button
                type="button"
                className="clear-search"
                onClick={() => setSearch("")}
              >
                <X size={17} />
              </button>
            )}
          </div>

          {loadingServices ? (
            <div className="loading-state">
              <Loader2 className="spin" size={30} />
              <span>Loading services...</span>
            </div>
          ) : error && !selectedService ? (
            <div className="error-state">
              <strong>Unable to load services</strong>
              <span>{error}</span>
              <button type="button" onClick={loadServices}>
                Try Again
              </button>
            </div>
          ) : filteredServices.length === 0 ? (
            <div className="empty-state">
              <Search size={35} />
              <strong>No services found</strong>
              <span>Try another search or platform.</span>
            </div>
          ) : (
            <div className="services-grid">
              {filteredServices.map((service) => {
                const Icon = PLATFORM_ICONS[service.platform] || Globe;
                const customerRate = getCustomerRate(service);

                return (
                  <article className="service-card" key={service.service_id}>
                    <div className="service-card-top">
                      <div className="service-platform">
                        <span className="service-platform-icon">
                          <Icon size={19} />
                        </span>
                        {service.platform}
                      </div>

                      <span className="service-number">
                        #{service.service_id}
                      </span>
                    </div>

                    <h3>{service.name}</h3>

                    <div className="service-meta">
                      <span>
                        Min{" "}
                        {Number(
                          service.min_quantity ?? service.min ?? 0
                        ).toLocaleString()}
                      </span>

                      <span>
                        Max{" "}
                        {Number(
                          service.max_quantity ?? service.max ?? 0
                        ).toLocaleString()}
                      </span>
                    </div>

                    <div className="service-bottom">
                      <div>
                        <small>Starting from</small>
                        <strong>
                          {formatKES(customerRate / 2)}
                          <em>/500</em>
                        </strong>
                      </div>

                      <button
                        type="button"
                        className="order-button"
                        onClick={() => openOrder(service)}
                      >
                        Order
                        <ShoppingCart size={17} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        <span>© {new Date().getFullYear()} HUPPY CUBE</span>
        <span>Secure payments • Fast delivery</span>
      </footer>

      {selectedService && (
        <div className="modal-backdrop" onClick={closeOrder}>
          <div
            className="order-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={closeOrder}
              disabled={ordering}
            >
              <X size={20} />
            </button>

            {!orderResult ? (
              <>
                <div className="modal-header">
                  <div className="modal-service-icon">
                    {React.createElement(
                      PLATFORM_ICONS[selectedService.platform] || Globe,
                      { size: 25 }
                    )}
                  </div>

                  <div>
                    <span>{selectedService.platform}</span>
                    <h2>Order service</h2>
                  </div>
                </div>

                <div className="selected-service-name">
                  {selectedService.name}
                </div>

                <form onSubmit={submitOrder}>
                  <label className="field">
                    <span>
                      <Hash size={16} />
                      Quantity
                    </span>

                    <input
                      type="number"
                      min={
                        selectedService.min_quantity ?? selectedService.min
                      }
                      max={
                        selectedService.max_quantity ?? selectedService.max
                      }
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                      placeholder="Enter quantity"
                    />

                    <small>
                      Min{" "}
                      {Number(
                        selectedService.min_quantity ??
                          selectedService.min ??
                          0
                      ).toLocaleString()}{" "}
                      • Max{" "}
                      {Number(
                        selectedService.max_quantity ??
                          selectedService.max ??
                          0
                      ).toLocaleString()}
                    </small>
                  </label>

                  <label className="field">
                    <span>
                      <LinkIcon size={16} />
                      Target link
                    </span>

                    <input
                      type="url"
                      value={link}
                      onChange={(event) => setLink(event.target.value)}
                      placeholder="https://..."
                    />
                  </label>

                  <label className="field">
                    <span>
                      <Phone size={16} />
                      Phone number
                    </span>

                    <input
                      type="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="07XXXXXXXX"
                    />
                  </label>

                  <div className="total-box">
                    <div>
                      <span>Total</span>
                      <small>
                        {Number(quantity || 0).toLocaleString()} units
                      </small>
                    </div>

                    <strong>
                      {formatKES(priceFor(selectedService, quantity))}
                    </strong>
                  </div>

                  {error && <div className="form-error">{error}</div>}

                  <button
                    type="submit"
                    className="pay-button"
                    disabled={ordering}
                  >
                    {ordering ? (
                      <>
                        <Loader2 className="spin" size={19} />
                        Preparing payment...
                      </>
                    ) : (
                      <>
                        Pay & Order
                        <ChevronRight size={20} />
                      </>
                    )}
                  </button>

                  <div className="secure-note">
                    🔒 Secure payment powered by PesaPal
                  </div>
                </form>
              </>
            ) : (
              <div className="success-screen">
                <div className="success-icon">
                  <CheckCircle2 size={48} />
                </div>

                <h2>Order Created!</h2>

                <p>
                  Your order has been created. Use the tracking page to follow
                  its progress.
                </p>

                <div className="success-details">
                  <div>
                    <span>Tracking ID</span>
                    <strong>{orderResult.tracking_id}</strong>
                  </div>

                  <div>
                    <span>Service</span>
                    <strong>{selectedService.name}</strong>
                  </div>

                  <div>
                    <span>Quantity</span>
                    <strong>{Number(quantity).toLocaleString()}</strong>
                  </div>

                  <div>
                    <span>Amount</span>
                    <strong>
                      {formatKES(priceFor(selectedService, quantity))}
                    </strong>
                  </div>
                </div>

                <button
                  type="button"
                  className="pay-button"
                  onClick={() => openTracking(orderResult.tracking_id)}
                >
                  Track My Order
                  <ChevronRight size={20} />
                </button>

                <a
                  className="whatsapp-help"
                  href={getWhatsAppUrl(orderResult.tracking_id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle size={20} />
                  <div>
                    <strong>WhatsApp Help</strong>
                    <span>Need help with this order?</span>
                  </div>
                  <ChevronRight size={19} />
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   ROOT — ROUTES /admin TO ADMIN DASHBOARD
========================================================= */

function Root() {
  if (window.location.pathname === "/admin") {
    return <AdminDashboard />;
  }

  return <App />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
