import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Download,
  FileText,
  Sparkles,
  CheckCircle2
} from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import api from "../services/api";
import { mockCleaningResults } from "../data/mockData";

export default function CleaningResults() {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get("jobId");

  const [activeTab, setActiveTab] = useState("all");
  const [showExportModal, setShowExportModal] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [exportFormat, setExportFormat] = useState("csv");
  const [exporting, setExporting] = useState(false);

  const [activeFormat, setActiveFormat] = useState("PDF"); // PDF | DOCX | JSON | CSV
  const [realReport, setRealReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reportError, setReportError] = useState(null);

  useEffect(() => {
    if (!jobId) return;

    let isMounted = true;
    async function loadReport() {
      try {
        setLoading(true);
        const res = await api.getCleaningJobReport(jobId);
        if (isMounted && res?.data) {
          setRealReport(res.data);
          if (res.data.dataset?.sourceFormat) {
            const fmt = res.data.dataset.sourceFormat.toUpperCase();
            if (["PDF", "DOCX", "JSON", "CSV", "XLSX"].includes(fmt)) {
              setActiveFormat(fmt);
            }
          }
        }
      } catch (err) {
        if (isMounted) setReportError(err.message || "Failed to load cleaning report.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadReport();
    return () => {
      isMounted = false;
    };
  }, [jobId]);

  // Multi-format source extraction metrics profiles
  const formatProfiles = {
    PDF: {
      fileName: realReport?.dataset?.originalName || "customer_directory_2026.pdf",
      format: "PDF",
      badgeColor: "#ef4444",
      totalRows: realReport?.metrics?.totalRows || 1200,
      cleanedRows: realReport?.metrics?.cleanRows || 450,
      duplicates: realReport?.duplicateReport?.duplicateRows || 34,
      missing: realReport?.missingReport?.missingValueCount || 56,
      aiSuggestions: realReport?.aiReport?.suggestions || 18,
      pages: realReport?.dataset?.pageCount || 32,
      tables: realReport?.dataset?.tableCount || 8,
      classifiedType: "Tabular Directory / Customer Roster",
      extractionConfidence: "99%",
      ocrStatus: "NOT_REQUIRED (Direct Vector Text)",
      normalizedHeaders: ["cust_nm → name", "tel_num → phone", "addr_city → city"]
    },
    DOCX: {
      fileName: realReport?.dataset?.originalName || "lead_generation_intake.docx",
      format: "DOCX",
      badgeColor: "#2563eb",
      totalRows: realReport?.metrics?.totalRows || 840,
      cleanedRows: realReport?.metrics?.cleanRows || 310,
      duplicates: realReport?.duplicateReport?.duplicateRows || 18,
      missing: realReport?.missingReport?.missingValueCount || 42,
      aiSuggestions: realReport?.aiReport?.suggestions || 12,
      pages: realReport?.dataset?.pageCount || 14,
      tables: realReport?.dataset?.tableCount || 3,
      classifiedType: "Word ML Structured Report",
      extractionConfidence: "98%",
      ocrStatus: "NOT_REQUIRED (XML Structured Content)",
      normalizedHeaders: ["client_name → name", "contact_email → email"]
    },
    JSON: {
      fileName: realReport?.dataset?.originalName || "api_customer_feed.json",
      format: "JSON",
      badgeColor: "#f59e0b",
      totalRows: realReport?.metrics?.totalRows || 2450,
      cleanedRows: realReport?.metrics?.cleanRows || 780,
      duplicates: realReport?.duplicateReport?.duplicateRows || 62,
      missing: realReport?.missingReport?.missingValueCount || 84,
      aiSuggestions: realReport?.aiReport?.suggestions || 28,
      pages: null,
      tables: null,
      classifiedType: "Nested JSON API Feed (Flattened)",
      extractionConfidence: "100%",
      ocrStatus: "N/A (Structured JSON)",
      normalizedHeaders: ["user.profile.name → name", "meta.geo.city → city"]
    },
    CSV: {
      fileName: realReport?.dataset?.originalName || "leads.csv",
      format: "CSV",
      badgeColor: "#10b981",
      totalRows: realReport?.metrics?.totalRows || 1200,
      cleanedRows: realReport?.metrics?.cleanRows || 450,
      duplicates: realReport?.duplicateReport?.duplicateRows || 34,
      missing: realReport?.missingReport?.missingValueCount || 56,
      aiSuggestions: realReport?.aiReport?.suggestions || 18,
      pages: null,
      tables: null,
      classifiedType: "Standard Delimited Table",
      extractionConfidence: "100%",
      ocrStatus: "N/A (Tabular Text)",
      normalizedHeaders: ["phone_num → phone"]
    }
  };

  const currentProfile = formatProfiles[activeFormat] || formatProfiles.CSV;

  const totalRowsCount = realReport ? (realReport.metrics?.totalRows ?? realReport.dataset?.totalRows ?? 0) : currentProfile.totalRows;
  const _cleanedRowsCount = realReport ? (realReport.metrics?.cleanRows ?? 0) : currentProfile.cleanedRows;
  const modifiedRowsCount = realReport ? (realReport.metrics?.modifiedRows ?? 0) : currentProfile.cleanedRows;
  const duplicateCount = realReport ? (realReport.duplicateReport?.duplicateRows ?? 0) : currentProfile.duplicates;
  const missingCount = realReport ? (realReport.missingReport?.missingValueCount ?? 0) : currentProfile.missing;
  const aiCount = realReport ? (realReport.aiReport?.suggestions ?? realReport.aiReport?.candidates ?? 0) : currentProfile.aiSuggestions;
  const unresolvedCount = realReport ? (realReport.reviewSummary?.pending ?? 0) : (jobId ? 0 : 12);
  const qualityScore = realReport?.qualityScore || {
    overall: 98,
    completeness: 99,
    validity: 98,
    uniqueness: 97,
    consistency: 98,
    explanation: "The DataSutra Data Quality Score is a deterministic, weighted aggregate calculated from measurable dimensions: Completeness (30%), Validity (30%), Uniqueness (20%), and Consistency (20%)."
  };

  // Tab definitions with count badges
  const tabs = [
    { id: "all", label: "All Records", count: totalRowsCount },
    { id: "changed", label: "Changed", count: modifiedRowsCount },
    { id: "duplicates", label: "Duplicates", count: duplicateCount },
    { id: "missing", label: "Missing", count: missingCount },
    { id: "ai", label: "AI Suggestions", count: aiCount, isAi: true },
    { id: "unresolved", label: "Unresolved", count: unresolvedCount }
  ];

  const realRows = realReport?.transformationLog?.length > 0
    ? realReport.transformationLog.map((t, idx) => ({
        id: `t_${idx}_${t.rowNumber}_${t.field}`,
        rowNumber: t.rowNumber,
        field: t.field,
        originalValue: t.originalValue === "" ? "(Empty cell)" : String(t.originalValue ?? ""),
        cleanedValue: t.cleanedValue === "" ? "(Removed)" : String(t.cleanedValue ?? ""),
        ruleApplied: t.rule || "Standardization",
        reason: t.reason || "Cleaned by pipeline",
        status: t.source === "ai" ? "AI Suggestion" : "Changed",
        isAi: t.source === "ai",
        category: t.source === "ai" ? "Unresolved" : "Changed",
        provenance: t.provenance
      }))
    : (realReport?.preview?.length > 0
        ? realReport.preview.flatMap((r, rIdx) => {
            const changes = r.changes || [];
            if (changes.length > 0) {
              return changes.map((chg, chgIdx) => ({
                id: `p_${rIdx}_${chgIdx}`,
                rowNumber: r.rowNumber,
                field: chg.field,
                originalValue: chg.originalValue === "" ? "(Empty cell)" : String(chg.originalValue ?? ""),
                cleanedValue: chg.cleanedValue === "" ? "(Removed)" : String(chg.cleanedValue ?? ""),
                ruleApplied: chg.rule || "Standardization",
                reason: chg.reason || "Standardized by rule engine",
                status: chg.source === "ai" ? "AI Suggestion" : "Changed",
                isAi: chg.source === "ai",
                category: "Changed",
                provenance: r.provenance
              }));
            }
            return [];
          })
        : null);

  const baseResults = realRows || mockCleaningResults;

  const filteredResults = baseResults.filter((item) => {
    if (activeTab === "all") return true;
    if (activeTab === "changed") return item.status === "Changed" || item.category === "Changed";
    if (activeTab === "duplicates") return item.status === "Duplicate" || item.category === "Duplicate";
    if (activeTab === "missing") return item.status === "Missing" || item.category === "Missing";
    if (activeTab === "ai") return item.isAi;
    if (activeTab === "unresolved") return item.category === "Unresolved" || item.status === "AI Suggestion";
    return true;
  });

  const handleDownload = async () => {
    if (jobId) {
      try {
        setExporting(true);
        await api.exportCleanedData(jobId, exportFormat);
        setDownloadSuccess(true);
        setTimeout(() => setDownloadSuccess(false), 4000);
      } catch (err) {
        alert(err.message || "Export failed.");
      } finally {
        setExporting(false);
        setShowExportModal(false);
      }
    } else {
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
      setShowExportModal(false);
    }
  };

  const getProvenanceBadge = (index) => {
    const rowNum = index + 1;
    if (activeFormat === "PDF") {
      const page = Math.ceil(rowNum / 5) + 1;
      return `Page ${page} • Table 1 • Row ${rowNum}`;
    }
    if (activeFormat === "DOCX") {
      return `Table 1 • Row ${rowNum}`;
    }
    if (activeFormat === "JSON") {
      return `data.items[${rowNum - 1}]`;
    }
    return `Line ${rowNum + 1}`;
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "2px 8px",
                borderRadius: "var(--radius-full)",
                fontSize: "0.725rem",
                fontWeight: 700,
                backgroundColor: `${currentProfile.badgeColor}18`,
                color: currentProfile.badgeColor,
                border: `1px solid ${currentProfile.badgeColor}40`
              }}
            >
              {currentProfile.format} SOURCE
            </span>
            <span style={{ fontSize: "0.825rem", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
              {currentProfile.fileName}
            </span>
          </div>
          <h1 className="page-header-title">Cleaning Results</h1>
          <p className="page-header-subtitle">
            Processed: <strong>{currentProfile.totalRows.toLocaleString()} rows</strong> · Cleaned: <strong>{currentProfile.cleanedRows.toLocaleString()} rows</strong> · Unresolved: <strong>{currentProfile.aiSuggestions} AI suggestions</strong>
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <Link to={jobId ? `/review?jobId=${jobId}` : "/review"}>
            <Button variant="outline" size="md" icon={Sparkles}>
              Review Suggestions ({currentProfile.aiSuggestions})
            </Button>
          </Link>

          <Button
            variant="secondary"
            size="md"
            icon={FileText}
            onClick={() => setShowExportModal(true)}
          >
            Export Report
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={Download}
            onClick={handleDownload}
          >
            Download Cleaned Data
          </Button>
        </div>
      </div>

      {reportError && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "var(--color-danger-bg)",
            border: "1px solid var(--color-danger-border)",
            borderRadius: "var(--radius-md)",
            color: "var(--color-danger-text)",
            fontSize: "0.85rem",
            marginBottom: "16px"
          }}
        >
          {reportError}
        </div>
      )}

      {loading && (
        <div
          style={{
            padding: "8px 14px",
            backgroundColor: "var(--color-primary-light)",
            border: "1px solid var(--color-primary-border)",
            borderRadius: "var(--radius-md)",
            color: "var(--color-primary)",
            fontSize: "0.825rem",
            marginBottom: "16px"
          }}
        >
          Loading latest cleaning job report and quality metrics...
        </div>
      )}

      {/* Format Switcher Pills */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "16px",
          flexWrap: "wrap",
          padding: "10px 14px",
          backgroundColor: "var(--color-bg-subtle)",
          borderRadius: "var(--radius-md)",
          fontSize: "0.825rem"
        }}
      >
        <span style={{ color: "var(--color-text-muted)", fontWeight: 600 }}>
          View Results For Format:
        </span>
        {Object.keys(formatProfiles).map((fmt) => (
          <button
            key={fmt}
            onClick={() => setActiveFormat(fmt)}
            style={{
              padding: "4px 10px",
              borderRadius: "var(--radius-sm)",
              border: activeFormat === fmt ? `1.5px solid ${formatProfiles[fmt].badgeColor}` : "1px solid var(--border-color)",
              backgroundColor: activeFormat === fmt ? "#ffffff" : "transparent",
              color: activeFormat === fmt ? formatProfiles[fmt].badgeColor : "var(--color-text-main)",
              fontWeight: activeFormat === fmt ? 700 : 500,
              cursor: "pointer",
              fontSize: "0.8rem"
            }}
          >
            {fmt} ({formatProfiles[fmt].fileName})
          </button>
        ))}
      </div>

      {/* Source Extraction & Document Intelligence Details Card */}
      <div
        className="ds-card"
        style={{
          marginBottom: "20px",
          padding: "16px 20px",
          backgroundColor: "#f8fafc",
          border: "1px solid #e2e8f0"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700, color: "var(--color-text-muted)" }}>
              Multi-Format Source Extraction Metrics
            </div>
            <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--color-text-main)", marginTop: "3px" }}>
              {currentProfile.classifiedType}
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {currentProfile.pages && (
              <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                📄 <strong>{currentProfile.pages}</strong> Pages
              </span>
            )}
            {currentProfile.tables && (
              <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                📊 <strong>{currentProfile.tables}</strong> Tables Detected
              </span>
            )}
            <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
              ⚡ Confidence: <strong style={{ color: "#16a34a" }}>{currentProfile.extractionConfidence}</strong>
            </span>
            <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
              🛡️ OCR: <strong>{currentProfile.ocrStatus}</strong>
            </span>
          </div>
        </div>

        <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "0.775rem" }}>
          <span style={{ color: "var(--color-text-muted)", fontWeight: 600 }}>Normalized Header Aliases:</span>
          {currentProfile.normalizedHeaders.map((hdr, i) => (
            <span
              key={i}
              style={{
                backgroundColor: "#e0f2fe",
                color: "#0369a1",
                padding: "2px 6px",
                borderRadius: "var(--radius-xs)",
                fontFamily: "var(--font-mono)"
              }}
            >
              {hdr}
            </span>
          ))}
          <span style={{ marginLeft: "auto", color: "var(--color-text-muted)", fontStyle: "italic" }}>
            All records unified into Common Structured Model (Step 7–10 engine)
          </span>
        </div>
      </div>

      {/* Success Notification */}
      {downloadSuccess && (
        <div
          style={{
            marginBottom: "20px",
            padding: "14px 18px",
            backgroundColor: "var(--color-success-bg)",
            border: "1px solid var(--color-success-border)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            color: "var(--color-success-text)",
            fontSize: "0.875rem"
          }}
        >
          <CheckCircle2 size={18} />
          <span>
            Cleaned dataset <strong>{currentProfile.fileName.replace(/\.[^/.]+$/, "")}_cleaned.{activeFormat.toLowerCase() === "pdf" || activeFormat.toLowerCase() === "docx" ? "csv" : activeFormat.toLowerCase()}</strong> successfully generated and downloaded!
          </span>
        </div>
      )}

      {/* Metric summary banner */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "14px",
          marginBottom: "24px"
        }}
      >
        <div className="ds-card" style={{ padding: "14px 18px", borderLeft: "4px solid #0176d3" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Total Rows</div>
          <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--color-text-main)" }}>{currentProfile.totalRows.toLocaleString()}</div>
        </div>
        <div className="ds-card" style={{ padding: "14px 18px", borderLeft: "4px solid #16a34a" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Rows Cleaned</div>
          <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#16a34a" }}>{currentProfile.cleanedRows.toLocaleString()}</div>
        </div>
        <div className="ds-card" style={{ padding: "14px 18px", borderLeft: "4px solid #f59e0b" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Duplicates Flagged</div>
          <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#f59e0b" }}>{currentProfile.duplicates}</div>
        </div>
        <div className="ds-card" style={{ padding: "14px 18px", borderLeft: "4px solid #dc2626" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Missing Data</div>
          <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#dc2626" }}>{currentProfile.missing}</div>
        </div>
        <div className="ds-card" style={{ padding: "14px 18px", borderLeft: "4px solid #7c3aed" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>AI Suggestions</div>
          <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#7c3aed" }}>{currentProfile.aiSuggestions}</div>
        </div>
      </div>

      {/* Transparent Data Quality Scorecard Banner */}
      <div
        className="ds-card"
        style={{
          marginBottom: "24px",
          padding: "20px 24px",
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, color: "var(--color-primary)" }}>
              Transparent Data Quality Score
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginTop: "4px" }}>
              <span style={{ fontSize: "2.2rem", fontWeight: 800, color: "var(--color-text-main)" }}>
                {qualityScore.overall ?? 100}%
              </span>
              <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                Deterministic Multidimensional Quality Assessment
              </span>
            </div>
          </div>
          <div style={{ maxWidth: 460, fontSize: "0.8rem", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
            {qualityScore.explanation || "Calculated deterministically from four measurable dimensions without black-box adjustments."}
          </div>
        </div>

        {/* 4 Transparent Dimension Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
          <div style={{ padding: "12px", backgroundColor: "#f8fafc", borderRadius: "var(--radius-md)", border: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", fontWeight: 600 }}>
              <span>Completeness (30%)</span>
              <span style={{ color: "#0284c7" }}>{qualityScore.completeness ?? 100}%</span>
            </div>
            <div style={{ height: "6px", backgroundColor: "#e2e8f0", borderRadius: "3px", marginTop: "6px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${qualityScore.completeness ?? 100}%`, backgroundColor: "#0284c7" }} />
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--color-text-light)", marginTop: "4px" }}>
              Formula: 100 × (Populated Cells ÷ Total Cells)
            </div>
          </div>

          <div style={{ padding: "12px", backgroundColor: "#f8fafc", borderRadius: "var(--radius-md)", border: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", fontWeight: 600 }}>
              <span>Validity (30%)</span>
              <span style={{ color: "#16a34a" }}>{qualityScore.validity ?? 100}%</span>
            </div>
            <div style={{ height: "6px", backgroundColor: "#e2e8f0", borderRadius: "3px", marginTop: "6px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${qualityScore.validity ?? 100}%`, backgroundColor: "#16a34a" }} />
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--color-text-light)", marginTop: "4px" }}>
              Formula: 100 × (Syntax-Valid Rows ÷ Total Rows)
            </div>
          </div>

          <div style={{ padding: "12px", backgroundColor: "#f8fafc", borderRadius: "var(--radius-md)", border: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", fontWeight: 600 }}>
              <span>Uniqueness (20%)</span>
              <span style={{ color: "#f59e0b" }}>{qualityScore.uniqueness ?? 100}%</span>
            </div>
            <div style={{ height: "6px", backgroundColor: "#e2e8f0", borderRadius: "3px", marginTop: "6px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${qualityScore.uniqueness ?? 100}%`, backgroundColor: "#f59e0b" }} />
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--color-text-light)", marginTop: "4px" }}>
              Formula: 100 × (Unique Records ÷ Total Rows)
            </div>
          </div>

          <div style={{ padding: "12px", backgroundColor: "#f8fafc", borderRadius: "var(--radius-md)", border: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", fontWeight: 600 }}>
              <span>Consistency (20%)</span>
              <span style={{ color: "#8b5cf6" }}>{qualityScore.consistency ?? 100}%</span>
            </div>
            <div style={{ height: "6px", backgroundColor: "#e2e8f0", borderRadius: "3px", marginTop: "6px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${qualityScore.consistency ?? 100}%`, backgroundColor: "#8b5cf6" }} />
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--color-text-light)", marginTop: "4px" }}>
              Formula: 100 × (Conflict-Free Rows ÷ Total Rows)
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border-color)",
          marginBottom: "18px",
          gap: "8px",
          overflowX: "auto"
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                border: "none",
                borderBottom: isActive ? "3px solid var(--color-primary)" : "3px solid transparent",
                backgroundColor: "transparent",
                color: isActive ? "var(--color-primary)" : "var(--color-text-muted)",
                fontWeight: isActive ? 600 : 500,
                fontSize: "0.875rem",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease"
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: "0.725rem",
                  padding: "1px 7px",
                  borderRadius: "var(--radius-full)",
                  backgroundColor: isActive
                    ? "var(--color-primary-light)"
                    : "var(--color-bg-subtle)",
                  color: isActive
                    ? "var(--color-primary)"
                    : "var(--color-text-muted)",
                  fontWeight: 600
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Results Table */}
      <div className="ds-card" style={{ overflow: "hidden" }}>
        <div className="ds-table-container" style={{ border: "none", borderRadius: 0 }}>
          <table className="ds-table">
            <thead>
              <tr>
                <th style={{ width: "40px" }}>#</th>
                <th>Source Origin</th>
                <th>Original Value</th>
                <th>Cleaned Value</th>
                <th>Rule Applied</th>
                <th>Reason</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: "center", padding: "48px 16px", color: "var(--color-text-muted)" }}>
                    <CheckCircle2 size={36} color="#16a34a" style={{ margin: "0 auto 12px auto" }} />
                    <div style={{ fontWeight: 600, fontSize: "1rem", color: "var(--color-text-main)" }}>
                      {activeTab === "duplicates" ? "No duplicate records detected" :
                       activeTab === "missing" ? "No missing values detected" :
                       activeTab === "ai" ? "No AI suggestions required (resolved deterministically)" :
                       activeTab === "unresolved" ? "No unresolved review items pending" :
                       "No transformation records match the selected filter"}
                    </div>
                    <p style={{ fontSize: "0.825rem", marginTop: 4 }}>
                      All items in this view satisfy data quality criteria.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredResults.map((row, idx) => (
                  <tr key={row.id}>
                    <td style={{ color: "var(--color-text-light)", fontWeight: 600 }}>
                      {idx + 1}
                    </td>

                    {/* Provenance */}
                    <td>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.75rem",
                          padding: "2px 6px",
                          backgroundColor: "var(--color-bg-subtle)",
                          color: "var(--color-text-muted)",
                          borderRadius: "var(--radius-xs)",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {getProvenanceBadge(idx)}
                      </span>
                    </td>

                    {/* Original Value */}
                    <td>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.825rem",
                          padding: "2px 6px",
                          backgroundColor: "#fef2f2",
                          color: "#991b1b",
                          borderRadius: "var(--radius-xs)"
                        }}
                      >
                        {row.originalValue}
                      </span>
                    </td>

                    {/* Cleaned Value */}
                    <td>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.825rem",
                          padding: "2px 6px",
                          backgroundColor: row.isAi ? "var(--color-ai-bg)" : "#ecfdf5",
                          color: row.isAi ? "var(--color-ai-text)" : "#065f46",
                          borderRadius: "var(--radius-xs)",
                          fontWeight: 600
                        }}
                      >
                        {row.cleanedValue}
                      </span>
                    </td>

                    {/* Rule Applied */}
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        {row.isAi && <Sparkles size={14} color="var(--color-ai)" />}
                        <span style={{ fontWeight: 500 }}>{row.ruleApplied}</span>
                      </div>
                    </td>

                    {/* Reason */}
                    <td style={{ color: "var(--color-text-muted)", fontSize: "0.825rem", maxWidth: 260 }}>
                      {row.reason}
                    </td>

                    {/* Status Badge */}
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Export Report Modal */}
      <Modal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export Cleaning Audit Report"
        subtitle="Generate a compliance-ready PDF or CSV audit report of all changes."
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowExportModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleDownload} disabled={exporting}>
              {exporting ? "Generating..." : "Generate Report"}
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label className="ds-form-label">Report Format</label>
            <select
              className="ds-select"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
            >
              <option value="csv">Cleaned Data (CSV)</option>
              <option value="json">Machine-Readable Cleaned Data (JSON)</option>
              <option value="report-csv">Detailed Transformation Diff (CSV)</option>
              <option value="pdf">Compliance & Quality Audit Report (TXT/PDF)</option>
            </select>
          </div>

          <div>
            <label className="ds-form-label">Scope</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.85rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input type="checkbox" defaultChecked /> Include deterministic rule changes (450)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input type="checkbox" defaultChecked /> Include duplicate candidate matches (34)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input type="checkbox" defaultChecked /> Include AI suggestion rationale & confidence (18)
              </label>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
