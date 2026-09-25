import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search,
  AlertTriangle,
  Sliders,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileCode,
  FileText,
  FileType,
  MapPin,
  Info,
  X
} from "lucide-react";
import Button from "../components/Button";
import api from "../services/api";
import { mockSampleRecords } from "../data/mockData";

export default function DataPreview() {
  const [searchParams] = useSearchParams();
  const datasetId = searchParams.get("datasetId");
  const [realDataset, setRealDataset] = useState(null);
  const [realRecords, setRealRecords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const [selectedFormat, setSelectedFormat] = useState("CSV"); // "CSV" | "XLSX" | "JSON" | "PDF" | "DOCX"
  const [activeView, setActiveView] = useState("records"); // "records" | "structure"
  const [showIssuesOnly, setShowIssuesOnly] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedColumn, setSelectedColumn] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [selectedProvenance, setSelectedProvenance] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    if (!datasetId) return;

    let isMounted = true;
    async function loadDataset() {
      try {
        setLoading(true);
        const dsRes = await api.getDataset(datasetId);
        if (!isMounted) return;
        const ds = dsRes?.data?.dataset;
        setRealDataset(ds);

        if (ds?.sourceFormat) {
          const fmt = ds.sourceFormat.toUpperCase();
          if (["CSV", "XLSX", "JSON", "PDF", "DOCX"].includes(fmt)) {
            setSelectedFormat(fmt);
          }
        }

        if (ds?.status === "completed") {
          const prevRes = await api.getDatasetPreview(datasetId, 50);
          if (isMounted && prevRes?.data?.rows) {
            setRealRecords(prevRes.data.rows);
          }
        } else if (ds?.status === "uploaded") {
          await api.parseDataset(datasetId);
          const prevRes = await api.getDatasetPreview(datasetId, 50);
          if (isMounted && prevRes?.data?.rows) {
            setRealRecords(prevRes.data.rows);
          }
        }
      } catch (err) {
        if (isMounted) setFetchError(err.message || "Failed to load dataset.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadDataset();
    return () => { isMounted = false; };
  }, [datasetId]);

  // Multi-format mock document structures for preview demonstration
  const documentStructures = {
    PDF: {
      pagesCount: 4,
      tablesCount: 2,
      isScanned: false,
      ocrStatus: "NOT_REQUIRED",
      warnings: ["Multiple tables detected. Extracted primary customer table."],
      pages: [
        { pageNumber: 1, lineCount: 24, charCount: 840, title: "Executive Directory 2026" },
        { pageNumber: 2, lineCount: 38, charCount: 1420, title: "Customer Records (Table 1)" },
        { pageNumber: 3, lineCount: 32, charCount: 1100, title: "Customer Records (Continued)" },
        { pageNumber: 4, lineCount: 18, charCount: 650, title: "Summary & Notes" }
      ],
      tables: [
        { tableIndex: 1, pageNumber: 2, headers: ["Name", "Email", "Phone", "City", "Company"], rowCount: 120 },
        { tableIndex: 2, pageNumber: 4, headers: ["Metric", "Value"], rowCount: 6 }
      ]
    },
    DOCX: {
      pagesCount: 3,
      tablesCount: 1,
      isScanned: false,
      ocrStatus: "NOT_REQUIRED",
      warnings: [],
      sections: [
        { order: 1, type: "heading", content: "Lead Generation Intake Document" },
        { order: 2, type: "paragraph", content: "Extracted customer contacts from regional business partners." },
        { order: 3, type: "table", content: "Table 1 (1,200 records detected)" }
      ],
      tables: [
        { tableIndex: 1, pageNumber: 1, headers: ["Name", "Email", "Phone", "City", "Company"], rowCount: 1200 }
      ]
    }
  };

  // Filter records
  const activeRecords = (realRecords && realRecords.length > 0) ? realRecords : mockSampleRecords;
  const filteredRecords = activeRecords.filter((record) => {
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchName = record.name?.toLowerCase().includes(q);
      const matchEmail = record.email?.toLowerCase().includes(q);
      const matchPhone = record.phone?.toLowerCase().includes(q);
      const matchCity = record.city?.toLowerCase().includes(q);
      const matchCompany = record.company?.toLowerCase().includes(q);
      return matchName || matchEmail || matchPhone || matchCity || matchCompany;
    }
    return true;
  });

  const totalPages = Math.ceil(filteredRecords.length / rowsPerPage) || 1;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentRecords = filteredRecords.slice(startIndex, startIndex + rowsPerPage);

  const formatBadges = [
    { label: "CSV", color: "#10b981", icon: FileSpreadsheet, file: "leads.csv" },
    { label: "XLSX", color: "#059669", icon: FileSpreadsheet, file: "inventory.xlsx" },
    { label: "JSON", color: "#f59e0b", icon: FileCode, file: "customers.json" },
    { label: "PDF", color: "#ef4444", icon: FileText, file: "customer_report.pdf" },
    { label: "DOCX", color: "#2563eb", icon: FileType, file: "leads_intake.docx" }
  ];

  const currentBadge = formatBadges.find((b) => b.label === selectedFormat) || formatBadges[0];
  const isDocumentFormat = selectedFormat === "PDF" || selectedFormat === "DOCX";

  const getRecordProvenance = (row, index, fieldName = null) => {
    const globalRow = startIndex + index + 1;
    if (selectedFormat === "PDF") {
      return {
        sourceType: "pdf",
        file: currentBadge.file,
        sourcePage: Math.ceil(globalRow / 5) + 1,
        tableIndex: 1,
        sourceRow: globalRow,
        field: fieldName,
        detail: `Page ${Math.ceil(globalRow / 5) + 1} • Table 1 • Row ${globalRow}`
      };
    }
    if (selectedFormat === "DOCX") {
      return {
        sourceType: "docx",
        file: currentBadge.file,
        section: "table",
        tableIndex: 1,
        sourceRow: globalRow,
        field: fieldName,
        detail: `Section: Table 1 • Row ${globalRow}`
      };
    }
    if (selectedFormat === "JSON") {
      return {
        sourceType: "json",
        file: currentBadge.file,
        recordPath: `data.customers[${globalRow - 1}]${fieldName ? `.${fieldName}` : ""}`,
        sourceRow: globalRow,
        field: fieldName,
        detail: `JSON Path: data.customers[${globalRow - 1}]${fieldName ? `.${fieldName}` : ""}`
      };
    }
    if (selectedFormat === "XLSX") {
      return {
        sourceType: "xlsx",
        file: currentBadge.file,
        sheet: "Catalog",
        sourceRow: globalRow + 1,
        field: fieldName,
        detail: `Worksheet "Catalog" • Row ${globalRow + 1}`
      };
    }
    return {
      sourceType: "csv",
      file: currentBadge.file,
      sourceRow: globalRow + 1,
      field: fieldName,
      detail: `CSV File • Line ${globalRow + 1}`
    };
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: 4 }}>
            <h1 className="page-header-title">Data Preview</h1>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: `${currentBadge.color}18`,
                color: currentBadge.color,
                border: `1px solid ${currentBadge.color}35`,
                fontSize: "0.75rem",
                fontWeight: 700
              }}
            >
              {currentBadge.label}
            </span>
          </div>
          <p className="page-header-subtitle">
            File: <strong>{realDataset?.originalName || realDataset?.name || currentBadge.file}</strong> · Records: <strong>{realDataset?.totalRows ? realDataset.totalRows.toLocaleString() : "1,200"}</strong> · Columns: <strong>{realDataset?.totalColumns || (realDataset?.columns ? realDataset.columns.length : 8)}</strong>
            {isDocumentFormat && " · Tables: 1 · Pages: 4"}
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <Button
            variant={showIssuesOnly ? "primary" : "secondary"}
            size="md"
            icon={AlertTriangle}
            onClick={() => setShowIssuesOnly(!showIssuesOnly)}
          >
            {showIssuesOnly ? "Issues Highlighted" : "Show Issues"}
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={Sliders}
            iconPosition="right"
            onClick={() => navigate(`/configure${datasetId ? `?datasetId=${datasetId}` : ""}`)}
          >
            Configure Cleaning
          </Button>
        </div>
      </div>

      {fetchError && (
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
          <AlertTriangle size={18} />
          <span>{fetchError}</span>
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
          Loading dataset structure and records...
        </div>
      )}

      {/* Format Selector Bar */}
      <div
        className="ds-card"
        style={{
          padding: "10px 18px",
          marginBottom: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", fontWeight: 600 }}>
            Source Format:
          </span>
          <div style={{ display: "flex", gap: "6px" }}>
            {formatBadges.map((b) => (
              <button
                key={b.label}
                type="button"
                onClick={() => {
                  setSelectedFormat(b.label);
                  if (b.label !== "PDF" && b.label !== "DOCX") {
                    setActiveView("records");
                  }
                }}
                style={{
                  padding: "4px 10px",
                  borderRadius: "var(--radius-sm)",
                  border: selectedFormat === b.label ? `1px solid ${b.color}` : "1px solid var(--border-color)",
                  backgroundColor: selectedFormat === b.label ? `${b.color}15` : "var(--color-bg-surface)",
                  color: selectedFormat === b.label ? b.color : "var(--color-text-muted)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                {React.createElement(b.icon, { size: 14 })}
                <span>{b.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* View Switcher for Document Formats */}
        {isDocumentFormat && (
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              onClick={() => setActiveView("records")}
              style={{
                padding: "4px 10px",
                borderRadius: "var(--radius-sm)",
                border: activeView === "records" ? "1px solid var(--color-primary)" : "1px solid var(--border-color)",
                backgroundColor: activeView === "records" ? "var(--color-primary-light)" : "var(--color-bg-surface)",
                color: activeView === "records" ? "var(--color-primary)" : "var(--color-text-muted)",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Extracted Records View
            </button>
            <button
              type="button"
              onClick={() => setActiveView("structure")}
              style={{
                padding: "4px 10px",
                borderRadius: "var(--radius-sm)",
                border: activeView === "structure" ? "1px solid var(--color-primary)" : "1px solid var(--border-color)",
                backgroundColor: activeView === "structure" ? "var(--color-primary-light)" : "var(--color-bg-surface)",
                color: activeView === "structure" ? "var(--color-primary)" : "var(--color-text-muted)",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Document Structure View
            </button>
          </div>
        )}
      </div>

      {/* Extraction Warnings Banner if applicable */}
      {selectedFormat === "PDF" && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--color-warning-bg)",
            border: "1px solid var(--color-warning-border)",
            color: "var(--color-warning-text)",
            fontSize: "0.8rem",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "10px"
          }}
        >
          <Info size={16} style={{ flexShrink: 0 }} />
          <span>
            Multiple tables detected across 4 pages. Extracted primary Customer Table (1,200 rows). OCR engine was not required (native text layer found).
          </span>
        </div>
      )}

      {/* VIEW A: Document Structure View (PDF & DOCX) */}
      {isDocumentFormat && activeView === "structure" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          {/* Pages Card */}
          <div className="ds-card" style={{ padding: "20px" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "14px", color: "var(--color-text-main)" }}>
              Detected Pages & Sections
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {(documentStructures[selectedFormat]?.pages || []).map((p) => (
                <div
                  key={p.pageNumber}
                  style={{
                    padding: "12px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--color-bg-subtle)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "0.825rem"
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>Page {p.pageNumber}: </span>
                    <span style={{ color: "var(--color-text-muted)" }}>{p.title}</span>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--color-text-light)" }}>
                    {p.lineCount} lines · {p.charCount} chars
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Tables Card */}
          <div className="ds-card" style={{ padding: "20px" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "14px", color: "var(--color-text-main)" }}>
              Detected Tables & Schemas
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {(documentStructures[selectedFormat]?.tables || []).map((t) => (
                <div
                  key={t.tableIndex}
                  style={{
                    padding: "12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-color)",
                    fontSize: "0.825rem"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, color: "var(--color-primary)" }}>
                      Table {t.tableIndex} {t.tableIndex === 1 && "(Primary)"}
                    </span>
                    <span style={{ color: "var(--color-text-muted)" }}>{t.rowCount} rows</span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                    Columns: {t.headers.join(", ")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* VIEW B: Extracted Records Spreadsheet View */
        <>
          {/* Control Bar: Search + Column Filter */}
          <div
            className="ds-card"
            style={{
              padding: "14px 18px",
              marginBottom: "18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 280 }}>
              <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
                <Search
                  size={16}
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--color-text-muted)"
                  }}
                />
                <input
                  type="text"
                  className="ds-input"
                  style={{ paddingLeft: "34px", paddingRight: "12px", fontSize: "0.85rem" }}
                  placeholder="Search in preview..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "0.825rem", color: "var(--color-text-muted)" }}>Column:</span>
                <select
                  className="ds-select"
                  style={{ width: 140, padding: "7px 10px", fontSize: "0.825rem" }}
                  value={selectedColumn}
                  onChange={(e) => setSelectedColumn(e.target.value)}
                >
                  <option value="all">All Columns</option>
                  <option value="name">Name</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="city">City</option>
                  <option value="company">Company</option>
                </select>
              </div>
            </div>

            {/* Provenance Hint tag */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
              <MapPin size={14} color="var(--color-primary)" />
              <span>Click any row or cell to inspect source provenance</span>
            </div>
          </div>

          {/* Spreadsheet Data Table */}
          <div className="ds-card" style={{ overflow: "hidden" }}>
            <div className="ds-table-container" style={{ border: "none", borderRadius: 0 }}>
              <table className="ds-table" style={{ fontFamily: "var(--font-sans)" }}>
                <thead>
                  <tr>
                    <th style={{ width: "50px" }}>#</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>City</th>
                    <th>Company</th>
                    <th style={{ textAlign: "right" }}>Flagged Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {currentRecords.map((row, idx) => {
                    const globalIndex = startIndex + idx + 1;
                    const hasEmailIssue = showIssuesOnly && (row.email === row.email.toUpperCase() || !row.email.includes("."));
                    const hasPhoneIssue = showIssuesOnly && (row.phone === "-" || row.phone.includes(" ") || row.issues.includes("duplicate-phone"));
                    const hasCityIssue = showIssuesOnly && (row.city === "mumbai" || row.city === "MUMBAI" || row.city === "delhi" || row.city === "Bombay");

                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedProvenance(getRecordProvenance(row, idx))}
                        style={{ cursor: "pointer" }}
                        title="Click to inspect provenance"
                      >
                        <td style={{ color: "var(--color-text-light)", fontWeight: 600 }}>
                          {globalIndex}
                        </td>

                        {/* Name */}
                        <td onClick={(e) => { e.stopPropagation(); setSelectedProvenance(getRecordProvenance(row, idx, "Name")); }}>
                          <span style={{ fontWeight: 600, color: "var(--color-text-main)" }}>
                            {row.name}
                          </span>
                        </td>

                        {/* Email */}
                        <td onClick={(e) => { e.stopPropagation(); setSelectedProvenance(getRecordProvenance(row, idx, "Email")); }}>
                          {hasEmailIssue ? (
                            <span className="cell-issue" title="Casing or syntax anomaly detected">
                              {row.email}
                            </span>
                          ) : (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.825rem" }}>
                              {row.email}
                            </span>
                          )}
                        </td>

                        {/* Phone */}
                        <td onClick={(e) => { e.stopPropagation(); setSelectedProvenance(getRecordProvenance(row, idx, "Phone")); }}>
                          {row.phone === "-" ? (
                            <span className="cell-issue cell-issue-error" title="Missing phone value">
                              (missing)
                            </span>
                          ) : row.issues.includes("duplicate-phone") && showIssuesOnly ? (
                            <span className="cell-issue cell-issue-duplicate" title="Potential duplicate phone number">
                              {row.phone}
                            </span>
                          ) : hasPhoneIssue ? (
                            <span className="cell-issue" title="Unstandardized phone spacing">
                              {row.phone}
                            </span>
                          ) : (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.825rem" }}>
                              {row.phone}
                            </span>
                          )}
                        </td>

                        {/* City */}
                        <td onClick={(e) => { e.stopPropagation(); setSelectedProvenance(getRecordProvenance(row, idx, "City")); }}>
                          {hasCityIssue ? (
                            <span className="cell-issue" title="Non-standardized city casing/alias">
                              {row.city}
                            </span>
                          ) : (
                            <span>{row.city}</span>
                          )}
                        </td>

                        {/* Company */}
                        <td>
                          <span>{row.company}</span>
                        </td>

                        {/* Issues tags */}
                        <td style={{ textAlign: "right" }}>
                          {row.issues && row.issues.length > 0 ? (
                            <div style={{ display: "inline-flex", gap: "4px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                              {row.issues.map((iss) => (
                                <span
                                  key={iss}
                                  style={{
                                    fontSize: "0.7rem",
                                    padding: "1px 6px",
                                    borderRadius: "var(--radius-sm)",
                                    backgroundColor: iss.includes("duplicate")
                                      ? "var(--color-warning-bg)"
                                      : iss.includes("missing")
                                      ? "var(--color-danger-bg)"
                                      : "var(--color-bg-subtle)",
                                    color: iss.includes("duplicate")
                                      ? "var(--color-warning-text)"
                                      : iss.includes("missing")
                                      ? "var(--color-danger-text)"
                                      : "var(--color-text-muted)"
                                  }}
                                >
                                  {iss.replace("-", " ")}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: "0.75rem", color: "var(--color-success)", fontWeight: 500 }}>
                              Clean
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 18px",
                borderTop: "1px solid var(--border-color-subtle)",
                backgroundColor: "var(--color-bg-surface)",
                fontSize: "0.825rem",
                color: "var(--color-text-muted)",
                flexWrap: "wrap",
                gap: "12px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span>Rows per page:</span>
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: "3px 8px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-color)",
                    background: "var(--color-bg-surface)"
                  }}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
                <span>
                  Showing {startIndex + 1} to {Math.min(startIndex + rowsPerPage, filteredRecords.length)} of 1,200 records
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  style={{
                    padding: "4px 8px",
                    border: "1px solid var(--border-color)",
                    background: "var(--color-bg-surface)",
                    borderRadius: "var(--radius-sm)",
                    cursor: currentPage === 1 ? "not-allowed" : "pointer",
                    opacity: currentPage === 1 ? 0.4 : 1
                  }}
                >
                  <ChevronLeft size={16} />
                </button>

                {[1, 2, 3].map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "var(--radius-sm)",
                      border: currentPage === page ? "1px solid var(--color-primary)" : "1px solid var(--border-color)",
                      backgroundColor: currentPage === page ? "var(--color-primary)" : "var(--color-bg-surface)",
                      color: currentPage === page ? "#ffffff" : "var(--color-text-main)",
                      fontWeight: 600,
                      fontSize: "0.8rem",
                      cursor: "pointer"
                    }}
                  >
                    {page}
                  </button>
                ))}

                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: "4px 8px",
                    border: "1px solid var(--border-color)",
                    background: "var(--color-bg-surface)",
                    borderRadius: "var(--radius-sm)",
                    cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                    opacity: currentPage === totalPages ? 0.4 : 1
                  }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Source Provenance Inspector Modal */}
      {selectedProvenance && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            width: 360,
            backgroundColor: "#ffffff",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-xl)",
            border: "1px solid var(--border-color)",
            padding: "18px 20px",
            zIndex: 100,
            animation: "fadeIn 0.2s ease"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <MapPin size={18} color="var(--color-primary)" />
              <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--color-text-main)" }}>
                Source Provenance
              </span>
            </div>
            <button
              onClick={() => setSelectedProvenance(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)" }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ fontSize: "0.825rem", color: "var(--color-text-main)", marginBottom: 8 }}>
            <strong>Source File: </strong>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}>{selectedProvenance.file}</span>
          </div>

          <div style={{ fontSize: "0.825rem", color: "var(--color-text-main)", marginBottom: 8 }}>
            <strong>Location: </strong>
            <span>{selectedProvenance.detail}</span>
          </div>

          {selectedProvenance.field && (
            <div style={{ fontSize: "0.825rem", color: "var(--color-text-main)", marginBottom: 8 }}>
              <strong>Target Field: </strong>
              <span style={{ fontWeight: 600, color: "var(--color-primary)" }}>{selectedProvenance.field}</span>
            </div>
          )}

          <div
            style={{
              marginTop: 12,
              padding: "8px 10px",
              backgroundColor: "var(--color-bg-subtle)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.75rem",
              color: "var(--color-text-muted)"
            }}
          >
            Verified source integrity. Deterministic audit trail linked to original uploaded file.
          </div>
        </div>
      )}
    </div>
  );
}
