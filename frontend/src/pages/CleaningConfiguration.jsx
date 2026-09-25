import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Play, RotateCcw, Info, AlertTriangle } from "lucide-react";
import CleaningRuleCard from "../components/CleaningRuleCard";
import Button from "../components/Button";
import api from "../services/api";
import { defaultDeterministicRules, defaultAiAssistedRules } from "../data/mockData";

export default function CleaningConfiguration() {
  const [searchParams] = useSearchParams();
  const datasetId = searchParams.get("datasetId");
  const [deterministicRules, setDeterministicRules] = useState(defaultDeterministicRules);
  const [aiRules, setAiRules] = useState(defaultAiAssistedRules);
  const [isStarting, setIsStarting] = useState(false);
  const [cleanError, setCleanError] = useState(null);

  const navigate = useNavigate();

  const handleToggleDeterministic = (id, checked) => {
    setDeterministicRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: checked } : r))
    );
  };

  const handleToggleAi = (id, checked) => {
    setAiRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: checked } : r))
    );
  };

  const handleReset = () => {
    setDeterministicRules(defaultDeterministicRules);
    setAiRules(defaultAiAssistedRules);
  };

  const activeDeterministicCount = deterministicRules.filter((r) => r.enabled).length;
  const activeAiCount = aiRules.filter((r) => r.enabled).length;

  const handleStartCleaning = async () => {
    setCleanError(null);
    const cleaningMode = activeAiCount > 0 ? "rules_then_ai" : "rules_only";

    if (datasetId) {
      try {
        setIsStarting(true);
        const res = await api.cleanDataset(datasetId, {
          cleaningMode
        });
        const jobId = res?.data?.job?.id;
        if (jobId) {
          navigate(`/progress?jobId=${jobId}&datasetId=${datasetId}`);
          return;
        }
      } catch (err) {
        setCleanError(err.message || "Failed to initiate dataset cleaning.");
        setIsStarting(false);
        return;
      }
    }

    navigate("/progress");
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Cleaning Configuration</h1>
          <p className="page-header-subtitle">
            Configure validation passes, deterministic hygiene rules, and assisted suggestions.
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <Button variant="secondary" size="md" icon={RotateCcw} onClick={handleReset} disabled={isStarting}>
            Reset Defaults
          </Button>
          <Button variant="primary" size="md" icon={Play} onClick={handleStartCleaning} disabled={isStarting}>
            {isStarting ? "Initiating Cleaning..." : "Start Cleaning"}
          </Button>
        </div>
      </div>

      {cleanError && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "var(--color-danger-bg)",
            border: "1px solid var(--color-danger-border)",
            borderRadius: "var(--radius-md)",
            color: "var(--color-danger-text)",
            fontSize: "0.85rem",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "20px"
          }}
        >
          <AlertTriangle size={18} />
          <span>{cleanError}</span>
        </div>
      )}

      {/* Critical Platform Architecture Callout Banner */}
      <div
        style={{
          padding: "16px 20px",
          backgroundColor: "var(--color-primary-light)",
          border: "1px solid var(--color-primary-border)",
          borderRadius: "var(--radius-lg)",
          display: "flex",
          alignItems: "flex-start",
          gap: "14px",
          marginBottom: "28px"
        }}
      >
        <Info size={22} color="var(--color-primary)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: "0.925rem", fontWeight: 700, color: "var(--color-primary)" }}>
            Deterministic Rules are Applied First
          </div>
          <p style={{ fontSize: "0.85rem", color: "#1e3a8a", marginTop: 2, lineHeight: 1.5 }}>
            Deterministic rules are executed locally on all rows first. Only unresolved or ambiguous
            records may be flagged for AI-assisted suggestions, preserving speed, zero unnecessary compute, and 100% auditable certainty.
          </p>
        </div>
      </div>

      {/* Two Column Grid for Configuration Rules */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: "28px",
          alignItems: "start"
        }}
      >
        {/* SECTION A: Deterministic Rules (JavaScript) */}
        <div className="ds-card" style={{ overflow: "hidden" }}>
          <div className="ds-card-header" style={{ backgroundColor: "#f8fafc" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 className="ds-card-title">Deterministic Rules (JavaScript)</h3>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "var(--radius-full)",
                    backgroundColor: "var(--color-success-bg)",
                    color: "var(--color-success-text)"
                  }}
                >
                  {activeDeterministicCount} Active
                </span>
              </div>
              <p className="ds-card-subtitle">
                100% predictable, fast, local code transformations
              </p>
            </div>
          </div>

          <div className="ds-card-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {deterministicRules.map((rule) => (
              <CleaningRuleCard
                key={rule.id}
                id={rule.id}
                label={rule.label}
                description={rule.description}
                enabled={rule.enabled}
                onChange={handleToggleDeterministic}
                badge={rule.enabled ? "JS Rule" : null}
              />
            ))}
          </div>
        </div>

        {/* SECTION B: AI-Assisted Processing */}
        <div className="ds-card" style={{ overflow: "hidden" }}>
          <div className="ds-card-header" style={{ backgroundColor: "#faf5ff" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 className="ds-card-title" style={{ color: "var(--color-ai)" }}>
                  AI-Assisted Processing
                </h3>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "var(--radius-full)",
                    backgroundColor: "var(--color-ai-bg)",
                    color: "var(--color-ai-text)"
                  }}
                >
                  {activeAiCount} Enabled
                </span>
              </div>
              <p className="ds-card-subtitle">
                Contextual suggestions for unresolved, ambiguous edge cases
              </p>
            </div>
          </div>

          <div className="ds-card-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {aiRules.map((rule) => (
              <CleaningRuleCard
                key={rule.id}
                id={rule.id}
                label={rule.label}
                description={rule.description}
                enabled={rule.enabled}
                onChange={handleToggleAi}
                isAi={true}
                badge={rule.enabled ? "Assisted" : "Optional"}
              />
            ))}

            <div
              style={{
                marginTop: "10px",
                padding: "12px 14px",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-bg-subtle)",
                border: "1px dashed var(--border-color)",
                fontSize: "0.8rem",
                color: "var(--color-text-muted)"
              }}
            >
              <strong>Human Verification:</strong> All AI-generated transformations are routed to the
              <em> Review Suggestions</em> queue and never modify the exported dataset without explicit operator approval.
            </div>
          </div>
        </div>
      </div>

      {/* Floating or Bottom Bar Action */}
      <div
        style={{
          marginTop: "32px",
          display: "flex",
          justifyContent: "flex-end",
          gap: "12px"
        }}
      >
        <Button variant="secondary" size="lg" onClick={() => navigate("/preview")}>
          Back to Preview
        </Button>
        <Button
          variant="primary"
          size="lg"
          icon={Play}
          iconPosition="right"
          onClick={handleStartCleaning}
        >
          Start Cleaning Pipeline
        </Button>
      </div>
    </div>
  );
}
