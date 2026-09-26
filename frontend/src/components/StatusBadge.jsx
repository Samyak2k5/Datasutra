import React from "react";

export default function StatusBadge({ status, label, size = "md" }) {
  const normStatus = (status || "").toLowerCase().trim();

  let badgeClass = "ds-badge-pending";
  let displayLabel = label || status || "Pending";

  if (["completed", "clean", "passed", "valid"].includes(normStatus)) {
    badgeClass = "ds-badge-completed";
  } else if (["processing", "running", "in progress"].includes(normStatus)) {
    badgeClass = "ds-badge-processing";
  } else if (["failed", "invalid", "error"].includes(normStatus)) {
    badgeClass = "ds-badge-failed";
  } else if (["changed", "normalized", "fixed"].includes(normStatus)) {
    badgeClass = "ds-badge-changed";
  } else if (["duplicate", "warning"].includes(normStatus)) {
    badgeClass = "ds-badge-duplicate";
  } else if (["missing"].includes(normStatus)) {
    badgeClass = "ds-badge-missing";
  } else if (["ai", "ai suggestion", "needs review", "suggested"].includes(normStatus)) {
    badgeClass = "ds-badge-ai";
  }

  const isSmall = size === "sm";

  return (
    <span
      className={`ds-badge ${badgeClass}`}
      style={isSmall ? { fontSize: "0.7rem", padding: "2px 6px" } : {}}
    >
      <span className="ds-badge-dot" />
      {displayLabel}
    </span>
  );
}
