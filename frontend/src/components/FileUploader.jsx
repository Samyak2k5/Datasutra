import React, { useState, useRef } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  FileCode,
  FileText,
  FileType,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowRight
} from "lucide-react";
import Button from "./Button";

export default function FileUploader({
  onFileAccepted,
  maxSizeBytes = 50 * 1024 * 1024, // 50MB
  acceptedExtensions = [
    ".csv",
    ".xlsx",
    ".xls",
    ".json",
    ".jsonl",
    ".ndjson",
    ".pdf",
    ".docx",
    ".doc"
  ]
}) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const getFormatBadge = (fileName) => {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".csv")) return { label: "CSV", color: "#10b981", icon: FileSpreadsheet, type: "CSV Dataset" };
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return { label: "XLSX", color: "#059669", icon: FileSpreadsheet, type: "Excel Spreadsheet" };
    if (lower.endsWith(".json") || lower.endsWith(".jsonl") || lower.endsWith(".ndjson")) return { label: "JSON", color: "#f59e0b", icon: FileCode, type: "JSON Dataset" };
    if (lower.endsWith(".pdf")) return { label: "PDF", color: "#ef4444", icon: FileText, type: "PDF Document" };
    if (lower.endsWith(".docx") || lower.endsWith(".doc")) return { label: "DOCX", color: "#2563eb", icon: FileType, type: "Word Document" };
    return { label: "FILE", color: "#6b7280", icon: FileText, type: "Document" };
  };

  const validateFile = (file) => {
    setError(null);

    // Empty check
    if (!file || file.size === 0) {
      setError("The selected file is empty (0 bytes). Please choose a valid dataset.");
      return false;
    }

    // Size limit check
    if (file.size > maxSizeBytes) {
      setError(`File size exceeds 50MB limit (${formatFileSize(file.size)}). Please upload a smaller file.`);
      return false;
    }

    // Extension check
    const fileName = file.name.toLowerCase();
    const isValidExtension = acceptedExtensions.some((ext) => fileName.endsWith(ext));
    if (!isValidExtension) {
      setError(`Unsupported file format. Supported formats: CSV, XLSX, JSON, PDF, DOCX.`);
      return false;
    }

    return true;
  };

  const handleFiles = (files) => {
    if (files && files.length > 0) {
      const file = files[0];
      if (validateFile(file)) {
        const badgeInfo = getFormatBadge(file.name);
        setSelectedFile({
          name: file.name,
          size: formatFileSize(file.size),
          rawSize: file.size,
          badge: badgeInfo.label,
          badgeColor: badgeInfo.color,
          icon: badgeInfo.icon,
          type: badgeInfo.type,
          lastModified: new Date(file.lastModified).toLocaleDateString()
        });
        if (onFileAccepted) {
          onFileAccepted(file);
        }
      }
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const handleRemove = () => {
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleLoadDemo = (format = "csv") => {
    let demoName = "leads.csv";
    if (format === "json") demoName = "customers.json";
    if (format === "pdf") demoName = "invoice_report.pdf";
    if (format === "docx") demoName = "directory.docx";

    const badgeInfo = getFormatBadge(demoName);
    setSelectedFile({
      name: demoName,
      size: "2.4 MB",
      rawSize: 2516582,
      badge: badgeInfo.label,
      badgeColor: badgeInfo.color,
      icon: badgeInfo.icon,
      type: badgeInfo.type,
      lastModified: "Today"
    });
    setError(null);
  };

  const supportedBadges = [
    { label: "CSV", color: "#10b981", desc: ".csv" },
    { label: "XLSX", color: "#059669", desc: ".xlsx, .xls" },
    { label: "JSON", color: "#f59e0b", desc: ".json, .jsonl" },
    { label: "PDF", color: "#ef4444", desc: ".pdf (text & tables)" },
    { label: "DOCX", color: "#2563eb", desc: ".docx, .doc" }
  ];

  return (
    <div style={{ maxWidth: 740, margin: "0 auto", width: "100%" }}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedExtensions.join(",")}
        onChange={handleChange}
        style={{ display: "none" }}
        id="dataset-file-input"
      />

      {/* Drag & Drop Zone */}
      {!selectedFile ? (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          style={{
            border: dragActive
              ? "2px dashed var(--color-primary)"
              : "2px dashed var(--border-color)",
            backgroundColor: dragActive
              ? "var(--color-primary-light)"
              : "var(--color-bg-surface)",
            borderRadius: "var(--radius-xl)",
            padding: "48px 24px",
            textAlign: "center",
            cursor: "pointer",
            transition: "all 0.2s ease",
            boxShadow: dragActive ? "var(--shadow-md)" : "none"
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              backgroundColor: "var(--color-primary-light)",
              color: "var(--color-primary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16
            }}
          >
            <UploadCloud size={32} />
          </div>

          <h3 style={{ fontSize: "1.2rem", fontWeight: 600, color: "var(--color-text-main)", marginBottom: 6 }}>
            Drag & drop your file here
          </h3>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", marginBottom: 20 }}>
            or click to browse your computer
          </p>

          <Button
            variant="primary"
            size="md"
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.click();
              }
            }}
          >
            Choose File
          </Button>

          {/* Supported Format Badges */}
          <div
            style={{
              marginTop: 28,
              paddingTop: 18,
              borderTop: "1px solid var(--border-color-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              flexWrap: "wrap"
            }}
          >
            <span style={{ fontSize: "0.775rem", color: "var(--color-text-light)", marginRight: 4 }}>
              Supported:
            </span>
            {supportedBadges.map((b) => (
              <span
                key={b.label}
                title={b.desc}
                style={{
                  padding: "2px 8px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: `${b.color}15`,
                  color: b.color,
                  border: `1px solid ${b.color}35`,
                  fontSize: "0.725rem",
                  fontWeight: 600,
                  letterSpacing: "0.03em"
                }}
              >
                {b.label}
              </span>
            ))}
            <span style={{ fontSize: "0.75rem", color: "var(--color-text-light)", marginLeft: 6 }}>
              (Max: 50MB)
            </span>
          </div>
        </div>
      ) : (
        /* Selected File Card & Extraction Pipeline Preview */
        <div
          className="ds-card"
          style={{
            padding: "24px",
            border: "1px solid var(--color-primary-border)",
            backgroundColor: "#ffffff",
            boxShadow: "var(--shadow-sm)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", minWidth: 0 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "var(--radius-md)",
                  backgroundColor: `${selectedFile.badgeColor}18`,
                  color: selectedFile.badgeColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}
              >
                {React.createElement(selectedFile.icon || FileText, { size: 26 })}
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      fontSize: "1rem",
                      fontWeight: 600,
                      color: "var(--color-text-main)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}
                  >
                    {selectedFile.name}
                  </span>
                  <span
                    style={{
                      padding: "2px 6px",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: `${selectedFile.badgeColor}20`,
                      color: selectedFile.badgeColor,
                      fontSize: "0.7rem",
                      fontWeight: 700
                    }}
                  >
                    {selectedFile.badge}
                  </span>
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: 2 }}>
                  {selectedFile.size} • {selectedFile.type}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  color: "var(--color-success)",
                  fontSize: "0.8rem",
                  fontWeight: 600
                }}
              >
                <CheckCircle2 size={18} />
                <span>Ready</span>
              </div>

              <button
                onClick={handleRemove}
                title="Remove file"
                aria-label="Remove file"
                style={{
                  border: "1px solid var(--border-color)",
                  background: "var(--color-bg-surface)",
                  borderRadius: "var(--radius-sm)",
                  padding: "6px",
                  cursor: "pointer",
                  color: "var(--color-text-muted)"
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Unified Extraction Stages Indicator */}
          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: "1px solid var(--border-color-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "0.75rem",
              color: "var(--color-text-muted)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--color-success)", fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--color-success)" }} />
              Uploaded
            </div>
            <ArrowRight size={12} color="var(--color-text-light)" />
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--color-primary)", fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--color-primary)" }} />
              Parsing & Extraction
            </div>
            <ArrowRight size={12} color="var(--color-text-light)" />
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--color-text-light)" }} />
              Structured Model
            </div>
            <ArrowRight size={12} color="var(--color-text-light)" />
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--color-text-light)" }} />
              Deterministic Cleaning
            </div>
          </div>
        </div>
      )}

      {/* Validation Error Message */}
      {error && (
        <div
          style={{
            marginTop: 14,
            padding: "12px 16px",
            backgroundColor: "var(--color-danger-bg)",
            border: "1px solid var(--color-danger-border)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            color: "var(--color-danger-text)",
            fontSize: "0.85rem"
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Quick Demo Sample Loaders */}
      {!selectedFile && (
        <div style={{ textAlign: "center", marginTop: 18, fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
          <span>Try demo sample: </span>
          <button
            type="button"
            onClick={() => handleLoadDemo("csv")}
            style={{ background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", textDecoration: "underline", marginRight: 8 }}
          >
            leads.csv
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={() => handleLoadDemo("json")}
            style={{ background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", textDecoration: "underline", margin: "0 8px" }}
          >
            customers.json
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={() => handleLoadDemo("pdf")}
            style={{ background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", textDecoration: "underline", margin: "0 8px" }}
          >
            invoice.pdf
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={() => handleLoadDemo("docx")}
            style={{ background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", textDecoration: "underline", marginLeft: 8 }}
          >
            directory.docx
          </button>
        </div>
      )}
    </div>
  );
}
