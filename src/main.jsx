import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  CreditCard,
  ExternalLink,
  Heart,
  Instagram,
  Loader2,
  Menu,
  MessageCircle,
  Package,
  Phone,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  Smartphone,
  Sparkles,
  TikTok,
  Wallet,
  X,
  Zap
} from "lucide-react";
import "./index.css";

const WHATSAPP_NUMBER = "254796681162";

const money = (value) =>
  `KSh ${Number(value || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

function getSavedPhone() {
  return localStorage.getItem("huppy_phone") || "";
}

function savePhone(phone) {
  localStorage.setItem("huppy_phone", phone);
}

function normalizeService(raw) {
  return {
    id: Number(raw.service_id ?? raw.service ?? raw.id),
    name: raw.name || "Social Media Service",
    type: raw.type || "",
    category: raw.category || "",
    rate: Number(raw.customer_rate ?? raw.rate ?? 0),
    supplierRate: Number(raw.supplier_rate ?? raw.rate ?? 0),
    min: Number(raw.min_quantity ?? raw.min ?? 1),
    max: Number(raw.max_quantity ?? raw.max ?? 1000000),
    refill: Boolean(raw.refill),
    cancel: Boolean(raw.cancel),
    active: raw.active === undefined ? true : Boolean(raw.active)
  };
}

function serviceIcon(name) {
  const n = name.toLowerCase();

  if (n.includes("instagram")) return <Instagram size={24} />;
  if (n.includes("tiktok")) return <TikTok size={24} />;
  if (n.includes("facebook")) return <span style={{ fontWeight: 900 }}>f</span>;
  if (n.includes("youtube")) return <span style={{ fontWeight: 900 }}>▶</span>;
  if (n.includes("telegram")) return <Send size={24} />;
  if (n.includes("whatsapp")) return <MessageCircle size={24} />;

  return <Sparkles size={24} />;
}

function App() {
  const [phone, setPhone] = useState(getSavedPhone());
  const [wallet, setWallet] = useState(0);

  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);

  const [selectedService, setSelectedService] = useState(null);
  const [search, setSearch] = useState("");

  const [link, setLink] = useState("");
  const [quantity, setQuantity] = useState("");

  const [depositAmount, setDepositAmount] = useState("");
  const [depositEmail, setDepositEmail] = useState("");

  const [loadingWallet, setLoadingWallet] = useState(false);
  const [depositLoading, setDepositLoading] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [lastOrder, setLastOrder] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const [mobileMenu, setMobileMenu] = useState(false);

  const filteredServices = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return services;

    return services.filter((service) =>
      `${service.name} ${service.type} ${service.category}`
        .toLowerCase()
        .includes(q)
    );
  }, [services, search]);

  const calculatedTotal = useMemo(() => {
    if (!selectedService) return 0;

    const qty = Number(quantity || 0);

    if (!qty || qty <= 0) return 0;

    /*
      The backend uses:
      customer_rate × quantity / 1000

      Example:
      KSh 80 per 1,000
      Quantity 1,000
      = KSh 80
    */
    return (selectedService.rate * qty) / 1000;
  }, [selectedService, quantity]);

  async function readJson(response) {
    const text = await response.text();

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        `Server returned an invalid response (${response.status}).`
      );
    }
  }

  async function loadWallet(currentPhone = phone) {
    if (!currentPhone) {
      setWallet(0);
      return;
    }

    setLoadingWallet(true);

    try {
      const response = await fetch(
        `/api/wallet?phone=${encodeURIComponent(currentPhone)}`
      );

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(data.error || "Could not load wallet.");
      }

      setWallet(Number(data.balance || data.wallet?.balance || 0));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingWallet(false);
    }
  }

  async function loadServices() {
    setLoadingServices(true);
    setError("");

    try {
      let response = await fetch("/api/services");
      let data = await readJson(response);

      let rawServices = Array.isArray(data)
        ? data
        : data.services || data.data || [];

      /*
        If the local service table is empty, try the DenzGains
        service endpoint directly through the Worker.
      */
      if (!rawServices.length) {
        response = await fetch("/api/denzgains/services");
        data = await readJson(response);

        rawServices = Array.isArray(data)
          ? data
          : data.services || data.data || [];
      }

      const normalized = rawServices
        .map(normalizeService)
        .filter((service) => service.id && service.rate >= 0);

      setServices(normalized);
    } catch (err) {
      console.error(err);
      setError(
        err.message ||
          "Unable to load services. Please refresh the page and try again."
      );
    } finally {
      setLoadingServices(false);
    }
  }

  useEffect(() => {
    loadServices();
  }, []);

  useEffect(() => {
    if (phone) {
      savePhone(phone);
      loadWallet(phone);
    }
  }, [phone]);

  function openService(service) {
    setSelectedService(service);
    setLink("");
    setQuantity(String(service.min));
    setMessage("");
    setError("");

    setTimeout(() => {
      document
        .getElementById("order-panel")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function closeService() {
    setSelectedService(null);
    setLink("");
    setQuantity("");
    setError("");
    setMessage("");
  }

  async function handleDeposit(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (!phone.trim()) {
      setError("Enter your phone number first.");
      return;
    }

    const amount = Number(depositAmount);

    if (!amount || amount < 1) {
      setError("Enter a valid deposit amount.");
      return;
    }

    setDepositLoading(true);

    try {
      savePhone(phone.trim());

      const response = await fetch("/api/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          phone: phone.trim(),
          email: depositEmail.trim(),
          amount
        })
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          data.error || data.message || "Unable to start payment."
        );
      }

      if (data.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }

      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }

      setMessage(
        data.message ||
          "Payment request created. Complete the payment to update your wallet."
      );
    } catch (err) {
      console.error(err);
      setError(err.message || "Payment could not be started.");
    } finally {
      setDepositLoading(false);
    }
  }

  async function placeOrder(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (!phone.trim()) {
      setError("Enter your phone number before placing an order.");
      return;
    }

    if (!selectedService) {
      setError("Please select a service.");
      return;
    }

    const qty = Number(quantity);

    if (!link.trim()) {
      setError("Enter the social media link.");
      return;
    }

    if (!qty || !Number.isInteger(qty)) {
      setError("Quantity must be a whole number.");
      return;
    }

    if (qty < selectedService.min) {
      setError(`Minimum quantity is ${selectedService.min.toLocaleString()}.`);
      return;
    }

    if (qty > selectedService.max) {
      setError(`Maximum quantity is ${selectedService.max.toLocaleString()}.`);
      return;
    }

    if (calculatedTotal <= 0) {
      setError("Unable to calculate the order price.");
      return;
    }

    if (wallet < calculatedTotal) {
      setError(
        `Insufficient wallet balance. You need ${money(
          calculatedTotal - wallet
        )} more.`
      );
      return;
    }

    setOrderLoading(true);

    try {
      savePhone(phone.trim());

      const response = await fetch("/api/smm/order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          phone: phone.trim(),
          service_id: selectedService.id,
          link: link.trim(),
          quantity: qty
        })
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          data.error || data.message || "Unable to place order."
        );
      }

      const order = data.order || data;

      setLastOrder({
        id: order.id || order.order_id,
        supplierOrderId:
          order.supplier_order_id ||
          order.supplierOrderId ||
          order.supplier_order ||
          null,
        serviceName:
          order.service_name || selectedService.name,
        link: link.trim(),
        quantity: qty,
        amount: Number(order.amount || calculatedTotal),
        status: order.status || "Pending"
      });

      setMessage(
        "Order placed successfully. Your order has been sent to the supplier."
      );

      setLink("");
      setQuantity(String(selectedService.min));

      await loadWallet(phone.trim());

      setTimeout(() => {
        document
          .getElementById("order-result")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (err) {
      console.error(err);
      setError(err.message || "Order could not be placed.");
    } finally {
      setOrderLoading(false);
    }
  }

  async function checkOrderStatus() {
    if (!lastOrder?.id && !lastOrder?.supplierOrderId) return;

    setStatusLoading(true);
    setError("");

    try {
      const orderId = lastOrder.id || lastOrder.supplierOrderId;

      const response = await fetch(
        `/api/smm/status?order_id=${encodeURIComponent(orderId)}`
      );

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(data.error || "Unable to check order status.");
      }

      const supplier = data.supplier || data.status || data;

      setLastOrder((previous) => ({
        ...previous,
        status:
          supplier.status ||
          data.order?.status ||
          previous.status ||
          "Pending",
        remains:
          supplier.remains ??
          data.order?.remains ??
          previous.remains,
        startCount:
          supplier.start_count ??
          data.order?.start_count ??
          previous.startCount
      }));

      setMessage("Order status updated.");
    } catch (err) {
      console.error(err);
      setError(err.message || "Unable to check order status.");
    } finally {
      setStatusLoading(false);
    }
  }

  function copyOrderId() {
    const id = lastOrder?.supplierOrderId || lastOrder?.id;

    if (!id) return;

    navigator.clipboard?.writeText(String(id));
    setMessage("Order ID copied.");
  }

  function openWhatsApp() {
    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
        "Hello HUPPY CUBE, I need help with my order."
      )}`,
      "_blank"
    );
  }

  return (
    <div className="hc-app">
      <style>{`
        .hc-app {
          min-height: 100vh;
          background:
            radial-gradient(circle at top left, rgba(124,58,237,.16), transparent 30%),
            radial-gradient(circle at top right, rgba(6,182,212,.12), transparent 28%),
            #070b14;
          color: #f8fafc;
          font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .hc-container {
          width: min(1180px, calc(100% - 32px));
          margin: 0 auto;
        }

        .hc-nav {
          position: sticky;
          top: 0;
          z-index: 50;
          backdrop-filter: blur(18px);
          background: rgba(7,11,20,.82);
          border-bottom: 1px solid rgba(255,255,255,.07);
        }

        .hc-nav-inner {
          min-height: 72px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .hc-logo {
          display: flex;
          align-items: center;
          gap: 11px;
          font-weight: 900;
          letter-spacing: -.5px;
          font-size: 20px;
        }

        .hc-logo-mark {
          width: 40px;
          height: 40px;
          border-radius: 13px;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg,#8b5cf6,#06b6d4);
          box-shadow: 0 10px 30px rgba(99,102,241,.28);
        }

        .hc-nav-links {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .hc-nav-btn,
        .hc-menu-btn {
          border: 0;
          color: #cbd5e1;
          background: transparent;
          padding: 10px 13px;
          border-radius: 10px;
          cursor: pointer;
        }

        .hc-nav-btn:hover,
        .hc-menu-btn:hover {
          background: rgba(255,255,255,.07);
          color: white;
        }

        .hc-menu-btn {
          display: none;
        }

        .hc-hero {
          padding: 65px 0 35px;
        }

        .hc-badge {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 7px 11px;
          border-radius: 999px;
          background: rgba(139,92,246,.12);
          border: 1px solid rgba(139,92,246,.24);
          color: #c4b5fd;
          font-size: 12px;
          font-weight: 800;
        }

        .hc-hero h1 {
          margin: 18px 0 12px;
          max-width: 780px;
          font-size: clamp(38px, 7vw, 70px);
          line-height: .98;
          letter-spacing: -3px;
        }

        .hc-gradient {
          background: linear-gradient(90deg,#a78bfa,#22d3ee);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .hc-hero p {
          max-width: 680px;
          color: #94a3b8;
          font-size: 17px;
          line-height: 1.7;
          margin: 0;
        }

        .hc-grid {
          display: grid;
          grid-template-columns: repeat(3,1fr);
          gap: 15px;
          margin: 20px 0 35px;
        }

        .hc-stat {
          padding: 20px;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 18px;
          background: rgba(15,23,42,.7);
        }

        .hc-stat-label {
          color: #94a3b8;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .8px;
        }

        .hc-stat-value {
          font-size: 25px;
          font-weight: 900;
          margin-top: 8px;
        }

        .hc-section {
          margin: 42px 0;
        }

        .hc-section-head {
          display: flex;
          justify-content: space-between;
          align-items: end;
          gap: 15px;
          margin-bottom: 18px;
        }

        .hc-section-head h2 {
          margin: 0;
          font-size: 27px;
        }

        .hc-section-head p {
          color: #64748b;
          margin: 5px 0 0;
        }

        .hc-card {
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 20px;
          background: rgba(15,23,42,.74);
          box-shadow: 0 20px 60px rgba(0,0,0,.18);
        }

        .hc-deposit {
          padding: 22px;
        }

        .hc-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .hc-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .hc-field.full {
          grid-column: 1 / -1;
        }

        .hc-field label {
          color: #cbd5e1;
          font-size: 13px;
          font-weight: 800;
        }

        .hc-input {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid rgba(255,255,255,.09);
          outline: none;
          background: #0a1020;
          color: white;
          border-radius: 12px;
          padding: 13px 14px;
          font-size: 15px;
        }

        .hc-input:focus {
          border-color: rgba(139,92,246,.7);
          box-shadow: 0 0 0 3px rgba(139,92,246,.1);
        }

        .hc-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 0;
          cursor: pointer;
          border-radius: 12px;
          padding: 13px 17px;
          color: white;
          font-weight: 900;
          transition: .2s ease;
        }

        .hc-btn:hover {
          transform: translateY(-1px);
        }

        .hc-btn-primary {
          background: linear-gradient(135deg,#7c3aed,#06b6d4);
          box-shadow: 0 12px 30px rgba(79,70,229,.25);
        }

        .hc-btn-secondary {
          background: rgba(255,255,255,.07);
          border: 1px solid rgba(255,255,255,.08);
        }

        .hc-btn-whatsapp {
          background: #16a34a;
        }

        .hc-search {
          position: relative;
          width: min(360px,100%);
        }

        .hc-search svg {
          position: absolute;
          left: 13px;
          top: 50%;
          transform: translateY(-50%);
          color: #64748b;
        }

        .hc-search input {
          padding-left: 42px;
        }

        .hc-services {
          display: grid;
          grid-template-columns: repeat(3,1fr);
          gap: 15px;
        }

        .hc-service {
          padding: 19px;
          cursor: pointer;
          transition: .2s ease;
          position: relative;
          overflow: hidden;
        }

        .hc-service:hover {
          transform: translateY(-3px);
          border-color: rgba(139,92,246,.4);
        }

        .hc-service-icon {
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          border-radius: 14px;
          background: rgba(124,58,237,.13);
          color: #c4b5fd;
          margin-bottom: 17px;
        }

        .hc-service h3 {
          margin: 0 0 8px;
          font-size: 17px;
        }

        .hc-service p {
          margin: 0;
          min-height: 42px;
          color: #64748b;
          font-size: 12px;
          line-height: 1.55;
        }

        .hc-service-bottom {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          margin-top: 18px;
        }

        .hc-price {
          font-size: 14px;
          font-weight: 900;
          color: #a78bfa;
        }

        .hc-order-small {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #e2e8f0;
          font-size: 12px;
          font-weight: 900;
        }

        .hc-alert {
          padding: 13px 15px;
          border-radius: 12px;
          margin: 14px 0;
          font-size: 13px;
          line-height: 1.5;
        }

        .hc-error {
          background: rgba(239,68,68,.1);
          border: 1px solid rgba(239,68,68,.2);
          color: #fca5a5;
        }

        .hc-success {
          background: rgba(34,197,94,.1);
          border: 1px solid rgba(34,197,94,.2);
          color: #86efac;
        }

        .hc-order {
          padding: 24px;
          scroll-margin-top: 90px;
        }

        .hc-order-header {
          display: flex;
          justify-content: space-between;
          gap: 15px;
          align-items: flex-start;
          margin-bottom: 22px;
        }

        .hc-order-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .hc-order-title h2 {
          margin: 0;
          font-size: 25px;
        }

        .hc-order-title p {
          color: #64748b;
          margin: 4px 0 0;
          font-size: 13px;
        }

        .hc-order-layout {
          display: grid;
          grid-template-columns: 1.3fr .7fr;
          gap: 20px;
        }

        .hc-order-box {
          padding: 19px;
          border-radius: 16px;
          background: rgba(2,6,23,.55);
          border: 1px solid rgba(255,255,255,.06);
        }

        .hc-total {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: 18px 0;
          padding: 16px;
          border-radius: 14px;
          background: rgba(124,58,237,.09);
          border: 1px solid rgba(124,58,237,.16);
        }

        .hc-total strong {
          font-size: 22px;
        }

        .hc-info-list {
          display: grid;
          gap: 11px;
        }

        .hc-info-row {
          display: flex;
          justify-content: space-between;
          gap: 15px;
          color: #94a3b8;
          font-size: 13px;
        }

        .hc-info-row strong {
          color: #e2e8f0;
          text-align: right;
        }

        .hc-result {
          padding: 23px;
          scroll-margin-top: 90px;
        }

        .hc-result-icon {
          width: 58px;
          height: 58px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: rgba(34,197,94,.12);
          color: #4ade80;
          margin-bottom: 15px;
        }

        .hc-order-id {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 14px;
          padding: 12px;
          border-radius: 11px;
          background: #050914;
          border: 1px solid rgba(255,255,255,.06);
          font-family: monospace;
          overflow: hidden;
        }

        .hc-order-id span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
        }

        .hc-footer {
          padding: 45px 0 55px;
          border-top: 1px solid rgba(255,255,255,.06);
          margin-top: 60px;
        }

        .hc-footer-inner {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: center;
        }

        .hc-muted {
          color: #64748b;
          font-size: 13px;
        }

        .hc-empty {
          padding: 40px 20px;
          text-align: center;
          color: #64748b;
        }

        .hc-spin {
          animation: hcspin 1s linear infinite;
        }

        @keyframes hcspin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 850px) {
          .hc-services {
            grid-template-columns: repeat(2,1fr);
          }

          .hc-order-layout {
            grid-template-columns: 1fr;
          }

          .hc-grid {
            grid-template-columns: 1fr 1fr;
          }

          .hc-nav-links {
            display: none;
          }

          .hc-menu-btn {
            display: inline-flex;
          }

          .hc-nav-links.mobile-open {
            display: flex;
            position: absolute;
            left: 16px;
            right: 16px;
            top: 65px;
            flex-direction: column;
            align-items: stretch;
            padding: 10px;
            background: #0b1120;
            border: 1px solid rgba(255,255,255,.08);
            border-radius: 14px;
          }
        }

        @media (max-width: 600px) {
          .hc-container {
            width: min(100% - 22px, 1180px);
          }

          .hc-hero {
            padding-top: 42px;
          }

          .hc-hero h1 {
            letter-spacing: -1.8px;
          }

          .hc-grid,
          .hc-services,
          .hc-form-grid {
            grid-template-columns: 1fr;
          }

          .hc-field.full {
            grid-column: auto;
          }

          .hc-section-head {
            align-items: stretch;
            flex-direction: column;
          }

          .hc-search {
            width: 100%;
          }

          .hc-order-header {
            flex-direction: column;
          }

          .hc-footer-inner {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>

      {/* NAVIGATION */}
      <header className="hc-nav">
        <div className="hc-container hc-nav-inner">
          <div className="hc-logo">
            <div className="hc-logo-mark">
              <Zap size={22} />
            </div>
            HUPPY CUBE
          </div>

          <div className={`hc-nav-links ${mobileMenu ? "mobile-open" : ""}`}>
            <button
              className="hc-nav-btn"
              onClick={() =>
                document
                  .getElementById("services")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              Services
            </button>

            <button
              className="hc-nav-btn"
              onClick={() =>
                document
                  .getElementById("deposit")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              Deposit
            </button>

            <button className="hc-btn hc-btn-whatsapp" onClick={openWhatsApp}>
              <MessageCircle size={16} />
              Support
            </button>
          </div>

          <button
            className="hc-menu-btn"
            onClick={() => setMobileMenu((v) => !v)}
          >
            {mobileMenu ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </header>

      <main className="hc-container">
        {/* HERO */}
        <section className="hc-hero">
          <span className="hc-badge">
            <Sparkles size={14} />
            FAST SOCIAL MEDIA SERVICES
          </span>

          <h1>
            Grow your social media
            <br />
            <span className="hc-gradient">without the hassle.</span>
          </h1>

          <p>
            Choose a service, enter your link and quantity, pay from your
            wallet, and your order is automatically sent for processing.
          </p>
        </section>

        {/* WALLET STATS */}
        <section className="hc-grid">
          <div className="hc-stat">
            <div className="hc-stat-label">Wallet Balance</div>
            <div className="hc-stat-value">
              {loadingWallet ? (
                <Loader2 className="hc-spin" size={23} />
              ) : (
                money(wallet)
              )}
            </div>
          </div>

          <div className="hc-stat">
            <div className="hc-stat-label">Available Services</div>
            <div className="hc-stat-value">{services.length}</div>
          </div>

          <div className="hc-stat">
            <div className="hc-stat-label">Support</div>
            <div className="hc-stat-value">24/7</div>
          </div>
        </section>

        {/* ALERTS */}
        {error && (
          <div className="hc-alert hc-error">
            {error}
          </div>
        )}

        {message && (
          <div className="hc-alert hc-success">
            {message}
          </div>
        )}

        {/* DEPOSIT */}
        <section id="deposit" className="hc-section">
          <div className="hc-section-head">
            <div>
              <h2>Add money to wallet</h2>
              <p>Deposit through the secure PesaPal checkout.</p>
            </div>
          </div>

          <div className="hc-card hc-deposit">
            <form onSubmit={handleDeposit}>
              <div className="hc-form-grid">
                <div className="hc-field">
                  <label>
                    <Phone size={13} style={{ verticalAlign: "middle" }} />{" "}
                    Phone Number
                  </label>

                  <input
                    className="hc-input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="07XXXXXXXX"
                    inputMode="tel"
                  />
                </div>

                <div className="hc-field">
                  <label>Email</label>

                  <input
                    className="hc-input"
                    value={depositEmail}
                    onChange={(e) => setDepositEmail(e.target.value)}
                    placeholder="you@example.com"
                    type="email"
                  />
                </div>

                <div className="hc-field">
                  <label>Deposit Amount (KSh)</label>

                  <input
                    className="hc-input"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="100"
                    type="number"
                    min="1"
                    step="1"
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "end"
                  }}
                >
                  <button
                    className="hc-btn hc-btn-primary"
                    type="submit"
                    disabled={depositLoading}
                    style={{ width: "100%" }}
                  >
                    {depositLoading ? (
                      <>
                        <Loader2 className="hc-spin" size={18} />
                        Starting payment...
                      </>
                    ) : (
                      <>
                        <CreditCard size={18} />
                        Deposit with PesaPal
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </section>

        {/* SERVICES */}
        <section id="services" className="hc-section">
          <div className="hc-section-head">
            <div>
              <h2>Our Services</h2>
              <p>Tap any service to order directly.</p>
            </div>

            <div className="hc-search">
              <Search size={18} />

              <input
                className="hc-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search services..."
              />
            </div>
          </div>

          {loadingServices ? (
            <div className="hc-card hc-empty">
              <Loader2 className="hc-spin" size={28} />
              <p>Loading live services...</p>
            </div>
          ) : filteredServices.length === 0 ? (
            <div className="hc-card hc-empty">
              <Package size={32} />
              <p>No services found.</p>

              <button
                className="hc-btn hc-btn-secondary"
                onClick={loadServices}
              >
                <RefreshCw size={16} />
                Refresh Services
              </button>
            </div>
          ) : (
            <div className="hc-services">
              {filteredServices.map((service) => (
                <div
                  className="hc-card hc-service"
                  key={service.id}
                  onClick={() => openService(service)}
                >
                  <div className="hc-service-icon">
                    {serviceIcon(service.name)}
                  </div>

                  <h3>{service.name}</h3>

                  <p>
                    {service.category ||
                      `${service.type || "Social media"} service`}
                  </p>

                  <div className="hc-service-bottom">
                    <span className="hc-price">
                      {money(service.rate)} / 1,000
                    </span>

                    <span className="hc-order-small">
                      Order
                      <ChevronRight size={15} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* SERVICE ORDER PANEL */}
        {selectedService && (
          <section id="order-panel" className="hc-section">
            <div className="hc-card hc-order">
              <div className="hc-order-header">
                <div className="hc-order-title">
                  <div className="hc-service-icon" style={{ margin: 0 }}>
                    {serviceIcon(selectedService.name)}
                  </div>

                  <div>
                    <h2>{selectedService.name}</h2>
                    <p>Complete your order below.</p>
                  </div>
                </div>

                <button
                  className="hc-btn hc-btn-secondary"
                  onClick={closeService}
                  type="button"
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
              </div>

              <div className="hc-order-layout">
                <form onSubmit={placeOrder}>
                  <div className="hc-order-box">
                    <div className="hc-field">
                      <label>Social Media Link</label>

                      <input
                        className="hc-input"
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        placeholder="https://instagram.com/username"
                        type="url"
                      />
                    </div>

                    <div
                      className="hc-field"
                      style={{ marginTop: 16 }}
                    >
                      <label>Quantity</label>

                      <input
                        className="hc-input"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        type="number"
                        min={selectedService.min}
                        max={selectedService.max}
                        step="1"
                      />

                      <span className="hc-muted">
                        Minimum:{" "}
                        {selectedService.min.toLocaleString()}{" "}
                        • Maximum:{" "}
                        {selectedService.max.toLocaleString()}
                      </span>
                    </div>

                    <div className="hc-total">
                      <div>
                        <div className="hc-muted">Total price</div>
                        <strong>{money(calculatedTotal)}</strong>
                      </div>

                      <ShoppingCart size={27} />
                    </div>

                    <button
                      className="hc-btn hc-btn-primary"
                      type="submit"
                      disabled={orderLoading}
                      style={{ width: "100%" }}
                    >
                      {orderLoading ? (
                        <>
                          <Loader2 className="hc-spin" size={18} />
                          Placing order...
                        </>
                      ) : (
                        <>
                          <ShoppingCart size={18} />
                          PLACE ORDER
                        </>
                      )}
                    </button>
                  </div>
                </form>

                <div className="hc-order-box">
                  <h3 style={{ marginTop: 0 }}>Order information</h3>

                  <div className="hc-info-list">
                    <div className="hc-info-row">
                      <span>Price</span>
                      <strong>
                        {money(selectedService.rate)} / 1,000
                      </strong>
                    </div>

                    <div className="hc-info-row">
                      <span>Wallet</span>
                      <strong>{money(wallet)}</strong>
                    </div>

                    <div className="hc-info-row">
                      <span>Refill</span>
                      <strong>
                        {selectedService.refill ? "Available" : "No"}
                      </strong>
                    </div>

                    <div className="hc-info-row">
                      <span>Cancel</span>
                      <strong>
                        {selectedService.cancel ? "Available" : "No"}
                      </strong>
                    </div>
                  </div>

                  <div
                    className="hc-alert"
                    style={{
                      marginTop: 18,
                      background: "rgba(6,182,212,.08)",
                      border: "1px solid rgba(6,182,212,.15)",
                      color: "#a5f3fc"
                    }}
                  >
                    Your wallet must have enough funds before the order can
                    be submitted.
                  </div>

                  <button
                    type="button"
                    className="hc-btn hc-btn-whatsapp"
                    onClick={openWhatsApp}
                    style={{ width: "100%", marginTop: 5 }}
                  >
                    <MessageCircle size={18} />
                    Need Help?
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ORDER RESULT */}
        {lastOrder && (
          <section id="order-result" className="hc-section">
            <div className="hc-card hc-result">
              <div className="hc-result-icon">
                <CheckCircle2 size={30} />
              </div>

              <h2 style={{ margin: 0 }}>Order submitted</h2>

              <p className="hc-muted">
                Your order has been submitted successfully.
              </p>

              <div className="hc-info-list" style={{ marginTop: 20 }}>
                <div className="hc-info-row">
                  <span>Service</span>
                  <strong>{lastOrder.serviceName}</strong>
                </div>

                <div className="hc-info-row">
                  <span>Quantity</span>
                  <strong>
                    {Number(lastOrder.quantity).toLocaleString()}
                  </strong>
                </div>

                <div className="hc-info-row">
                  <span>Amount</span>
                  <strong>{money(lastOrder.amount)}</strong>
                </div>

                <div className="hc-info-row">
                  <span>Status</span>
                  <strong>{lastOrder.status || "Pending"}</strong>
                </div>

                {lastOrder.remains !== undefined &&
                  lastOrder.remains !== null && (
                    <div className="hc-info-row">
                      <span>Remaining</span>
                      <strong>
                        {Number(lastOrder.remains).toLocaleString()}
                      </strong>
                    </div>
                  )}
              </div>

              {(lastOrder.supplierOrderId || lastOrder.id) && (
                <div className="hc-order-id">
                  <span>
                    Supplier Order ID:{" "}
                    {lastOrder.supplierOrderId || lastOrder.id}
                  </span>

                  <button
                    type="button"
                    className="hc-btn hc-btn-secondary"
                    style={{ padding: 8 }}
                    onClick={copyOrderId}
                    title="Copy order ID"
                  >
                    <Copy size={15} />
                  </button>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 18
                }}
              >
                <button
                  className="hc-btn hc-btn-primary"
                  onClick={checkOrderStatus}
                  disabled={statusLoading}
                >
                  {statusLoading ? (
                    <Loader2 className="hc-spin" size={17} />
                  ) : (
                    <RefreshCw size={17} />
                  )}
                  Check Status
                </button>

                <button
                  className="hc-btn hc-btn-secondary"
                  onClick={() => {
                    setLastOrder(null);
                    document
                      .getElementById("services")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  <ShoppingCart size={17} />
                  Order Another
                </button>

                <button
                  className="hc-btn hc-btn-whatsapp"
                  onClick={openWhatsApp}
                >
                  <MessageCircle size={17} />
                  WhatsApp Support
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* FOOTER */}
      <footer className="hc-footer">
        <div className="hc-container hc-footer-inner">
          <div>
            <div className="hc-logo">
              <div className="hc-logo-mark">
                <Zap size={19} />
              </div>
              HUPPY CUBE
            </div>

            <div className="hc-muted" style={{ marginTop: 9 }}>
              Social Media Marketing Panel
            </div>
          </div>

          <button
            className="hc-btn hc-btn-whatsapp"
            onClick={openWhatsApp}
          >
            <MessageCircle size={18} />
            WhatsApp Support
          </button>
        </div>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
