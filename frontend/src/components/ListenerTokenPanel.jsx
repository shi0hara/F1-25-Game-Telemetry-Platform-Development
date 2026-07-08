import { useEffect, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://f1-telementry-1.onrender.com";

function getAuthHeaders() {
  const token = window.localStorage.getItem("f1AuthToken");

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function ListenerTokenPanel() {
  const [tokens, setTokens] = useState([]);
  const [label, setLabel] = useState("My PC listener");
  const [newToken, setNewToken] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadTokens() {
    try {
      setMessage("");

      const res = await fetch(`${API_BASE}/listener-tokens`, {
        headers: getAuthHeaders(),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load tokens.");

      setTokens(data.tokens || []);
    } catch (err) {
      setMessage(err.message || "Failed to load tokens.");
    }
  }

  useEffect(() => {
    loadTokens();
  }, []);

  async function generateToken() {
    try {
      setLoading(true);
      setMessage("");
      setNewToken("");

      const res = await fetch(`${API_BASE}/listener-tokens`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ label }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create token.");

      setNewToken(data.token);
      setMessage("Token generated. Copy it now; it will only be shown once.");
      await loadTokens();
    } catch (err) {
      setMessage(err.message || "Failed to create token.");
    } finally {
      setLoading(false);
    }
  }

  async function copyToken() {
    await navigator.clipboard.writeText(newToken);
    setMessage("Copied token.");
  }

  async function revokeToken(tokenId) {
    try {
      setMessage("");

      const res = await fetch(`${API_BASE}/listener-tokens/${tokenId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to revoke token.");

      await loadTokens();
      setMessage("Token revoked.");
    } catch (err) {
      setMessage(err.message || "Failed to revoke token.");
    }
  }

  return (
    <section className="listener-token-panel card">
      <h2>Listener Token</h2>

      <div className="listener-token-create">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Token label"
        />
        <button type="button" className="btn-primary" onClick={generateToken} disabled={loading}>
          {loading ? "Generating..." : "Generate Token"}
        </button>
      </div>

      {newToken && (
        <div className="listener-token-result">
          <code>{newToken}</code>
          <button type="button" onClick={copyToken}>
            Copy
          </button>
        </div>
      )}

      {message && <p className="listener-token-message">{message}</p>}

      <div className="listener-token-list">
        {tokens.length === 0 ? (
          <p>No active listener tokens.</p>
        ) : (
          tokens.map((token) => (
            <div className="listener-token-row" key={token.tokenId}>
              <div>
                <strong>{token.label}</strong>
                <span>{token.tokenPreview}</span>
              </div>
              <button type="button" onClick={() => revokeToken(token.tokenId)}>
                Revoke
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
