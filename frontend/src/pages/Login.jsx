import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import GoogleSignIn from "../components/GoogleSignIn";
import Logo from "../components/Logo";
import Button from "../components/Button";
import { useAuth } from "../auth/context";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !email.includes("@")) {
      setError("Please enter a valid business email address.");
      return;
    }
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      await login({ email, password });
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Invalid email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--color-bg-page)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "32px 16px"
      }}
    >
      <div style={{ marginBottom: "28px" }}>
        <Logo size="md" showSubtitle={false} />
      </div>

      <div
        className="ds-card"
        style={{
          width: "100%",
          maxWidth: 420,
          padding: "36px 32px",
          boxShadow: "var(--shadow-md)"
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "1.45rem", fontWeight: 700, color: "var(--color-text-main)" }}>
            Welcome Back
          </h2>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: "4px" }}>
            Login to your DataSutra account
          </p>
        </div>

        {error && (
          <div
            style={{
              padding: "10px 14px",
              backgroundColor: "var(--color-danger-bg)",
              border: "1px solid var(--color-danger-border)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-danger-text)",
              fontSize: "0.825rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "18px"
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="ds-form-group">
            <label className="ds-form-label" htmlFor="login-email">
              Email Address
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="login-email"
                type="email"
                className={`ds-input ${error && !email.includes("@") ? "has-error" : ""}`}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="ds-form-group">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label className="ds-form-label" htmlFor="login-password" style={{ margin: 0 }}>
                Password
              </label>
              <a
                href="#forgot"
                onClick={(e) => {
                  e.preventDefault();
                  alert("Password reset instructions have been sent to your email.");
                }}
                style={{ fontSize: "0.775rem", color: "var(--color-primary)", fontWeight: 500 }}
              >
                Forgot Password?
              </a>
            </div>
            <input
              id="login-password"
              type="password"
              className="ds-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            style={{ width: "100%", marginTop: "8px" }}
          >
            Login
          </Button>
        </form>

        {/* Divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            margin: "24px 0",
            color: "var(--color-text-light)",
            fontSize: "0.8rem"
          }}
        >
          <div style={{ flex: 1, height: 1, backgroundColor: "var(--border-color)" }} />
          <span style={{ padding: "0 12px" }}>or continue with</span>
          <div style={{ flex: 1, height: 1, backgroundColor: "var(--border-color)" }} />
        </div>

        <GoogleSignIn disabled={loading} />

        <div style={{ textAlign: "center", marginTop: "24px", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
          Don't have an account?{" "}
          <Link to="/register" style={{ color: "var(--color-primary)", fontWeight: 600 }}>
            Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
}
