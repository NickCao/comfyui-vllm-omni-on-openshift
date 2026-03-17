import { useEffect, useState } from "react";

interface User {
  username: string;
  displayName: string;
  avatar: string;
}

interface Instance {
  name: string;
  username: string;
  status: string;
  updated: string;
  routeUrl: string;
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user) refreshInstances();
  }, [user]);

  async function refreshInstances() {
    const res = await fetch("/api/instances");
    if (res.ok) setInstances(await res.json());
  }

  async function createInstance() {
    setError("");
    const res = await fetch("/api/instances", { method: "POST" });
    if (res.ok) {
      refreshInstances();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to create instance");
    }
  }

  async function deleteInstance(username: string) {
    setError("");
    const res = await fetch(`/api/instances/${username}`, { method: "DELETE" });
    if (res.ok) {
      refreshInstances();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to delete instance");
    }
  }

  if (loading) return <p>Loading...</p>;

  if (!user) {
    return (
      <div style={{ maxWidth: 400, margin: "100px auto", textAlign: "center" }}>
        <h1>ComfyUI Portal</h1>
        <p>Sign in to manage your ComfyUI instances.</p>
        <a href="/auth/github" style={{ fontSize: 18 }}>
          Sign in with GitHub
        </a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", padding: "0 20px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>ComfyUI Portal</h1>
        <div>
          {user.avatar && <img src={user.avatar} width={32} height={32} style={{ borderRadius: "50%", verticalAlign: "middle", marginRight: 8 }} />}
          {user.username}
          <button onClick={() => fetch("/auth/logout", { method: "POST" }).then(() => setUser(null))} style={{ marginLeft: 12 }}>
            Logout
          </button>
        </div>
      </header>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <button onClick={createInstance} style={{ marginBottom: 20 }}>
        Create My Instance
      </button>

      {instances.length === 0 ? (
        <p>No instances yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>User</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>Release</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>Status</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ccc", padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {instances.map((inst) => (
              <tr key={inst.name}>
                <td style={{ padding: 8 }}>{inst.username}</td>
                <td style={{ padding: 8 }}>{inst.name}</td>
                <td style={{ padding: 8 }}>{inst.status}</td>
                <td style={{ padding: 8 }}>
                  {inst.routeUrl && (
                    <a href={inst.routeUrl} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>
                      Open
                    </a>
                  )}
                  <button onClick={() => deleteInstance(inst.username)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
