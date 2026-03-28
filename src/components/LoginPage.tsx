import { useState } from "react";
import { X, LogIn } from "lucide-react";
import { useStore } from "../store";

interface LoginModalProps {
  onClose: () => void;
}

export function LoginModal({ onClose }: LoginModalProps) {
  const { setAuth } = useStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid credentials");
        return;
      }
      if (!data.token) {
        setError("Authentication is not configured on this server");
        return;
      }
      setAuth({ token: data.token, username: data.username, authEnabled: true });
      onClose();
    } catch {
      setError("Unable to reach the server");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Sign in"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--ide-border)] p-8 shadow-2xl"
        style={{ background: "var(--ide-surface)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-bold text-base text-[var(--ide-text)]">
            Sign in
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--ide-text-3)] hover:text-[var(--ide-text)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="login-username"
              className="text-sm text-[var(--ide-text-2)]"
            >
              Username
            </label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-[var(--ide-bg)] border border-[var(--ide-border)] rounded-lg px-3 py-2 text-sm text-[var(--ide-text)] focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="admin"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="login-password"
              className="text-sm text-[var(--ide-text-2)]"
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-[var(--ide-bg)] border border-[var(--ide-border)] rounded-lg px-3 py-2 text-sm text-[var(--ide-text)] focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="flex items-center justify-center gap-2 mt-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors"
          >
            <LogIn size={14} />
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
