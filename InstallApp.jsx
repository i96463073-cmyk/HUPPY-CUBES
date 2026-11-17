import React, { useEffect, useRef, useState } from "react";
import { Download, X, Share, PlusSquare, MoreVertical, CheckCircle2 } from "lucide-react";
import "./install.css";

const INSTALLED_KEY = "huppy_cube_installed";

function isStandalone() {
  try {
    return (
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.matchMedia?.("(display-mode: fullscreen)").matches ||
      window.navigator.standalone === true
    );
  } catch {
    return false;
  }
}

function isIOS() {
  const ua = navigator.userAgent || "";
  const iDevice = /iPad|iPhone|iPod/.test(ua);
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iDevice || iPadOS;
}

function readInstalledFlag() {
  try { return localStorage.getItem(INSTALLED_KEY) === "1"; } catch { return false; }
}
function writeInstalledFlag(v) {
  try { v ? localStorage.setItem(INSTALLED_KEY, "1") : localStorage.removeItem(INSTALLED_KEY); } catch {}
}

export default function InstallApp() {
  const deferredRef = useRef(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [installed, setInstalled] = useState(() => isStandalone() || readInstalledFlag());
  const [open, setOpen] = useState(false);
  const [ios] = useState(() => isIOS());
  const [result, setResult] = useState("");

  // Register the service worker (needed for installability)
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () =>
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) =>
        console.warn("Service worker registration failed:", e)
      );
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  // Install events
  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();               // keep the event so WE trigger it from our button
      deferredRef.current = e;
      setCanPrompt(true);
      // The browser only fires this when the app is NOT installed.
      writeInstalledFlag(false);
      setInstalled(isStandalone());
    };
    const onInstalled = () => {
      writeInstalledFlag(true);
      deferredRef.current = null;
      setCanPrompt(false);
      setInstalled(true);
      setOpen(false);
    };
    const mq = window.matchMedia?.("(display-mode: standalone)");
    const onMode = () => { if (isStandalone()) setInstalled(true); };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    mq?.addEventListener?.("change", onMode);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      mq?.removeEventListener?.("change", onMode);
    };
  }, []);

  // Close with Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function handleInstall() {
    setResult("");
    const evt = deferredRef.current;
    if (!evt) return; // iOS / manual cases show instructions instead
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      deferredRef.current = null;
      setCanPrompt(false);
      if (choice?.outcome === "accepted") {
        setResult("Installing… look for HUPPY CUBE on your home screen.");
      } else {
        setResult("No problem. You can install any time from the GET APP button.");
      }
    } catch (e) {
      console.warn("Install prompt failed:", e);
      setResult("Could not open the install prompt. Use the manual steps below.");
    }
  }

  if (installed) return null;

  return (
    <>
      <button
        type="button"
        className="install-fab"
        aria-label="Get the HUPPY CUBE app"
        onClick={() => setOpen(true)}
      >
        <span className="install-fab-icon"><Download size={18} /></span>
        <span className="install-fab-text">GET APP</span>
      </button>

      {open && (
        <div className="install-backdrop" onClick={() => setOpen(false)}>
          <div
            className="install-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Install HUPPY CUBE"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="install-close" aria-label="Close" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>

            <img className="install-logo" src="/icons/icon-192.png" alt="" width="64" height="64" />
            <h3>Your favourite panel, one tap away.</h3>
            <p className="install-desc">
              Install HUPPY CUBE for faster access, convenient ordering and a better experience.
            </p>

            {ios ? (
              <ol className="install-steps">
                <li><span>1</span> Open HUPPY CUBE in <b>Safari</b>.</li>
                <li><span>2</span> Tap the <b>Share</b> button <Share size={15} className="inline-ic" />.</li>
                <li><span>3</span> Choose <b>Add to Home Screen</b> <PlusSquare size={15} className="inline-ic" />.</li>
                <li><span>4</span> Tap <b>Add</b> to confirm.</li>
              </ol>
            ) : canPrompt ? (
              <button type="button" className="install-primary" onClick={handleInstall}>
                <Download size={18} /> INSTALL APP
              </button>
            ) : (
              <ol className="install-steps">
                <li><span>1</span> Open the browser menu <MoreVertical size={15} className="inline-ic" /> (Chrome or Samsung Internet).</li>
                <li><span>2</span> Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
                <li><span>3</span> Confirm to add HUPPY CUBE.</li>
              </ol>
            )}

            {result && (
              <div className="install-result"><CheckCircle2 size={16} /> {result}</div>
            )}

            <button type="button" className="install-later" onClick={() => setOpen(false)}>
              Maybe later
            </button>

            <small className="install-note">
              HUPPY CUBE installs from this website using your browser. No APK or special permissions needed.
            </small>
          </div>
        </div>
      )}
    </>
  );
}
