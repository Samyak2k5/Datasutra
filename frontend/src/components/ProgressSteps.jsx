import React from "react";
import { CheckCircle2, Loader2, Circle, AlertCircle } from "lucide-react";
import StatusBadge from "./StatusBadge";

export default function ProgressSteps({ steps = [], overallProgress = 45 }) {
  return (
    <div className="ds-card" style={{ padding: "28px" }}>
      {/* Progress Bar Header */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text-main)" }}>
            Overall Cleaning Progress
          </span>
          <span
            style={{
              fontSize: "1.1rem",
              fontWeight: 700,
              color: "var(--color-primary)",
              fontFamily: "var(--font-mono)"
            }}
          >
            {overallProgress}%
          </span>
        </div>

        <div
          style={{
            height: 10,
            borderRadius: "var(--radius-full)",
            backgroundColor: "var(--color-bg-subtle)",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${overallProgress}%`,
              backgroundColor: "var(--color-primary)",
              borderRadius: "var(--radius-full)",
              transition: "width 0.4s ease"
            }}
          />
        </div>
      </div>

      {/* Step by step list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {steps.map((step, index) => {
          let icon = <Circle size={18} style={{ color: "var(--color-text-light)" }} />;
          let textColor = "var(--color-text-muted)";
          let fontWeight = 400;

          if (step.status === "completed") {
            icon = <CheckCircle2 size={20} style={{ color: "var(--color-success)" }} />;
            textColor = "var(--color-text-main)";
            fontWeight = 500;
          } else if (step.status === "processing") {
            icon = <Loader2 size={20} className="spinner" style={{ color: "var(--color-primary)" }} />;
            textColor = "var(--color-primary)";
            fontWeight = 600;
          } else if (step.status === "failed") {
            icon = <AlertCircle size={20} style={{ color: "var(--color-danger)" }} />;
            textColor = "var(--color-danger)";
            fontWeight = 600;
          }

          return (
            <div
              key={step.id || index}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                backgroundColor: step.status === "processing" ? "var(--color-primary-light)" : "transparent",
                border: step.status === "processing" ? "1px solid var(--color-primary-border)" : "1px solid transparent"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {icon}
                <div>
                  <span style={{ fontSize: "0.875rem", color: textColor, fontWeight }}>
                    {step.label}
                  </span>
                  {step.detail && (
                    <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: 2 }}>
                      {step.detail}
                    </div>
                  )}
                </div>
              </div>

              <StatusBadge status={step.status} size="sm" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
