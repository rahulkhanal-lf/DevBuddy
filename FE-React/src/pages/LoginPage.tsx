import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bot } from "lucide-react";
import { loginApi } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import "./AuthPage.css";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/maps";
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError("Email is required."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Enter a valid email address."); return; }
    if (!password) { setError("Password is required."); return; }
    setError("");
    setLoading(true);
    try {
      const { token, user } = await loginApi(email.trim(), password);
      login(token, user);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <Bot size={32} />
          <span>MindFlow AI</span>
        </div>
        <h1 className="auth-title">Welcome back</h1>
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="auth-label">Email</label>
          <input
            className="auth-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          <label className="auth-label">Password</label>
          <input
            className="auth-input"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="auth-footer">
          Don't have an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
