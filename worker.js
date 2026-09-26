const PESAPAL_LIVE_URL = "https://pay.pesapal.com/v3";

async function getPesaPalToken(env) {
  const response = await fetch(`${PESAPAL_LIVE_URL}/api/Auth/RequestToken`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      consumer_key: env.PESAPAL_CONSUMER_KEY,
      consumer_secret: env.PESAPAL_CONSUMER_SECRET
    })
  });

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

async function createPayment(request, env) {
  const body = await request.json();

  const amount = Number(body.amount);
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim();
  const firstName = String(body.firstName || "HUPPY").trim();
  const lastName = String(body.lastName || "CUSTOMER").trim();

  if (!amount || amount <= 0) {
    return Response.json(
      { success: false, message: "Invalid payment amount" },
      { status: 400 }
    );
  }

  if (!phone) {
    return Response.json(
      { success: false, message: "Phone number is required" },
      { status: 400 }
    );
  }

  const token = await getPesaPalToken(env);

  const origin = new URL(request.url).origin;

  const reference =
    "HUPPY-" +
    Date.now() +
    "-" +
    crypto.randomUUID().slice(0, 8).toUpperCase();

  const paymentRequest = {
    id: reference,
    currency: "KES",
    amount,
    description: "HUPPY CUBE Wallet Deposit",
    callback_url: `${origin}/payment-success`,
    notification_id: env.PESAPAL_IPN_ID,

    billing_address: {
      email_address: email || "customer@huppycube.com",
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
    return Response.json(
      {
        success: false,
        message:
          data.error?.message ||
          data.message ||
          "PesaPal payment could not be created",
        pesapal: data
      },
      { status: 400 }
    );
  }

  return Response.json({
    success: true,
    reference,
    order_tracking_id: data.order_tracking_id,
    redirect_url: data.redirect_url
  });
}

async function paymentStatus(request, env) {
  const url = new URL(request.url);
  const trackingId = url.searchParams.get("tracking_id");

  if (!trackingId) {
    return Response.json(
      {
        success: false,
        message: "tracking_id is required"
      },
      { status: 400 }
    );
  }

  const token = await getPesaPalToken(env);

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

  const data = await response.json();

  return Response.json({
    success: response.ok,
    status: data
  });
}

async function registerIPN(env) {
  const token = await getPesaPalToken(env);

  const origin = env.APP_URL;

  const response = await fetch(
    `${PESAPAL_LIVE_URL}/api/URLSetup/RegisterIPN`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        url: `${origin}/api/ipn`,
        ipn_notification_type: "GET"
      })
    }
  );

  return response.json();
}

async function handleIPN(request, env) {
  const url = new URL(request.url);

  const trackingId = url.searchParams.get("OrderTrackingId");
  const merchantReference = url.searchParams.get("OrderMerchantReference");

  if (!trackingId) {
    return new Response("Missing OrderTrackingId", {
      status: 400
    });
  }

  console.log("PesaPal IPN received", {
    trackingId,
    merchantReference
  });

  /*
    IMPORTANT:

    The IPN notification itself is not treated as proof
    that money was successfully paid.

    The transaction must be verified through
    GetTransactionStatus.
  */

  const token = await getPesaPalToken(env);

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

  const status = await response.json();

  console.log("Verified PesaPal transaction:", status);

  return new Response("OK", {
    status: 200
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (request.method === "POST" && url.pathname === "/api/payment") {
        return await createPayment(request, env);
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/payment-status"
      ) {
        return await paymentStatus(request, env);
      }

      if (url.pathname === "/api/ipn") {
        return await handleIPN(request, env);
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/register-ipn"
      ) {
        const result = await registerIPN(env);
        return Response.json(result);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);

      return Response.json(
        {
          success: false,
          message: error.message || "Server error"
        },
        { status: 500 }
      );
    }
  }
};
