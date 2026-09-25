import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Info,
  ShieldCheck,
  Upload,
  Globe,
  AlertTriangle,
  Lock,
  CheckCircle2
} from "lucide-react";
import FileUploader from "../components/FileUploader";
import Button from "../components/Button";
import api from "../services/api";

export default function UploadDataset() {
  const [activeTab, setActiveTab] = useState("file"); // "file" | "api"
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadedDatasetId, setUploadedDatasetId] = useState(null);

  const [apiUrl, setApiUrl] = useState("");
  const [datasetName, setDatasetName] = useState("");
  const [authType, setAuthType] = useState("none"); // "none" | "bearer" | "apiKey"
  const [authToken, setAuthToken] = useState("");
  const [apiKeyHeader, setApiKeyHeader] = useState("X-API-Key");
  const [recordPath, setRecordPath] = useState("");
  const [maxPages, setMaxPages] = useState("1");
  const [isImporting, setIsImporting] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [apiSuccess, setApiSuccess] = useState(false);

  const navigate = useNavigate();

  const handleFileAccepted = async (file) => {
    setUploadedFile(file);
    setUploadError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name);
      const res = await api.uploadDataset(formData);
      if (res?.data?.dataset?.id) {
        setUploadedDatasetId(res.data.dataset.id);
      }
    } catch (err) {
      setUploadError(err.message || "Failed to upload dataset to backend.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleContinue = () => {
    if (uploadedDatasetId) {
      navigate(`/preview?datasetId=${uploadedDatasetId}`);
    } else {
      navigate("/preview");
    }
  };

  const handleJsonApiImport = async (e) => {
    e.preventDefault();
    setApiError(null);
    setApiSuccess(false);

    if (!apiUrl.trim()) {
      setApiError("Please provide a valid API endpoint URL.");
      return;
    }

    try {
      setIsImporting(true);
      const payload = {
        url: apiUrl.trim(),
        name: datasetName.trim() || undefined,
        recordPath: recordPath.trim() || undefined,
        bearerToken: authType === "bearer" ? authToken.trim() : undefined,
        apiKey: authType === "apiKey" ? authToken.trim() : undefined,
        apiKeyHeader: authType === "apiKey" ? apiKeyHeader.trim() : undefined,
        pagination: {
          maxPages: parseInt(maxPages, 10) || 1
        }
      };

      const res = await api.importJsonApi(payload);
      setIsImporting(false);
      setApiSuccess(true);
      const dsId = res?.data?.dataset?.id;

      setTimeout(() => {
        if (dsId) {
          navigate(`/preview?datasetId=${dsId}`);
        } else {
          navigate("/preview");
        }
      }, 1000);
    } catch (err) {
      setIsImporting(false);
      setApiError(err.message || "Failed to import dataset from JSON API endpoint.");
    }
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Upload Dataset</h1>
          <p className="page-header-subtitle">
            Ingest tabular data, spreadsheets, JSON, or documents (PDF / Word) into DataSutra's deterministic cleaning pipeline.
          </p>
        </div>
      </div>

      {/* Ingestion Source Tabs */}
      <div
        style={{
          maxWidth: 740,
          margin: "0 auto 24px auto",
          display: "flex",
          borderBottom: "1px solid var(--border-color)",
          gap: "8px"
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("file")}
          style={{
            padding: "10px 18px",
            border: "none",
            background: "none",
            fontSize: "0.9rem",
            fontWeight: 600,
            cursor: "pointer",
            color: activeTab === "file" ? "var(--color-primary)" : "var(--color-text-muted)",
            borderBottom: activeTab === "file" ? "2px solid var(--color-primary)" : "2px solid transparent",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.15s ease"
          }}
        >
          <Upload size={16} />
          <span>File Upload (CSV, XLSX, JSON, PDF, DOCX)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("api")}
          style={{
            padding: "10px 18px",
            border: "none",
            background: "none",
            fontSize: "0.9rem",
            fontWeight: 600,
            cursor: "pointer",
            color: activeTab === "api" ? "var(--color-primary)" : "var(--color-text-muted)",
            borderBottom: activeTab === "api" ? "2px solid var(--color-primary)" : "2px solid transparent",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.15s ease"
          }}
        >
          <Globe size={16} />
          <span>JSON API Import</span>
        </button>
      </div>

      {/* Main Mode 1: File Upload */}
      {activeTab === "file" && (
        <>
          {uploadError && (
            <div
              style={{
                maxWidth: 740,
                margin: "0 auto 16px auto",
                padding: "12px 16px",
                backgroundColor: "var(--color-danger-bg)",
                border: "1px solid var(--color-danger-border)",
                borderRadius: "var(--radius-md)",
                color: "var(--color-danger-text)",
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              <AlertTriangle size={18} />
              <span>{uploadError}</span>
            </div>
          )}

          <div style={{ marginTop: "16px", marginBottom: "32px" }}>
            <FileUploader onFileAccepted={handleFileAccepted} />
          </div>

          <div style={{ maxWidth: 740, margin: "0 auto", display: "flex", justifyContent: uploadedFile ? "space-between" : "flex-end", alignItems: "center" }}>
            {uploadedFile && (
              <span style={{ fontSize: "0.85rem", color: "#16a34a", fontWeight: 600 }}>
                ✓ File Attached: {uploadedFile.name}
              </span>
            )}
            <Button
              variant="primary"
              size="lg"
              icon={ArrowRight}
              iconPosition="right"
              onClick={handleContinue}
              disabled={isUploading}
            >
              {isUploading ? "Uploading Dataset..." : "Continue to Data Preview"}
            </Button>
          </div>
        </>
      )}

      {/* Main Mode 2: Secure JSON API Import */}
      {activeTab === "api" && (
        <div style={{ maxWidth: 740, margin: "0 auto" }}>
          <form
            onSubmit={handleJsonApiImport}
            className="ds-card"
            style={{ padding: "28px", backgroundColor: "#ffffff" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: 20 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-primary-light)",
                  color: "var(--color-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Globe size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--color-text-main)" }}>
                  Import from Remote JSON API
                </h3>
                <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                  Connect to a secure HTTPS REST endpoint to ingest structured JSON datasets.
                </p>
              </div>
            </div>

            {/* API URL */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 6, color: "var(--color-text-main)" }}
              >
                API Endpoint URL <span style={{ color: "var(--color-danger)" }}>*</span>
              </label>
              <input
                type="url"
                required
                placeholder="https://api.example.com/v1/customers"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="ds-input"
                style={{ width: "100%" }}
              />
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-light)", marginTop: 4, display: "block" }}>
                Must be an HTTPS endpoint. Requests to private, localhost, or internal cloud networks are blocked.
              </span>
            </div>

            {/* Dataset Name */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 6, color: "var(--color-text-main)" }}>
                  Dataset Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Q3 Customer Leads"
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                  className="ds-input"
                  style={{ width: "100%" }}
                />
              </div>

              {/* Record Path */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 6, color: "var(--color-text-main)" }}>
                  Records Path (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. data.items or records"
                  value={recordPath}
                  onChange={(e) => setRecordPath(e.target.value)}
                  className="ds-input"
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            {/* Authentication Config */}
            <div
              style={{
                padding: "16px",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-bg-subtle)",
                marginBottom: 18
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: 12 }}>
                <Lock size={16} color="var(--color-primary)" />
                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-main)" }}>
                  Endpoint Authentication
                </span>
              </div>

              <div style={{ display: "flex", gap: "16px", marginBottom: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.825rem", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="authType"
                    value="none"
                    checked={authType === "none"}
                    onChange={() => setAuthType("none")}
                  />
                  <span>No Auth (Public)</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.825rem", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="authType"
                    value="bearer"
                    checked={authType === "bearer"}
                    onChange={() => setAuthType("bearer")}
                  />
                  <span>Bearer Token</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.825rem", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="authType"
                    value="apiKey"
                    checked={authType === "apiKey"}
                    onChange={() => setAuthType("apiKey")}
                  />
                  <span>API Key Header</span>
                </label>
              </div>

              {authType === "bearer" && (
                <div>
                  <input
                    type="password"
                    placeholder="Enter Bearer Token (Masked)"
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    className="ds-input"
                    style={{ width: "100%" }}
                  />
                  <span style={{ fontSize: "0.725rem", color: "var(--color-text-muted)", marginTop: 4, display: "block" }}>
                    Token is securely transmitted over TLS and never stored in plain text or browser history.
                  </span>
                </div>
              )}

              {authType === "apiKey" && (
                <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "10px" }}>
                  <input
                    type="text"
                    placeholder="X-API-Key"
                    value={apiKeyHeader}
                    onChange={(e) => setApiKeyHeader(e.target.value)}
                    className="ds-input"
                  />
                  <input
                    type="password"
                    placeholder="API Key Secret (Masked)"
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    className="ds-input"
                  />
                </div>
              )}
            </div>

            {/* Pagination Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: 20 }}>
              <span style={{ fontSize: "0.825rem", color: "var(--color-text-muted)" }}>Bounded Pages (Max: 5):</span>
              <select
                value={maxPages}
                onChange={(e) => setMaxPages(e.target.value)}
                className="ds-select"
                style={{ width: 80, padding: "5px 8px" }}
              >
                <option value="1">1 page</option>
                <option value="2">2 pages</option>
                <option value="3">3 pages</option>
                <option value="5">5 pages</option>
              </select>
            </div>

            {/* Error / Success messages */}
            {apiError && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-danger-bg)",
                  border: "1px solid var(--color-danger-border)",
                  color: "var(--color-danger-text)",
                  fontSize: "0.825rem",
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}
              >
                <AlertTriangle size={16} />
                <span>{apiError}</span>
              </div>
            )}

            {apiSuccess && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-success-bg)",
                  border: "1px solid var(--color-success-border)",
                  color: "var(--color-success-text)",
                  fontSize: "0.825rem",
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}
              >
                <CheckCircle2 size={16} />
                <span>Dataset imported successfully! Redirecting to preview...</span>
              </div>
            )}

            {/* Submit Action */}
            <div style={{ textAlign: "right" }}>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isImporting}
                icon={ArrowRight}
                iconPosition="right"
              >
                {isImporting ? "Importing from API..." : "Import & Preview"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Unified Instructions & Security Cards */}
      <div
        style={{
          maxWidth: 740,
          margin: "40px auto 0 auto",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px"
        }}
      >
        <div
          className="ds-card"
          style={{ padding: "18px 20px", display: "flex", gap: "14px", alignItems: "flex-start" }}
        >
          <Info size={20} color="var(--color-primary)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-main)" }}>
              Unified Multi-Format Support
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: 4 }}>
              Supports CSV, Excel (XLSX), JSON/NDJSON, PDF documents (text & tables), Word (DOCX), and secure JSON APIs.
            </div>
          </div>
        </div>

        <div
          className="ds-card"
          style={{ padding: "18px 20px", display: "flex", gap: "14px", alignItems: "flex-start" }}
        >
          <ShieldCheck size={20} color="var(--color-success)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-main)" }}>
              SSRF & Security Isolation
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: 4 }}>
              Private IP rejection, secret masking, and deterministic sandbox guarantees all datasets are isolated securely.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
