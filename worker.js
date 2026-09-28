const PESAPAL_BASE = "https://pay.pesapal.com/v3";
const DENZGAINS_BASE = "https://denzgains.com/api/v2";

const FRONTEND_URL = "https://huppy-cubes.i96463073.workers.dev";
const WHATSAPP_NUMBER = "254796681162";

/* -------------------------------------------------------
   BASIC HELPERS
------------------------------------------------------- */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "Content-Type, Authorization"
    }
  });
}

function redirect(url, status = 302) {
  return new Response(null, {
    status,
    headers: {
      Location: url,
      "Cache-Control": "no-store"
    }
  });
}

function corsResponse(response) {
  const headers = new Headers(response.headers);

  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set(
    "access-control-allow-headers",
    "Content-Type, Authorization"
  );

  return new Response(response.body, {
    status: response.status,
    headers
  });
}

function now() {
  return new Date().toISOString();
}

function makeMerchantReference() {
  return `HUPPY-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function makeTrackingId() {
  return `HC-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function getWhatsAppUrl(trackingId = "") {
  const message = trackingId
    ? `Hello HUPPY CUBE, I need help with order ${trackingId}`
    : "Hello HUPPY CUBE, I need help with my order.";

  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    message
  )}`;
}

/* -------------------------------------------------------
   PESAPAL
------------------------------------------------------- */

async function getPesapalToken(env) {
  const response = await fetch(
    `${PESAPAL_BASE}/api/Auth/RequestToken`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        consumer_key: env.PESAPAL_CONSUMER_KEY,
        consumer_secret: env.PESAPAL_CONSUMER_SECRET
      })
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.token) {
    throw new Error(
      `PesaPal authentication failed: HTTP ${response.status} ${JSON.stringify(
        data
      )}`
    );
  }

  return data.token;
}

async function createPesapalOrder(env, order) {
  const token = await getPesapalToken(env);

  const payload = {
    id: order.merchant_reference,
    currency: "KES",
    amount: Number(order.amount),
    description: `HUPPY CUBE - ${order.service_name}`,
    callback_url: `${FRONTEND_URL}/api/pesapal/callback`,
    notification_id: env.PESAPAL_IPN_ID,
    redirect_mode: "TOP_WINDOW",

    billing_address: {
      email_address:
        order.email || "customer@huppycube.com",
      phone_number: order.phone,
      country_code: "KE",
      first_name: order.full_name || "HUPPY",
      middle_name: "",
      last_name: "CUSTOMER",
      line_1: "",
      line_2: "",
      city: "",
      state: "",
      postal_code: "",
      zip_code: ""
    }
  };

  const response = await fetch(
    `${PESAPAL_BASE}/api/Transactions/SubmitOrderRequest`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.redirect_url) {
    throw new Error(
      `PesaPal order creation failed: HTTP ${response.status} ${JSON.stringify(
        data
      )}`
    );
  }

  return data;
}

async function getPesapalStatus(env, orderTrackingId) {
  if (!orderTrackingId) {
    throw new Error("Missing PesaPal order tracking ID");
  }

  const token = await getPesapalToken(env);

  const url =
    `${PESAPAL_BASE}/api/Transactions/GetTransactionStatus` +
    `?orderTrackingId=${encodeURIComponent(orderTrackingId)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `PesaPal status check failed: HTTP ${response.status} ${JSON.stringify(
        data
      )}`
    );
  }

  return data;
}

/* -------------------------------------------------------
   DENZGAINS
------------------------------------------------------- */

async function getDenzServices(env) {
  const url =
    `${DENZGAINS_BASE}/?action=services` +
    `&key=${encodeURIComponent(env.DENZGAINS_API_KEY)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  const data = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(
      `DenzGains services request failed: HTTP ${response.status} ${JSON.stringify(
        data
      )}`
    );
  }

  return data;
}

async function sendOrderToDenzGains(env, order) {
  const params = new URLSearchParams();

  params.set("action", "add");
  params.set("key", env.DENZGAINS_API_KEY);
  params.set("service", String(order.service_id));
  params.set("link", String(order.link));
  params.set("quantity", String(order.quantity));

  const url = `${DENZGAINS_BASE}/?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `DenzGains order failed: HTTP ${response.status} ${JSON.stringify(
        data
      )}`
    );
  }

  if (
    data.error ||
    data.errors ||
    data.success === false
  ) {
    throw new Error(
      `DenzGains rejected order: ${JSON.stringify(data)}`
    );
  }

  return data;
}

/* -------------------------------------------------------
   FIND ORDER
------------------------------------------------------- */

async function findOrderByTrackingId(env, trackingId) {
  return await env.DB.prepare(`
    SELECT *
    FROM direct_orders
    WHERE tracking_id = ?
    LIMIT 1
  `)
    .bind(trackingId)
    .first();
}

async function findOrderByMerchantReference(env, merchantReference) {
  return await env.DB.prepare(`
    SELECT *
    FROM direct_orders
    WHERE merchant_reference = ?
    LIMIT 1
  `)
    .bind(merchantReference)
    .first();
}

/* -------------------------------------------------------
   PROCESS PAID ORDER
------------------------------------------------------- */

async function processPaidOrder(
  env,
  trackingId,
  pesapalTrackingId = null,
  merchantReference = null
) {
  let order = null;

  /*
    First try our internal HUPPY tracking ID.
  */
  if (trackingId) {
    order = await findOrderByTrackingId(env, trackingId);
  }

  /*
    If this is a PesaPal callback, use the merchant reference.
  */
  if (!order && merchantReference) {
    order = await findOrderByMerchantReference(
      env,
      merchantReference
    );
  }

  if (!order) {
    throw new Error("HUPPY CUBE order not found");
  }

  /*
    VERY IMPORTANT:
    Never submit the same supplier order twice.
  */
  if (order.supplier_order_id) {
    return {
      success: true,
      already_submitted: true,
      order
    };
  }

  /*
    Determine which PesaPal tracking ID should be checked.
  */
  const ppTrackingId =
    pesapalTrackingId ||
    order.pesapal_tracking_id ||
    order.tracking_id;

  if (!ppTrackingId) {
    throw new Error("Missing PesaPal tracking ID");
  }

  /*
    Verify directly with PesaPal.
  */
  const payment = await getPesapalStatus(
    env,
    ppTrackingId
  );

  const paymentStatus = String(
    payment.payment_status_description || ""
  ).toUpperCase();

  const paymentAmount = Number(payment.amount || 0);
  const paymentCurrency = String(
    payment.currency || ""
  ).toUpperCase();

  const merchantRef =
    payment.merchant_reference ||
    merchantReference ||
    order.merchant_reference;

  /*
    Do not release the order unless PesaPal confirms
    a completed payment.
  */
  if (paymentStatus !== "COMPLETED") {
    await env.DB.prepare(`
      UPDATE direct_orders
      SET
        payment_status = ?,
        order_status = ?,
        updated_at = ?
      WHERE id = ?
    `)
      .bind(
        paymentStatus || "PENDING",
        paymentStatus === "FAILED"
          ? "Payment Failed"
          : paymentStatus === "REVERSED"
          ? "Payment Reversed"
          : "Payment Pending",
        now(),
        order.id
      )
      .run();

    return {
      success: false,
      payment_completed: false,
      payment_status: paymentStatus,
      order
    };
  }

  /*
    Verify merchant reference.
  */
  if (
    merchantRef &&
    order.merchant_reference &&
    merchantRef !== order.merchant_reference
  ) {
    throw new Error("PesaPal merchant reference mismatch");
  }

  /*
    Verify currency.
  */
  if (
    paymentCurrency &&
    paymentCurrency !== "KES"
  ) {
    throw new Error("PesaPal currency mismatch");
  }

  /*
    Verify amount.
  */
  if (
    Number.isFinite(paymentAmount) &&
    Math.abs(paymentAmount - Number(order.amount)) > 0.01
  ) {
    throw new Error(
      `PesaPal amount mismatch. Expected ${order.amount}, received ${paymentAmount}`
    );
  }

  /*
    Claim the order before sending it to DenzGains.
    This helps prevent two callbacks from submitting
    the same order simultaneously.
  */
  const claim = await env.DB.prepare(`
    UPDATE direct_orders
    SET
      payment_status = ?,
      order_status = ?,
      updated_at = ?
    WHERE id = ?
      AND supplier_order_id IS NULL
      AND (
        payment_status IS NULL
        OR payment_status != ?
      )
  `)
    .bind(
      "COMPLETED",
      "Submitting",
      now(),
      order.id,
      "COMPLETED"
    )
    .run();

  /*
    Reload after claiming.
  */
  order = await env.DB.prepare(`
    SELECT *
    FROM direct_orders
    WHERE id = ?
    LIMIT 1
  `)
    .bind(order.id)
    .first();

  /*
    If another callback already completed the submission,
    don't submit again.
  */
  if (order.supplier_order_id) {
    return {
      success: true,
      already_submitted: true,
      order
    };
  }

  /*
    Send the paid order to DenzGains.
  */
  let supplierResponse;

  try {
    supplierResponse = await sendOrderToDenzGains(
      env,
      order
    );
  } catch (error) {
    await env.DB.prepare(`
      UPDATE direct_orders
      SET
        payment_status = ?,
        order_status = ?,
        updated_at = ?
      WHERE id = ?
    `)
      .bind(
        "COMPLETED",
        "Payment Completed - Supplier Error",
        now(),
        order.id
      )
      .run();

    throw error;
  }

  /*
    DenzGains normally returns an order ID.
  */
  const supplierOrderId =
    supplierResponse.order ||
    supplierResponse.order_id ||
    supplierResponse.id ||
    null;

  /*
    Save supplier order.
  */
  await env.DB.prepare(`
    UPDATE direct_orders
    SET
      payment_status = ?,
      order_status = ?,
      supplier_order_id = ?,
      updated_at = ?
    WHERE id = ?
  `)
    .bind(
      "COMPLETED",
      "Processing",
      supplierOrderId
        ? String(supplierOrderId)
        : null,
      now(),
      order.id
    )
    .run();

  const updatedOrder = await env.DB.prepare(`
    SELECT *
    FROM direct_orders
    WHERE id = ?
    LIMIT 1
  `)
    .bind(order.id)
    .first();

  return {
    success: true,
    already_submitted: false,
    order: updatedOrder,
    supplier_response: supplierResponse
  };
}

/* -------------------------------------------------------
   ORDER STATUS
------------------------------------------------------- */

async function handleOrderStatus(request, env) {
  const url = new URL(request.url);
  const trackingId =
    url.searchParams.get("tracking_id") ||
    url.searchParams.get("trackingId");

  if (!trackingId) {
    return json(
      {
        success: false,
        error: "tracking_id is required"
      },
      400
    );
  }

  const order = await env.DB.prepare(`
    SELECT
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
    LIMIT 1
  `)
    .bind(trackingId)
    .first();

  if (!order) {
    return json(
      {
        success: false,
        error: "Order not found"
      },
      404
    );
  }

  let currentStep = 1;
  let progress = 25;

  const paymentStatus = String(
    order.payment_status || ""
  ).toUpperCase();

  const orderStatus = String(
    order.order_status || ""
  ).toLowerCase();

  /*
    Failed/reversed payments.
  */
  if (
    paymentStatus === "FAILED" ||
    paymentStatus === "REVERSED" ||
    orderStatus.includes("failed") ||
    orderStatus.includes("reversed") ||
    orderStatus.includes("invalid")
  ) {
    currentStep = 1;
    progress = 0;
  }

  /*
    Payment completed.
  */
  else if (
    paymentStatus === "COMPLETED"
  ) {
    currentStep = 2;
    progress = 50;
  }

  /*
    Supplier order exists / processing.
  */
  if (
    order.supplier_order_id ||
    orderStatus === "processing" ||
    orderStatus === "completed"
  ) {
    currentStep = 3;
    progress = 75;
  }

  /*
    Completed.
  */
  if (
    orderStatus === "completed"
  ) {
    currentStep = 4;
    progress = 100;
  }

  /*
    Supplier error:
    payment has completed but supplier submission failed.
  */
  if (
    orderStatus.includes("supplier error")
  ) {
    currentStep = 2;
    progress = 50;
  }

  return json({
    success: true,

    order,

    tracking: {
      current_step: currentStep,
      progress,

      payment_received:
        paymentStatus === "COMPLETED",

      order_submitted:
        Boolean(order.supplier_order_id),

      processing:
        Boolean(
          order.supplier_order_id &&
          orderStatus === "processing"
        ),

      completed:
        orderStatus === "completed"
    },

    whatsapp: {
      number: WHATSAPP_NUMBER,
      url: getWhatsAppUrl(order.tracking_id)
    }
  });
}

/* -------------------------------------------------------
   CREATE CUSTOMER PAYMENT
------------------------------------------------------- */

async function handleOrderPayment(
  request,
  env
) {
  if (request.method !== "POST") {
    return json(
      {
        success: false,
        error: "Method not allowed"
      },
      405
    );
  }

  const body = await request.json();

  const fullName =
    String(body.full_name || body.fullName || "")
      .trim();

  const phone =
    String(body.phone || "")
      .trim();

  const email =
    String(body.email || "")
      .trim();

  const platform =
    String(body.platform || "")
      .trim();

  const serviceId =
    String(
      body.service_id ||
      body.serviceId ||
      ""
    ).trim();

  const serviceName =
    String(
      body.service_name ||
      body.serviceName ||
      ""
    ).trim();

  const link =
    String(body.link || body.account_link || "")
      .trim();

  const quantity =
    Number(body.quantity || 0);

  if (
    !fullName ||
    !phone ||
    !serviceId ||
    !link ||
    !quantity ||
    quantity <= 0
  ) {
    return json(
      {
        success: false,
        error:
          "Full name, phone, service, link and quantity are required."
      },
      400
    );
  }

  /*
    Get live DenzGains services.
  */
  const services = await getDenzServices(env);

  const service = Array.isArray(services)
    ? services.find(
        (item) =>
          String(item.service) === serviceId ||
          String(item.service_id) === serviceId ||
          String(item.id) === serviceId
      )
    : null;

  if (!service) {
    return json(
      {
        success: false,
        error:
          "Selected service was not found at DenzGains."
      },
      400
    );
  }

  const supplierRate =
    Number(service.rate || 0);

  if (
    !Number.isFinite(supplierRate) ||
    supplierRate <= 0
  ) {
    return json(
      {
        success: false,
        error:
          "Supplier price is unavailable for this service."
      },
      400
    );
  }

  /*
    CUSTOMER PRICE = 2 × SUPPLIER RATE

    DenzGains rates are normally expressed per 1,000.
  */
  const customerRate =
    supplierRate * 2;

  const amount =
    Math.round(
      (customerRate * quantity) / 1000
    );

  if (amount < 1) {
    return json(
      {
        success: false,
        error:
          "Calculated payment amount is below KSh 1."
      },
      400
    );
  }

  const merchantReference =
    makeMerchantReference();

  const trackingId =
    makeTrackingId();

  const createdAt = now();

  /*
    Save the order BEFORE sending the customer
    to PesaPal.
  */
  await env.DB.prepare(`
    INSERT INTO direct_orders (
      tracking_id,
      merchant_reference,
      service_id,
      service_name,
      quantity,
      link,
      full_name,
      phone,
      email,
      platform,
      amount,
      supplier_rate,
      customer_rate,
      payment_status,
      order_status,
      supplier_order_id,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      trackingId,
      merchantReference,
      String(
        service.service ||
        service.service_id ||
        service.id ||
        serviceId
      ),
      serviceName ||
        service.name ||
        service.service ||
        "Social Media Service",
      quantity,
      link,
      fullName,
      phone,
      email,
      platform,
      amount,
      supplierRate,
      customerRate,
      "PENDING",
      "Payment Pending",
      null,
      createdAt,
      createdAt
    )
    .run();

  /*
    Create PesaPal payment.
  */
  let pesapal;

  try {
    pesapal = await createPesapalOrder(
      env,
      {
        merchant_reference:
          merchantReference,

        amount,

        service_name:
          serviceName ||
          service.name ||
          "Social Media Service",

        phone,
        email,
        full_name: fullName
      }
    );
  } catch (error) {
    /*
      Keep the order in the database so it can be
      inspected instead of silently disappearing.
    */
    await env.DB.prepare(`
      UPDATE direct_orders
      SET
        order_status = ?,
        updated_at = ?
      WHERE tracking_id = ?
    `)
      .bind(
        "Payment Initialization Error",
        now(),
        trackingId
      )
      .run();

    throw error;
  }

  /*
    PesaPal gives us its own order tracking ID.
    Save it if the database has this column.
    
    IMPORTANT:
    If your existing direct_orders table already contains
    pesapal_tracking_id, this update works directly.
  */
  try {
    if (pesapal.order_tracking_id) {
      await env.DB.prepare(`
        UPDATE direct_orders
        SET
          pesapal_tracking_id = ?,
          updated_at = ?
        WHERE tracking_id = ?
      `)
        .bind(
          String(pesapal.order_tracking_id),
          now(),
          trackingId
        )
        .run();
    }
  } catch (e) {
    /*
      Do not break payment creation if the optional
      column is not present in an older database.
    */
  }

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
      getWhatsAppUrl(trackingId)
  });
}

/* -------------------------------------------------------
   PESAPAL CALLBACK
------------------------------------------------------- */

async function handlePesapalCallback(
  request,
  env
) {
  const url = new URL(request.url);

  const pesapalTrackingId =
    url.searchParams.get(
      "OrderTrackingId"
    );

  const merchantReference =
    url.searchParams.get(
      "OrderMerchantReference"
    );

  /*
    PesaPal does NOT put the payment status in the
    callback URL. We therefore verify it through
    GetTransactionStatus.
  */
  if (!pesapalTrackingId) {
    return redirect(
      `${FRONTEND_URL}/?payment=missing_tracking_id`
    );
  }

  let order = null;

  if (merchantReference) {
    order =
      await findOrderByMerchantReference(
        env,
        merchantReference
      );
  }

  /*
    If merchant reference wasn't found, try the stored
    PesaPal tracking ID.
  */
  if (!order) {
    try {
      order = await env.DB.prepare(`
        SELECT *
        FROM direct_orders
        WHERE pesapal_tracking_id = ?
        LIMIT 1
      `)
        .bind(pesapalTrackingId)
        .first();
    } catch (e) {
      /*
        Older DB schema may not have the optional column.
      */
    }
  }

  if (!order) {
    return redirect(
      `${FRONTEND_URL}/?payment=order_not_found`
    );
  }

  /*
    The customer's HUPPY CUBE tracking ID is the ID
    we display in the frontend.
  */
  const huppyTrackingId =
    order.tracking_id;

  try {
    const result =
      await processPaidOrder(
        env,
        huppyTrackingId,
        pesapalTrackingId,
        merchantReference
      );

    /*
      Send customer directly back to HUPPY CUBE.
      The React app reads ?tracking_id=...
    */
    const destination =
      new URL(FRONTEND_URL);

    destination.searchParams.set(
      "tracking_id",
      huppyTrackingId
    );

    destination.searchParams.set(
      "payment",
      result.success
        ? "completed"
        : "pending"
    );

    return redirect(
      destination.toString()
    );
  } catch (error) {
    console.error(
      "PesaPal callback processing error:",
      error
    );

    /*
      Still return the customer to the tracking page.
      The frontend can show the current database status.
    */
    const destination =
      new URL(FRONTEND_URL);

    destination.searchParams.set(
      "tracking_id",
      huppyTrackingId
    );

    destination.searchParams.set(
      "payment",
      "processing"
    );

    return redirect(
      destination.toString()
    );
  }
}

/* -------------------------------------------------------
   PESAPAL IPN
------------------------------------------------------- */

async function handlePesapalIPN(
  request,
  env
) {
  const url = new URL(request.url);

  let pesapalTrackingId =
    url.searchParams.get(
      "OrderTrackingId"
    );

  let merchantReference =
    url.searchParams.get(
      "OrderMerchantReference"
    );

  /*
    PesaPal may send IPN as POST.
  */
  if (request.method === "POST") {
    try {
      const body =
        await request.json();

      pesapalTrackingId =
        pesapalTrackingId ||
        body.OrderTrackingId ||
        body.orderTrackingId;

      merchantReference =
        merchantReference ||
        body.OrderMerchantReference ||
        body.orderMerchantReference;
    } catch (e) {
      /*
        Continue with query parameters.
      */
    }
  }

  if (
    !pesapalTrackingId &&
    !merchantReference
  ) {
    return json(
      {
        orderNotificationType:
          "IPNCHANGE",
        status: 500
      },
      400
    );
  }

  try {
    const order =
      merchantReference
        ? await findOrderByMerchantReference(
            env,
            merchantReference
          )
        : null;

    if (order) {
      await processPaidOrder(
        env,
        order.tracking_id,
        pesapalTrackingId,
        merchantReference
      );
    }

    /*
      PesaPal expects an acknowledgement.
    */
    return json({
      orderNotificationType:
        "IPNCHANGE",

      orderTrackingId:
        pesapalTrackingId,

      orderMerchantReference:
        merchantReference,

      status: 200
    });
  } catch (error) {
    console.error(
      "PesaPal IPN processing error:",
      error
    );

    /*
      Acknowledge receipt even when our internal
      supplier processing has an error. The order
      remains in the database for investigation.
    */
    return json({
      orderNotificationType:
        "IPNCHANGE",

      orderTrackingId:
        pesapalTrackingId,

      orderMerchantReference:
        merchantReference,

      status: 200
    });
  }
}

/* -------------------------------------------------------
   TEST EXISTING ORDER
------------------------------------------------------- */

async function handleTestOrder(
  request,
  env,
  orderId
) {
  const url = new URL(request.url);

  const suppliedSecret =
    url.searchParams.get("secret");

  if (
    !env.TEST_ORDER_SECRET ||
    suppliedSecret !==
      env.TEST_ORDER_SECRET
  ) {
    return json(
      {
        success: false,
        error: "Unauthorized"
      },
      401
    );
  }

  if (!orderId) {
    return json(
      {
        success: false,
        error: "Order ID is required"
      },
      400
    );
  }

  const order =
    await env.DB.prepare(`
      SELECT *
      FROM direct_orders
      WHERE id = ?
      LIMIT 1
    `)
      .bind(orderId)
      .first();

  if (!order) {
    return json(
      {
        success: false,
        error: "Order not found"
      },
      404
    );
  }

  /*
    NEVER submit an existing supplier order again.
  */
  if (order.supplier_order_id) {
    return json({
      success: true,
      message:
        "This order has already been submitted to DenzGains.",
      order
    });
  }

  if (!order.tracking_id) {
    return json(
      {
        success: false,
        error:
          "This order has no tracking ID."
      },
      400
    );
  }

  try {
    const result =
      await processPaidOrder(
        env,
        order.tracking_id,
        order.pesapal_tracking_id ||
          order.tracking_id,
        order.merchant_reference
      );

    return json({
      success: true,
      message:
        "Order processing test completed.",
      result
    });
  } catch (error) {
    return json(
      {
        success: false,
        error: error.message || String(error)
      },
      500
    );
  }
}

/* -------------------------------------------------------
   SERVICES API
------------------------------------------------------- */

async function handleServices(
  request,
  env
) {
  try {
    const services =
      await getDenzServices(env);

    /*
      Return the supplier catalogue to the frontend.
      Your React app can use this for service selection.
    */
    return json({
      success: true,
      services
    });
  } catch (error) {
    console.error(
      "Services error:",
      error
    );

    return json(
      {
        success: false,
        error:
          error.message ||
          "Unable to load services."
      },
      500
    );
  }
}

/* -------------------------------------------------------
   HEALTH CHECK
------------------------------------------------------- */

async function handleHealth() {
  return json({
    success: true,
    name: "HUPPY CUBE",
    status: "online",
    time: now()
  });
}

/* -------------------------------------------------------
   MAIN WORKER
------------------------------------------------------- */

export default {
  async fetch(request, env) {
    try {
      /*
        CORS preflight.
      */
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods":
              "GET,POST,OPTIONS",
            "access-control-allow-headers":
              "Content-Type, Authorization",
            "access-control-max-age": "86400"
          }
        });
      }

      const url =
        new URL(request.url);

      const pathname =
        url.pathname;

      /*
        Health.
      */
      if (
        pathname === "/" &&
        request.method === "GET"
      ) {
        return corsResponse(
          await handleHealth()
        );
      }

      /*
        Services.
      */
      if (
        pathname === "/api/services"
      ) {
        return corsResponse(
          await handleServices(
            request,
            env
          )
        );
      }

      /*
        Customer creates an order/payment.
      */
      if (
        pathname === "/api/order-payment"
      ) {
        return corsResponse(
          await handleOrderPayment(
            request,
            env
          )
        );
      }

      /*
        Customer tracking.
      */
      if (
        pathname === "/api/order-status"
      ) {
        return corsResponse(
          await handleOrderStatus(
            request,
            env
          )
        );
      }

      /*
        PesaPal customer callback.
      */
      if (
        pathname === "/api/pesapal/callback"
      ) {
        return await handlePesapalCallback(
          request,
          env
        );
      }

      /*
        PesaPal IPN.
      */
      if (
        pathname === "/api/pesapal/ipn"
      ) {
        return corsResponse(
          await handlePesapalIPN(
            request,
            env
          )
        );
      }

      /*
        Existing-order testing endpoint.

        Example:

        /api/test-order/8?secret=YOUR_SECRET
      */
      if (
        pathname.startsWith(
          "/api/test-order/"
        )
      ) {
        const orderId =
          pathname.split("/").pop();

        return corsResponse(
          await handleTestOrder(
            request,
            env,
            orderId
          )
        );
      }

      /*
        Unknown route.
      */
      return corsResponse(
        json(
          {
            success: false,
            error: "Route not found"
          },
          404
        )
      );
    } catch (error) {
      console.error(
        "HUPPY CUBE Worker error:",
        error
      );

      return corsResponse(
        json(
          {
            success: false,
            error:
              error.message ||
              "Internal server error"
          },
          500
        )
      );
    }
  }
};
