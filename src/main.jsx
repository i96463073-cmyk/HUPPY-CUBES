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
  "All", "Instagram", "TikTok", "Facebook", "YouTube",
  "Telegram", "Twitter / X", "WhatsApp", "Spotify", "Gaming", "Other"
];

function WhatsAppIcon({ size = 18 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
    </svg>
  );
}

const PLATFORM_ICONS = {
  Instagram, TikTok: Music2, Facebook, YouTube: Youtube,
  Telegram: Send, "Twitter / X": Twitter, WhatsApp: MessageCircle,
  Spotify: Headphones, Gaming: Gamepad2, Other: Globe
};

const TYPE_ORDER = [
  "Likes", "Views", "Comments", "Followers", "Saves",
  "Shares", "Live Stream", "Watch Time", "Accounts & Bundles", "Other"
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

// Which types have sub-categories
const SUB_TYPE_ORDER = {
  Likes: [
    "Post Likes",
    "Reactions",
    "Story Reactions",
    "Live Reactions",
    "Comment Likes",
    "Auto Likes",
    "Premium / Real Likes"
  ],
  Followers: [
    "Standard Followers",
    "High Quality",
    "Bot / Cheap",
    "Group Members",
    "Subscribers",
    "Premium Members"
  ],
  Views: [
    "Post Views",
    "Story Views",
    "Reel / Shorts Views",
    "Live Views",
    "Impressions / Reach"
  ],
  Comments: [
    "Random Comments",
    "Custom Comments"
  ]
};

const SUB_TYPE_META = {
  "Post Likes": { emoji: "👍" },
  Reactions: { emoji: "🔥" },
  "Story Reactions": { emoji: "📸" },
  "Live Reactions": { emoji: "📡" },
  "Comment Likes": { emoji: "💬" },
  "Auto Likes": { emoji: "🤖" },
  "Premium / Real Likes": { emoji: "💎" },
  "Standard Followers": { emoji: "👥" },
  "High Quality": { emoji: "💎" },
  "Bot / Cheap": { emoji: "💰" },
  "Group Members": { emoji: "👨‍👩‍👧" },
  Subscribers: { emoji: "🔔" },
  "Premium Members": { emoji: "👑" },
  "Post Views": { emoji: "👁️" },
  "Story Views": { emoji: "📸" },
  "Reel / Shorts Views": { emoji: "🎬" },
  "Live Views": { emoji: "📡" },
  "Impressions / Reach": { emoji: "📊" },
  "Random Comments": { emoji: "💬" },
  "Custom Comments": { emoji: "✍️" }
};

function detectPlatform(service) {
  const t = `${service?.name || ""} ${service?.category || ""} ${service?.type || ""}`.toLowerCase();

  if (t.includes("instagram") || t.includes("ig ") || t.includes(" ig")) return "Instagram";
  if (t.includes("tiktok") || t.includes("tik tok") || t.includes("tt ")) return "TikTok";
  if (t.includes("facebook") || t.includes("fb ") || t.includes("fb post") || t.includes("fb group")) return "Facebook";
  if (t.includes("youtube") || t.includes("yt ") || t.includes("yt-")) return "YouTube";
  if (t.includes("telegram") || t.includes("tg ")) return "Telegram";
  if (t.includes("twitter") || t.includes(" x ") || t.startsWith("x ") || t.includes(" x/") || t.includes("x (") || t.includes(" x.com")) return "Twitter / X";
  if (t.includes("whatsapp") || t.includes("wa chan") || t.includes("wa poll")) return "WhatsApp";
  if (t.includes("spotify")) return "Spotify";
  if (t.includes("boomplay") || t.includes("gaming") || t.includes("game ") || t.includes("twitch")) return "Gaming";
  return "Other";
}

function detectServiceType(service) {
  const name = String(service?.name || "").toLowerCase();
  const category = String(service?.category || "").toLowerCase();
  const type = String(service?.type || "").toLowerCase();
  const combined = `${name} ${category} ${type}`;

  if (
    type === "package" ||
    combined.includes("premium accounts") || combined.includes("netflix") ||
    combined.includes("chat gpt") || combined.includes("chatgpt") ||
    combined.includes("capcut") || combined.includes("prime video") ||
    combined.includes("account ") || combined.includes("vpn") ||
    combined.includes("whatsapp numbers") || combined.includes("telegram numbers") ||
    combined.includes("safaricom") || combined.includes("data bundles") ||
    combined.includes("google maps reviews") || combined.includes("verification")
  ) return "Accounts & Bundles";

  if (
    combined.includes("live stream") || combined.includes("live video") ||
    combined.includes("live views") || combined.includes("live likes") ||
    combined.includes("live reaction") || combined.includes("live pk") ||
    combined.includes("battle points")
  ) return "Live Stream";

  if (
    combined.includes("watchtime") || combined.includes("watch time") ||
    combined.includes("watch-time")
  ) return "Watch Time";

  if (
    combined.includes("like") || combined.includes("reaction") ||
    combined.includes("react") || combined.includes("heart")
  ) return "Likes";

  if (
    combined.includes("view") || combined.includes("views") ||
    combined.includes("play") || combined.includes("plays") ||
    combined.includes("impression") || combined.includes("reach") ||
    combined.includes("visits") || combined.includes("traffic") ||
    combined.includes("stream") || combined.includes("listener")
  ) return "Views";

  if (combined.includes("comment") || combined.includes("mention")) return "Comments";

  if (
    combined.includes("follower") || combined.includes("subscriber") ||
    combined.includes("member") || combined.includes("subs") ||
    combined.includes("sub ") || combined.includes("bot start")
  ) return "Followers";

  if (combined.includes("save") || combined.includes("bookmark")) return "Saves";

  if (
    combined.includes("share") || combined.includes("repost") ||
    combined.includes("retweet")
  ) return "Shares";

  return "Other";
}

function detectServiceSubType(service, type) {
  if (!type) return null;

  // Types without sub-categories
  if (
    type === "Saves" || type === "Shares" || type === "Watch Time" ||
    type === "Accounts & Bundles" || type === "Live Stream" ||
    type === "Other"
  ) return null;

  const name = String(service?.name || "").toLowerCase();
  const category = String(service?.category || "").toLowerCase();
  const combined = `${name} ${category}`;

  if (type === "Likes") {
    if (combined.includes("comment like") || combined.includes("comment likes") ||
        combined.includes("under comment") || combined.includes("comments likes")) {
      return "Comment Likes";
    }
    if (combined.includes("story") && (combined.includes("react") || combined.includes("like"))) {
      return "Story Reactions";
    }
    if (combined.includes("live") && (combined.includes("react") || combined.includes("like"))) {
      return "Live Reactions";
    }
    if (combined.includes("auto like") || combined.includes("auto likes") ||
        combined.includes("auto react")) {
      return "Auto Likes";
    }
    if (combined.includes("reaction") || combined.includes("react") ||
        combined.includes("emoji")) {
      return "Reactions";
    }
    if (
      combined.includes("real") || combined.includes("supreme") ||
      combined.includes("premium") || combined.includes("hq") ||
      combined.includes("high quality") || combined.includes("👑") ||
      combined.includes("💎") || combined.includes("old account") ||
      combined.includes("old likes")
    ) {
      return "Premium / Real Likes";
    }
    return "Post Likes";
  }

  if (type === "Followers") {
    if (combined.includes("premium member") || combined.includes("prem member")) {
      return "Premium Members";
    }
    if (combined.includes("group member") || combined.includes("group members")) {
      return "Group Members";
    }
    if (
      combined.includes("subscriber") || combined.includes("sub ") ||
      combined.includes("subs") || combined.includes("sub →") ||
      combined.includes("yt subs") || combined.includes("yt sub")
    ) {
      return "Subscribers";
    }
    if (
      combined.includes("bot") || combined.includes("boost") ||
      combined.includes("cheap") || combined.includes("budget")
    ) {
      return "Bot / Cheap";
    }
    if (
      combined.includes("supreme") || combined.includes("non drop") ||
      combined.includes("non-drop") || combined.includes("nondrop") ||
      combined.includes("hq") || combined.includes("high quality") ||
      combined.includes("stable") || combined.includes("real")
    ) {
      return "High Quality";
    }
    return "Standard Followers";
  }

  if (type === "Views") {
    if (combined.includes("story")) return "Story Views";
    if (
      combined.includes("reel") || combined.includes("short") ||
      combined.includes("shorts")
    ) return "Reel / Shorts Views";
    if (combined.includes("live")) return "Live Views";
    if (
      combined.includes("impression") || combined.includes("reach") ||
      combined.includes("visit") || combined.includes("profile visit")
    ) return "Impressions / Reach";
    return "Post Views";
  }

  if (type === "Comments") {
    if (combined.includes("custom")) return "Custom Comments";
    return "Random Comments";
  }

  return null;
}

function getCustomerRate(service) {
  return Number(service?.customer_rate ?? service?.price ?? service?.rate ?? 0);
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

const TICKER_SERVICES = [
  { platform: "Instagram", type: "Likes", emoji: "❤️", minQty: 500, maxQty: 5000 },
  { platform: "Instagram", type: "Followers", emoji: "👥", minQty: 200, maxQty: 2000 },
  { platform: "Instagram", type: "Views", emoji: "👁️", minQty: 1000, maxQty: 20000 },
  { platform: "Instagram", type: "Comments", emoji: "💬", minQty: 20, maxQty: 200 },
  { platform: "TikTok", type: "Likes", emoji: "❤️", minQty: 500, maxQty: 5000 },
  { platform: "TikTok", type: "Views", emoji: "⚡", minQty: 1000, maxQty: 50000 },
  { platform: "TikTok", type: "Followers", emoji: "👥", minQty: 200, maxQty: 2000 },
  { platform: "Facebook", type: "Page Likes", emoji: "👍", minQty: 200, maxQty: 2000 },
  { platform: "Facebook", type: "Followers", emoji: "👥", minQty: 200, maxQty: 3000 },
  { platform: "Facebook", type: "Post Reactions", emoji: "🔥", minQty: 100, maxQty: 1000 },
  { platform: "YouTube", type: "Views", emoji: "▶️", minQty: 500, maxQty: 5000 },
  { platform: "YouTube", type: "Subscribers", emoji: "🔔", minQty: 100, maxQty: 1000 },
  { platform: "YouTube", type: "Likes", emoji: "❤️", minQty: 200, maxQty: 2000 },
  { platform: "Telegram", type: "Members", emoji: "📨", minQty: 200, maxQty: 2000 },
  { platform: "Telegram", type: "Views", emoji: "👁️", minQty: 500, maxQty: 5000 },
  { platform: "Twitter / X", type: "Followers", emoji: "🐦", minQty: 200, maxQty: 2000 },
  { platform: "WhatsApp", type: "Channel Members", emoji: "💚", minQty: 100, maxQty: 1000 },
  { platform: "Spotify", type: "Plays", emoji: "🎵", minQty: 500, maxQty: 5000 },
  { platform: "Spotify", type: "Followers", emoji: "🎧", minQty: 200, maxQty: 1000 }
];

const TICKER_LOCATIONS = [
  "Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret", "Thika", "Malindi",
  "Kitale", "Garissa", "Kakamega", "Nyeri", "Meru", "Embu", "Machakos",
  "Naivasha", "Kericho", "Kisii", "Bungoma", "Busia", "Homa Bay", "Migori",
  "Siaya", "Vihiga", "Nyamira", "Bomet", "Narok", "Kajiado", "Kiambu",
  "Murang'a", "Kirinyaga", "Nyandarua", "Laikipia", "Samburu", "Isiolo",
  "Taita-Taveta", "Kilifi", "Kwale", "Lamu", "Voi", "Nanyuki", "Chuka",
  "Karatina", "Ruiru", "Juja", "Athi River", "Ngong", "Limuru", "Kikuyu",
  "Kangundo", "Wote", "Marsabit", "Wajir"
];

const TICKER_NAMES = [
  "Brian", "Kevin", "Dennis", "Collins", "Felix", "Peter", "Eric", "Victor",
  "Samuel", "Anthony", "George", "James", "Daniel", "Alex", "Martin", "Simon",
  "Elvis", "Wycliffe", "Vincent", "Duncan", "Nicholas", "Alfred", "Boniface",
  "Steve", "Fred", "Joseph", "Patrick", "Michael", "John", "David", "Faith",
  "Mercy", "Grace", "Joy", "Mary", "Esther", "Sharon", "Winnie", "Anne",
  "Diana", "Cynthia", "Purity", "Ruth", "Sarah", "Naomi", "Caroline",
  "Elizabeth", "Hannah", "Irene", "Millicent", "Nancy", "Lucy", "Christine",
  "Beatrice", "Gloria", "Jemimah", "Wanjiku", "Akinyi", "Chebet", "Mueni"
];

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function pickRandomQty(min, max) {
  const raw = min + Math.random() * (max - min);
  const step = raw >= 5000 ? 500 : raw >= 500 ? 100 : 50;
  return Math.round(raw / step) * step;
}

function buildRandomOrder() {
  const service = pickRandom(TICKER_SERVICES);
  const location = pickRandom(TICKER_LOCATIONS);
  const name = pickRandom(TICKER_NAMES);
  const qty = pickRandomQty(service.minQty, service.maxQty);
  return { emoji: service.emoji, qty, name, platform: service.platform,
    type: service.type, location };
}

function formatQty(n) {
  return Number(n).toLocaleString("en-KE");
}

function OrderPopup() {
  const [current, setCurrent] = useState(() => buildRandomOrder());
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const startTimer = setTimeout(() => setVisible(true), 3000);
    const hideTimer = setTimeout(() => setVisible(false), 9000);
    const loopTimer = setInterval(() => {
      setCurrent(buildRandomOrder());
      setVisible(true);
      setTimeout(() => setVisible(false), 6000);
    }, 12000);
    return () => {
      clearTimeout(startTimer);
      clearTimeout(hideTimer);
      clearInterval(loopTimer);
    };
  }, []);

  return (
    <div className={`order-popup ${visible ? "visible" : "hidden"}`}>
      <div className="order-popup-inner">
        <div className="order-popup-emoji">{current.emoji}</div>
        <div className="order-popup-body">
          <div className="order-popup-title">
            <strong>{current.name}</strong> from <strong>{current.location}</strong>
          </div>
          <div className="order-popup-detail">
            Just ordered <strong>{formatQty(current.qty)}</strong> {current.platform} {current.type}
          </div>
          <div className="order-popup-time">Just now</div>
        </div>
      </div>
    </div>
  );
}

function TrackOrderCard({ hasTrackingId, onTrack }) {
  return (
    <div className="track-card">
      <div className="track-card-icon"><PackageCheck size={22} /></div>
      <div className="track-card-info">
        <strong>Already placed an order?</strong>
        <span>
          {hasTrackingId
            ? "Open your tracking page to see live status."
            : "View live status of your recent order."}
        </span>
      </div>
      <button type="button" className="track-card-btn" onClick={onTrack}>
        Track Order <ChevronRight size={17} />
      </button>
    </div>
  );
}

const TRUST_BADGES = [
  { icon: "🛡️", title: "Secure Payments", description: "Powered by PesaPal" },
  { icon: "⚡", title: "Fast Delivery", description: "Orders start instantly" },
  { icon: "💳", title: "M-Pesa Accepted", description: "Pay in 30 seconds" },
  { icon: "🎧", title: "24/7 Support", description: "We're on WhatsApp" }
];

function TrustBadges() {
  return (
    <section className="trust-badges">
      {TRUST_BADGES.map((badge) => (
        <div className="trust-badge" key={badge.title}>
          <div className="trust-badge-icon">{badge.icon}</div>
          <div className="trust-badge-text">
            <strong>{badge.title}</strong>
            <span>{badge.description}</span>
          </div>
        </div>
      ))}
    </section>
  );
}

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
  const key = String(order?.order_status || "payment pending").toLowerCase().trim();
  const direct = STATUS_PROGRESS[key];
  if (direct) {
    return { current_step: direct.current_step, progress: direct.progress,
      status_label: statusLabel(order?.order_status) };
  }
  const matched = Object.entries(STATUS_PROGRESS).find(([k]) => key.includes(k));
  const match = matched?.[1] || { current_step: 1, progress: 15 };
  return { current_step: match.current_step, progress: match.progress,
    status_label: statusLabel(order?.order_status) };
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
            <div className={`tracking-step ${active ? "active" : ""} ${current ? "current" : ""}`}>
              <div className="tracking-step-icon"><Icon size={19} /></div>
              <span>{step.title}</span>
            </div>
            {index < steps.length - 1 && (
              <div className={`tracking-line ${currentStep > step.number ? "active" : ""}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

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
        { credentials: "same-origin", cache: "no-store" }
      );
      const responseText = await response.text();
      let data = null;
      try { data = responseText ? JSON.parse(responseText) : null; }
      catch { throw new Error("The tracking server returned an invalid response."); }
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
    orderStatusKey.includes("completed") || orderStatusKey.includes("partial") ||
    orderStatusKey.includes("cancel") || orderStatusKey.includes("failed") ||
    orderStatusKey.includes("reversed") || orderStatusKey.includes("supplier error");

  useEffect(() => {
    loadTracking(true);
    if (terminal) return;
    const interval = setInterval(() => loadTracking(false), 15000);
    return () => clearInterval(interval);
  }, [trackingId, terminal]);

  const whatsappUrl = trackingData?.whatsapp?.url || getWhatsAppUrl(trackingId);

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
          <X size={19} /> Close
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
          <button type="button" onClick={() => loadTracking(true)}>Try Again</button>
        </div>
      )}

      {order && (
        <>
          <div className="tracking-id-box">
            <div>
              <span>Tracking ID</span>
              <strong>{order.tracking_id}</strong>
            </div>
            <button type="button" onClick={() => navigator.clipboard?.writeText(order.tracking_id)}>
              Copy
            </button>
          </div>

          <div className="tracking-status-card">
            <div className="tracking-status-top">
              <div>
                <span>Current status</span>
                <strong>{statusLabel(order.order_status)}</strong>
              </div>
              <div className="tracking-percent">{Number(tracking?.progress || 0)}%</div>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${Number(tracking?.progress || 0)}%` }} />
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
            <div className="form-error"><span>{order.error_message}</span></div>
          )}

          <div className="tracking-auto">
            <Clock3 size={17} />
            <span>
              {terminal
                ? "This order is complete. No further updates expected."
                : "Status checks automatically every 15 seconds."}
            </span>
            <button type="button" onClick={() => loadTracking(true)}>Refresh</button>
          </div>

          <a className="whatsapp-help" href={whatsappUrl} target="_blank" rel="noreferrer">
            <WhatsAppIcon size={20} />
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
  const [selectedSubType, setSelectedSubType] = useState(null);
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
      try { localStorage.setItem("huppy_cube_tracking_id", returnedTrackingId); } catch {}
      setShowTracking(true);
    }
  }, []);

  async function loadServices() {
    try {
      setLoadingServices(true);
      setError("");
      const response = await fetch("/api/services", {
        credentials: "same-origin", cache: "no-store"
      });
      const responseText = await response.text();
      let data = null;
      try { data = responseText ? JSON.parse(responseText) : null; }
      catch { throw new Error("The services server returned an invalid response."); }
      if (!response.ok) throw new Error(data?.error || "Unable to load services");
      const serviceList = Array.isArray(data) ? data
        : Array.isArray(data?.services) ? data.services : [];
      setServices(serviceList);
    } catch (err) {
      setError(err?.message || "Unable to load services");
    } finally {
      setLoadingServices(false);
    }
  }

  const enrichedServices = useMemo(() => {
    return services.map((service) => {
      const platform = detectPlatform(service);
      const serviceType = detectServiceType(service);
      const subType = detectServiceSubType(service, serviceType);
      return { ...service, platform, serviceType, serviceSubType: subType };
    });
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
      type: t, count: counts[t], ...TYPE_META[t]
    }));
  }, [platformServices]);

  const typeServices = useMemo(() => {
    if (!selectedType) return platformServices;
    return platformServices.filter((s) => s.serviceType === selectedType);
  }, [platformServices, selectedType]);

  const availableSubTypes = useMemo(() => {
    if (!selectedType) return [];
    const subTypeOrder = SUB_TYPE_ORDER[selectedType];
    if (!subTypeOrder) return [];

    const counts = {};
    for (const s of typeServices) {
      const st = s.serviceSubType;
      if (!st) continue;
      counts[st] = (counts[st] || 0) + 1;
    }

    return subTypeOrder
      .filter((st) => counts[st] > 0)
      .map((st) => ({ subType: st, count: counts[st], ...(SUB_TYPE_META[st] || {}) }));
  }, [typeServices, selectedType]);

  const shouldSkipTypeStage = availableTypes.length <= 1;
  const shouldSkipSubTypeStage =
    !SUB_TYPE_ORDER[selectedType] || availableSubTypes.length <= 1;

  const filteredServices = useMemo(() => {
    const query = search.trim().toLowerCase();
    const activeType = shouldSkipTypeStage ? availableTypes[0]?.type || null : selectedType;

    const activeSubType = (() => {
      if (!activeType) return null;
      if (shouldSkipSubTypeStage) return availableSubTypes[0]?.subType || null;
      return selectedSubType;
    })();

    const matched = platformServices.filter((service) => {
      const matchesType = !activeType || service.serviceType === activeType;
      const matchesSubType = !activeSubType || service.serviceSubType === activeSubType;
      const matchesSearch = !query ||
        `${service.name} ${service.category} ${service.type} ${service.platform}`
          .toLowerCase().includes(query);
      return matchesType && matchesSubType && matchesSearch;
    });

    return matched
      .sort((a, b) => {
        const ra = Number(getCustomerRate(a) || 0);
        const rb = Number(getCustomerRate(b) || 0);
        return ra - rb;
      })
      .slice(0, 60);
  }, [
    platformServices, availableTypes, availableSubTypes,
    shouldSkipTypeStage, shouldSkipSubTypeStage,
    selectedType, selectedSubType, search
  ]);

  useEffect(() => {
    setSelectedType(null);
    setSelectedSubType(null);
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
    const minimum = Number(selectedService.min_quantity ?? selectedService.min ?? 0);
    const maximum = Number(selectedService.max_quantity ?? selectedService.max ?? 0);

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
      try { data = responseText ? JSON.parse(responseText) : null; }
      catch {
        throw new Error(
          `The payment server returned an invalid response: ${responseText.slice(0, 300)}`
        );
      }
      if (!data || typeof data !== "object") {
        throw new Error("The payment server returned an empty response. Please try again.");
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
      try { localStorage.setItem("huppy_cube_tracking_id", data.tracking_id); } catch {}

      if (data.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }
      setOrderResult(data);
    } catch (err) {
      console.error("Order payment error:", err);
      setError(err?.message || "Something went wrong while creating your order.");
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
            <div className="brand-icon"><Sparkles size={22} /></div>
            <div>
              <div className="brand-name">HUPPY CUBE</div>
              <div className="brand-subtitle">SOCIAL MEDIA SERVICES</div>
            </div>
          </div>
          <a className="support-button support-button-wa"
             href={getWhatsAppUrl(trackingId)} target="_blank" rel="noreferrer">
            <WhatsAppIcon size={18} />
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
            <div className="brand-icon"><Sparkles size={22} /></div>
            <div>
              <div className="brand-name">HUPPY CUBE</div>
              <div className="brand-subtitle">SOCIAL MEDIA SERVICES</div>
            </div>
          </div>
          <a className="support-button support-button-wa"
             href={getWhatsAppUrl()} target="_blank" rel="noreferrer">
            <WhatsAppIcon size={18} />
            <span>WhatsApp Support</span>
          </a>
        </header>

        <main className="main-content">
          <section className="hero-section">
            <div className="hero-glow">
              <Sparkles size={18} />
              Fast • Simple • Secure
            </div>
            <h1>Grow your<span> social presence.</span></h1>
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

          <TrackOrderCard
            hasTrackingId={Boolean(trackingId)}
            onTrack={() => openTracking()}
          />

          <section className="services-section">
            <div className="section-heading">
              <div>
                <span className="section-kicker">EXPLORE</span>
                <h2>Choose a platform</h2>
              </div>
              <div className="service-count">{enrichedServices.length} services</div>
            </div>

            <div className="platform-grid">
              {PLATFORM_ORDER.map((platform) => {
                if (platform === "All") return null;
                const Icon = PLATFORM_ICONS[platform] || Globe;
                const count = enrichedServices.filter((service) => service.platform === platform).length;
                return (
                  <button key={platform} type="button" className="platform-card"
                          onClick={() => setSelectedPlatform(platform)}>
                    <span className="platform-icon"><Icon size={21} /></span>
                    <span className="platform-info">
                      <strong>{platform}</strong>
                      <small>{count} services</small>
                    </span>
                    <ChevronRight size={17} className="platform-arrow" />
                  </button>
                );
              })}
            </div>

            <TrustBadges />
          </section>

          <OrderPopup />
        </main>

        <footer className="footer">
          <span>© {new Date().getFullYear()} HUPPY CUBE</span>
          <span>Secure payments • Fast delivery</span>
        </footer>
      </div>
    );
                     }  if (!shouldSkipTypeStage && !selectedType && selectedPlatform !== "All") {
    return (
      <div className="app-shell">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <div className="ambient ambient-three" />

        <header className="topbar">
          <div className="brand">
            <div className="brand-icon"><Sparkles size={22} /></div>
            <div>
              <div className="brand-name">HUPPY CUBE</div>
              <div className="brand-subtitle">SOCIAL MEDIA SERVICES</div>
            </div>
          </div>
          <a className="support-button support-button-wa"
             href={getWhatsAppUrl()} target="_blank" rel="noreferrer">
            <WhatsAppIcon size={18} />
            <span>WhatsApp Support</span>
          </a>
        </header>

        <main className="main-content">
          <section className="services-section">
            <div className="section-heading">
              <div>
                <button type="button" className="tracking-back"
                        onClick={() => { setSelectedPlatform("All"); setSelectedType(null); setSelectedSubType(null); }}
                        style={{ marginBottom: "12px" }}>
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
                  <button key={t.type} type="button" className="type-card"
                          onClick={() => { setSelectedType(t.type); setSelectedSubType(null); }}>
                    <span className="type-emoji">{t.emoji}</span>
                    <span className="type-info">
                      <strong><Icon size={17} />{t.type}</strong>
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

  if (!shouldSkipSubTypeStage && !selectedSubType && selectedPlatform !== "All" && selectedType) {
    return (
      <div className="app-shell">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <div className="ambient ambient-three" />

        <header className="topbar">
          <div className="brand">
            <div className="brand-icon"><Sparkles size={22} /></div>
            <div>
              <div className="brand-name">HUPPY CUBE</div>
              <div className="brand-subtitle">SOCIAL MEDIA SERVICES</div>
            </div>
          </div>
          <a className="support-button support-button-wa"
             href={getWhatsAppUrl()} target="_blank" rel="noreferrer">
            <WhatsAppIcon size={18} />
            <span>WhatsApp Support</span>
          </a>
        </header>

        <main className="main-content">
          <section className="services-section">
            <div className="section-heading">
              <div>
                <button type="button" className="tracking-back"
                        onClick={() => { setSelectedType(null); setSelectedSubType(null); }}
                        style={{ marginBottom: "12px" }}>
                  <ChevronLeft size={16} />
                  Back to {selectedPlatform} types
                </button>
                <span className="section-kicker">{selectedPlatform.toUpperCase()}</span>
                <h2>{TYPE_META[selectedType]?.emoji} {selectedType}</h2>
                <p style={{ marginTop: "6px", opacity: 0.7 }}>
                  Choose the exact type of {selectedType.toLowerCase()} you need.
                </p>
              </div>
            </div>

            <div className="type-grid">
              {availableSubTypes.map((st) => (
                <button key={st.subType} type="button" className="type-card"
                        onClick={() => setSelectedSubType(st.subType)}>
                  <span className="type-emoji">{st.emoji || "•"}</span>
                  <span className="type-info">
                    <strong>{st.subType}</strong>
                    <small>{st.count} service{st.count !== 1 ? "s" : ""}</small>
                  </span>
                  <ChevronRight size={18} className="type-arrow" />
                </button>
              ))}
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

  const activeType = shouldSkipTypeStage ? availableTypes[0]?.type || null : selectedType;
  const activeSubType = shouldSkipSubTypeStage
    ? availableSubTypes[0]?.subType || null
    : selectedSubType;

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="ambient ambient-three" />

      <header className="topbar">
        <div className="brand">
          <div className="brand-icon"><Sparkles size={22} /></div>
          <div>
            <div className="brand-name">HUPPY CUBE</div>
            <div className="brand-subtitle">SOCIAL MEDIA SERVICES</div>
          </div>
        </div>
        <a className="support-button support-button-wa"
           href={getWhatsAppUrl()} target="_blank" rel="noreferrer">
          <WhatsAppIcon size={18} />
          <span>WhatsApp Support</span>
        </a>
      </header>

      <main className="main-content">
        <section className="services-section">
          <div className="section-heading">
            <div>
              <button type="button" className="tracking-back"
                      onClick={() => {
                        if (shouldSkipTypeStage) {
                          setSelectedPlatform("All");
                        } else if (shouldSkipSubTypeStage) {
                          setSelectedType(null);
                          setSelectedSubType(null);
                        } else {
                          setSelectedSubType(null);
                        }
                      }}
                      style={{ marginBottom: "12px" }}>
                <ChevronLeft size={16} />
                {shouldSkipTypeStage
                  ? "Back to platforms"
                  : shouldSkipSubTypeStage
                  ? `Back to ${selectedPlatform} types`
                  : `Back to ${activeType} types`}
              </button>

              <span className="section-kicker">
                {selectedPlatform.toUpperCase()}
              </span>
              <h2>
                {activeSubType
                  ? `${SUB_TYPE_META[activeSubType]?.emoji || ""} ${activeSubType}`
                  : activeType
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
            <input type="text"
                   placeholder={`Search ${activeSubType || activeType || "services"}...`}
                   value={search}
                   onChange={(event) => setSearch(event.target.value)} />
            {search && (
              <button type="button" className="clear-search" onClick={() => setSearch("")}>
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
              <button type="button" onClick={loadServices}>Try Again</button>
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
                        <span className="service-platform-icon"><Icon size={19} /></span>
                        {service.platform}
                      </div>
                      <span className="service-number">#{service.service_id}</span>
                    </div>

                    <h3>{service.name}</h3>

                    <div className="service-meta">
                      <span>Min {Number(service.min_quantity ?? service.min ?? 0).toLocaleString()}</span>
                      <span>Max {Number(service.max_quantity ?? service.max ?? 0).toLocaleString()}</span>
                    </div>

                    <div className="service-bottom">
                      <div>
                        <small>Starting from</small>
                        <strong>
                          {formatKES(customerRate / 2)}
                          <em>/500</em>
                        </strong>
                      </div>
                      <button type="button" className="order-button" onClick={() => openOrder(service)}>
                        Order <ShoppingCart size={17} />
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
          <div className="order-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={closeOrder} disabled={ordering}>
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

                <div className="selected-service-name">{selectedService.name}</div>

                <form onSubmit={submitOrder}>
                  <label className="field">
                    <span><Hash size={16} />Quantity</span>
                    <input type="number"
                           min={selectedService.min_quantity ?? selectedService.min}
                           max={selectedService.max_quantity ?? selectedService.max}
                           value={quantity}
                           onChange={(event) => setQuantity(event.target.value)}
                           placeholder="Enter quantity" />
                    <small>
                      Min {Number(selectedService.min_quantity ?? selectedService.min ?? 0).toLocaleString()} • Max{" "}
                      {Number(selectedService.max_quantity ?? selectedService.max ?? 0).toLocaleString()}
                    </small>
                  </label>

                  <label className="field">
                    <span><LinkIcon size={16} />Target link</span>
                    <input type="url" value={link}
                           onChange={(event) => setLink(event.target.value)}
                           placeholder="https://..." />
                  </label>

                  <label className="field">
                    <span><Phone size={16} />Phone number</span>
                    <input type="tel" value={phone}
                           onChange={(event) => setPhone(event.target.value)}
                           placeholder="07XXXXXXXX" />
                  </label>

                  <div className="total-box">
                    <div>
                      <span>Total</span>
                      <small>{Number(quantity || 0).toLocaleString()} units</small>
                    </div>
                    <strong>{formatKES(priceFor(selectedService, quantity))}</strong>
                  </div>

                  {error && <div className="form-error">{error}</div>}

                  <button type="submit" className="pay-button" disabled={ordering}>
                    {ordering ? (
                      <><Loader2 className="spin" size={19} />Preparing payment...</>
                    ) : (
                      <>Pay & Order <ChevronRight size={20} /></>
                    )}
                  </button>

                  <div className="secure-note">🔒 Secure payment powered by PesaPal</div>
                </form>
              </>
            ) : (
              <div className="success-screen">
                <div className="success-icon"><CheckCircle2 size={48} /></div>
                <h2>Order Created!</h2>
                <p>Your order has been created. Use the tracking page to follow its progress.</p>

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
                    <strong>{formatKES(priceFor(selectedService, quantity))}</strong>
                  </div>
                </div>

                <button type="button" className="pay-button"
                        onClick={() => openTracking(orderResult.tracking_id)}>
                  Track My Order <ChevronRight size={20} />
                </button>

                <a className="whatsapp-help"
                   href={getWhatsAppUrl(orderResult.tracking_id)}
                   target="_blank" rel="noreferrer">
                  <WhatsAppIcon size={20} />
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
