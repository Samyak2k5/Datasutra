import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Play,
  Pause,
  X,
  ArrowRight,
  FastForward,
  CheckCircle2,
  Sparkles,
  FileSpreadsheet,
  FileText,
  FileType,
  Database,
  AlertCircle
} from "lucide-react";
import ProgressSteps from "../components/ProgressSteps";
import Button from "../components/Button";
import api from "../services/api";

export default function CleaningProgress() {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get("jobId");

  const [progress, setProgress] = useState(jobId ? 25 : 45);
  const [isPaused, setIsPaused] = useState(false);
  const [activeFormat, setActiveFormat] = useState("NDJSON"); // NDJSON | PDF | DOCX | CSV
  const [realJob, setRealJob] = useState(null);
  const [jobError, setJobError] = useState(null);
  const navigate = useNavigate();

  // Multi-format configuration profiles
  const formatProfiles = {
    NDJSON: {
      fileName: "customers_large.ndjson",
      icon: Database,
      badgeColor: "#8b5cf6",
      totalRecords: 2450,
      batchSize: 500,
      processingMode: "Streaming Batch (500 records/chunk)",
      metaDetail: "2.4 MB • 5 Batches • Bounded Memory Buffer",
      aiCandidates: 28
    },
    PDF: {
      fileName: "financial_report.pdf",
      icon: FileText,
      badgeColor: "#ef4444",
      totalRecords: 1200,
      batchSize: 500,
      processingMode: "Multi-Page PDF Extraction + Batching",
      metaDetail: "32 Pages • 8 Tables Extracted • Magic Bytes %PDF-",
      aiCandidates: 18
    },
    DOCX: {
      fileName: "supplier_intake.docx",
      icon: FileType,
      badgeColor: "#2563eb",
      totalRecords: 840,
      batchSize: 500,
      processingMode: "Word Table & Paragraph Extraction",
      metaDetail: "3 Headings • 2 Tables • WordProcessingML",
      aiCandidates: 12
    },
    CSV: {
      fileName: "leads_2026.csv",
      icon: FileSpreadsheet,
      badgeColor: "#10b981",
      totalRecords: 1500,
      batchSize: 500,
      processingMode: "Streaming CSV Transform",
      metaDetail: "1.8 MB • UTF-8 Validated • 3 Batches",
      aiCandidates: 22
    }
  };

  const profile = formatProfiles[activeFormat];
  const totalBatches = Math.ceil(profile.totalRecords / profile.batchSize);
  const processedRecords = Math.min(
    profile.totalRecords,
    Math.round((progress / 100) * profile.totalRecords)
  );
  const currentBatch = Math.min(
    totalBatches,
    Math.max(1, Math.ceil((processedRecords || 1) / profile.batchSize))
  );

  const steps = [
    {
      id: 1,
      label: "Format & signature detection",
      status: "completed",
      detail: `Verified magic bytes & format signature for ${profile.fileName}`
    },
    {
      id: 2,
      label: "Unified parser extraction",
      status: "completed",
      detail: profile.metaDetail
    },
    {
      id: 3,
      label: "Stream batch chunking",
      status: progress >= 20 ? (progress >= 35 ? "completed" : "processing") : "pending",
      detail: `Partitioned into ${totalBatches} bounded batches (BATCH_SIZE: ${profile.batchSize})`
    },
    {
      id: 4,
      label: "Deterministic JavaScript rules",
      status: progress >= 35 ? (progress >= 60 ? "completed" : "processing") : "pending",
      detail: `Batch ${currentBatch}/${totalBatches}: Trimming whitespace, normalization & formatting`
    },
    {
      id: 5,
      label: "Duplicate & hash detection",
      status: progress >= 60 ? (progress >= 75 ? "completed" : "processing") : "pending",
      detail: `Cross-batch key index scanning • ${Math.round(processedRecords * 0.03)} duplicates found`
    },
    {
      id: 6,
      label: "Missing data handling",
      status: progress >= 75 ? (progress >= 88 ? "completed" : "processing") : "pending",
      detail: `Analyzing empty fields • Imputing defaults & flagging critical gaps`
    },
    {
      id: 7,
      label: "Batch-bounded AI assistance",
      status: progress >= 88 ? (progress >= 98 ? "completed" : "processing") : "pending",
      detail: `Processing ${profile.aiCandidates} unresolved candidates (isolated to current batch)`
    },
    {
      id: 8,
      label: "Audit compilation & artifact export",
      status: progress >= 100 ? "completed" : "pending",
      detail: "Generating change diff audit log, provenance map & cleaned file"
    }
  ];

  // Real job polling when jobId is provided
  useEffect(() => {
    if (!jobId) return;

    let isMounted = true;
    let pollInterval = null;

    async function pollJob() {
      try {
        const res = await api.getCleaningJob(jobId);
        if (!isMounted) return;
        const job = res?.data?.job;
        if (job) {
          setRealJob(job);
          if (job.status === "completed") {
            setProgress(100);
            if (pollInterval) clearInterval(pollInterval);
          } else if (job.status === "failed") {
            setJobError(job.errorMessage || "Cleaning pipeline failed.");
            if (pollInterval) clearInterval(pollInterval);
          } else if (typeof job.progressPercent === "number") {
            setProgress(Math.max(10, Math.min(99, job.progressPercent)));
          }
        }
      } catch (err) {
        if (isMounted) {
          setJobError(err.message || "Failed to fetch cleaning job status.");
        }
      }
    }

    pollJob();
    pollInterval = setInterval(pollJob, 1500);

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [jobId]);

  // Auto-progress simulation for local demo mode without jobId
  useEffect(() => {
    if (jobId || isPaused || progress >= 100) return;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          return 100;
        }
        return Math.min(100, prev + 5);
      });
    }, 1200);

    return () => clearInterval(timer);
  }, [jobId, isPaused, progress]);

  const handleFastForward = () => {
    setProgress(100);
  };

  const handleViewResults = () => {
    if (jobId) {
      navigate(`/results?jobId=${jobId}`);
    } else {
      navigate("/results");
    }
  };

  const ActiveIcon = profile.icon;

  return (
    <div className="page-container" style={{ maxWidth: 880 }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "3px 9px",
                borderRadius: "var(--radius-full)",
                fontSize: "0.75rem",
                fontWeight: 700,
                backgroundColor: `${profile.badgeColor}18`,
                color: profile.badgeColor,
                border: `1px solid ${profile.badgeColor}40`
              }}
            >
              <ActiveIcon size={13} />
              {activeFormat}
            </span>
            <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
              {realJob?.datasetId?.originalName || profile.fileName}
            </span>
          </div>
          <h1 className="page-header-title">Cleaning Pipeline in Progress</h1>
          <p className="page-header-subtitle">
            {realJob
              ? `Live Job ${realJob._id || jobId}: Status ${realJob.status.toUpperCase()} • ${realJob.totalRecords || 0} records`
              : "Streaming multi-format ingestion, deterministic JavaScript rules & bounded AI processing."}
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {progress < 100 && (
            <Button
              variant="secondary"
              size="sm"
              icon={FastForward}
              onClick={handleFastForward}
            >
              Skip Ahead
            </Button>
          )}

          {progress >= 100 ? (
            <Button
              variant="primary"
              size="md"
              icon={ArrowRight}
              iconPosition="right"
              onClick={handleViewResults}
            >
              View Cleaning Results
            </Button>
          ) : (
            <Button
              variant="outline"
              size="md"
              icon={isPaused ? Play : Pause}
              onClick={() => setIsPaused(!isPaused)}
            >
              {isPaused ? "Resume" : "Pause"}
            </Button>
          )}
        </div>
      </div>

      {jobError && (
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
            marginBottom: "16px"
          }}
        >
          <AlertCircle size={18} />
          <span>{jobError}</span>
        </div>
      )}

      {/* Format Selector Pills (Demo switcher) */}
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
          Preview Pipeline For Format:
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
              fontSize: "0.8rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px"
            }}
          >
            {fmt}
          </button>
        ))}
      </div>

      {/* Live Batch Statistics Dashboard */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: "12px",
          marginBottom: "20px"
        }}
      >
        {/* Metric 1: Records Processed */}
        <div className="ds-card" style={{ padding: "14px 16px", borderLeft: "4px solid #0176d3" }}>
          <div style={{ fontSize: "0.725rem", color: "var(--color-text-muted)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.5px" }}>
            Records Processed
          </div>
          <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--color-text-main)", marginTop: "2px" }}>
            {processedRecords.toLocaleString()} <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", fontWeight: 500 }}>/ {profile.totalRecords.toLocaleString()}</span>
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--color-primary)", marginTop: "4px" }}>
            {Math.round((processedRecords / profile.totalRecords) * 100)}% of total dataset
          </div>
        </div>

        {/* Metric 2: Current Batch */}
        <div className="ds-card" style={{ padding: "14px 16px", borderLeft: "4px solid #8b5cf6" }}>
          <div style={{ fontSize: "0.725rem", color: "var(--color-text-muted)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.5px" }}>
            Batch Execution
          </div>
          <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--color-text-main)", marginTop: "2px" }}>
            Batch {currentBatch} <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", fontWeight: 500 }}>of {totalBatches}</span>
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "4px" }}>
            Size: {profile.batchSize} rows/chunk
          </div>
        </div>

        {/* Metric 3: AI Candidates */}
        <div className="ds-card" style={{ padding: "14px 16px", borderLeft: "4px solid #ec4899" }}>
          <div style={{ fontSize: "0.725rem", color: "var(--color-text-muted)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.5px" }}>
            AI Candidates
          </div>
          <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#ec4899", marginTop: "2px", display: "flex", alignItems: "center", gap: "6px" }}>
            <Sparkles size={18} />
            {profile.aiCandidates}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "4px" }}>
            Batch-bounded review items
          </div>
        </div>

        {/* Metric 4: Processing Mode */}
        <div className="ds-card" style={{ padding: "14px 16px", borderLeft: "4px solid #10b981" }}>
          <div style={{ fontSize: "0.725rem", color: "var(--color-text-muted)", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.5px" }}>
            Pipeline Mode
          </div>
          <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--color-text-main)", marginTop: "4px", lineHeight: 1.3 }}>
            {profile.processingMode}
          </div>
          <div style={{ fontSize: "0.725rem", color: "#10b981", marginTop: "4px", fontWeight: 600 }}>
            ● Low Memory Footprint
          </div>
        </div>
      </div>

      {/* Progress Card */}
      <ProgressSteps steps={steps} overallProgress={progress} />

      {/* Completion Banner or Footer Controls */}
      {progress >= 100 ? (
        <div
          style={{
            marginTop: "24px",
            padding: "20px",
            borderRadius: "var(--radius-lg)",
            backgroundColor: "var(--color-success-bg)",
            border: "1px solid var(--color-success-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <CheckCircle2 size={28} color="var(--color-success)" />
            <div>
              <div style={{ fontWeight: 700, color: "var(--color-success-text)", fontSize: "1rem" }}>
                Multi-Format Data Cleaning Completed Successfully!
              </div>
              <div style={{ fontSize: "0.825rem", color: "var(--color-success-text)", marginTop: 2 }}>
                {profile.totalRecords.toLocaleString()} rows processed in {totalBatches} batches • {Math.round(profile.totalRecords * 0.38)} rows cleaned • {profile.aiCandidates} AI suggestions ready for review
              </div>
            </div>
          </div>

          <Button variant="success" size="lg" icon={ArrowRight} iconPosition="right" onClick={handleViewResults}>
            Open Results
          </Button>
        </div>
      ) : (
        <div
          style={{
            marginTop: "20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <span style={{ fontSize: "0.825rem", color: "var(--color-text-muted)" }}>
            Current step: {steps.find((s) => s.status === "processing")?.label || "Processing..."}
          </span>
          <Button variant="ghost" size="sm" icon={X} onClick={() => navigate("/dashboard")}>
            Cancel Pipeline
          </Button>
        </div>
      )}
    </div>
  );
}

