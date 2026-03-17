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

function StatusBadge({ status }: { status: string }) {
  const colors =
    status === "deployed"
      ? "bg-emerald-50 text-emerald-700"
      : status === "failed"
        ? "bg-red-50 text-red-700"
        : "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${colors}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [instanceName, setInstanceName] = useState("");
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
    setCreating(true);
    try {
      const body: Record<string, string> = {};
      if (instanceName.trim()) body.name = instanceName.trim();
      const res = await fetch("/api/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setInstanceName("");
        refreshInstances();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create instance");
      }
    } finally {
      setCreating(false);
    }
  }

  async function deleteInstance(name: string) {
    setError("");
    const res = await fetch(`/api/instances/${name}`, { method: "DELETE" });
    if (res.ok) {
      refreshInstances();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to delete instance");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-400">
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm rounded-xl bg-white p-10 text-center shadow-sm ring-1 ring-gray-950/5">
          <h1 className="text-2xl font-semibold text-gray-900">ComfyUI Portal</h1>
          <p className="mt-2 text-sm text-gray-500">Sign in to manage your ComfyUI instances.</p>
          <a
            href="/auth/github"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-gray-800 transition-colors"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            Sign in with GitHub
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold text-gray-900">ComfyUI Portal</h1>
          <div className="flex items-center gap-3">
            {user.avatar && (
              <img src={user.avatar} className="h-8 w-8 rounded-full ring-1 ring-gray-200" />
            )}
            <span className="text-sm font-medium text-gray-700">{user.username}</span>
            <button
              onClick={() => fetch("/auth/logout", { method: "POST" }).then(() => setUser(null))}
              className="rounded-md px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Instances</h2>
          <form
            onSubmit={(e) => { e.preventDefault(); createInstance(); }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="optional suffix"
              className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {creating ? "Creating..." : "+ New Instance"}
            </button>
          </form>
        </div>

        <div className="rounded-xl bg-white shadow-sm ring-1 ring-gray-950/5">
          {instances.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-gray-500">No instances yet.</p>
              <p className="mt-1 text-xs text-gray-400">Create one to get started with ComfyUI.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {instances.map((inst) => (
                <li key={inst.name} className="flex items-center gap-4 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{inst.name}</p>
                    <p className="text-xs text-gray-400">{inst.username}</p>
                  </div>
                  <StatusBadge status={inst.status} />
                  <div className="flex items-center gap-2">
                    {inst.routeUrl && (
                      <a
                        href={inst.routeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 transition-colors"
                      >
                        Open
                      </a>
                    )}
                    <button
                      onClick={() => deleteInstance(inst.name)}
                      className="rounded-md px-3 py-1.5 text-sm font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
