const API_BASE =
  import.meta.env.VITE_API_BASE || "https://f1-telementry-1.onrender.com";

const LOCAL_LISTENER_URL =
  import.meta.env.VITE_LOCAL_LISTENER_URL || "http://127.0.0.1:51377";

async function fetchWithTimeout(url, options = {}, timeoutMs = 900) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

async function readJson(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function authHeaders(authToken) {
  return {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
}

function sameUser(localStatus, user) {
  if (!localStatus?.paired || !user) return false;

  const localUserId = String(localStatus.userId || "").trim();
  const nextUserId = String(user.id || "").trim();
  if (localUserId && nextUserId && localUserId === nextUserId) return true;

  const localUsername = String(localStatus.username || "").trim().toLowerCase();
  const nextUsername = String(user.username || "").trim().toLowerCase();
  return Boolean(localUsername && nextUsername && localUsername === nextUsername);
}

export async function getLocalListenerStatus() {
  const res = await fetchWithTimeout(`${LOCAL_LISTENER_URL}/health`, {
    method: "GET",
  });

  if (!res.ok) {
    throw new Error("Local listener is not available.");
  }

  return readJson(res);
}

async function createWebsiteListenerToken(authToken) {
  const res = await fetch(`${API_BASE}/listener-tokens`, {
    method: "POST",
    headers: authHeaders(authToken),
    body: JSON.stringify({
      label: "Website auto-pair listener",
    }),
  });

  const data = await readJson(res);
  if (!res.ok) {
    throw new Error(data.error || "Failed to create listener token.");
  }

  return data.token;
}

async function pairLocalListener(listenerToken) {
  const res = await fetchWithTimeout(
    `${LOCAL_LISTENER_URL}/pair`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ listenerToken }),
    },
    2500
  );

  const data = await readJson(res);
  if (!res.ok) {
    throw new Error(data.error || "Failed to pair local listener.");
  }

  return data;
}

export async function pairLocalListenerAfterLogin({ user, authToken }) {
  let status;

  try {
    status = await getLocalListenerStatus();
  } catch {
    return { paired: false, reason: "listener_not_running" };
  }

  if (sameUser(status, user)) {
    return { paired: true, reason: "already_paired", status };
  }

  const listenerToken = await createWebsiteListenerToken(authToken);
  const paired = await pairLocalListener(listenerToken);

  return { paired: true, reason: "paired", status: paired };
}

export async function notifyLocalListenerLogout() {
  try {
    const res = await fetchWithTimeout(
      `${LOCAL_LISTENER_URL}/unpair`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "website_logout" }),
      },
      1200
    );

    if (!res.ok) return { unpaired: false };
    return { unpaired: true, status: await readJson(res) };
  } catch {
    return { unpaired: false, reason: "listener_not_running" };
  }
}
