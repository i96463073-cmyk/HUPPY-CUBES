import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";
import "./install.css";

const INSTALLED_KEY = "huppy_cube_installed";

/* Capture the browser's install event as early as possible
   (this file is imported before React renders). */
let deferredPrompt = null;
const subscribers = new Set();
const notify = () => subscribers.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    try { localStorage.removeItem(INSTALLED_KEY); } catch {}
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    try { localStorage.setItem(INSTALLED_KEY, "1"); } catch {}
    notify();
  });
}

function isStandalone() {
  try {
    return (
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.matchMedia?.("(display-mode: fullscreen)").matches ||
      window.navigator.standalone === true
    );
  } catch { return false; }
}

function isIOS() {
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function wasInstalled() {
  try { return localStorage.getItem(INSTALLED_KEY) === "1"; } catch { return false; }
}

export default function InstallApp() {
  const [, force] = useState(0);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const fn = () => force((n) => n + 1);
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const register = () =>
        navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
      if (document.readyState === "complete") register();
      else window.addEventListener("load", register, { once: true });
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  if (isStandalone() || (wasInstalled() && !deferredPrompt)) return null;

  async function handleTap() {
    // One tap: open the browser's own install dialog straight away.
    if (deferredPrompt) {
      const evt = deferredPrompt;
      deferredPrompt = null;
      try {
        await evt.prompt();
        await evt.userChoice;
      } catch {}
      notify();
      return;
    }
    // The browser is not offering install right now (or this is iPhone).
    setToast(
      isIOS()
        ? "Tap Share, then Add to Home Screen"
        : "Tap ⋮ menu, then Install app"
    );
  }

  return (
    <>
      <button type="button" className="install-fab" aria-label="Install HUPPY CUBE app" onClick={handleTap}>
        <span className="install-fab-icon"><Download size={18} /></span>
        <span className="install-fab-text">GET APP</span>
      </button>
      {toast && <div className="install-toast" role="status">{toast}</div>}
    </>
  );
}
