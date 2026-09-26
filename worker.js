const PESAPAL_LIVE_URL = "https://pay.pesapal.com/v3";

/* =========================
   PESAPAL AUTHENTICATION
========================= */

async function getPesaPalToken(env) {
  const response = await fetch(
    `${PESAPAL_LIVE_URL}/api/Auth/RequestToken`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        consumer_key: env.PESAPAL_CONSUMER_KEY,
        consumer_secret: env.PESAPAL_CONSUMER_SECRET
      })
    }
  );

  const data = await response.json();

  if (!response.ok || !data.token) {
    throw new Error(
      data.error?.message ||
        data.message ||
        "Unable to authenticate with PesaPal"
    );
  }

  return data.token;
}

/* =========================
   PHONE NORMALIZATION
========================= */

function normalizePhone(phone) {
  let value = String(phone || "").trim();

  value = value.replace(/\s+/g, "");

  if (value.startsWith("+254")) {
    value = value.substring(1);
  }

  if (value.startsWith("07")) {
    value = "254" + value.substring(1);
  }

  if (value.startsWith("01")) {
    value = "254" + value.substring(1);
  }

  if (/^7\d{8}$/.test(value)) {
    value = "254" + value;
  }

  if (/^1\d{8}$/.test(value)) {
    value = "254" + value;
  }

  return value;
}

/* =========================
   CREATE PESAPAL PAYMENT
========================= */

async function createPayment(request, env) {
  const body = await request.json();

  const amount = Number(body.amount);
  const phone = normalizePhone(body.phone);
  const email = String(body.email || "").trim();

  const firstName = String(
    body.firstName || "HUPPY"
  ).trim();

  const lastName = String(
    body.lastName || "CUSTOMER"
  ).trim();

  if (!amount || amount < 10) {
    return Response.json(
      {
        success: false,
        message: "Minimum payment amount is KSh 10."
      },
      { status: 400 }
    );
  }

  if (!phone) {
    return Response.json(
      {
        success: false,
        message: "Phone number is required."
      },
      { status: 400 }
    );
  }

  if (!env.DB) {
    throw new Error(
      "D1 database binding DB is not configured."
    );
  }

  if (!env.PESAPAL_IPN_ID) {
    throw new Error(
      "PESAPAL_IPN_ID is not configured."
    );
  }

  const token = await getPesaPalToken(env);

  const origin =
    env.APP_URL ||
    new URL(request.url).origin;

  const reference =
    "HUPPY-" +
    Date.now() +
    "-" +
    crypto
      .randomUUID()
      .replace(/-/g, "")
      .slice(0, 8)
      .toUpperCase();

  /* Save payment as pending BEFORE sending to PesaPal */

  await env.DB.prepare(
    `
    INSERT INTO payments (
      merchant_reference,
      phone,
      email,
      amount,
      currency,
      status
    )
    VALUES (?, ?, ?, ?, 'KES', 'PENDING')
    `
  )
    .bind(
      reference,
      phone,
      email || null,
      amount
    )
    .run();

  const paymentRequest = {
    id: reference,
    currency: "KES",
    amount,
    description: "HUPPY CUBE Wallet Deposit",

    callback_url:
      `${origin}/payment-success`,

    notification_id:
      env.PESAPAL_IPN_ID,

    billing_address: {
      email_address:
        email || "customer@huppycube.com",

      phone_number: phone,

      country_code: "KE",

      first_name: firstName,

      last_name: lastName
    }
  };

  const response = await fetch(
    `${PESAPAL_LIVE_URL}/api/Transactions/SubmitOrderRequest`,
    {
      method: "POST",

      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },

      body: JSON.stringify(paymentRequest)
    }
  );

  const data = await response.json();

  if (!response.ok || !data.redirect_url) {
    await env.DB.prepare(
      `
      UPDATE payments
      SET status = 'FAILED',
          updated_at = CURRENT_TIMESTAMP
      WHERE merchant_reference = ?
      `
    )
      .bind(reference)
      .run();

    return Response.json(
      {
        success: false,

        message:
          data.error?.message ||
          data.message ||
          "PesaPal payment could not be created."
      },

      { status: 400 }
    );
  }

  const trackingId =
    data.order_tracking_id;

  await env.DB.prepare(
    `
    UPDATE payments
    SET tracking_id = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE merchant_reference = ?
    `
  )
    .bind(
      trackingId,
      reference
    )
    .run();

  return Response.json({
    success: true,

    reference,

    order_tracking_id:
      trackingId,

    redirect_url:
      data.redirect_url
  });
}

/* =========================
   GET PESAPAL TRANSACTION STATUS
========================= */

async function getTransactionStatus(
  trackingId,
  env
) {
  const token =
    await getPesaPalToken(env);

  const response = await fetch(
    `${PESAPAL_LIVE_URL}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(
      trackingId
    )}`,

    {
      method: "GET",

      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.error?.message ||
        data.message ||
        "Unable to verify PesaPal transaction."
    );
  }

  return data;
}

/* =========================
   CREDIT WALLET
========================= */

async function creditWallet(
  payment,
  status,
  env
) {
  const statusCode =
    Number(status.status_code);

  const paymentStatus =
    String(
      status.payment_status_description ||
        ""
    ).toUpperCase();

  /* Only COMPLETED payments can be credited */

  if (
    statusCode !== 1 &&
    paymentStatus !== "COMPLETED"
  ) {
    return {
      credited: false,
      status:
        status.payment_status_description ||
        "NOT_COMPLETED"
    };
  }

  /* Security checks */

  const paidAmount =
    Number(status.amount);

  const expectedAmount =
    Number(payment.amount);

  if (
    !Number.isFinite(paidAmount) ||
    Math.abs(
      paidAmount - expectedAmount
    ) > 0.001
  ) {
    throw new Error(
      "PesaPal amount does not match the payment record."
    );
  }

  if (
    String(status.currency || "")
      .toUpperCase() !== "KES"
  ) {
    throw new Error(
      "PesaPal currency does not match KES."
    );
  }

  if (
    status.merchant_reference &&
    status.merchant_reference !==
      payment.merchant_reference
  ) {
    throw new Error(
      "PesaPal merchant reference does not match."
    );
  }

  /*
    The unique wallet transaction reference
    prevents the same payment from being
    credited twice.
  */

  const walletReference =
    `PESAPAL:${payment.tracking_id}`;

  const confirmationCode =
    status.confirmation_code || null;

  try {
    await env.DB.batch([
      env.DB.prepare(
        `
        UPDATE payments
        SET status = 'COMPLETED',
            payment_method = ?,
            confirmation_code = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `
      ).bind(
        status.payment_method || null,
        confirmationCode,
        payment.id
      ),

      env.DB.prepare(
        `
        INSERT INTO wallet_transactions (
          phone,
          type,
          amount,
          reference,
          description
        )
        VALUES (
          ?,
          'DEPOSIT',
          ?,
          ?,
          ?
        )
        `
      ).bind(
        payment.phone,
        paidAmount,
        walletReference,
        "PesaPal wallet deposit"
      ),

      env.DB.prepare(
        `
        INSERT INTO wallets (
          phone,
          balance
        )
        VALUES (?, ?)

        ON CONFLICT(phone)
        DO UPDATE SET
          balance =
            wallets.balance + excluded.balance,

          updated_at =
            CURRENT_TIMESTAMP
        `
      ).bind(
        payment.phone,
        paidAmount
      ),

      env.DB.prepare(
        `
        UPDATE payments
        SET credited = 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `
      ).bind(payment.id)
    ]);
  } catch (error) {
    /*
      A UNIQUE constraint on the wallet transaction
      reference prevents duplicate crediting.
    */

    if (
      String(error.message || "")
        .toLowerCase()
        .includes("unique")
    ) {
      const existing =
        await env.DB.prepare(
          `
          SELECT credited
          FROM payments
          WHERE id = ?
          `
        )
          .bind(payment.id)
          .first();

      return {
        credited: Boolean(
          existing?.credited
        ),
        duplicate: true
      };
    }

    throw error;
  }

  return {
    credited: true,
    amount: paidAmount,
    phone: payment.phone
  };
}

/* =========================
   VERIFY + CREDIT PAYMENT
========================= */

async function verifyAndCredit(
  trackingId,
  env
) {
  const payment =
    await env.DB.prepare(
      `
      SELECT *
      FROM payments
      WHERE tracking_id = ?
      LIMIT 1
      `
    )
      .bind(trackingId)
      .first();

  if (!payment) {
    throw new Error(
      "Payment was not found in HUPPY CUBE."
    );
  }

  /*
    If already credited, don't credit it again.
  */

  if (Number(payment.credited) === 1) {
    const wallet =
      await env.DB.prepare(
        `
        SELECT balance
        FROM wallets
        WHERE phone = ?
        LIMIT 1
        `
      )
        .bind(payment.phone)
        .first();

    return {
      already_credited: true,
      credited: true,
      amount: payment.amount,
      balance:
        Number(wallet?.balance || 0)
    };
  }

  const status =
    await getTransactionStatus(
      trackingId,
      env
    );

  const result =
    await creditWallet(
      payment,
      status,
      env
    );

  const wallet =
    await env.DB.prepare(
      `
      SELECT balance
      FROM wallets
      WHERE phone = ?
      LIMIT 1
      `
    )
      .bind(payment.phone)
      .first();

  return {
    tracking_id: trackingId,

    merchant_reference:
      payment.merchant_reference,

    status:
      status.payment_status_description,

    status_code:
      status.status_code,

    amount:
      Number(status.amount || payment.amount),

    credited:
      result.credited,

    balance:
      Number(wallet?.balance || 0)
  };
}

/* =========================
   PAYMENT STATUS ENDPOINT
========================= */

async function paymentStatus(
  request,
  env
) {
  const url =
    new URL(request.url);

  const trackingId =
    url.searchParams.get(
      "tracking_id"
    );

  if (!trackingId) {
    return Response.json(
      {
        success: false,
        message:
          "tracking_id is required."
      },
      { status: 400 }
    );
  }

  const result =
    await verifyAndCredit(
      trackingId,
      env
    );

  return Response.json({
    success: true,
    ...result
  });
}

/* =========================
   PESAPAL IPN
========================= */

async function handleIPN(
  request,
  env
) {
  const url =
    new URL(request.url);

  let trackingId =
    url.searchParams.get(
      "OrderTrackingId"
    );

  let merchantReference =
    url.searchParams.get(
      "OrderMerchantReference"
    );

  /*
    Also support POST IPN in case the
    registered PesaPal notification method
    is changed later.
  */

  if (request.method === "POST") {
    try {
      const body =
        await request.json();

      trackingId =
        trackingId ||
        body.OrderTrackingId;

      merchantReference =
        merchantReference ||
        body.OrderMerchantReference;
    } catch {
      /* GET-style parameters may still exist */
    }
  }

  if (!trackingId) {
    return Response.json(
      {
        orderNotificationType:
          "IPNCHANGE",

        orderTrackingId:
          "",

        orderMerchantReference:
          merchantReference || "",

        status: 500
      },
      { status: 400 }
    );
  }

  try {
    const result =
      await verifyAndCredit(
        trackingId,
        env
      );

    /*
      PesaPal expects confirmation that
      the IPN was received.
    */

    return Response.json({
      orderNotificationType:
        "IPNCHANGE",

      orderTrackingId:
        trackingId,

      orderMerchantReference:
        merchantReference ||
        result.merchant_reference ||
        "",

      status: 200
    });
  } catch (error) {
    console.error(
      "PesaPal IPN error:",
      error
    );

    return Response.json(
      {
        orderNotificationType:
          "IPNCHANGE",

        orderTrackingId:
          trackingId,

        orderMerchantReference:
          merchantReference || "",

        status: 500
      },
      { status: 500 }
    );
  }
}

/* =========================
   REGISTER IPN
========================= */

async function registerIPN(env) {
  const token =
    await getPesaPalToken(env);

  const origin =
    env.APP_URL;

  if (!origin) {
    throw new Error(
      "APP_URL is not configured."
    );
  }

  const response =
    await fetch(
      `${PESAPAL_LIVE_URL}/api/URLSetup/RegisterIPN`,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${token}`,

          "Content-Type":
            "application/json",

          Accept:
            "application/json"
        },

        body: JSON.stringify({
          url:
            `${origin}/api/ipn`,

          ipn_notification_type:
            "GET"
        })
      }
    );

  return response.json();
}

/* =========================
   MAIN WORKER
========================= */

export default {
  async fetch(request, env) {
    const url =
      new URL(request.url);

    try {
      /* Create payment */

      if (
        request.method === "POST" &&
        url.pathname === "/api/payment"
      ) {
        return await createPayment(
          request,
          env
        );
      }

      /* Verify payment */

      if (
        request.method === "GET" &&
        url.pathname ===
          "/api/payment-status"
      ) {
        return await paymentStatus(
          request,
          env
        );
      }

      /* PesaPal IPN */

      if (
        url.pathname === "/api/ipn"
      ) {
        return await handleIPN(
          request,
          env
        );
      }

      /* Register IPN */

      if (
        url.pathname ===
        "/api/register-ipn"
      ) {
        const result =
          await registerIPN(env);

        return Response.json(
          result
        );
      }

      /* Get wallet balance */

      if (
        request.method === "GET" &&
        url.pathname ===
          "/api/wallet"
      ) {
        const phone =
          normalizePhone(
            url.searchParams.get(
              "phone"
            )
          );

        if (!phone) {
          return Response.json(
            {
              success: false,
              message:
                "Phone number is required."
            },
            { status: 400 }
          );
        }

        const wallet =
          await env.DB.prepare(
            `
            SELECT phone, balance
            FROM wallets
            WHERE phone = ?
            LIMIT 1
            `
          )
            .bind(phone)
            .first();

        return Response.json({
          success: true,
          phone,
          balance:
            Number(
              wallet?.balance || 0
            )
        });
      }

      /* Serve HUPPY CUBE frontend */

      return env.ASSETS.fetch(
        request
      );
    } catch (error) {
      console.error(
        "HUPPY CUBE Worker Error:",
        error
      );

      return Response.json(
        {
          success: false,
          message:
            error.message ||
            "Server error."
        },
        { status: 500 }
      );
    }
  }
};
