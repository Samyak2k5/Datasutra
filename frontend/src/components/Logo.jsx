import React from "react";
import { Link } from "react-router-dom";

export default function Logo({ size = "md", linkTo = "/", showSubtitle = false }) {
  const iconSizes = {
    sm: 24,
    md: 30,
    lg: 38
  };

  const fontSizes = {
    sm: "1.1rem",
    md: "1.3rem",
    lg: "1.65rem"
  };

  const currentIconSize = iconSizes[size] || 30;
  const currentFontSize = fontSizes[size] || "1.3rem";

  const logoContent = (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", userSelect: "none" }}>
      {/* Custom DataSutra Emblem: Data Node Cloud + Filtration Quality Diamond */}
      <svg
        width={currentIconSize}
        height={currentIconSize}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        <defs>
          <linearGradient id="dsGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0176d3" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>
          <linearGradient id="dsGlow" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0284c7" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>

        {/* Outer shield/cloud rounded background */}
        <rect x="2" y="2" width="36" height="36" rx="9" fill="url(#dsGradient)" />

        {/* Clean Data Filtration Matrix / Geometric Nodes */}
        {/* Layer 1: Left Node */}
        <circle cx="13" cy="20" r="3.5" fill="#ffffff" fillOpacity="0.9" />
        {/* Connecting Lines */}
        <path d="M14.5 18.5L20 12.5" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M14.5 21.5L20 27.5" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
        {/* Layer 2: Top & Bottom Nodes */}
        <circle cx="20" cy="12.5" r="3" fill="#ffffff" fillOpacity="0.8" />
        <circle cx="20" cy="27.5" r="3" fill="#ffffff" fillOpacity="0.8" />
        {/* Converging into Pure Clean Target Node */}
        <path d="M22 13L27.5 19" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M22 27L27.5 21" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
        {/* Master Quality Node with Pure Spark */}
        <circle cx="28" cy="20" r="4.5" fill="#ffffff" />
        <path
          d="M26.2 20.1L27.4 21.3L29.8 18.7"
          stroke="#0176d3"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <span
          style={{
            fontSize: currentFontSize,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: "var(--color-text-main)",
            lineHeight: 1.1
          }}
        >
          Data<span style={{ color: "var(--color-primary)" }}>Sutra</span>
        </span>
        {showSubtitle && (
          <span
            style={{
              fontSize: "0.68rem",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--color-text-muted)",
              marginTop: 1
            }}
          >
            Data Quality Platform
          </span>
        )}
      </div>
    </div>
  );

  if (linkTo) {
    return <Link to={linkTo} style={{ display: "inline-block" }}>{logoContent}</Link>;
  }

  return logoContent;
}
