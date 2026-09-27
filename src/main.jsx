import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Instagram,
  Loader2,
  Menu,
  MessageCircle,
  Music2,
  Package,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  Sparkles,
  Wallet,
  X,
  Zap
} from "lucide-react";
import { createRoot } from "react-dom/client";

const SUPPORT_NUMBER = "254796681162";

const PLATFORM_CONFIG = {
  Facebook: {
    icon: "🔵",
    color: "#1877F2",
    keywords: ["facebook", "fb ", "fb likes", "fb followers", "fb comments"]
  },
  Instagram: {
    icon: "📸",
    color: "#E1306C",
    keywords: ["instagram", "ig ", "ig likes", "ig followers", "ig comments"]
  },
  TikTok: {
    icon: "🎵",
    color: "#111111",
    keywords: ["tiktok", "tik tok", "tt followers", "tt likes", "tt views"]
  },
  YouTube: {
    icon: "▶️",
    color: "#FF0000",
    keywords: ["youtube", "yt ", "yt views", "yt subscribers", "yt likes"]
  },
  Telegram: {
    icon: "✈️",
    color: "#229ED9",
    keywords: ["telegram", "tg ", "telegram members", "telegram views"]
  },
  "X / Twitter": {
    icon: "𝕏",
    color: "#111111",
    keywords: ["twitter", "x followers", "x likes", "x retweets"]
  },
  WhatsApp: {
    icon: "💬",
    color: "#25D366",
    keywords: ["whatsapp", "wa followers", "wa channel"]
  },
  Spotify: {
    icon: "🎧",
    color: "#1DB954",
    keywords: ["spotify", "spotify plays", "spotify followers"]
  },
  Other: {
    icon: "✨",
    color: "#7c3aed",
    keywords: []
  }
};

function getSavedPhone() {
  try {
    return window.localStorage.getItem("huppy_phone") || "";
  } catch {
    return "";
  }
}

function savePhone(value) {
  try {
    window.localStorage.setItem("huppy_phone", value);
  } catch {
    // Ignore storage errors.
  }
}

function detectPlatform(service) {
  const text = `${service?.name || ""} ${service?.category || ""} ${
    service?.type || ""
  }`.toLowerCase();

  const platforms = [
    "Facebook",
    "Instagram",
    "TikTok",
    "YouTube",
    "Telegram",
    "X / Twitter",
    "WhatsApp",
    "Spotify"
  ];

  for (const platform of platforms) {
    const keywords = PLATFORM_CONFIG[platform]?.keywords || [];

    if (
      keywords.some((keyword) =>
        text.includes(String(keyword).toLowerCase())
      )
    ) {
      return platform;
    }
  }

  return "Other";
}

function formatMoney(value) {
  const number = Number(value || 0);

  return `KSh ${number.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function normalizeService(service, index = 0) {
  const supplierRate = Number(
    service?.supplier_rate ?? service?.rate ?? 0
  );

  const customerRate = Number(
    service?.customer_rate ?? supplierRate * 2
  );

  const serviceId = Number(
    service?.service_id ?? service?.service ?? index + 1
  );

  const minQuantity = Number(
    service?.min_quantity ?? service?.min ?? 1
  );

  const maxQuantity = Number(
    service?.max_quantity ?? service?.max ?? 1000000
  );

  return {
    service: serviceId,
    service_id: serviceId,
    name: String(service?.name || "Unnamed Service"),
    type: String(service?.type || ""),
    category: String(service?.category || ""),
    rate: supplierRate,
    supplier_rate: supplierRate,
    customer_rate: customerRate,
    min: minQuantity,
    max: maxQuantity,
    min_quantity: minQuantity,
    max_quantity: maxQuantity,
    refill:
      service?.refill === true ||
      service?.refill === 1 ||
      service?.refill === "1",
    cancel:
      service?.cancel === true ||
      service?.cancel === 1 ||
      service?.cancel === "1"
  };
}

function calculatePrice(service, quantity) {
  if (!service) return 0;

  const rate = Number(service.customer_rate || 0);
  const qty = Number(quantity || 0);

  if (!rate || !qty) return 0;

  return (rate * qty) / 1000;
}

async function readJson(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      "The server returned an invalid response. Please try again."
    );
  }
}

function App() {
  const [services, setServices] = useState([]);

  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [selectedService, setSelectedService] = useState(null);

  const [loadingServices, setLoadingServices] = useState(true);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [wallet, setWallet] = useState(0);

  const [phone, setPhone] = useState(getSavedPhone());

  const [depositAmount, setDepositAmount] = useState("");

  const [search, setSearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");

  const [link, setLink] = useState("");
  const [quantity, setQuantity] = useState("");

  const [orderId, setOrderId] = useState("");
  const [orderStatus, setOrderStatus] = useState(null);

  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    loadServices();
  }, []);

  useEffect(() => {
    const cleaned = phone.trim();

    if (cleaned) {
      savePhone(cleaned);
      loadWallet(cleaned);
    }
  }, [phone]);

  async function loadServices() {
    setLoadingServices(true);
    setError("");

    try {
      const response = await fetch("/api/services", {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          data?.error || "Unable to load services."
        );
      }

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.services)
        ? data.services
        : [];

      setServices(
        list.map((service, index) =>
          normalizeService(service, index)
        )
      );
    } catch (firstError) {
      try {
        const response = await fetch(
          "/api/denzgains/services",
          {
            method: "GET",
            headers: {
              Accept: "application/json"
            }
          }
        );

        const data = await readJson(response);

        if (!response.ok) {
          throw new Error(
            data?.error || "Unable to load services."
          );
        }

        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.services)
          ? data.services
          : [];

        setServices(
          list.map((service, index) =>
            normalizeService(service, index)
          )
        );
      } catch (secondError) {
        setServices([]);
        setError(
          secondError?.message ||
            firstError?.message ||
            "Unable to load services."
        );
      }
    } finally {
      setLoadingServices(false);
    }
  }

  async function loadWallet(userPhone = phone) {
    const cleanedPhone = String(userPhone || "").trim();

    if (!cleanedPhone) {
      return;
    }

    setLoadingWallet(true);

    try {
      const response = await fetch(
        `/api/wallet?phone=${encodeURIComponent(cleanedPhone)}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json"
          }
        }
      );

      const data = await readJson(response);

      if (response.ok) {
        setWallet(Number(data?.balance || 0));
      }
    } catch {
      // Keep existing wallet balance.
    } finally {
      setLoadingWallet(false);
    }
  }

  async function deposit() {
    setError("");
    setSuccess("");

    const cleanedPhone = phone.trim();
    const amount = Number(depositAmount);

    if (!cleanedPhone) {
      setError("Enter your phone number first.");
      return;
    }

    if (!amount || amount < 1) {
      setError("Enter a valid deposit amount.");
      return;
    }

    try {
      const response = await fetch("/api/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          phone: cleanedPhone,
          amount,
          email: `${cleanedPhone.replace(/\D/g, "")}@huppycube.com`
        })
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          data?.error || "Could not start payment."
        );
      }

      if (data?.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }

      throw new Error(
        "PesaPal did not return a payment link."
      );
    } catch (err) {
      setError(
        err?.message || "Unable to start payment."
      );
    }
  }

  const platformGroups = useMemo(() => {
    const groups = {};

    Object.keys(PLATFORM_CONFIG).forEach((platform) => {
      groups[platform] = [];
    });

    services.forEach((service) => {
      const platform = detectPlatform(service);

      if (!groups[platform]) {
        groups[platform] = [];
      }

      groups[platform].push(service);
    });

    return groups;
  }, [services]);

  const visiblePlatforms = useMemo(() => {
    const query = search.trim().toLowerCase();

    const allPlatforms = Object.keys(PLATFORM_CONFIG);

    if (!query) {
      return allPlatforms.filter(
        (platform) =>
          (platformGroups[platform] || []).length > 0
      );
    }

    return allPlatforms.filter((platform) => {
      const platformMatches = platform
        .toLowerCase()
        .includes(query);

      const serviceMatches = (
        platformGroups[platform] || []
      ).some((service) => {
        return (
          service.name.toLowerCase().includes(query) ||
          service.category.toLowerCase().includes(query) ||
          service.type.toLowerCase().includes(query)
        );
      });

      return platformMatches || serviceMatches;
    });
  }, [search, platformGroups]);

  const selectedPlatformServices = useMemo(() => {
    if (!selectedPlatform) {
      return [];
    }

    let list =
      platformGroups[selectedPlatform] || [];

    const query = serviceSearch.trim().toLowerCase();

    if (query) {
      list = list.filter((service) => {
        return (
          service.name.toLowerCase().includes(query) ||
          service.category.toLowerCase().includes(query) ||
          service.type.toLowerCase().includes(query)
        );
      });
    }

    return list;
  }, [
    selectedPlatform,
    platformGroups,
    serviceSearch
  ]);

  const estimatedPrice = useMemo(() => {
    return calculatePrice(
      selectedService,
      quantity
    );
  }, [selectedService, quantity]);

  function clearMessages() {
    setError("");
    setSuccess("");
  }

  function openPlatform(platform) {
    clearMessages();

    setSearch("");
    setServiceSearch("");
    setSelectedPlatform(platform);
    setSelectedService(null);
    setOrderStatus(null);

    window.setTimeout(() => {
      document
        .getElementById("services")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
    }, 50);
  }

  function openService(service) {
    clearMessages();

    setSelectedService(service);
    setLink("");
    setQuantity(
      String(
        service.min_quantity ||
          service.min ||
          1
      )
    );
    setOrderStatus(null);
  }

  function goBackToPlatforms() {
    clearMessages();

    setSelectedPlatform(null);
    setSelectedService(null);
    setServiceSearch("");
    setLink("");
    setQuantity("");
    setOrderStatus(null);
  }

  function goBackToServices() {
    clearMessages();

    setSelectedService(null);
    setLink("");
    setQuantity("");
    setOrderStatus(null);
  }

  async function placeOrder() {
    clearMessages();

    const cleanedPhone = phone.trim();

    if (!cleanedPhone) {
      setError("Enter your phone number first.");
      return;
    }

    if (!selectedService) {
      setError("Please select a service.");
      return;
    }

    if (!link.trim()) {
      setError("Enter the social media link.");
      return;
    }

    const qty = Number(quantity);

    if (!Number.isFinite(qty)) {
      setError("Enter a valid quantity.");
      return;
    }

    if (
      qty <
      Number(selectedService.min_quantity)
    ) {
      setError(
        `Minimum quantity is ${Number(
          selectedService.min_quantity
        ).toLocaleString()}`
      );
      return;
    }

    if (
      qty >
      Number(selectedService.max_quantity)
    ) {
      setError(
        `Maximum quantity is ${Number(
          selectedService.max_quantity
        ).toLocaleString()}`
      );
      return;
    }

    if (estimatedPrice <= 0) {
      setError("Unable to calculate the order price.");
      return;
    }

    if (estimatedPrice > wallet) {
      setError(
        `Insufficient wallet balance. You need ${formatMoney(
          estimatedPrice
        )}.`
      );
      return;
    }

    setPlacingOrder(true);

    try {
      const response = await fetch(
        "/api/smm/order",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({
            phone: cleanedPhone,
            service_id:
              selectedService.service_id,
            service_name:
              selectedService.name,
            link: link.trim(),
            quantity: qty
          })
        }
      );

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Order could not be placed."
        );
      }

      const createdOrderId =
        data?.order_id ??
        data?.id ??
        data?.order ??
        data?.smm_order_id;

      if (createdOrderId !== undefined) {
        setOrderId(String(createdOrderId));
      }

      setSuccess(
        `Order placed successfully${
          createdOrderId
            ? ` (#${createdOrderId})`
            : ""
        }.`
      );

      await loadWallet(cleanedPhone);
    } catch (err) {
      setError(
        err?.message || "Order failed."
      );
    } finally {
      setPlacingOrder(false);
    }
  }

  async function checkOrderStatus() {
    clearMessages();

    const cleanedOrderId =
      orderId.trim();

    if (!cleanedOrderId) {
      setError("Enter an order ID.");
      return;
    }

    setCheckingStatus(true);

    try {
      const response = await fetch(
        `/api/smm/status?order_id=${encodeURIComponent(
          cleanedOrderId
        )}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json"
          }
        }
      );

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Could not check order."
        );
      }

      setOrderStatus(data);
    } catch (err) {
      setError(
        err?.message ||
          "Could not check order status."
      );
    } finally {
      setCheckingStatus(false);
    }
  }

  function openWhatsApp() {
    const message = encodeURIComponent(
      "Hello HUPPY CUBE support, I need help with my order."
    );

    window.open(
      `https://wa.me/${SUPPORT_NUMBER}?text=${message}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function scrollToServices() {
    document
      .getElementById("services")
      ?.scrollIntoView({
        behavior: "smooth"
      });
  }

  function scrollToWallet() {
    document
      .getElementById("wallet")
      ?.scrollIntoView({
        behavior: "smooth"
      });
  }

  function getPlatformIcon(platform) {
    if (platform === "Instagram") {
      return <Instagram size={30} />;
    }

    if (platform === "TikTok") {
      return <Music2 size={30} />;
    }

    if (platform === "Facebook") {
      return (
        <span className="platform-emoji">
          🔵
        </span>
      );
    }

    if (platform === "YouTube") {
      return (
        <span className="platform-emoji">
          ▶️
        </span>
      );
    }

    if (platform === "Telegram") {
      return (
        <span className="platform-emoji">
          ✈️
        </span>
      );
    }

    if (platform === "X / Twitter") {
      return (
        <span className="platform-x">
          𝕏
        </span>
      );
    }

    if (platform === "WhatsApp") {
      return (
        <span className="platform-emoji">
          💬
        </span>
      );
    }

    if (platform === "Spotify") {
      return (
        <span className="platform-emoji">
          🎧
        </span>
      );
    }

    return <Sparkles size={30} />;
  }

  return (
    <div className="app">
      <style>{`
        * {
          box-sizing: border-box;
        }

        html {
          scroll-behavior: smooth;
        }

        body {
          margin: 0;
          font-family: Inter, Arial, Helvetica, sans-serif;
          background: #f5f7fb;
          color: #111827;
        }

        button,
        input {
          font: inherit;
        }

        button {
          cursor: pointer;
        }

        .app {
          min-height: 100vh;
          background:
            radial-gradient(
              circle at top right,
              rgba(124,58,237,.10),
              transparent 30%
            ),
            #f5f7fb;
        }

        .header {
          position: sticky;
          top: 0;
          z-index: 50;
          background: rgba(255,255,255,.96);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid #e5e7eb;
        }

        .header-inner {
          max-width: 1180px;
          margin: auto;
          min-height: 70px;
          padding: 12px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 900;
          font-size: 20px;
          letter-spacing: -.5px;
        }

        .brand-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          color: white;
          background: linear-gradient(
            135deg,
            #7c3aed,
            #2563eb
          );
          box-shadow:
            0 8px 20px rgba(79,70,229,.25);
        }

        .nav {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .nav-btn {
          border: 0;
          background: transparent;
          padding: 10px 14px;
          border-radius: 10px;
          font-weight: 700;
          color: #4b5563;
        }

        .nav-btn:hover {
          background: #f3f4f6;
        }

        .wallet-mini {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 13px;
          border-radius: 12px;
          background: #f3f4f6;
          font-weight: 800;
          white-space: nowrap;
        }

        .menu-btn {
          display: none;
          border: 0;
          background: transparent;
          color: #111827;
          padding: 8px;
        }

        .container {
          max-width: 1180px;
          margin: auto;
          padding: 28px 20px 70px;
        }

        .hero {
          border-radius: 24px;
          padding: 34px;
          color: white;
          background:
            radial-gradient(
              circle at 85% 15%,
              rgba(255,255,255,.20),
              transparent 25%
            ),
            linear-gradient(
              135deg,
              #111827,
              #312e81 55%,
              #7c3aed
            );
          box-shadow:
            0 20px 50px rgba(31,41,55,.18);
          margin-bottom: 22px;
        }

        .hero h1 {
          margin: 0 0 10px;
          font-size: clamp(30px,5vw,48px);
          letter-spacing: -1.5px;
        }

        .hero p {
          margin: 0;
          color: #e5e7eb;
          max-width: 650px;
          line-height: 1.6;
        }

        .hero-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 22px;
        }

        .primary-btn,
        .whatsapp-btn {
          border: 0;
          border-radius: 12px;
          padding: 12px 17px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-weight: 800;
        }

        .primary-btn {
          background: white;
          color: #312e81;
        }

        .whatsapp-btn {
          background: #25d366;
          color: white;
        }

        .stats {
          display: grid;
          grid-template-columns: repeat(3,1fr);
          gap: 14px;
          margin-bottom: 24px;
        }

        .stat {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 18px;
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .stat-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          background: #f3f4f6;
          color: #4f46e5;
          flex-shrink: 0;
        }

        .stat strong {
          display: block;
          font-size: 20px;
        }

        .stat span {
          color: #6b7280;
          font-size: 13px;
        }

        .section {
          margin-top: 25px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 15px;
          margin-bottom: 14px;
        }

        .section-title {
          margin: 0;
          font-size: 23px;
          font-weight: 900;
        }

        .section-subtitle {
          margin: 4px 0 0;
          color: #6b7280;
          font-size: 14px;
          line-height: 1.5;
        }

        .search-box {
          position: relative;
          max-width: 420px;
          width: 100%;
        }

        .search-box svg {
          position: absolute;
          left: 13px;
          top: 50%;
          transform: translateY(-50%);
          color: #9ca3af;
          pointer-events: none;
        }

        .search-box input {
          width: 100%;
          border: 1px solid #d1d5db;
          background: white;
          border-radius: 13px;
          padding: 13px 14px 13px 42px;
          outline: none;
        }

        .search-box input:focus,
        .input:focus {
          border-color: #6366f1;
          box-shadow:
            0 0 0 3px rgba(99,102,241,.10);
        }

        .platform-grid {
          display: grid;
          grid-template-columns: repeat(4,1fr);
          gap: 15px;
        }

        .platform-card {
          border: 1px solid #e5e7eb;
          background: white;
          border-radius: 20px;
          padding: 20px;
          text-align: left;
          transition: .18s ease;
          position: relative;
          overflow: hidden;
        }

        .platform-card:hover {
          transform: translateY(-3px);
          box-shadow:
            0 14px 30px rgba(17,24,39,.10);
          border-color: #c7d2fe;
        }

        .platform-icon {
          width: 58px;
          height: 58px;
          border-radius: 17px;
          display: grid;
          place-items: center;
          background: #f3f4f6;
          margin-bottom: 17px;
        }

        .platform-emoji {
          font-size: 28px;
          line-height: 1;
        }

        .platform-x {
          font-size: 31px;
          font-weight: 900;
          line-height: 1;
        }

        .platform-card h3 {
          margin: 0 0 5px;
          font-size: 17px;
        }

        .platform-card p {
          margin: 0;
          color: #6b7280;
          font-size: 13px;
        }

        .platform-arrow {
          position: absolute;
          right: 16px;
          bottom: 18px;
          color: #9ca3af;
        }

        .services-grid {
          display: grid;
          grid-template-columns: repeat(3,1fr);
          gap: 14px;
        }

        .service-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 17px;
          padding: 17px;
          transition: .18s ease;
        }

        .service-card:hover {
          border-color: #c7d2fe;
          box-shadow:
            0 12px 25px rgba(17,24,39,.07);
        }

        .service-name {
          font-weight: 850;
          line-height: 1.35;
          margin-bottom: 7px;
        }

        .service-category {
          color: #6b7280;
          font-size: 12px;
          line-height: 1.45;
          min-height: 35px;
        }

        .service-meta {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          margin: 14px 0;
          font-size: 12px;
          color: #6b7280;
        }

        .service-rate {
          font-weight: 900;
          color: #111827;
        }

        .select-btn {
          width: 100%;
          border: 0;
          border-radius: 11px;
          padding: 11px;
          background: #111827;
          color: white;
          font-weight: 800;
        }

        .select-btn:hover {
          background: #312e81;
        }

        .panel {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 20px;
          padding: 22px;
          margin-bottom: 22px;
        }

        .back-btn {
          border: 0;
          background: #f3f4f6;
          border-radius: 10px;
          padding: 9px 13px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-weight: 750;
          margin-bottom: 18px;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(2,1fr);
          gap: 14px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .form-group.full {
          grid-column: 1/-1;
        }

        .label {
          font-size: 13px;
          font-weight: 800;
        }

        .input {
          width: 100%;
          padding: 13px;
          border: 1px solid #d1d5db;
          border-radius: 11px;
          outline: none;
          background: white;
        }

        .price-box {
          background: #f5f3ff;
          border: 1px solid #ddd6fe;
          border-radius: 14px;
          padding: 15px;
        }

        .price-box span {
          color: #6b7280;
          font-size: 12px;
        }

        .price-box strong {
          display: block;
          color: #4c1d95;
          font-size: 23px;
          margin-top: 3px;
        }

        .order-btn {
          width: 100%;
          border: 0;
          border-radius: 12px;
          padding: 14px;
          background:
            linear-gradient(
              135deg,
              #4f46e5,
              #7c3aed
            );
          color: white;
          font-weight: 900;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
        }

        .order-btn:disabled,
        .deposit-btn:disabled {
          opacity: .65;
          cursor: not-allowed;
        }

        .notice {
          padding: 13px 15px;
          border-radius: 12px;
          margin-bottom: 15px;
          font-size: 14px;
          font-weight: 650;
        }

        .error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #991b1b;
        }

        .success {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #166534;
        }

        .deposit-grid {
          display: grid;
          grid-template-columns: 1fr 1fr auto;
          gap: 10px;
          align-items: end;
        }

        .deposit-btn {
          min-height: 47px;
          border: 0;
          border-radius: 11px;
          background: #111827;
          color: white;
          padding: 0 18px;
          font-weight: 850;
        }

        .status-box {
          margin-top: 15px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 15px;
        }

        .status-row {
          display: flex;
          justify-content: space-between;
          padding: 7px 0;
          gap: 15px;
          border-bottom: 1px solid #e5e7eb;
        }

        .status-row:last-child {
          border-bottom: 0;
        }

        .status-row span:first-child {
          color: #6b7280;
        }

        .status-row strong {
          text-align: right;
          word-break: break-word;
        }

        .empty {
          padding: 40px 20px;
          text-align: center;
          color: #6b7280;
          background: white;
          border: 1px dashed #d1d5db;
          border-radius: 18px;
        }

        .loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 45px;
          color: #6b7280;
          background: white;
          border-radius: 18px;
          border: 1px solid #e5e7eb;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        .floating-support {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 40;
          border: 0;
          border-radius: 999px;
          padding: 13px 18px;
          background: #25d366;
          color: white;
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 850;
          box-shadow:
            0 12px 30px rgba(37,211,102,.30);
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 900px) {
          .platform-grid {
            grid-template-columns: repeat(3,1fr);
          }

          .services-grid {
            grid-template-columns: repeat(2,1fr);
          }
        }

        @media (max-width: 700px) {
          .header-inner {
            padding: 10px 14px;
          }

          .nav {
            display: none;
          }

          .menu-btn {
            display: block;
          }

          .stats {
            grid-template-columns: 1fr;
          }

          .hero {
            padding: 25px;
          }

          .platform-grid {
            grid-template-columns: repeat(2,1fr);
          }

          .services-grid {
            grid-template-columns: 1fr;
          }

          .form-grid,
          .deposit-grid {
            grid-template-columns: 1fr;
          }

          .form-group.full {
            grid-column: auto;
          }

          .section-header {
            flex-direction: column;
            align-items: stretch;
          }

          .search-box {
            max-width: none;
          }

          .floating-support {
            right: 12px;
            bottom: 12px;
          }
        }

        @media (max-width: 390px) {
          .container {
            padding-left: 12px;
            padding-right: 12px;
          }

          .platform-grid {
            gap: 9px;
          }

          .platform-card {
            padding: 14px;
          }

          .platform-icon {
            width: 48px;
            height: 48px;
          }

          .platform-card h3 {
            font-size: 14px;
          }

          .platform-card p {
            font-size: 12px;
          }
        }
      `}</style>

      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-icon">
              <Zap size={21} />
            </div>
            HUPPY CUBE
          </div>

          <div className="nav">
            <button
              className="nav-btn"
              onClick={() => {
                setSelectedPlatform(null);
                setSelectedService(null);
                scrollToServices();
              }}
            >
              Services
            </button>

            <button
              className="nav-btn"
              onClick={scrollToWallet}
            >
              Wallet
            </button>

            <div className="wallet-mini">
              <Wallet size={17} />
              {loadingWallet
                ? "..."
                : formatMoney(wallet)}
            </div>
          </div>

          <button
            className="menu-btn"
            aria-label="Menu"
            onClick={() =>
              setMobileMenu((value) => !value)
            }
          >
            {mobileMenu ? <X /> : <Menu />}
          </button>
        </div>

        {mobileMenu && (
          <div
            style={{
              padding: "10px 15px 15px",
              borderTop:
                "1px solid #e5e7eb",
              background: "white"
            }}
          >
            <button
              className="nav-btn"
              onClick={() => {
                setMobileMenu(false);
                setSelectedPlatform(null);
                setSelectedService(null);
                scrollToServices();
              }}
            >
              Services
            </button>

            <button
              className="nav-btn"
              onClick={() => {
                setMobileMenu(false);
                scrollToWallet();
              }}
            >
              Wallet
            </button>
          </div>
        )}
      </header>

      <main className="container">
        <section className="hero">
          <h1>Grow Your Social Media</h1>

          <p>
            Choose your social media platform,
            select the service you need, enter
            your link and place your order
            quickly.
          </p>

          <div className="hero-actions">
            <button
              className="primary-btn"
              onClick={scrollToServices}
            >
              <ShoppingCart size={18} />
              Browse Services
            </button>

            <button
              className="whatsapp-btn"
              onClick={openWhatsApp}
            >
              <MessageCircle size={18} />
              WhatsApp Support
            </button>
          </div>
        </section>

        <section className="stats">
          <div className="stat">
            <div className="stat-icon">
              <Package size={21} />
            </div>

            <div>
              <strong>
                {services.length}
              </strong>
              <span>
                Available services
              </span>
            </div>
          </div>

          <div className="stat">
            <div className="stat-icon">
              <Wallet size={21} />
            </div>

            <div>
              <strong>
                {formatMoney(wallet)}
              </strong>
              <span>
                Wallet balance
              </span>
            </div>
          </div>

          <div className="stat">
            <div className="stat-icon">
              <MessageCircle size={21} />
            </div>

            <div>
              <strong>24/7</strong>
              <span>
                Customer support
              </span>
            </div>
          </div>
        </section>

        {error && (
          <div className="notice error">
            {error}
          </div>
        )}

        {success && (
          <div className="notice success">
            <CheckCircle2
              size={17}
              style={{
                verticalAlign: "middle",
                marginRight: 6
              }}
            />
            {success}
          </div>
        )}

        <section
          id="wallet"
          className="panel"
        >
          <div className="section-header">
            <div>
              <h2 className="section-title">
                Wallet
              </h2>

              <p className="section-subtitle">
                Add funds to your HUPPY CUBE
                wallet using PesaPal.
              </p>
            </div>

            <div className="wallet-mini">
              <Wallet size={17} />
              {formatMoney(wallet)}
            </div>
          </div>

          <div className="deposit-grid">
            <div className="form-group">
              <label className="label">
                Phone number
              </label>

              <input
                className="input"
                type="tel"
                inputMode="tel"
                placeholder="07XXXXXXXX"
                value={phone}
                onChange={(event) =>
                  setPhone(event.target.value)
                }
              />
            </div>

            <div className="form-group">
              <label className="label">
                Deposit amount
              </label>

              <input
                className="input"
                type="number"
                min="1"
                placeholder="e.g. 100"
                value={depositAmount}
                onChange={(event) =>
                  setDepositAmount(
                    event.target.value
                  )
                }
              />
            </div>

            <button
              className="deposit-btn"
              onClick={deposit}
            >
              <CreditCard
                size={17}
                style={{
                  verticalAlign: "middle",
                  marginRight: 5
                }}
              />
              Deposit
            </button>
          </div>
        </section>

        <section
          id="services"
          className="section"
        >
          {!selectedPlatform &&
            !selectedService && (
              <>
                <div className="section-header">
                  <div>
                    <h2 className="section-title">
                      Choose Platform
                    </h2>

                    <p className="section-subtitle">
                      Select a platform to view
                      only its available services.
                    </p>
                  </div>

                  <div className="search-box">
                    <Search size={18} />

                    <input
                      placeholder="Search platform or service..."
                      value={search}
                      onChange={(event) =>
                        setSearch(
                          event.target.value
                        )
                      }
                    />
                  </div>
                </div>

                {loadingServices ? (
                  <div className="loading">
                    <Loader2 className="spin" />
                    Loading services...
                  </div>
                ) : visiblePlatforms.length ===
                  0 ? (
                  <div className="empty">
                    No matching platforms or
                    services found.
                  </div>
                ) : (
                  <div className="platform-grid">
                    {visiblePlatforms.map(
                      (platform) => {
                        const count =
                          platformGroups[
                            platform
                          ]?.length || 0;

                        const config =
                          PLATFORM_CONFIG[
                            platform
                          ];

                        return (
                          <button
                            key={platform}
                            className="platform-card"
                            onClick={() =>
                              openPlatform(
                                platform
                              )
                            }
                          >
                            <div
                              className="platform-icon"
                              style={{
                                color:
                                  config?.color ||
                                  "#7c3aed"
                              }}
                            >
                              {getPlatformIcon(
                                platform
                              )}
                            </div>

                            <h3>
                              {platform}
                            </h3>

                            <p>
                              {count} service
                              {count === 1
                                ? ""
                                : "s"}
                            </p>

                            <ChevronRight
                              className="platform-arrow"
                              size={20}
                            />
                          </button>
                        );
                      }
                    )}
                  </div>
                )}
              </>
            )}

          {selectedPlatform &&
            !selectedService && (
              <>
                <button
                  className="back-btn"
                  onClick={
                    goBackToPlatforms
                  }
                >
                  <ArrowLeft size={17} />
                  All Platforms
                </button>

                <div className="section-header">
                  <div>
                    <h2 className="section-title">
                      {
                        PLATFORM_CONFIG[
                          selectedPlatform
                        ]?.icon
                      }{" "}
                      {selectedPlatform}
                    </h2>

                    <p className="section-subtitle">
                      Select the service you
                      want.
                    </p>
                  </div>

                  <div className="search-box">
                    <Search size={18} />

                    <input
                      placeholder={`Search ${selectedPlatform} services...`}
                      value={
                        serviceSearch
                      }
                      onChange={(event) =>
                        setServiceSearch(
                          event.target.value
                        )
                      }
                    />
                  </div>
                </div>

                {selectedPlatformServices.length ===
                0 ? (
                  <div className="empty">
                    No services found for this
                    platform.
                  </div>
                ) : (
                  <div className="services-grid">
                    {selectedPlatformServices.map(
                      (service) => (
                        <div
                          className="service-card"
                          key={`${service.service_id}-${service.name}`}
                        >
                          <div className="service-name">
                            {service.name}
                          </div>

                          <div className="service-category">
                            {service.category ||
                              "Social media service"}
                          </div>

                          <div className="service-meta">
                            <span>
                              Min:{" "}
                              {Number(
                                service.min_quantity
                              ).toLocaleString()}
                            </span>

                            <span>
                              Max:{" "}
                              {Number(
                                service.max_quantity
                              ).toLocaleString()}
                            </span>
                          </div>

                          <div className="service-meta">
                            <span className="service-rate">
                              {formatMoney(
                                service.customer_rate
                              )}{" "}
                              / 1K
                            </span>

                            <span>
                              {service.refill
                                ? "Refill"
                                : ""}
                            </span>
                          </div>

                          <button
                            className="select-btn"
                            onClick={() =>
                              openService(
                                service
                              )
                            }
                          >
                            Select Service
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}
              </>
            )}

          {selectedService && (
            <>
              <button
                className="back-btn"
                onClick={goBackToServices}
              >
                <ArrowLeft size={17} />
                {selectedPlatform} Services
              </button>

              <div className="panel">
                <div
                  style={{
                    marginBottom: 20
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      color: "#6b7280",
                      marginBottom: 6
                    }}
                  >
                    {selectedPlatform}
                  </div>

                  <h2
                    style={{
                      margin: 0,
                      fontSize: 24,
                      fontWeight: 900
                    }}
                  >
                    {selectedService.name}
                  </h2>

                  <p
                    style={{
                      color: "#6b7280",
                      fontSize: 14,
                      lineHeight: 1.5
                    }}
                  >
                    {selectedService.category ||
                      "Enter your social media link and quantity."}
                  </p>
                </div>

                <div className="form-grid">
                  <div className="form-group full">
                    <label className="label">
                      Social media link
                    </label>

                    <input
                      className="input"
                      type="url"
                      placeholder="https://..."
                      value={link}
                      onChange={(event) =>
                        setLink(
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label className="label">
                      Quantity
                    </label>

                    <input
                      className="input"
                      type="number"
                      min={
                        selectedService.min_quantity
                      }
                      max={
                        selectedService.max_quantity
                      }
                      value={quantity}
                      onChange={(event) =>
                        setQuantity(
                          event.target.value
                        )
                      }
                    />

                    <small
                      style={{
                        color: "#6b7280"
                      }}
                    >
                      Min{" "}
                      {Number(
                        selectedService.min_quantity
                      ).toLocaleString()}
                      {" • "}
                      Max{" "}
                      {Number(
                        selectedService.max_quantity
                      ).toLocaleString()}
                    </small>
                  </div>

                  <div className="price-box">
                    <span>
                      Estimated price
                    </span>

                    <strong>
                      {formatMoney(
                        estimatedPrice
                      )}
                    </strong>
                  </div>

                  <div className="form-group full">
                    <button
                      className="order-btn"
                      onClick={placeOrder}
                      disabled={
                        placingOrder
                      }
                    >
                      {placingOrder ? (
                        <>
                          <Loader2
                            className="spin"
                            size={18}
                          />
                          Placing Order...
                        </>
                      ) : (
                        <>
                          <Send size={18} />
                          Place Order
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 14,
                    padding: 13,
                    background: "#f9fafb",
                    borderRadius: 12,
                    color: "#6b7280",
                    fontSize: 13
                  }}
                >
                  Wallet balance:{" "}
                  <strong
                    style={{
                      color: "#111827"
                    }}
                  >
                    {formatMoney(wallet)}
                  </strong>
                </div>
              </div>
            </>
          )}
        </section>

        <section
          className="panel"
          style={{ marginTop: 25 }}
        >
          <div className="section-header">
            <div>
              <h2 className="section-title">
                Check Order Status
              </h2>

              <p className="section-subtitle">
                Enter your HUPPY CUBE order ID
                to check its current status.
              </p>
            </div>

            <RefreshCw
              size={20}
              color="#6b7280"
            />
          </div>

          <div className="deposit-grid">
            <div className="form-group">
              <label className="label">
                Order ID
              </label>

              <input
                className="input"
                type="text"
                placeholder="e.g. 123"
                value={orderId}
                onChange={(event) =>
                  setOrderId(
                    event.target.value
                  )
                }
              />
            </div>

            <div />

            <button
              className="deposit-btn"
              onClick={checkOrderStatus}
              disabled={checkingStatus}
            >
              {checkingStatus ? (
                <>
                  <Loader2
                    className="spin"
                    size={17}
                  />
                </>
              ) : (
                "Check Status"
              )}
            </button>
          </div>

          {orderStatus && (
            <div className="status-box">
              {Object.entries(
                orderStatus
              ).map(([key, value]) => (
                <div
                  className="status-row"
                  key={key}
                >
                  <span>{key}</span>

                  <strong>
                    {String(value)}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <button
        className="floating-support"
        onClick={openWhatsApp}
      >
        <MessageCircle size={19} />
        Support
      </button>
    </div>
  );
}

const rootElement =
  document.getElementById("root");

if (!rootElement) {
  document.body.innerHTML =
    "<div style='padding:30px;font-family:Arial'>HUPPY CUBE could not find the application root.</div>";
} else {
  createRoot(rootElement).render(
    <App />
  );
          }
