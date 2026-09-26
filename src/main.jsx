import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Wallet,
  CreditCard,
  ShoppingCart,
  MessageCircle,
  Instagram,
  Facebook,
  Youtube,
  Music2,
  RefreshCw,
  ArrowRight,
  CheckCircle,
  Menu,
  X
} from "lucide-react";
import "./index.css";

const WHATSAPP_NUMBER = "254796681162";

const services = [
  {
    name: "Instagram Followers",
    price: "KSh 40",
    icon: Instagram
  },
  {
    name: "Instagram Likes",
    price: "KSh 30",
    icon: Instagram
  },
  {
    name: "TikTok Followers",
    price: "KSh 50",
    icon: Music2
  },
  {
    name: "TikTok Likes",
    price: "KSh 35",
    icon: Music2
  },
  {
    name: "Facebook Page Likes",
    price: "KSh 45",
    icon: Facebook
  },
  {
    name: "YouTube Subscribers",
    price: "KSh 80",
    icon: Youtube
  }
];

function App() {
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState("");
  const [balance, setBalance] = useState(0);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function loadBalance(phoneNumber = phone) {
    if (!phoneNumber.trim()) {
      setBalance(0);
      return;
    }

    setLoadingBalance(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/wallet?phone=${encodeURIComponent(phoneNumber)}`
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not load wallet.");
      }

      setBalance(Number(data.balance || 0));
    } catch (error) {
      setMessage(error.message || "Could not load wallet balance.");
    } finally {
      setLoadingBalance(false);
    }
  }

  async function startPayment(event) {
    event.preventDefault();

    setMessage("");
    setSuccess(false);

    const numericAmount = Number(amount);

    if (!phone.trim()) {
      setMessage("Enter your phone number.");
      return;
    }

    if (!numericAmount || numericAmount < 10) {
      setMessage("Minimum deposit is KSh 10.");
      return;
    }

    setPaying(true);

    try {
      const response = await fetch("/api/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount: numericAmount,
          phone: phone.trim(),
          email: email.trim(),
          firstName: "HUPPY",
          lastName: "CUSTOMER"
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to create PesaPal payment."
        );
      }

      if (!data.redirect_url) {
        throw new Error("PesaPal did not return a payment URL.");
      }

      window.location.href = data.redirect_url;
    } catch (error) {
      setMessage(error.message || "Payment could not be started.");
      setPaying(false);
    }
  }

  function openWhatsApp(serviceName = "") {
    const text = serviceName
      ? `Hello HUPPY CUBE, I want to order ${serviceName}.`
      : "Hello HUPPY CUBE, I need assistance.";

    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`,
      "_blank"
    );
  }

  useEffect(() => {
    const savedPhone = localStorage.getItem("huppy_phone");

    if (savedPhone) {
      setPhone(savedPhone);
      loadBalance(savedPhone);
    }
  }, []);

  useEffect(() => {
    if (phone.trim()) {
      localStorage.setItem("huppy_phone", phone.trim());
    }
  }, [phone]);

  return (
    <div className="app">
      {/* HEADER */}
      <header className="header">
        <div className="container header-inner">
          <a href="#home" className="logo">
            HUPPY <span>CUBE</span>
          </a>

          <button
            className="mobile-menu"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menu"
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          <nav className={menuOpen ? "nav nav-open" : "nav"}>
            <a href="#home" onClick={() => setMenuOpen(false)}>
              Home
            </a>
            <a href="#services" onClick={() => setMenuOpen(false)}>
              Services
            </a>
            <a href="#wallet" onClick={() => setMenuOpen(false)}>
              Wallet
            </a>
            <a href="#support" onClick={() => setMenuOpen(false)}>
              Support
            </a>
          </nav>

          <button
            className="header-whatsapp"
            onClick={() => openWhatsApp()}
          >
            <MessageCircle size={18} />
            WhatsApp
          </button>
        </div>
      </header>

      {/* HERO */}
      <main>
        <section id="home" className="hero">
          <div className="container hero-grid">
            <div className="hero-content">
              <div className="badge">
                <span className="badge-dot"></span>
                HUPPY CUBE SMM PANEL
              </div>

              <h1>
                Grow your social media
                <span> with HUPPY CUBE.</span>
              </h1>

              <p>
                Fast, simple and convenient social media services.
                Manage your orders and wallet from one place.
              </p>

              <div className="hero-buttons">
                <a href="#services" className="primary-button">
                  View Services
                  <ArrowRight size={18} />
                </a>

                <button
                  className="secondary-button"
                  onClick={() => openWhatsApp()}
                >
                  <MessageCircle size={18} />
                  WhatsApp Support
                </button>
              </div>

              <div className="hero-features">
                <div>
                  <CheckCircle size={18} />
                  <span>24/7 Ordering</span>
                </div>

                <div>
                  <CheckCircle size={18} />
                  <span>Fast Delivery</span>
                </div>

                <div>
                  <CheckCircle size={18} />
                  <span>Easy Management</span>
                </div>
              </div>
            </div>

            {/* WALLET CARD */}
            <div className="wallet-card" id="wallet">
              <div className="wallet-card-top">
                <div>
                  <span className="small-label">YOUR WALLET</span>
                  <h2>KSh {balance.toFixed(2)}</h2>
                </div>

                <div className="wallet-icon">
                  <Wallet size={28} />
                </div>
              </div>

              <div className="wallet-divider"></div>

              <label>Phone Number</label>

              <div className="input-box">
                <span>🇰🇪</span>
                <input
                  type="tel"
                  placeholder="0712 345 678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <button
                className="refresh-button"
                onClick={() => loadBalance()}
                disabled={loadingBalance}
              >
                <RefreshCw
                  size={16}
                  className={loadingBalance ? "spin" : ""}
                />
                {loadingBalance ? "Checking..." : "Check Balance"}
              </button>

              <form onSubmit={startPayment}>
                <label>Deposit Amount</label>

                <div className="amount-input">
                  <span>KSh</span>
                  <input
                    type="number"
                    min="10"
                    step="1"
                    placeholder="Enter amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>

                <label>Email (optional)</label>

                <input
                  className="email-input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />

                <button
                  type="submit"
                  className="deposit-button"
                  disabled={paying}
                >
                  <CreditCard size={19} />

                  {paying
                    ? "Connecting to PesaPal..."
                    : "Deposit with PesaPal"}
                </button>
              </form>

              {message && (
                <div className="message error-message">
                  {message}
                </div>
              )}

              {success && (
                <div className="message success-message">
                  <CheckCircle size={18} />
                  Payment completed successfully.
                </div>
              )}

              <p className="payment-note">
                Secure payment powered by PesaPal.
              </p>
            </div>
          </div>
        </section>

        {/* SERVICES */}
        <section id="services" className="section">
          <div className="container">
            <div className="section-heading">
              <div className="badge">OUR SERVICES</div>

              <h2>Choose a service</h2>

              <p>
                Select the service you need and contact us through
                WhatsApp to place your order.
              </p>
            </div>

            <div className="services-grid">
              {services.map((service) => (
                <Service
                  key={service.name}
                  service={service}
                  onOrder={() => openWhatsApp(service.name)}
                />
              ))}
            </div>
          </div>
        </section>

        {/* QUICK ORDER */}
        <section className="quick-order">
          <div className="container quick-order-inner">
            <div>
              <span className="small-label">READY TO ORDER?</span>
              <h2>Start growing your social media today.</h2>
              <p>
                Contact HUPPY CUBE on WhatsApp and we'll help you
                with your order.
              </p>
            </div>

            <button
              className="primary-button"
              onClick={() => openWhatsApp()}
            >
              <MessageCircle size={19} />
              Order on WhatsApp
            </button>
          </div>
        </section>

        {/* SUPPORT */}
        <section id="support" className="section support-section">
          <div className="container support-card">
            <div className="support-icon">
              <MessageCircle size={32} />
            </div>

            <div>
              <span className="small-label">CUSTOMER SUPPORT</span>
              <h2>Need help?</h2>
              <p>
                Our WhatsApp support is available to help you with
                payments, orders and services.
              </p>
            </div>

            <button
              className="primary-button"
              onClick={() => openWhatsApp()}
            >
              Chat on WhatsApp
              <ArrowRight size={18} />
            </button>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <div className="logo">
              HUPPY <span>CUBE</span>
            </div>

            <p>
              Social Media Marketing Panel
            </p>
          </div>

          <div className="footer-links">
            <a href="#home">Home</a>
            <a href="#services">Services</a>
            <a href="#wallet">Wallet</a>
            <a href="#support">Support</a>
          </div>
        </div>

        <div className="container footer-bottom">
          © {new Date().getFullYear()} HUPPY CUBE. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

function Service({ service, onOrder }) {
  const Icon = service.icon;

  return (
    <div className="service-card">
      <div className="service-icon">
        <Icon size={24} />
      </div>

      <div className="service-info">
        <h3>{service.name}</h3>
        <p>Starting from</p>
        <strong>{service.price}</strong>
      </div>

      <button
        className="service-order"
        onClick={onOrder}
      >
        <ShoppingCart size={17} />
        Order
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
