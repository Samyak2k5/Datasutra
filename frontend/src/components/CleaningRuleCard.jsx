import React from "react";

export default function CleaningRuleCard({
  id,
  label,
  description,
  enabled,
  onChange,
  isAi = false,
  badge
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "16px",
        padding: "16px 18px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-color)",
        backgroundColor: enabled
          ? isAi
            ? "var(--color-ai-bg)"
            : "var(--color-primary-light)"
          : "var(--color-bg-surface)",
        transition: "all 0.15s ease"
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: 4 }}>
          <label
            htmlFor={`rule-switch-${id}`}
            style={{
              fontSize: "0.925rem",
              fontWeight: 600,
              color: "var(--color-text-main)",
              cursor: "pointer"
            }}
          >
            {label}
          </label>
          {badge && (
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: isAi ? "var(--color-ai)" : "var(--color-primary)",
                color: "#ffffff"
              }}
            >
              {badge}
            </span>
          )}
        </div>
        <p style={{ fontSize: "0.825rem", color: "var(--color-text-muted)", lineHeight: 1.4 }}>
          {description}
        </p>
      </div>

      <label className="ds-switch" htmlFor={`rule-switch-${id}`}>
        <input
          type="checkbox"
          id={`rule-switch-${id}`}
          checked={enabled}
          onChange={(e) => onChange(id, e.target.checked)}
          aria-label={label}
        />
        <span
          className="ds-slider"
          style={
            enabled && isAi
              ? { backgroundColor: "var(--color-ai)" }
              : {}
          }
        />
      </label>
    </div>
  );
}
