import React, { useState } from "react";
import { mockQualityOverview } from "../data/mockData";

export default function QualityChart({ data = mockQualityOverview }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  // SVG Donut calculation
  const size = 180;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const segments = data.categories.reduce((acc, cat, idx) => {
    const offset = acc.accumulated;
    const strokeDasharray = `${(cat.percentage / 100) * circumference} ${circumference}`;
    const strokeDashoffset = -((offset / 100) * circumference);
    return {
      accumulated: offset + cat.percentage,
      items: [...acc.items, { ...cat, strokeDasharray, strokeDashoffset, idx }]
    };
  }, { accumulated: 0, items: [] }).items;

  return (
    <div className="ds-card" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="ds-card-header">
        <div>
          <h3 className="ds-card-title">Data Quality Overview</h3>
          <p className="ds-card-subtitle">Aggregate health across active datasets</p>
        </div>
      </div>

      <div
        className="ds-card-body"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          gap: "24px",
          flexWrap: "wrap",
          padding: "24px",
          flex: 1
        }}
      >
        {/* SVG Donut Chart with 85% inside */}
        <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {/* Background Track */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke="#f1f5f9"
              strokeWidth={strokeWidth}
            />

            {/* Segments */}
            {segments.map((seg) => {
              const isHovered = hoveredIndex === seg.idx;

              return (
                <circle
                  key={seg.label}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="transparent"
                  stroke={seg.color}
                  strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={seg.strokeDasharray}
                  strokeDashoffset={seg.strokeDashoffset}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${center} ${center})`}
                  style={{
                    cursor: "pointer",
                    transition: "all 0.2s ease"
                  }}
                  onMouseEnter={() => setHoveredIndex(seg.idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              );
            })}
          </svg>

          {/* Center text badge */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              textAlign: "center",
              pointerEvents: "none"
            }}
          >
            <div
              style={{
                fontSize: "1.75rem",
                fontWeight: 800,
                color: "var(--color-text-main)",
                lineHeight: 1
              }}
            >
              {data.cleanDataPercent}%
            </div>
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--color-text-muted)",
                marginTop: 2
              }}
            >
              Clean Data
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: 160 }}>
          {data.categories.map((cat, idx) => (
            <div
              key={cat.label}
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                padding: "4px 8px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: hoveredIndex === idx ? "var(--color-bg-subtle)" : "transparent",
                cursor: "pointer",
                transition: "background-color 0.15s ease"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    backgroundColor: cat.color,
                    flexShrink: 0
                  }}
                />
                <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "var(--color-text-main)" }}>
                  {cat.label}
                </span>
              </div>
              <span
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: "var(--color-text-main)",
                  fontFamily: "var(--font-mono)"
                }}
              >
                {cat.percentage}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
