import React, { useEffect, useMemo, useState } from "react";
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
  ArrowLeft,
  X,
  CheckCircle2,
  Loader2,
  Phone,
  Link as LinkIcon,
  Hash,
  ChevronRight,
  Headphones
} from "lucide-react";

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

function detectPlatform(service) {
  const text = `${service?.name || ""} ${service?.category || ""} ${service?.type || ""}`.toLowerCase();

  if (text.includes("instagram") || text.includes("ig ")) return "Instagram";
  if (text.includes("tiktok") || text.includes("tik tok")) return "TikTok";
  if (text.includes("facebook") || text.includes("fb ")) return "Facebook";
  if (text.includes("youtube") || text.includes("youtube")) return "YouTube";
  if (text.includes("telegram")) return "Telegram";
  if (
    text.includes("twitter") ||
    text.includes(" x ") ||
    text.startsWith("x ") ||
    text.includes(" x/")
  ) return "Twitter / X";
  if (text.includes("whatsapp")) return "WhatsApp";
  if (text.includes("spotify")) return "Spotify";
  if (
    text.includes("gaming") ||
    text.includes("game ") ||
    text.includes("twitch")
  ) return "Gaming";

  return "Other";
}

function formatKES(value) {
  return `KSh ${Number(value || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function priceFor(service, quantity) {
  const rate = Number(service?.customer_rate || 0);
  const qty = Number(quantity || 0);

  return (rate * qty) / 1000;
}

function App() {
  const [services, setServices] = useState([]);
  const [selectedPlatform, setSelectedPlatform] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedService, setSelectedService] = useState(null);

  const [quantity, setQuantity] = useState("");
  const [link, setLink] = useState("");
  const [phone, setPhone] = useState("");

  const [loadingServices, setLoadingServices] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [orderResult, setOrderResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadServices();
  }, []);

  async function loadServices() {
    try {
      setLoadingServices(true);
      setError("");

      const response = await fetch("/api/services", {
        credentials: "same-origin"
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Unable to load services");
      }

      setServices(Array.isArray(data) ? data : data.services || []);
    } catch (err) {
      setError(err.message || "Unable to load services");
    } finally {
      setLoadingServices(false);
    }
  }

  const enrichedServices = useMemo(() => {
    return services.map((service) => ({
      ...service,
      platform: detectPlatform(service)
    }));
  }, [services]);

  const filteredServices = useMemo(() => {
    const query = search.trim().toLowerCase();

    return enrichedServices.filter((service) => {
      const matchesPlatform =
        selectedPlatform === "All" ||
        service.platform === selectedPlatform;

      const matchesSearch =
        !query ||
        `${service.name} ${service.category} ${service.type} ${service.platform}`
          .toLowerCase()
          .includes(query);

      return matchesPlatform && matchesSearch;
    });
  }, [enrichedServices, selectedPlatform, search]);

  function openOrder(service) {
    setSelectedService(service);
    setQuantity(String(service.min_quantity || ""));
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

  async function submitOrder(event) {
    event.preventDefault();

    if (!selectedService) return;

    const qty = Number(quantity);

    if (!qty || qty < Number(selectedService.min_quantity)) {
      setError(
        `Minimum quantity is ${Number(
          selectedService.min_quantity
        ).toLocaleString()}`
      );
      return;
    }

    if (qty > Number(selectedService.max_quantity)) {
      setError(
        `Maximum quantity is ${Number(
          selectedService.max_quantity
        ).toLocaleString()}`
      );
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
      /*
       * This endpoint will be connected to the new
       * PesaPal → DenzGains payment flow.
       */
      const response = await fetch("/api/order-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify({
          service_id: selectedService.service_id,
          service_name: selectedService.name,
          quantity: qty,
          link: link.trim(),
          phone: phone.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Unable to create payment.");
      }

      if (data.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }

      if (data.order_id) {
        setOrderResult(data);
      } else {
        throw new Error("Payment information was not returned.");
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setOrdering(false);
    }
  }

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
          href="https://wa.me/254796681162"
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle size={18} />
          <span>Support</span>
        </a>
      </header>

      <main className="main-content">
        <section className="hero-section">
          <div className="hero-glow">
            <Sparkles size={18} />
            Fast • Simple • Secure
          </div>

          <h1>
            Grow your
            <span> social presence.</span>
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
              {filteredServices.length} services
            </div>
          </div>

          <div className="platform-grid">
            {PLATFORM_ORDER.map((platform) => {
              const Icon =
                platform === "All"
                  ? Sparkles
                  : PLATFORM_ICONS[platform] || Globe;

              const count =
                platform === "All"
                  ? enrichedServices.length
                  : enrichedServices.filter(
                      (service) => service.platform === platform
                    ).length;

              return (
                <button
                  key={platform}
                  type="button"
                  className={`platform-card ${
                    selectedPlatform === platform ? "active" : ""
                  }`}
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

          <div className="search-box">
            <Search size={20} />
            <input
              type="text"
              placeholder="Search services..."
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
                const Icon =
                  PLATFORM_ICONS[service.platform] || Globe;

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
                          service.min_quantity || 0
                        ).toLocaleString()}
                      </span>

                      <span>
                        Max{" "}
                        {Number(
                          service.max_quantity || 0
                        ).toLocaleString()}
                      </span>
                    </div>

                    <div className="service-bottom">
                      <div>
                        <small>Starting from</small>
                        <strong>
                          {formatKES(service.customer_rate)}
                          <em>/1K</em>
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
                      min={selectedService.min_quantity}
                      max={selectedService.max_quantity}
                      value={quantity}
                      onChange={(event) =>
                        setQuantity(event.target.value)
                      }
                      placeholder="Enter quantity"
                    />

                    <small>
                      Min{" "}
                      {Number(
                        selectedService.min_quantity
                      ).toLocaleString()}{" "}
                      • Max{" "}
                      {Number(
                        selectedService.max_quantity
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
                      onChange={(event) =>
                        setLink(event.target.value)
                      }
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
                      onChange={(event) =>
                        setPhone(event.target.value)
                      }
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
                      {formatKES(
                        priceFor(selectedService, quantity)
                      )}
                    </strong>
                  </div>

                  {error && (
                    <div className="form-error">
                      {error}
                    </div>
                  )}

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

                <h2>Order Successful!</h2>

                <p>
                  Your payment was received and your order has
                  been submitted.
                </p>

                <div className="success-details">
                  <div>
                    <span>Order ID</span>
                    <strong>#{orderResult.order_id}</strong>
                  </div>

                  <div>
                    <span>Service</span>
                    <strong>{selectedService.name}</strong>
                  </div>

                  <div>
                    <span>Quantity</span>
                    <strong>
                      {Number(quantity).toLocaleString()}
                    </strong>
                  </div>

                  <div>
                    <span>Amount</span>
                    <strong>
                      {formatKES(
                        priceFor(selectedService, quantity)
                      )}
                    </strong>
                  </div>
                </div>

                <button
                  type="button"
                  className="pay-button"
                  onClick={closeOrder}
                >
                  Order Another Service
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
