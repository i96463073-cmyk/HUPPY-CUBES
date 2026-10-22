import React from "react";

/* =========================================================
   Brand icons — each one is a full app-icon tile (rounded
   square) that fills whatever box it is placed in.
   Used by PLATFORM_ICONS in main.jsx.
========================================================= */

function tile(label, children) {
  const Icon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="brand-svg"
      role="img"
      aria-label={label}
    >
      {children}
    </svg>
  );
  Icon.displayName = label;
  return Icon;
}

const Instagram = tile("Instagram", (
  <>
    <defs><radialGradient id="hc-ig" cx="0.3" cy="1.05" r="1.2"><stop offset="0" stopColor="#fdf497"/><stop offset="0.08" stopColor="#fdf497"/><stop offset="0.45" stopColor="#fd5949"/><stop offset="0.65" stopColor="#d6249f"/><stop offset="1" stopColor="#285aeb"/></radialGradient></defs><rect width="24" height="24" rx="6.2" fill="url(#hc-ig)"/><rect x="6.2" y="6.2" width="11.6" height="11.6" rx="3.4" fill="none" stroke="#fff" strokeWidth="1.5"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="#fff" strokeWidth="1.5"/><circle cx="15.9" cy="8.1" r="0.95" fill="#fff"/>
  </>
));

const TikTok = tile("TikTok", (
  <>
    <rect width="24" height="24" rx="6.2" fill="#0b0b10"/><g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9"><path d="M14.2 5v9.2a3.2 3.2 0 1 1-2.6-3.1M14.2 5c.3 2 1.7 3.4 3.8 3.7" stroke="#25f4ee" transform="translate(-0.7 -0.6)"/><path d="M14.2 5v9.2a3.2 3.2 0 1 1-2.6-3.1M14.2 5c.3 2 1.7 3.4 3.8 3.7" stroke="#fe2c55" transform="translate(0.7 0.6)"/><path d="M14.2 5v9.2a3.2 3.2 0 1 1-2.6-3.1M14.2 5c.3 2 1.7 3.4 3.8 3.7" stroke="#fff"/></g>
  </>
));

const Facebook = tile("Facebook", (
  <>
    <rect width="24" height="24" rx="6.2" fill="#1877f2"/><path d="M13.4 20v-6.6h2.2l.4-2.6h-2.6V9.2c0-.8.3-1.3 1.4-1.3h1.3V5.6c-.2 0-1-.1-1.9-.1-2 0-3.3 1.2-3.3 3.4v1.9H8.7v2.6h2.2V20z" fill="#fff"/>
  </>
));

const YouTube = tile("YouTube", (
  <>
    <rect width="24" height="24" rx="6.2" fill="#ff0000"/><rect x="3.8" y="6.6" width="16.4" height="10.8" rx="3.2" fill="#fff"/><path d="M10.2 9.5v5l4.4-2.5z" fill="#ff0000"/>
  </>
));

const Telegram = tile("Telegram", (
  <>
    <rect width="24" height="24" rx="6.2" fill="#229ed9"/><path d="M18.2 6.6 5.6 11.5c-.8.3-.8.8-.1 1l3.1.9 1.2 3.7c.1.4.4.5.7.2l1.8-1.5 3.3 2.4c.6.3 1 .1 1.2-.6l2.1-10.1c.2-.9-.3-1.3-.7-1z" fill="#fff"/><path d="M9.7 13.1 16.7 8.6" fill="none" stroke="#229ed9" strokeWidth="1" strokeLinecap="round"/>
  </>
));

const TwitterX = tile("Twitter / X", (
  <>
    <rect width="24" height="24" rx="6.2" fill="#0b0b10"/><path d="M5.8 5.5h3.3l9.1 13H15z" fill="#fff"/><path d="M17.8 5.5 13 10.9M6.2 18.5 11 13.1" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round"/>
  </>
));

const WhatsApp = tile("WhatsApp", (
  <>
    <rect width="24" height="24" rx="6.2" fill="#25d366"/><g transform="translate(4.2 4.2) scale(0.65)"><path fill="#fff" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></g>
  </>
));

const Spotify = tile("Spotify", (
  <>
    <rect width="24" height="24" rx="6.2" fill="#1db954"/><g fill="none" stroke="#0a0a0a" strokeLinecap="round"><path d="M6.4 9.3c3.7-1.1 8.1-.8 11.2 1.1" strokeWidth="1.7"/><path d="M7 12.4c3-.8 6.2-.5 8.9 1.1" strokeWidth="1.5"/><path d="M7.6 15.3c2.4-.6 4.8-.4 6.8.8" strokeWidth="1.3"/></g>
  </>
));

const Gaming = tile("Gaming", (
  <>
    <defs><linearGradient id="hc-gm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b5cf6"/><stop offset="1" stopColor="#2563eb"/></linearGradient></defs><rect width="24" height="24" rx="6.2" fill="url(#hc-gm)"/><rect x="4.8" y="8.2" width="14.4" height="8.4" rx="4.2" fill="none" stroke="#fff" strokeWidth="1.5"/><path d="M8.6 10.6v3.2M7 12.2h3.2" stroke="#fff" strokeWidth="1.4" strokeLinecap="round"/><circle cx="14.9" cy="11.6" r=".85" fill="#fff"/><circle cx="16.6" cy="13.3" r=".85" fill="#fff"/>
  </>
));

const Other = tile("Other", (
  <>
    <defs><linearGradient id="hc-ot" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#475569"/><stop offset="1" stopColor="#1e293b"/></linearGradient></defs><rect width="24" height="24" rx="6.2" fill="url(#hc-ot)"/><g fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round"><circle cx="12" cy="12" r="6.4"/><path d="M5.6 12h12.8M12 5.6c1.9 1.8 2.9 4 2.9 6.4s-1 4.6-2.9 6.4c-1.9-1.8-2.9-4-2.9-6.4s1-4.6 2.9-6.4z"/></g>
  </>
));

export const BRAND_ICONS = {
  Instagram: Instagram,
  TikTok: TikTok,
  Facebook: Facebook,
  YouTube: YouTube,
  Telegram: Telegram,
  "Twitter / X": TwitterX,
  WhatsApp: WhatsApp,
  Spotify: Spotify,
  Gaming: Gaming,
  Other: Other,
};
