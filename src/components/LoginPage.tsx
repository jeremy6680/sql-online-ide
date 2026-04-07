import { useState } from "react";
import { X, LogIn, UserPlus, KeyRound, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useStore } from "../store";

type View = "signin" | "signup" | "forgot" | "reset";

interface LoginModalProps {
  onClose: () => void;
  initialView?: View;
  /** Pre-filled reset token from URL query param */
  resetToken?: string;
}

export function LoginModal({ onClose, initialView = "signin", resetToken }: LoginModalProps) {
  const { setAuth } = useStore();
  const [view, setView] = useState<View>(resetToken ? "reset" : initialView);
  const [registrationEnabled, setRegistrationEnabled] = useState<boolean | null>(null);

  // ── Sign-in state ──────────────────────────────────────────────────────────
  const [siIdentifier, setSiIdentifier] = useState(""); // email or username
  const [siPassword, setSiPassword] = useState("");
  const [siError, setSiError] = useState<string | null>(null);
  const [siLoading, setSiLoading] = useState(false);

  // ── Sign-up state ──────────────────────────────────────────────────────────
  const [suUsername, setSuUsername] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suConfirm, setSuConfirm] = useState("");
  const [suError, setSuError] = useState<string | null>(null);
  const [suLoading, setSuLoading] = useState(false);

  // ── Forgot password state ──────────────────────────────────────────────────
  const [fpEmail, setFpEmail] = useState("");
  const [fpLoading, setFpLoading] = useState(false);
  const [fpDone, setFpDone] = useState(false);
  const [fpError, setFpError] = useState<string | null>(null);

  // ── Reset password state ───────────────────────────────────────────────────
  const [rpToken] = useState(resetToken ?? "");
  const [rpPassword, setRpPassword] = useState("");
  const [rpConfirm, setRpConfirm] = useState("");
  const [rpLoading, setRpLoading] = useState(false);
  const [rpDone, setRpDone] = useState(false);
  const [rpError, setRpError] = useState<string | null>(null);

  async function fetchRegistrationStatus() {
    if (registrationEnabled !== null) return;
    try {
      const res = await fetch("/api/auth/status");
      const data = await res.json() as { registrationEnabled?: boolean };
      setRegistrationEnabled(data.registrationEnabled ?? false);
    } catch {
      setRegistrationEnabled(false);
    }
  }

  function switchView(next: View) {
    setView(next);
    if (next === "signup") fetchRegistrationStatus();
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setSiError(null);
    setSiLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: siIdentifier, password: siPassword }),
      });
      const data = await res.json() as { token?: string; username?: string; error?: string };
      if (!res.ok) { setSiError(data.error ?? "Invalid credentials"); return; }
      if (!data.token) { setSiError("Authentication is not configured on this server"); return; }
      setAuth({ token: data.token, username: data.username ?? siIdentifier, authEnabled: true });
      onClose();
    } catch {
      setSiError("Unable to reach the server");
    } finally {
      setSiLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setSuError(null);
    if (suPassword !== suConfirm) { setSuError("Passwords do not match."); return; }
    setSuLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: suUsername, email: suEmail, password: suPassword }),
      });
      const data = await res.json() as { token?: string; username?: string; error?: string };
      if (!res.ok) { setSuError(data.error ?? "Registration failed"); return; }
      setAuth({ token: data.token!, username: data.username ?? suUsername, authEnabled: true });
      onClose();
    } catch {
      setSuError("Unable to reach the server");
    } finally {
      setSuLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setFpError(null);
    setFpLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fpEmail }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { setFpError(data.error ?? "An error occurred."); return; }
      setFpDone(true);
    } catch {
      setFpError("Unable to reach the server");
    } finally {
      setFpLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setRpError(null);
    if (rpPassword !== rpConfirm) { setRpError("Passwords do not match."); return; }
    setRpLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: rpToken, password: rpPassword }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { setRpError(data.error ?? "An error occurred."); return; }
      setRpDone(true);
    } catch {
      setRpError("Unable to reach the server");
    } finally {
      setRpLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--ide-border)] shadow-2xl overflow-hidden"
        style={{ background: "var(--ide-surface)" }}
      >
        {/* ── Tab bar (sign in / sign up only) ── */}
        {(view === "signin" || view === "signup") && (
          <div className="flex border-b border-[var(--ide-border)]">
            <button
              onClick={() => switchView("signin")}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                view === "signin"
                  ? "text-[var(--ide-text)] border-b-2 border-blue-500"
                  : "text-[var(--ide-text-3)] hover:text-[var(--ide-text)]"
              }`}
            >
              Sign in
            </button>
            <button
              onClick={() => switchView("signup")}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                view === "signup"
                  ? "text-[var(--ide-text)] border-b-2 border-blue-500"
                  : "text-[var(--ide-text-3)] hover:text-[var(--ide-text)]"
              }`}
            >
              Create account
            </button>
            <button onClick={onClose} aria-label="Close" className="px-4 text-[var(--ide-text-3)] hover:text-[var(--ide-text)] transition-colors">
              <X size={16} />
            </button>
          </div>
        )}

        {/* ── Sub-view header (forgot / reset) ── */}
        {(view === "forgot" || view === "reset") && (
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--ide-border)]">
            <button onClick={() => switchView("signin")} className="text-[var(--ide-text-3)] hover:text-[var(--ide-text)] transition-colors" aria-label="Back">
              <ArrowLeft size={16} />
            </button>
            <span className="text-sm font-medium text-[var(--ide-text)] flex-1">
              {view === "forgot" ? "Forgot password" : "Set new password"}
            </span>
            <button onClick={onClose} aria-label="Close" className="text-[var(--ide-text-3)] hover:text-[var(--ide-text)] transition-colors">
              <X size={16} />
            </button>
          </div>
        )}

        <div className="p-8">

          {/* ══ Sign in ══ */}
          {view === "signin" && (
            <form onSubmit={handleSignIn} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="si-id" className="text-sm text-[var(--ide-text-2)]">Email or username</label>
                <input
                  id="si-id"
                  type="text"
                  autoComplete="username email"
                  autoFocus
                  required
                  value={siIdentifier}
                  onChange={(e) => setSiIdentifier(e.target.value)}
                  className="bg-[var(--ide-bg)] border border-[var(--ide-border)] rounded-lg px-3 py-2 text-sm text-[var(--ide-text)] focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="you@example.com"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="si-password" className="text-sm text-[var(--ide-text-2)]">Password</label>
                  <button
                    type="button"
                    onClick={() => switchView("forgot")}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  id="si-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={siPassword}
                  onChange={(e) => setSiPassword(e.target.value)}
                  className="bg-[var(--ide-bg)] border border-[var(--ide-border)] rounded-lg px-3 py-2 text-sm text-[var(--ide-text)] focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="••••••••"
                />
              </div>

              {siError && <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{siError}</p>}

              <button type="submit" disabled={siLoading} className="flex items-center justify-center gap-2 mt-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors">
                <LogIn size={14} />
                {siLoading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          )}

          {/* ══ Sign up ══ */}
          {view === "signup" && (
            <>
              {registrationEnabled === false && (
                <p className="text-sm text-[var(--ide-text-3)] text-center py-4">
                  Self-registration is not enabled on this server.
                  <br />
                  Contact the administrator to get an account.
                </p>
              )}
              {registrationEnabled !== false && (
                <form onSubmit={handleSignUp} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="su-username" className="text-sm text-[var(--ide-text-2)]">Username</label>
                    <input id="su-username" type="text" autoComplete="username" autoFocus required value={suUsername} onChange={(e) => setSuUsername(e.target.value)}
                      className="bg-[var(--ide-bg)] border border-[var(--ide-border)] rounded-lg px-3 py-2 text-sm text-[var(--ide-text)] focus:outline-none focus:border-blue-500 transition-colors"
                      placeholder="john_doe" />
                    <span className="text-[11px] text-[var(--ide-text-4)]">3–32 characters, letters/digits/_ - .</span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="su-email" className="text-sm text-[var(--ide-text-2)]">Email</label>
                    <input id="su-email" type="email" autoComplete="email" required value={suEmail} onChange={(e) => setSuEmail(e.target.value)}
                      className="bg-[var(--ide-bg)] border border-[var(--ide-border)] rounded-lg px-3 py-2 text-sm text-[var(--ide-text)] focus:outline-none focus:border-blue-500 transition-colors"
                      placeholder="you@example.com" />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="su-password" className="text-sm text-[var(--ide-text-2)]">Password</label>
                    <input id="su-password" type="password" autoComplete="new-password" required value={suPassword} onChange={(e) => setSuPassword(e.target.value)}
                      className="bg-[var(--ide-bg)] border border-[var(--ide-border)] rounded-lg px-3 py-2 text-sm text-[var(--ide-text)] focus:outline-none focus:border-blue-500 transition-colors"
                      placeholder="••••••••" />
                    <span className="text-[11px] text-[var(--ide-text-4)]">Min. 8 characters, uppercase, lowercase &amp; digit required.</span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="su-confirm" className="text-sm text-[var(--ide-text-2)]">Confirm password</label>
                    <input id="su-confirm" type="password" autoComplete="new-password" required value={suConfirm} onChange={(e) => setSuConfirm(e.target.value)}
                      className="bg-[var(--ide-bg)] border border-[var(--ide-border)] rounded-lg px-3 py-2 text-sm text-[var(--ide-text)] focus:outline-none focus:border-blue-500 transition-colors"
                      placeholder="••••••••" />
                  </div>

                  {suError && <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{suError}</p>}

                  <button type="submit" disabled={suLoading} className="flex items-center justify-center gap-2 mt-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors">
                    <UserPlus size={14} />
                    {suLoading ? "Creating account…" : "Create account"}
                  </button>
                </form>
              )}
            </>
          )}

          {/* ══ Forgot password ══ */}
          {view === "forgot" && (
            <>
              {fpDone ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CheckCircle2 size={32} className="text-green-400" />
                  <p className="text-sm text-[var(--ide-text)]">
                    If an account exists for <strong>{fpEmail}</strong>, a reset link has been sent.
                  </p>
                  <p className="text-xs text-[var(--ide-text-4)]">
                    Check your spam folder if you don't see it. The link expires in 1 hour.
                  </p>
                  <button onClick={() => switchView("signin")} className="mt-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
                    Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
                  <p className="text-sm text-[var(--ide-text-3)]">
                    Enter your account email. We'll send a reset link if the address is registered.
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="fp-email" className="text-sm text-[var(--ide-text-2)]">Email</label>
                    <input id="fp-email" type="email" autoFocus required value={fpEmail} onChange={(e) => setFpEmail(e.target.value)}
                      className="bg-[var(--ide-bg)] border border-[var(--ide-border)] rounded-lg px-3 py-2 text-sm text-[var(--ide-text)] focus:outline-none focus:border-blue-500 transition-colors"
                      placeholder="you@example.com" />
                  </div>
                  {fpError && <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{fpError}</p>}
                  <button type="submit" disabled={fpLoading} className="flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors">
                    <KeyRound size={14} />
                    {fpLoading ? "Sending…" : "Send reset link"}
                  </button>
                </form>
              )}
            </>
          )}

          {/* ══ Reset password ══ */}
          {view === "reset" && (
            <>
              {rpDone ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <CheckCircle2 size={32} className="text-green-400" />
                  <p className="text-sm text-[var(--ide-text)]">Password updated successfully!</p>
                  <button onClick={() => switchView("signin")} className="mt-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
                    Sign in with your new password
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="rp-password" className="text-sm text-[var(--ide-text-2)]">New password</label>
                    <input id="rp-password" type="password" autoComplete="new-password" autoFocus required value={rpPassword} onChange={(e) => setRpPassword(e.target.value)}
                      className="bg-[var(--ide-bg)] border border-[var(--ide-border)] rounded-lg px-3 py-2 text-sm text-[var(--ide-text)] focus:outline-none focus:border-blue-500 transition-colors"
                      placeholder="••••••••" />
                    <span className="text-[11px] text-[var(--ide-text-4)]">Min. 8 characters, uppercase, lowercase &amp; digit.</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="rp-confirm" className="text-sm text-[var(--ide-text-2)]">Confirm password</label>
                    <input id="rp-confirm" type="password" autoComplete="new-password" required value={rpConfirm} onChange={(e) => setRpConfirm(e.target.value)}
                      className="bg-[var(--ide-bg)] border border-[var(--ide-border)] rounded-lg px-3 py-2 text-sm text-[var(--ide-text)] focus:outline-none focus:border-blue-500 transition-colors"
                      placeholder="••••••••" />
                  </div>
                  {rpError && <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{rpError}</p>}
                  <button type="submit" disabled={rpLoading || !rpToken} className="flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors">
                    <KeyRound size={14} />
                    {rpLoading ? "Updating…" : "Set new password"}
                  </button>
                  {!rpToken && <p className="text-xs text-red-400">No reset token found. Please use the link from your email.</p>}
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
