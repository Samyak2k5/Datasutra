import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import GoogleSignIn from "../components/GoogleSignIn";
import Logo from "../components/Logo";
import Button from "../components/Button";
import { useAuth } from "../auth/context";

export default function Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { register } = useAuth();

  // Password rules validation
  const hasMinLength = password.length >= 8;
  const hasNumber = /\d/.test(password);
  const passwordsMatch = password && password === confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!fullName.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!email || !email.includes("@")) {
      setError("Please enter a valid work email.");
      return;
    }
    if (!hasMinLength) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await register({
        name: fullName.trim(),
        email: email.trim(),
        password
      });
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Registration failed. Email may already be in use.");
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
          maxWidth: 440,
          padding: "36px 32px",
          boxShadow: "var(--shadow-md)"
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "1.45rem", fontWeight: 700, color: "var(--color-text-main)" }}>
            Create an Account
          </h2>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", marginTop: "4px" }}>
            Join and start cleaning your data
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
            <label className="ds-form-label" htmlFor="register-name">
              Full Name
            </label>
            <input
              id="register-name"
              type="text"
              className="ds-input"
              placeholder="Your full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div className="ds-form-group">
            <label className="ds-form-label" htmlFor="register-email">
              Work Email
            </label>
            <input
              id="register-email"
              type="email"
              className="ds-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="ds-form-group">
            <label className="ds-form-label" htmlFor="register-password">
              Password
            </label>
            <input
              id="register-password"
              type="password"
              className="ds-input"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {/* Password Validation Guidance UI */}
            {password && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4, fontSize: "0.75rem" }}>
                <span style={{ color: hasMinLength ? "var(--color-success)" : "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                  <CheckCircle2 size={13} color={hasMinLength ? "var(--color-success)" : "var(--color-text-light)"} />
                  At least 8 characters
                </span>
                <span style={{ color: hasNumber ? "var(--color-success)" : "var(--color-text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                  <CheckCircle2 size={13} color={hasNumber ? "var(--color-success)" : "var(--color-text-light)"} />
                  Contains at least one number
                </span>
              </div>
            )}
          </div>

          <div className="ds-form-group">
            <label className="ds-form-label" htmlFor="register-confirm">
              Confirm Password
            </label>
            <input
              id="register-confirm"
              type="password"
              className={`ds-input ${confirmPassword && !passwordsMatch ? "has-error" : ""}`}
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            {confirmPassword && !passwordsMatch && (
              <div className="ds-form-error">Passwords do not match</div>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            style={{ width: "100%", marginTop: "8px" }}
          >
            Create Account
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
          Already have an account?{" "}
          <Link to="/login" style={{ color: "var(--color-primary)", fontWeight: 600 }}>
            Login
          </Link>
        </div>
      </div>
    </div>
  );
}
