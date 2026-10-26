import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bot } from "lucide-react";
import { register } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import "./AuthPage.css";

function validate(name: string, email: string, password: string): string | null {
  if (!name.trim()) return "Name is required.";
  if (name.trim().length < 2) return "Name must be at least 2 characters.";
  if (!email.trim()) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
  if (!password) return "Password is required.";
  if (password.length < 6) return "Password must be at least 6 characters.";
  return null;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const clientError = validate(name, email, password);
    if (clientError) { setError(clientError); return; }
    setError("");
    setLoading(true);
    try {
      const { token, user } = await register(name.trim(), email.trim(), password);
      login(token, user);
      navigate("/maps");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
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
        <h1 className="auth-title">Create account</h1>
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="auth-label">Name</label>
          <input
            className="auth-input"
            type="text"
            placeholder="Andra Basnet"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <label className="auth-label">Email</label>
          <input
            className="auth-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label className="auth-label">Password</label>
          <input
            className="auth-input"
            type="password"
            placeholder="min 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
