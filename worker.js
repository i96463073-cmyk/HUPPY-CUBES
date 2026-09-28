async function getPesapalToken(env) {
  const response = await fetch(`${PESAPAL_BASE}/api/Auth/RequestToken`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      consumer_key: env.PESAPAL_CONSUMER_KEY,
      consumer_secret: env.PESAPAL_CONSUMER_SECRET
    })
  });

  const data = await response.json();

  if (!response.ok || !data.token) {
    throw new Error(
      `PesaPal authentication failed: ${JSON.stringify(data)}`
    );
  }

  return data.token;
}