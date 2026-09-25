import React from "react";
import { Link } from "react-router-dom";
import {
  Copy,
  AlertCircle,
  BarChart3,
  ArrowRight,
  Play,
  CheckCircle2,
  ShieldCheck,
  Sliders
} from "lucide-react";
import Logo from "../components/Logo";
import Button from "../components/Button";

export default function Landing() {
  const featureCards = [
    {
      icon: Copy,
      title: "Remove Duplicates",
      desc: "Detect exact and fuzzy duplicate records across custom identifiers before data lands in your CRM.",
      accent: "#0176d3"
    },
    {
      icon: AlertCircle,
      title: "Fix Missing Values",
      desc: "Identify empty, null, and placeholder values with rule-based flagging and imputation workflows.",
      accent: "#f59e0b"
    },
    {
      icon: Sliders,
      title: "Standardize Data",
      desc: "Normalize email formatting, phone numbers, text casing, and regional city nomenclature.",
      accent: "#16a34a"
    },
    {
      icon: BarChart3,
      title: "Data Quality Reports",
      desc: "Review comprehensive before-and-after change diffs and audit logs before exporting cleaned records.",
      accent: "#7c3aed"
    }
  ];

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#ffffff" }}>
      {/* Navigation Header */}
      <header
        style={{
          borderBottom: "1px solid var(--border-color)",
          backgroundColor: "#ffffff",
          position: "sticky",
          top: 0,
          zIndex: 50
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "0 24px",
            height: 72,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <Logo size="md" showSubtitle={true} />

          <nav style={{ display: "none", md: "flex", gap: "28px", alignItems: "center" }} className="landing-nav-links">
            <a href="#features" style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--color-text-muted)" }}>
              Features
            </a>
            <a href="#how-it-works" style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--color-text-muted)" }}>
              How It Works
            </a>
            <a href="#pipeline" style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--color-text-muted)" }}>
              Architecture
            </a>
            <a href="#pricing" style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--color-text-muted)" }}>
              Pricing
            </a>
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Link to="/login">
              <Button variant="ghost" size="md">
                Login
              </Button>
            </Link>
            <Link to="/register">
              <Button variant="primary" size="md">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section
        style={{
          padding: "72px 24px 64px 24px",
          background: "linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)",
          borderBottom: "1px solid var(--border-color-subtle)"
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "48px",
            alignItems: "center"
          }}
        >
          {/* Left Column: Heading and CTAs */}
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "4px 12px",
                borderRadius: "var(--radius-full)",
                backgroundColor: "var(--color-primary-light)",
                color: "var(--color-primary)",
                fontSize: "0.8rem",
                fontWeight: 600,
                marginBottom: "20px"
              }}
            >
              <ShieldCheck size={16} />
              Enterprise Data Cleaning Platform
            </div>

            <h1
              style={{
                fontSize: "clamp(2rem, 4vw, 3.25rem)",
                fontWeight: 800,
                lineHeight: 1.15,
                color: "var(--color-text-main)",
                letterSpacing: "-0.03em",
                marginBottom: "20px"
              }}
            >
              Clean Your Data. <br />
              <span style={{ color: "var(--color-primary)" }}>Build Better Data.</span>
            </h1>

            <p
              style={{
                fontSize: "1.05rem",
                color: "var(--color-text-muted)",
                lineHeight: 1.6,
                marginBottom: "32px",
                maxWidth: 540
              }}
            >
              Upload CSV or Excel files, detect data-quality issues, clean structured records,
              and review unresolved data before exporting the final dataset.
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
              <Link to="/register">
                <Button variant="primary" size="lg" icon={ArrowRight} iconPosition="right">
                  Get Started
                </Button>
              </Link>
              <Link to="/dashboard">
                <Button variant="secondary" size="lg" icon={Play}>
                  View Demo
                </Button>
              </Link>
            </div>

            <div
              style={{
                marginTop: "32px",
                display: "flex",
                alignItems: "center",
                gap: "20px",
                fontSize: "0.8rem",
                color: "var(--color-text-muted)"
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <CheckCircle2 size={16} color="var(--color-success)" /> Deterministic first
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <CheckCircle2 size={16} color="var(--color-success)" /> Human in the loop
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <CheckCircle2 size={16} color="var(--color-success)" /> Audit trail ready
              </span>
            </div>
          </div>

          {/* Right Column: Hero Preview Card Mockup */}
          <div style={{ position: "relative" }}>
            <div
              style={{
                position: "absolute",
                inset: -12,
                background: "linear-gradient(135deg, rgba(1, 118, 211, 0.15) 0%, rgba(2, 132, 199, 0.05) 100%)",
                borderRadius: "var(--radius-xl)",
                filter: "blur(20px)",
                zIndex: 0
              }}
            />

            <div
              className="ds-card"
              style={{
                position: "relative",
                zIndex: 1,
                border: "1px solid var(--border-color)",
                boxShadow: "var(--shadow-lg)",
                overflow: "hidden"
              }}
            >
              {/* Mock App Window Header */}
              <div
                style={{
                  padding: "12px 18px",
                  background: "#f1f5f9",
                  borderBottom: "1px solid var(--border-color)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }}
              >
                <div style={{ display: "flex", gap: "6px" }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981" }} />
                </div>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-text-muted)" }}>
                  DataSutra Dashboard Preview • leads.csv
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--color-success)", fontWeight: 600 }}>
                  ● 94% Quality
                </span>
              </div>

              {/* Mock Dashboard Body */}
              <div style={{ padding: "20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                  <div style={{ padding: "12px", background: "var(--color-bg-page)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color-subtle)" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Processed Rows</div>
                    <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--color-text-main)" }}>1,200</div>
                  </div>
                  <div style={{ padding: "12px", background: "var(--color-bg-page)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color-subtle)" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Duplicates Flagged</div>
                    <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--color-warning)" }}>34</div>
                  </div>
                </div>

                {/* Mini Preview Table */}
                <div style={{ border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                  <div style={{ background: "#f8fafc", padding: "8px 12px", fontSize: "0.75rem", fontWeight: 600, display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
                    <span>Original</span>
                    <span>Cleaned</span>
                    <span>Rule</span>
                  </div>
                  <div style={{ padding: "8px 12px", fontSize: "0.75rem", borderTop: "1px solid var(--border-color-subtle)", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", alignItems: "center" }}>
                    <span style={{ color: "#b45309", fontFamily: "var(--font-mono)" }}>RAHUL@GMAIL.COM</span>
                    <span style={{ color: "var(--color-success-text)", fontWeight: 600 }}>rahul@gmail.com</span>
                    <span style={{ color: "var(--color-text-muted)" }}>Normalize Email</span>
                  </div>
                  <div style={{ padding: "8px 12px", fontSize: "0.75rem", borderTop: "1px solid var(--border-color-subtle)", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", alignItems: "center" }}>
                    <span style={{ color: "#b45309", fontFamily: "var(--font-mono)" }}>mumbai</span>
                    <span style={{ color: "var(--color-success-text)", fontWeight: 600 }}>Mumbai</span>
                    <span style={{ color: "var(--color-text-muted)" }}>Standardize City</span>
                  </div>
                  <div style={{ padding: "8px 12px", fontSize: "0.75rem", borderTop: "1px solid var(--border-color-subtle)", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", alignItems: "center" }}>
                    <span style={{ color: "var(--color-ai)", fontFamily: "var(--font-mono)" }}>Bombay</span>
                    <span style={{ color: "var(--color-ai-text)", fontWeight: 600 }}>Mumbai (Review)</span>
                    <span style={{ color: "var(--color-ai)" }}>AI Suggestion</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Cards Section */}
      <section id="features" style={{ padding: "80px 24px", maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "54px" }}>
          <h2 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--color-text-main)", marginBottom: "12px" }}>
            Engineered for Precision Data Quality
          </h2>
          <p style={{ maxWidth: 600, margin: "0 auto", fontSize: "1rem" }}>
            A structured two-stage pipeline combining deterministic rule execution with
            assisted suggestions for unresolved records.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "24px"
          }}
        >
          {featureCards.map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.title}
                className="ds-card"
                style={{
                  padding: "32px 24px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease"
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "var(--radius-lg)",
                    backgroundColor: "var(--color-bg-subtle)",
                    color: feat.accent,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  <Icon size={24} />
                </div>
                <h3 style={{ fontSize: "1.15rem", fontWeight: 600, color: "var(--color-text-main)" }}>
                  {feat.title}
                </h3>
                <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
                  {feat.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section
        style={{
          padding: "64px 24px",
          backgroundColor: "#f8fafc",
          borderTop: "1px solid var(--border-color)",
          textAlign: "center"
        }}
      >
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <h2 style={{ fontSize: "1.85rem", fontWeight: 700, marginBottom: "12px" }}>
            Ready to upgrade your data quality workflow?
          </h2>
          <p style={{ marginBottom: "28px", fontSize: "0.95rem" }}>
            Start cleaning your datasets with deterministic accuracy and human-in-the-loop review.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "16px" }}>
            <Link to="/register">
              <Button variant="primary" size="lg">
                Create Free Account
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="secondary" size="lg">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          padding: "32px 24px",
          borderTop: "1px solid var(--border-color)",
          backgroundColor: "#ffffff",
          fontSize: "0.85rem",
          color: "var(--color-text-muted)"
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px"
          }}
        >
          <Logo size="sm" showSubtitle={false} />
          <div>© {new Date().getFullYear()} DataSutra Inc. All rights reserved.</div>
          <div style={{ display: "flex", gap: "20px" }}>
            <a href="#privacy" style={{ color: "var(--color-text-muted)" }}>Privacy Policy</a>
            <a href="#terms" style={{ color: "var(--color-text-muted)" }}>Terms of Service</a>
            <a href="#security" style={{ color: "var(--color-text-muted)" }}>Security</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
