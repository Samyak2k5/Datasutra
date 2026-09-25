import React from "react";
import { Database } from "lucide-react";
import Button from "./Button";

export default function EmptyState({
  title = "No data found",
  description = "There are no records matching your criteria.",
  icon: Icon = Database,
  actionText,
  onAction
}) {
  return (
    <div style={{
      textAlign: "center",
      padding: "48px 24px",
      background: "var(--color-bg-surface)",
      borderRadius: "var(--radius-lg)",
      border: "1px dashed var(--border-color)"
    }}>
      <div style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 52,
        height: 52,
        borderRadius: "50%",
        background: "var(--color-bg-subtle)",
        color: "var(--color-text-muted)",
        marginBottom: 16
      }}>
        <Icon size={26} />
      </div>
      <h3 style={{ fontSize: "1.1rem", marginBottom: 6, fontWeight: 600 }}>{title}</h3>
      <p style={{ maxWidth: 400, margin: "0 auto 20px auto", color: "var(--color-text-muted)", fontSize: "0.875rem" }}>
        {description}
      </p>
      {actionText && (
        <Button variant="primary" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  );
}
