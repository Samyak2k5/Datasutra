import React from "react";

export default function StatCard({
  title,
  value,
  subtext,
  icon: Icon,
  accentColor = "var(--color-primary)",
  badgeText
}) {
  return (
    <div
      className="ds-card"
      style={{
        padding: "20px 24px",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between"
      }}
    >
      {/* Top accent bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          backgroundColor: accentColor
        }}
      />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: "0.825rem", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
            {title}
          </span>
          <div
            style={{
              fontSize: "1.9rem",
              fontWeight: 700,
              color: "var(--color-text-main)",
              letterSpacing: "-0.03em",
              marginTop: 4,
              lineHeight: 1.1
            }}
          >
            {value}
          </div>
        </div>

        {Icon && (
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-bg-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: accentColor,
              flexShrink: 0
            }}
          >
            <Icon size={22} />
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        {subtext && (
          <span style={{ fontSize: "0.775rem", color: "var(--color-text-muted)" }}>
            {subtext}
          </span>
        )}
        {badgeText && (
          <span
            style={{
              fontSize: "0.725rem",
              fontWeight: 600,
              padding: "2px 6px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-bg-subtle)",
              color: accentColor
            }}
          >
            {badgeText}
          </span>
        )}
      </div>
    </div>
  );
}
