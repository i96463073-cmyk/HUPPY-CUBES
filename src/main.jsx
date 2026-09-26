import React from "react";
import { createRoot } from "react-dom/client";
import {
  ShoppingCart,
  MessageCircle,
  Instagram,
  Facebook,
  Youtube
} from "lucide-react";
import "./index.css";

function App() {
  return (
    <div className="app">
      <header>
        <div className="container nav">
          <div className="logo">
            <div className="logo-icon">H</div>
            <span>
              HUPPY <b>CUBE</b>
            </span>
          </div>

          <nav>
            <a href="#home">Home</a>
            <a href="#services">Services</a>
            <a href="#orders">Orders</a>
            <a href="#support">Support</a>
          </nav>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="hero" id="home">
          <div className="container hero-grid">
            <div>
              <span className="badge">
                SOCIAL MEDIA MARKETING
              </span>

              <h1>
                Grow your social media
                <span> with HUPPY CUBE.</span>
              </h1>

              <p>
                Fast, simple and affordable social media marketing
                services for creators, businesses and brands.
              </p>

              <div className="buttons">
                <a href="#services" className="primary">
                  View Services
                </a>

                <a
                  href="https://wa.me/254796681162"
                  target="_blank"
                  rel="noreferrer"
                  className="secondary"
                >
                  <MessageCircle size={18} />
                  WhatsApp Support
                </a>
              </div>
            </div>

            <div className="hero-card">
              <ShoppingCart size={42} />

              <h2>Everything you need</h2>

              <p>
                Manage your social media growth from one simple
                dashboard.
              </p>

              <div className="stats">
                <div>
                  <strong>24/7</strong>
                  <small>Ordering</small>
                </div>

                <div>
                  <strong>Fast</strong>
                  <small>Delivery</small>
                </div>

                <div>
                  <strong>Easy</strong>
                  <small>Management</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SERVICES */}
        <section className="section" id="services">
          <div className="container">
            <span className="eyebrow">OUR SERVICES</span>

            <h2 className="section-title">
              Social Media Services
            </h2>

            <div className="cards">
              <Service
                platform="Instagram"
                title="Instagram Followers"
                price="KSh 40"
              />

              <Service
                platform="Instagram"
                title="Instagram Likes"
                price="KSh 30"
              />

              <Service
                platform="TikTok"
                title="TikTok Followers"
                price="KSh 50"
              />

              <Service
                platform="TikTok"
                title="TikTok Likes"
                price="KSh 35"
              />

              <Service
                platform="Facebook"
                title="Facebook Page Likes"
                price="KSh 45"
              />

              <Service
                platform="YouTube"
                title="YouTube Subscribers"
                price="KSh 80"
              />
            </div>
          </div>
        </section>

        {/* PESAPAL PAYMENT */}
        <section className="order-section" id="orders">
          <div className="container order-card">
            <span className="eyebrow">ADD FUNDS</span>

            <h2>Fund Your HUPPY CUBE Wallet</h2>

            <p>
              Enter your details below and continue to secure
              PesaPal checkout.
            </p>

            <div className="payment-form">
              <label htmlFor="amount">
                Amount (KES)
              </label>

              <input
                id="amount"
                type="number"
                min="10"
                placeholder="Enter amount"
              />

              <label htmlFor="phone">
                Phone Number
              </label>

              <input
                id="phone"
                type="tel"
                placeholder="2547XXXXXXXX"
              />

              <label htmlFor="email">
                Email
              </label>

              <input
                id="email"
                type="email"
                placeholder="you@example.com"
              />

              <button
                type="button"
                className="primary payment-button"
                onClick={async () => {
                  const amount = Number(
                    document.getElementById("amount").value
                  );

                  const phone =
                    document
                      .getElementById("phone")
                      .value.trim();

                  const email =
                    document
                      .getElementById("email")
                      .value.trim();

                  if (!amount || amount < 10) {
                    alert(
                      "Please enter at least KSh 10."
                    );
                    return;
                  }

                  if (!phone) {
                    alert(
                      "Please enter your phone number."
                    );
                    return;
                  }

                  const button =
                    document.querySelector(
                      ".payment-button"
                    );

                  try {
                    button.disabled = true;
                    button.textContent =
                      "Connecting to PesaPal...";

                    const response = await fetch(
                      "/api/payment",
                      {
                        method: "POST",
                        headers: {
                          "Content-Type":
                            "application/json"
                        },
                        body: JSON.stringify({
                          amount,
                          phone,
                          email
                        })
                      }
                    );

                    const data =
                      await response.json();

                    if (
                      !response.ok ||
                      !data.success
                    ) {
                      throw new Error(
                        data.message ||
                          "Unable to start PesaPal payment."
                      );
                    }

                    if (!data.redirect_url) {
                      throw new Error(
                        "PesaPal did not return a checkout URL."
                      );
                    }

                    window.location.href =
                      data.redirect_url;
                  } catch (error) {
                    console.error(
                      "Payment error:",
                      error
                    );

                    alert(
                      error.message ||
                        "Payment connection failed. Please try again."
                    );

                    button.disabled = false;
                    button.textContent =
                      "Continue to PesaPal";
                  }
                }}
              >
                Continue to PesaPal
              </button>
            </div>

            <p className="payment-note">
              Secure checkout powered by PesaPal.
            </p>
          </div>
        </section>

        {/* SUPPORT */}
        <section className="support" id="support">
          <div className="container support-card">
            <MessageCircle size={38} />

            <div>
              <h2>Need help?</h2>

              <p>
                Our support team is available through WhatsApp.
              </p>
            </div>

            <a
              href="https://wa.me/254796681162"
              target="_blank"
              rel="noreferrer"
              className="whatsapp"
            >
              Chat on WhatsApp
            </a>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer>
        <div className="container footer">
          <div className="logo">
            <div className="logo-icon">H</div>

            <span>
              HUPPY <b>CUBE</b>
            </span>
          </div>

          <p>© 2026 HUPPY CUBE</p>

          <div className="socials">
            <Instagram size={18} />
            <Facebook size={18} />
            <Youtube size={18} />
          </div>
        </div>
      </footer>
    </div>
  );
}

function Service({
  platform,
  title,
  price
}) {
  return (
    <div className="service-card">
      <span>{platform}</span>

      <h3>{title}</h3>

      <p>
        High-quality social media marketing service.
      </p>

      <div className="service-bottom">
        <strong>{price}</strong>

        <small>per 1K</small>

        <a
          href="https://wa.me/254796681162"
          target="_blank"
          rel="noreferrer"
        >
          Order
        </a>
      </div>
    </div>
  );
}

createRoot(
  document.getElementById("root")
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
