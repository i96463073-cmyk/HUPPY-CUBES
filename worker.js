const PESAPAL_BASE = "https://pay.pesapal.com/v3";
const DENZGAINS_BASE = "https://denzgains.com/api/v2";

const WHATSAPP_NUMBER = "254796681162";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function html(body, status = 200) {
  return new Response(
    `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>HUPPY CUBE</title>
</head>
<body style="margin:0;background:#090414;color:white;font-family:Arial,sans-serif">
${body}
</body>
</html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      }
    }
  );
}

/* ============================================================
   PESAPAL
============================================================ */

async function getPesapalToken(env) {
  if (
    !env.PESAPAL_CONSUMER_KEY ||
    !env.PESAPAL_CONSUMER_SECRET
  ) {
    throw new Error(
      "PesaPal credentials are not configured."
    );
  }

  const response = await fetch(
    `${PESAPAL_BASE}/api/Auth/RequestToken`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        consumer_key:
          env.PESAPAL_CONSUMER_KEY,
        consumer_secret:
          env.PESAPAL_CONSUMER_SECRET
      })
    }
  );

  const data = await response.json();

  if (!response.ok || !data.token) {
    console.error(
      "PesaPal authentication failed:",
      data
    );

    throw new Error(
      data?.message ||
      data?.error?.message ||
      "PesaPal authentication failed."
    );
  }

  return data.token;
}

async function createPesapalOrder(
  env,
  merchantReference,
  amount,
  serviceName,
  phone,
  callbackUrl,
  ipnId
) {
  const token =
    await getPesapalToken(env);

  const response = await fetch(
    `${PESAPAL_BASE}/api/Transactions/SubmitOrderRequest`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        id: merchantReference,
        currency: "KES",
        amount: Number(amount),
        description:
          `HUPPY CUBE - ${serviceName}`.slice(
            0,
            100
          ),
        callback_url: callbackUrl,
        cancellation_url: callbackUrl,
        notification_id: ipnId,
        billing_address: {
          phone_number: phone,
          country_code: "KE"
        }
      })
    }
  );

  const data =
    await response.json();

  if (
    !response.ok ||
    !data.redirect_url
  ) {
    console.error(
      "PesaPal order creation failed:",
      data
    );

    throw new Error(
      data?.message ||
      data?.error?.message ||
      "Unable to create PesaPal payment."
    );
  }

  return data;
}

async function getPesapalStatus(
  env,
  trackingId
) {
  const token =
    await getPesapalToken(env);

  const response = await fetch(
    `${PESAPAL_BASE}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(
      trackingId
    )}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      }
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    console.error(
      "PesaPal status error:",
      data
    );

    throw new Error(
      data?.message ||
      data?.error?.message ||
      "Unable to verify PesaPal payment."
    );
  }

  return data;
}

/* ============================================================
   DENZGAINS
============================================================ */

async function getDenzServices(env) {
  if (!env.DENZGAINS_API_KEY) {
    throw new Error(
      "DENZGAINS_API_KEY is not configured."
    );
  }

  const response = await fetch(
    `${DENZGAINS_BASE}?action=services&key=${encodeURIComponent(
      env.DENZGAINS_API_KEY
    )}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    }
  );

  const text =
    await response.text();

  if (!response.ok) {
    console.error(
      "DenzGains services error:",
      response.status,
      text.slice(0, 1000)
    );

    throw new Error(
      "Unable to contact DenzGains."
    );
  }

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    console.error(
      "Invalid DenzGains services response:",
      text.slice(0, 1000)
    );

    throw new Error(
      "DenzGains returned invalid data."
    );
  }

  if (!Array.isArray(data)) {
    console.error(
      "Unexpected DenzGains services response:",
      data
    );

    throw new Error(
      "Unexpected DenzGains services response."
    );
  }

  return data;
}

/*
 * Send an already-paid order to DenzGains.
 */
async function sendOrderToDenzGains(
  env,
  order
) {
  if (!env.DENZGAINS_API_KEY) {
    throw new Error(
      "DENZGAINS_API_KEY is not configured."
    );
  }

  const params =
    new URLSearchParams();

  params.set(
    "action",
    "add"
  );

  params.set(
    "service",
    String(order.service_id)
  );

  params.set(
    "link",
    String(order.link)
  );

  params.set(
    "quantity",
    String(order.quantity)
  );

  params.set(
    "key",
    env.DENZGAINS_API_KEY
  );

  const url =
    `${DENZGAINS_BASE}?${params.toString()}`;

  console.log(
    "Sending paid order to DenzGains:",
    {
      orderId: order.id,
      service: order.service_id,
      quantity: order.quantity
    }
  );

  const response =
    await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

  const text =
    await response.text();

  console.log(
    "DenzGains response:",
    {
      status: response.status,
      contentType:
        response.headers.get(
          "content-type"
        ),
      body:
        text.slice(0, 2000)
    }
  );

  if (!response.ok) {
    throw new Error(
      `DenzGains HTTP error ${response.status}: ${text.slice(
        0,
        500
      )}`
    );
  }

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `DenzGains returned non-JSON response: ${text.slice(
        0,
        500
      )}`
    );
  }

  if (
    !data ||
    !data.order
  ) {
    throw new Error(
      data?.error ||
      data?.message ||
      `DenzGains did not return an order ID. Response: ${text.slice(
        0,
        500
      )}`
    );
  }

  return String(
    data.order
  );
}

/* ============================================================
   PROCESS PAID ORDER
============================================================ */

async function processPaidOrder(
  env,
  trackingId
) {
  if (!trackingId) {
    throw new Error(
      "Missing PesaPal tracking ID."
    );
  }

  const payment =
    await env.DB.prepare(
      `SELECT *
       FROM direct_orders
       WHERE tracking_id = ?
       LIMIT 1`
    )
      .bind(trackingId)
      .first();

  if (!payment) {
    throw new Error(
      "Order was not found."
    );
  }

  /*
   * Already submitted.
   */
  if (
    payment.supplier_order_id
  ) {
    return {
      success: true,
      orderId: payment.id,
      supplierOrderId:
        payment.supplier_order_id,
      paymentStatus:
        payment.payment_status,
      orderStatus:
        payment.order_status
    };
  }

  /*
   * Verify payment directly with PesaPal.
   */
  const status =
    await getPesapalStatus(
      env,
      trackingId
    );

  const statusCode =
    Number(
      status.status_code || 0
    );

  const paidAmount =
    Number(
      status.amount || 0
    );

  const expectedAmount =
    Number(
      payment.amount || 0
    );

  const currency =
    String(
      status.currency || ""
    ).toUpperCase();

  if (
    status.merchant_reference &&
    status.merchant_reference !==
      payment.merchant_reference
  ) {
    throw new Error(
      "PesaPal merchant reference mismatch."
    );
  }

  if (
    currency &&
    currency !== "KES"
  ) {
    throw new Error(
      "PesaPal currency mismatch."
    );
  }

  if (
    statusCode === 1 &&
    Math.round(paidAmount) !==
      Math.round(expectedAmount)
  ) {
    throw new Error(
      `PesaPal amount mismatch: expected ${Math.round(
        expectedAmount
      )} KES, received ${Math.round(
        paidAmount
      )} KES.`
    );
  }

  /*
   * Payment not completed.
   */
  if (statusCode !== 1) {
    let paymentStatus =
      "PENDING";

    if (statusCode === 2) {
      paymentStatus =
        "FAILED";
    } else if (
      statusCode === 3
    ) {
      paymentStatus =
        "REVERSED";
    } else if (
      statusCode === 0
    ) {
      paymentStatus =
        "INVALID";
    }

    await env.DB.prepare(
      `UPDATE direct_orders
       SET payment_status = ?,
           order_status = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(
        paymentStatus,
        paymentStatus ===
          "PENDING"
          ? "Awaiting Payment"
          : "Payment Failed",
        payment.id
      )
      .run();

    return {
      success: false,
      orderId: payment.id,
      supplierOrderId: null,
      paymentStatus,
      orderStatus:
        paymentStatus ===
        "PENDING"
          ? "Awaiting Payment"
          : "Payment Failed"
    };
  }

  /*
   * Payment confirmed.
   *
   * Claim order first to prevent duplicate
   * supplier submissions.
   */
  const claim =
    await env.DB.prepare(
      `UPDATE direct_orders
       SET payment_status = 'COMPLETED',
           order_status = 'Submitting',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND supplier_order_id IS NULL
         AND order_status != 'Submitting'`
    )
      .bind(payment.id)
      .run();

  if (
    !claim.meta ||
    claim.meta.changes !== 1
  ) {
    const latest =
      await env.DB.prepare(
        `SELECT *
         FROM direct_orders
         WHERE id = ?
         LIMIT 1`
      )
        .bind(payment.id)
        .first();

    return {
      success:
        Boolean(
          latest?.supplier_order_id
        ),
      orderId: payment.id,
      supplierOrderId:
        latest?.supplier_order_id ||
        null,
      paymentStatus:
        latest?.payment_status ||
        "COMPLETED",
      orderStatus:
        latest?.order_status ||
        "Submitting"
    };
  }

  /*
   * Send order to DenzGains.
   */
  try {
    const supplierOrderId =
      await sendOrderToDenzGains(
        env,
        payment
      );

    await env.DB.prepare(
      `UPDATE direct_orders
       SET supplier_order_id = ?,
           order_status = 'Processing',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(
        supplierOrderId,
        payment.id
      )
      .run();

    console.log(
      "DenzGains order created:",
      {
        customerOrderId:
          payment.id,
        supplierOrderId
      }
    );

    return {
      success: true,
      orderId: payment.id,
      supplierOrderId,
      paymentStatus:
        "COMPLETED",
      orderStatus:
        "Processing"
    };
  } catch (error) {
    console.error(
      "DenzGains submission failed:",
      error
    );

    await env.DB.prepare(
      `UPDATE direct_orders
       SET order_status = 'Payment Completed - Supplier Error',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(payment.id)
      .run();

    throw error;
  }
}

/* ============================================================
   CREATE CUSTOMER PAYMENT
============================================================ */

async function handleOrderPayment(
  request,
  env
) {
  let body;

  try {
    body =
      await request.json();
  } catch {
    return json(
      {
        error:
          "Invalid JSON request."
      },
      400
    );
  }

  const serviceId =
    Number(
      body?.service_id
    );

  const quantity =
    Number(
      body?.quantity
    );

  const link =
    String(
      body?.link || ""
    ).trim();

  const phone =
    String(
      body?.phone || ""
    ).trim();

  if (
    !Number.isInteger(
      serviceId
    ) ||
    serviceId <= 0
  ) {
    return json(
      {
        error:
          "Invalid service."
      },
      400
    );
  }

  if (
    !Number.isInteger(
      quantity
    ) ||
    quantity <= 0
  ) {
    return json(
      {
        error:
          "Invalid quantity."
      },
      400
    );
  }

  if (!link) {
    return json(
      {
        error:
          "Target link is required."
      },
      400
    );
  }

  if (!phone) {
    return json(
      {
        error:
          "Phone number is required."
      },
      400
    );
  }

  const services =
    await getDenzServices(
      env
    );

  const service =
    services.find(
      (item) =>
        Number(item.service) ===
        serviceId
    );

  if (!service) {
    return json(
      {
        error:
          "Selected service is no longer available."
      },
      400
    );
  }

  const min =
    Number(
      service.min || 0
    );

  const max =
    Number(
      service.max || 0
    );

  const supplierRate =
    Number(
      service.rate || 0
    );

  if (
    quantity < min
  ) {
    return json(
      {
        error:
          `Minimum quantity is ${min.toLocaleString()}.`
      },
      400
    );
  }

  if (
    max > 0 &&
    quantity > max
  ) {
    return json(
      {
        error:
          `Maximum quantity is ${max.toLocaleString()}.`
      },
      400
    );
  }

  if (
    !supplierRate ||
    supplierRate <= 0
  ) {
    return json(
      {
        error:
          "Service price is currently unavailable."
      },
      400
    );
  }

  /*
   * CUSTOMER PRICE = SUPPLIER RATE × 2
   */
  const customerRate =
    supplierRate * 2;

  /*
   * Price per 1,000 units.
   */
  const amount =
    Math.round(
      (customerRate *
        quantity) /
        1000
    );

  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {
    return json(
      {
        error:
          "Invalid order amount."
      },
      400
    );
  }

  const merchantReference =
    `HC-${Date.now()}-${crypto
      .randomUUID()
      .slice(0, 8)}`;

  const origin =
    new URL(
      request.url
    ).origin;

  const appUrl =
    String(
      env.APP_URL ||
        origin
    ).replace(
      /\/$/,
      ""
    );

  const callbackUrl =
    `${appUrl}/api/payment-callback`;

  if (!env.PESAPAL_IPN_ID) {
    return json(
      {
        error:
          "PESAPAL_IPN_ID is not configured. Register your IPN URL first."
      },
      500
    );
  }

  /*
   * Save order BEFORE creating PesaPal payment.
   */
  await env.DB.prepare(
    `INSERT INTO direct_orders (
      merchant_reference,
      phone,
      service_id,
      service_name,
      link,
      quantity,
      supplier_rate,
      customer_rate,
      amount,
      payment_status,
      order_status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'Awaiting Payment')`
  )
    .bind(
      merchantReference,
      phone,
      serviceId,
      String(
        service.name ||
          body.service_name ||
          "Service"
      ),
      link,
      quantity,
      supplierRate,
      customerRate,
      amount
    )
    .run();

  let pesapal;

  try {
    pesapal =
      await createPesapalOrder(
        env,
        merchantReference,
        amount,
        String(
          service.name ||
            "Service"
        ),
        phone,
        callbackUrl,
        env.PESAPAL_IPN_ID
      );
  } catch (error) {
    await env.DB.prepare(
      `UPDATE direct_orders
       SET order_status = 'Payment Creation Failed',
           updated_at = CURRENT_TIMESTAMP
       WHERE merchant_reference = ?`
    )
      .bind(
        merchantReference
      )
      .run();

    throw error;
  }

  const trackingId =
    pesapal.order_tracking_id;

  await env.DB.prepare(
    `UPDATE direct_orders
     SET tracking_id = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE merchant_reference = ?`
  )
    .bind(
      trackingId,
      merchantReference
    )
    .run();

  /*
   * IMPORTANT:
   * The frontend receives tracking_id here.
   * It should keep this value and use it for
   * automatic customer tracking.
   */
  return json({
    success: true,

    merchant_reference:
      merchantReference,

    tracking_id:
      trackingId,

    order_id:
      null,

    amount,

    redirect_url:
      pesapal.redirect_url,

    whatsapp:
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
        `Hello HUPPY CUBE, I need help with my order. Tracking ID: ${trackingId}`
      )}`
  });
}

/* ============================================================
   CUSTOMER ORDER STATUS
============================================================ */

async function handleOrderStatus(
  request,
  env
) {
  const url =
    new URL(
      request.url
    );

  const trackingId =
    String(
      url.searchParams.get(
        "tracking_id"
      ) || ""
    ).trim();

  if (!trackingId) {
    return json(
      {
        success: false,
        error:
          "Missing tracking ID."
      },
      400
    );
  }

  const order =
    await env.DB.prepare(
      `SELECT
        id,
        tracking_id,
        merchant_reference,
        service_name,
        quantity,
        payment_status,
        order_status,
        supplier_order_id,
        created_at,
        updated_at
       FROM direct_orders
       WHERE tracking_id = ?
       LIMIT 1`
    )
      .bind(trackingId)
      .first();

  if (!order) {
    return json(
      {
        success: false,
        error:
          "Order not found."
      },
      404
    );
  }

  const paymentStatus =
    String(
      order.payment_status ||
        "PENDING"
    );

  const orderStatus =
    String(
      order.order_status ||
        "Awaiting Payment"
    );

  const hasSupplierOrder =
    Boolean(
      order.supplier_order_id
    );

  /*
   * Determine customer-facing stage.
   */
  let currentStep = 1;
  let progress = 25;

  if (
    paymentStatus ===
      "COMPLETED"
  ) {
    currentStep = 2;
    progress = 50;
  }

  if (
    hasSupplierOrder ||
    orderStatus ===
      "Processing"
  ) {
    currentStep = 3;
    progress = 75;
  }

  if (
    orderStatus ===
      "Completed"
  ) {
    currentStep = 4;
    progress = 100;
  }

  /*
   * Handle payment failures.
   */
  if (
    paymentStatus ===
      "FAILED" ||
    paymentStatus ===
      "REVERSED" ||
    paymentStatus ===
      "INVALID"
  ) {
    currentStep = 1;
    progress = 0;
  }

  /*
   * Handle supplier error.
   */
  if (
    orderStatus ===
      "Payment Completed - Supplier Error"
  ) {
    currentStep = 2;
    progress = 50;
  }

  const whatsappMessage =
    `Hello HUPPY CUBE, I need help with my order. Tracking ID: ${trackingId}`;

  return json({
    success: true,

    order: {
      id: order.id,

      tracking_id:
        order.tracking_id,

      service_name:
        order.service_name,

      quantity:
        Number(
          order.quantity || 0
        ),

      payment_status:
        paymentStatus,

      order_status:
        orderStatus,

      supplier_order_id:
        order.supplier_order_id ||
        null,

      created_at:
        order.created_at,

      updated_at:
        order.updated_at
    },

    tracking: {
      current_step:
        currentStep,

      progress,

      payment_received:
        paymentStatus ===
        "COMPLETED",

      order_submitted:
        Boolean(
          order.supplier_order_id
        ),

      processing:
        orderStatus ===
          "Processing",

      completed:
        orderStatus ===
          "Completed"
    },

    whatsapp: {
      number:
        WHATSAPP_NUMBER,

      url:
        `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
          whatsappMessage
        )}`
    }
  });
}

/* ============================================================
   PAYMENT CALLBACK
============================================================ */

async function handlePaymentCallback(
  request,
  env
) {
  const url =
    new URL(
      request.url
    );

  const trackingId =
    url.searchParams.get(
      "OrderTrackingId"
    ) ||
    url.searchParams.get(
      "orderTrackingId"
    );

  const merchantReference =
    url.searchParams.get(
      "OrderMerchantReference"
    ) ||
    url.searchParams.get(
      "orderMerchantReference"
    );

  if (!trackingId) {
    return html(
      `
      <div style="
        max-width:600px;
        margin:80px auto;
        padding:30px;
        text-align:center
      ">

        <h1>Payment Status</h1>

        <p>
          Payment tracking information
          was not received.
        </p>

        <a
          href="/"
          style="color:#8b5cf6"
        >
          Return to HUPPY CUBE
        </a>

      </div>
      `,
      400
    );
  }

  if (merchantReference) {
    await env.DB.prepare(
      `UPDATE direct_orders
       SET tracking_id =
           COALESCE(
             tracking_id,
             ?
           ),
           updated_at =
             CURRENT_TIMESTAMP
       WHERE merchant_reference = ?`
    )
      .bind(
        trackingId,
        merchantReference
      )
      .run();
  }

  try {
    const result =
      await processPaidOrder(
        env,
        trackingId
      );

    /*
     * Successful supplier submission.
     */
    if (
      result.success &&
      result.supplierOrderId
    ) {
      const whatsappUrl =
        `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
          `Hello HUPPY CUBE, I need help with my order. Tracking ID: ${trackingId}`
        )}`;

      return html(`
        <div style="
          max-width:650px;
          margin:50px auto;
          padding:30px 20px;
          text-align:center
        ">

          <div style="
            font-size:64px;
            color:#22c55e
          ">
            ✓
          </div>

          <h1 style="
            color:#a78bfa
          ">
            Order Successful
          </h1>

          <p>
            Your payment was verified and
            your order was sent to the supplier.
          </p>

          <div style="
            margin:25px 0;
            padding:24px;
            background:#160d27;
            border-radius:16px;
            text-align:left
          ">

            <p>
              <strong>HUPPY CUBE Order</strong>
            </p>

            <h2>
              #${result.orderId}
            </h2>

            <p>
              <strong>Tracking ID</strong>
            </p>

            <p style="
              word-break:break-all;
              color:#c4b5fd
            ">
              ${escapeHtml(trackingId)}
            </p>

            <p>
              <strong>Supplier Order ID</strong>
            </p>

            <h2>
              ${escapeHtml(
                result.supplierOrderId
              )}
            </h2>

            <p>
              <strong>Status</strong>
            </p>

            <p style="
              color:#22c55e;
              font-weight:bold
            ">
              Processing
            </p>

          </div>

          <a
            href="/api/order-status?tracking_id=${encodeURIComponent(
              trackingId
            )}"
            style="
              display:inline-block;
              margin:6px;
              padding:14px 22px;
              background:#7c3aed;
              color:white;
              text-decoration:none;
              border-radius:12px
            "
          >
            Track My Order
          </a>

          <a
            href="${whatsappUrl}"
            target="_blank"
            rel="noopener"
            style="
              display:inline-block;
              margin:6px;
              padding:14px 22px;
              background:#16a34a;
              color:white;
              text-decoration:none;
              border-radius:12px
            "
          >
            WhatsApp Help
          </a>

          <br><br>

          <a
            href="/"
            style="color:#a78bfa"
          >
            Order Another Service
          </a>

        </div>
      `);
    }

    /*
     * Payment still pending.
     */
    if (
      result.paymentStatus ===
      "PENDING"
    ) {
      return html(`
        <div style="
          max-width:600px;
          margin:80px auto;
          padding:30px;
          text-align:center
        ">

          <h1>
            Payment Pending
          </h1>

          <p>
            Your payment is still being processed.
            Please wait a moment.
          </p>

          <p>
            Your tracking ID:
          </p>

          <p style="
            color:#a78bfa;
            word-break:break-all
          ">
            ${escapeHtml(
              trackingId
            )}
          </p>

          <a
            href="/api/order-status?tracking_id=${encodeURIComponent(
              trackingId
            )}"
            style="
              display:inline-block;
              padding:14px 22px;
              background:#7c3aed;
              color:white;
              text-decoration:none;
              border-radius:12px
            "
          >
            Check Order Status
          </a>

          <br><br>

          <a
            href="/"
            style="color:#a78bfa"
          >
            Return to HUPPY CUBE
          </a>

        </div>
      `);
    }

    /*
     * Payment not completed.
     */
    return html(`
      <div style="
        max-width:600px;
        margin:80px auto;
        padding:30px;
        text-align:center
      ">

        <h1>
          Payment Not Completed
        </h1>

        <p>
          Your payment was not completed successfully.
        </p>

        <p>
          Tracking ID:
        </p>

        <p style="
          color:#a78bfa;
          word-break:break-all
        ">
          ${escapeHtml(
            trackingId
          )}
        </p>

        <a
          href="/"
          style="color:#a78bfa"
        >
          Return to HUPPY CUBE
        </a>

      </div>
    `);

  } catch (error) {
    console.error(
      "Payment callback error:",
      error
    );

    /*
     * IMPORTANT:
     * Do not tell the customer the supplier
     * API key or internal error details.
     */
    return html(`
      <div style="
        max-width:600px;
        margin:80px auto;
        padding:30px;
        text-align:center
      ">

        <h1>
          Payment Received
        </h1>

        <p>
          Your payment is being verified.
        </p>

        <p>
          Your order has been recorded.
          Please check the tracking page shortly.
        </p>

        <a
          href="/api/order-status?tracking_id=${encodeURIComponent(
            trackingId
          )}"
          style="
            display:inline-block;
            padding:14px 22px;
            background:#7c3aed;
            color:white;
            text-decoration:none;
            border-radius:12px
          "
        >
          Track My Order
        </a>

        <br><br>

        <a
          href="https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
            `Hello HUPPY CUBE, I need help with my order. Tracking ID: ${trackingId}`
          )}"
          target="_blank"
          rel="noopener"
          style="
            display:inline-block;
            padding:14px 22px;
            background:#16a34a;
            color:white;
            text-decoration:none;
            border-radius:12px
          "
        >
          WhatsApp Help
        </a>

      </div>
    `);
  }
}

/* ============================================================
   PESAPAL IPN
============================================================ */

async function handlePesapalIPN(
  request,
  env
) {
  const url =
    new URL(
      request.url
    );

  let trackingId =
    url.searchParams.get(
      "OrderTrackingId"
    ) ||
    url.searchParams.get(
      "orderTrackingId"
    );

  let merchantReference =
    url.searchParams.get(
      "OrderMerchantReference"
    ) ||
    url.searchParams.get(
      "orderMerchantReference"
    );

  if (
    request.method ===
    "POST"
  ) {
    const contentType =
      request.headers.get(
        "content-type"
      ) || "";

    try {
      if (
        contentType.includes(
          "application/json"
        )
      ) {
        const body =
          await request.json();

        trackingId =
          trackingId ||
          body.OrderTrackingId ||
          body.orderTrackingId;

        merchantReference =
          merchantReference ||
          body.OrderMerchantReference ||
          body.orderMerchantReference;
      }
    } catch (error) {
      console.error(
        "Could not parse PesaPal IPN body:",
        error
      );
    }
  }

  if (
    merchantReference &&
    trackingId
  ) {
    await env.DB.prepare(
      `UPDATE direct_orders
       SET tracking_id =
           COALESCE(
             tracking_id,
             ?
           ),
           updated_at =
             CURRENT_TIMESTAMP
       WHERE merchant_reference = ?`
    )
      .bind(
        trackingId,
        merchantReference
      )
      .run();
  }

  if (trackingId) {
    try {
      await processPaidOrder(
        env,
        trackingId
      );
    } catch (error) {
      console.error(
        "PesaPal IPN processing error:",
        error
      );
    }
  }

  return json({
    orderNotificationType:
      "IPNCHANGE",

    orderTrackingId:
      trackingId || "",

    orderMerchantReference:
      merchantReference || "",

    status: 200
  });
}

/* ============================================================
   TEST EXISTING ORDER #8
============================================================ */

async function handleTestOrder8(
  request,
  env
) {
  if (
    !env.TEST_ORDER_SECRET
  ) {
    return html(
      `
      <div style="
        max-width:600px;
        margin:80px auto;
        padding:30px;
        text-align:center
      ">

        <h1>
          Test Endpoint Not Configured
        </h1>

        <p>
          TEST_ORDER_SECRET is not configured
          in Cloudflare.
        </p>

      </div>
      `,
      500
    );
  }

  const url =
    new URL(
      request.url
    );

  const suppliedSecret =
    url.searchParams.get(
      "secret"
    ) || "";

  if (
    suppliedSecret !==
    env.TEST_ORDER_SECRET
  ) {
    return html(
      `
      <div style="
        max-width:600px;
        margin:80px auto;
        padding:30px;
        text-align:center
      ">

        <h1>
          Access Denied
        </h1>

        <p>
          Invalid test secret.
        </p>

      </div>
      `,
      403
    );
  }

  /*
   * FIXED TO EXISTING ORDER #8.
   *
   * This does NOT create another PesaPal payment.
   */
  const orderId = 8;

  const order =
    await env.DB.prepare(
      `SELECT *
       FROM direct_orders
       WHERE id = ?
       LIMIT 1`
    )
      .bind(orderId)
      .first();

  if (!order) {
    return html(
      `
      <div style="
        max-width:600px;
        margin:80px auto;
        padding:30px;
        text-align:center
      ">

        <h1>
          Order Not Found
        </h1>

        <p>
          HUPPY CUBE order #8 does not exist.
        </p>

      </div>
      `,
      404
    );
  }

  /*
   * Never submit twice if supplier order
   * already exists.
   */
  if (
    order.supplier_order_id
  ) {
    return html(`
      <div style="
        max-width:600px;
        margin:60px auto;
        padding:35px;
        text-align:center
      ">

        <div style="
          font-size:60px;
          color:#22c55e
        ">
          ✓
        </div>

        <h1 style="
          color:#a78bfa
        ">
          Order Already Submitted
        </h1>

        <p>
          HUPPY CUBE Order #8 already
          has a supplier order.
        </p>

        <div style="
          margin:25px 0;
          padding:20px;
          background:#160d27;
          border-radius:16px
        ">

          <p>
            HUPPY CUBE Order
          </p>

          <h2>
            #8
          </h2>

          <p>
            Supplier Order ID
          </p>

          <h2>
            ${escapeHtml(
              order.supplier_order_id
            )}
          </h2>

          <p>
            Status:
            ${escapeHtml(
              order.order_status ||
                ""
            )}
          </p>

        </div>

      </div>
    `);
  }

  /*
   * Existing paid order must have
   * PesaPal tracking ID.
   */
  if (
    !order.tracking_id
  ) {
    return html(
      `
      <div style="
        max-width:600px;
        margin:60px auto;
        padding:35px;
        text-align:center
      ">

        <h1>
          Missing PesaPal Tracking ID
        </h1>

        <p>
          Order #8 exists, but it does not
          have a PesaPal tracking ID.
        </p>

        <div style="
          margin:25px 0;
          padding:20px;
          background:#160d27;
          border-radius:16px
        ">

          <p>
            Order
          </p>

          <h2>
            #8
          </h2>

          <p>
            Payment Status
          </p>

          <h3>
            ${escapeHtml(
              order.payment_status ||
                ""
            )}
          </h3>

        </div>

      </div>
      `,
      400
    );
  }

  try {
    const result =
      await processPaidOrder(
        env,
        order.tracking_id
      );

    if (
      result.success &&
      result.supplierOrderId
    ) {
      return html(`
        <div style="
          max-width:600px;
          margin:60px auto;
          padding:35px;
          text-align:center
        ">

          <div style="
            font-size:70px;
            color:#22c55e
          ">
            ✓
          </div>

          <h1 style="
            color:#a78bfa
          ">
            Order Successful
          </h1>

          <p>
            Existing paid order #8 was
            verified and sent to DenzGains.
          </p>

          <div style="
            margin:25px 0;
            padding:24px;
            background:#160d27;
            border-radius:16px
          ">

            <p>
              HUPPY CUBE Order
            </p>

            <h2>
              #${result.orderId}
            </h2>

            <p>
              Supplier Order ID
            </p>

            <h2>
              ${escapeHtml(
                result.supplierOrderId
              )}
            </h2>

            <p>
              Status
            </p>

            <h3 style="
              color:#22c55e
            ">
              Processing
            </h3>

          </div>

          <a
            href="/api/order-status?tracking_id=${encodeURIComponent(
              order.tracking_id
            )}"
            style="
              display:inline-block;
              padding:14px 22px;
              background:#7c3aed;
              color:white;
              text-decoration:none;
              border-radius:12px
            "
          >
            Track Order
          </a>

        </div>
      `);
    }

    if (
      result.paymentStatus ===
      "PENDING"
    ) {
      return html(`
        <div style="
          max-width:600px;
          margin:80px auto;
          padding:30px;
          text-align:center
        ">

          <h1>
            Payment Pending
          </h1>

          <p>
            PesaPal has not confirmed
            the payment yet.
          </p>

          <p>
            Order #8 has NOT been
            sent to DenzGains.
          </p>

        </div>
      `);
    }

    return html(`
      <div style="
        max-width:600px;
        margin:80px auto;
        padding:30px;
        text-align:center
      ">

        <h1>
          Order Not Submitted
        </h1>

        <p>
          The payment verification did
          not return a completed payment.
        </p>

        <p>
          Payment status:
          ${escapeHtml(
            result.paymentStatus ||
              ""
          )}
        </p>

      </div>
    `);

  } catch (error) {
    console.error(
      "Test order #8 failed:",
      error
    );

    return html(
      `
      <div style="
        max-width:650px;
        margin:60px auto;
        padding:35px;
        text-align:center
      ">

        <div style="
          font-size:60px;
          color:#ef4444
        ">
          ✕
        </div>

        <h1>
          Order Test Failed
        </h1>

        <p>
          The existing order #8 could not
          be submitted to DenzGains.
        </p>

        <div style="
          margin:25px 0;
          padding:20px;
          background:#160d27;
          border-radius:16px;
          text-align:left
        ">

          <p>
            <strong>Order:</strong>
            #8
          </p>

          <p>
            <strong>Error:</strong>
          </p>

          <pre style="
            white-space:pre-wrap;
            color:#fca5a5
          ">${escapeHtml(
            error?.message ||
              "Unknown error"
          )}</pre>

        </div>

        <p>
          Check the Cloudflare Worker
          logs for the complete response.
        </p>

      </div>
      `,
      500
    );
  }
}

/* ============================================================
   HTML ESCAPE
============================================================ */

function escapeHtml(
  value
) {
  return String(value)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}

/* ============================================================
   MAIN WORKER
============================================================ */

export default {
  async fetch(
    request,
    env
  ) {
    try {
      const url =
        new URL(
          request.url
        );

      /*
       * ======================================================
       * TEST EXISTING ORDER #8
       * ======================================================
       *
       * Does NOT create a new payment.
       */
      if (
        url.pathname ===
          "/api/test-order/8" &&
        request.method ===
          "GET"
      ) {
        return await handleTestOrder8(
          request,
          env
        );
      }

      /*
       * ======================================================
       * GET SERVICES
       * ======================================================
       */
      if (
        url.pathname ===
          "/api/services" &&
        request.method ===
          "GET"
      ) {
        const data =
          await getDenzServices(
            env
          );

        const services =
          data
            .map(
              (service) => {
                const supplierRate =
                  Number(
                    service.rate ||
                      0
                  );

                return {
                  service_id:
                    Number(
                      service.service
                    ),

                  name:
                    String(
                      service.name ||
                        ""
                    ),

                  type:
                    service.type ||
                    "",

                  category:
                    service.category ||
                    "",

                  supplier_rate:
                    supplierRate,

                  customer_rate:
                    supplierRate *
                    2,

                  min_quantity:
                    Number(
                      service.min ||
                        0
                    ),

                  max_quantity:
                    Number(
                      service.max ||
                        0
                    ),

                  refill:
                    service.refill
                      ? 1
                      : 0,

                  cancel:
                    service.cancel
                      ? 1
                      : 0,

                  active: 1
                };
              }
            )
            .filter(
              (service) =>
                service.service_id &&
                service.name &&
                service.customer_rate >
                  0
            );

        return json({
          services
        });
      }

      /*
       * ======================================================
       * CREATE PAYMENT
       * ======================================================
       */
      if (
        url.pathname ===
          "/api/order-payment" &&
        request.method ===
          "POST"
      ) {
        return await handleOrderPayment(
          request,
          env
        );
      }

      /*
       * ======================================================
       * CUSTOMER ORDER STATUS
       * ======================================================
       */
      if (
        url.pathname ===
          "/api/order-status" &&
        request.method ===
          "GET"
      ) {
        return await handleOrderStatus(
          request,
          env
        );
      }

      /*
       * ======================================================
       * PESAPAL CALLBACK
       * ======================================================
       */
      if (
        url.pathname ===
          "/api/payment-callback" &&
        request.method ===
          "GET"
      ) {
        return await handlePaymentCallback(
          request,
          env
        );
      }

      /*
       * ======================================================
       * PESAPAL IPN
       * ======================================================
       */
      if (
        url.pathname ===
          "/api/pesapal-ipn" &&
        (
          request.method ===
            "GET" ||
          request.method ===
            "POST"
        )
      ) {
        return await handlePesapalIPN(
          request,
          env
        );
      }

      /*
       * ======================================================
       * UNKNOWN API ROUTE
       * ======================================================
       */
      if (
        url.pathname.startsWith(
          "/api/"
        )
      ) {
        return json(
          {
            error:
              "API route not found."
          },
          404
        );
      }

      /*
       * ======================================================
       * FRONTEND ASSETS
       * ======================================================
       */
      return await env.ASSETS.fetch(
        request
      );

    } catch (error) {
      console.error(
        "WORKER ERROR:",
        error
      );

      return json(
        {
          error:
            error?.message ||
            "Internal server error."
        },
        500
      );
    }
  }
};
