import { useEffect, useState, useRef } from "react";

interface User {
  username: string;
  displayName: string;
  avatar: string;
}

interface PodStatus {
  name: string;
  phase: string;
  ready: boolean;
  restarts: number;
  message: string;
}

interface Instance {
  name: string;
  username: string;
  status: string;
  updated: string;
  routeUrl: string;
  password: string;
  pods: PodStatus[];
}

function PodBadge({ pod }: { pod: PodStatus }) {
  const isReady = pod.ready;
  const isCrash = pod.phase === "CrashLoopBackOff" || pod.phase === "Error";
  const isPending = pod.phase === "Pending" || pod.phase === "ContainerCreating" || pod.phase === "PodInitializing";

  const colors = isReady
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : isCrash
      ? "bg-red-50 text-red-700 border-red-200"
      : isPending
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-gray-50 text-gray-600 border-gray-200";

  const label = isReady ? "Ready" : pod.phase;

  return (
    <div className={`rounded-lg border px-3 py-2 ${colors}`}>
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${isReady ? "bg-emerald-500" : isCrash ? "bg-red-500" : isPending ? "bg-amber-500 animate-pulse" : "bg-gray-400"}`} />
        <span className="text-xs font-medium">{label}</span>
        {pod.restarts > 0 && (
          <span className="text-xs opacity-60">({pod.restarts} restarts)</span>
        )}
      </div>
      <p className="mt-0.5 text-xs opacity-60 font-mono truncate">{pod.name}</p>
      {pod.message && <p className="mt-0.5 text-xs opacity-75 truncate">{pod.message}</p>}
    </div>
  );
}

function LogViewer({ name }: { name: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource(`/api/instances/${name}/logs`);
    es.onmessage = (e) => {
      setLines((prev) => {
        const next = [...prev, e.data];
        return next.length > 1000 ? next.slice(-1000) : next;
      });
    };
    es.addEventListener("close", () => es.close());
    return () => es.close();
  }, [name]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <div className="border-t border-gray-100 bg-gray-950 rounded-b-xl max-h-80 overflow-y-auto">
      <pre className="px-4 py-3 text-xs leading-5 text-gray-300 font-mono whitespace-pre-wrap break-all">
        {lines.length === 0 ? <span className="text-gray-500">Waiting for logs...</span> : lines.join("\n")}
        <div ref={bottomRef} />
      </pre>
    </div>
  );
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [instanceName, setInstanceName] = useState("");
  const [error, setError] = useState("");
  const [logsOpen, setLogsOpen] = useState<Record<string, boolean>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshInstances();
    intervalRef.current = setInterval(refreshInstances, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
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

        <div className="space-y-3">
          {instances.length === 0 ? (
            <div className="rounded-xl bg-white px-6 py-16 text-center shadow-sm ring-1 ring-gray-950/5">
              <p className="text-sm text-gray-500">No instances yet.</p>
              <p className="mt-1 text-xs text-gray-400">Create one to get started with ComfyUI.</p>
            </div>
          ) : (
            instances.map((inst) => (
              <div key={inst.name} className="rounded-xl bg-white shadow-sm ring-1 ring-gray-950/5">
                <div className="flex items-center gap-4 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{inst.name}</p>
                    {inst.routeUrl && (
                      <a href={inst.routeUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline break-all">
                        {inst.routeUrl}
                      </a>
                    )}
                    {inst.password && (
                      <p className="mt-1 text-xs text-gray-400">
                        Password: <code className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 select-all">{inst.password}</code>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setLogsOpen((prev) => ({ ...prev, [inst.name]: !prev[inst.name] }))}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium ring-1 transition-colors ${logsOpen[inst.name] ? "bg-gray-900 text-white ring-gray-900" : "text-gray-700 ring-gray-300 hover:bg-gray-50"}`}
                    >
                      Logs
                    </button>
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
                </div>
                {inst.pods.length > 0 && (
                  <div className="border-t border-gray-100 px-6 py-3">
                    <div className="flex flex-wrap gap-2">
                      {inst.pods.map((pod) => (
                        <PodBadge key={pod.name} pod={pod} />
                      ))}
                    </div>
                  </div>
                )}
                {logsOpen[inst.name] && <LogViewer name={inst.name} />}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
