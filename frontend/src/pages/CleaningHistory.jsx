import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  FileSpreadsheet,
  Download,
  Eye,
  Trash2
} from "lucide-react";
import StatusBadge from "../components/StatusBadge";
import Button from "../components/Button";
import api from "../services/api";
import { mockCleaningHistory } from "../data/mockData";

export default function CleaningHistory() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [historyList, setHistoryList] = useState(mockCleaningHistory);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    async function loadJobs() {
      try {
        const res = await api.getCleaningJobs();
        if (isMounted && res?.data?.jobs && res.data.jobs.length > 0) {
          const transformed = res.data.jobs.map((j) => ({
            id: j.id,
            fileName: j.datasetName || "Dataset",
            fileSize: "Processed dataset",
            status: j.status === "completed" ? "Completed" : j.status === "processing" ? "Processing" : j.status,
            rowsProcessed: j.totalRecords || 0,
            quality: j.qualityScore ?? 98,
            changesCount: j.modifiedRecords || 0,
            date: j.createdAt ? new Date(j.createdAt).toLocaleDateString() : "Recent",
            datasetId: j.datasetId
          }));
          setHistoryList(transformed);
        }
      } catch {
        // Fallback to sample data
      }
    }
    loadJobs();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredHistory = historyList.filter((item) => {
    const matchesSearch = item.fileName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || item.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  const handleDelete = (id, e) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to remove this cleaning job record?")) {
      setHistoryList((prev) => prev.filter((item) => item.id !== id));
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Cleaning History</h1>
          <p className="page-header-subtitle">
            Audit logs and transformation reports across your datasets.
          </p>
        </div>

        <Button variant="primary" size="md" onClick={() => navigate("/upload")}>
          + New Cleaning Job
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div
        className="ds-card"
        style={{
          padding: "16px 20px",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "14px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 260 }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
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
              style={{ paddingLeft: "34px", paddingRight: "12px" }}
              placeholder="Search by file name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "0.825rem", color: "var(--color-text-muted)" }}>Status:</span>
            <select
              className="ds-select"
              style={{ width: 140, padding: "7px 10px" }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        <div style={{ fontSize: "0.825rem", color: "var(--color-text-muted)" }}>
          Showing <strong>{filteredHistory.length}</strong> jobs
        </div>
      </div>

      {/* History Table */}
      <div className="ds-card" style={{ overflow: "hidden" }}>
        <div className="ds-table-container" style={{ border: "none", borderRadius: 0 }}>
          <table className="ds-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Status</th>
                <th>Rows Processed</th>
                <th>Quality Score</th>
                <th>Date</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: "var(--radius-sm)",
                          backgroundColor: "var(--color-primary-light)",
                          color: "var(--color-primary)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0
                        }}
                      >
                        <FileSpreadsheet size={18} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--color-text-main)" }}>
                          {item.fileName}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                          {item.fileSize}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td>
                    <StatusBadge status={item.status} />
                  </td>

                  <td style={{ fontFamily: "var(--font-mono)" }}>
                    {item.processed > 0 ? (
                      <span>
                        {item.processed.toLocaleString()}{" "}
                        <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                          ({item.changed} cleaned)
                        </span>
                      </span>
                    ) : (
                      <span style={{ color: "var(--color-text-light)" }}>-</span>
                    )}
                  </td>

                  <td>
                    <span
                      style={{
                        fontWeight: 600,
                        color:
                          parseInt(item.quality) >= 90
                            ? "var(--color-success)"
                            : parseInt(item.quality) > 0
                            ? "var(--color-warning)"
                            : "var(--color-text-light)"
                      }}
                    >
                      {item.quality}
                    </span>
                  </td>

                  <td style={{ color: "var(--color-text-muted)", fontSize: "0.825rem" }}>
                    {item.date}
                  </td>

                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: "8px" }}>
                      {item.status === "Completed" && (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={Eye}
                            onClick={() => navigate("/results")}
                          >
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            icon={Download}
                            onClick={() => alert(`Downloading cleaned dataset for ${item.fileName}...`)}
                          >
                            Download
                          </Button>
                        </>
                      )}
                      {item.status === "Processing" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => navigate("/progress")}
                        >
                          View Status
                        </Button>
                      )}
                      {item.status === "Failed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate("/upload")}
                        >
                          Retry
                        </Button>
                      )}
                      <button
                        onClick={(e) => handleDelete(item.id, e)}
                        title="Delete log"
                        aria-label="Delete log"
                        style={{
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          color: "var(--color-text-light)",
                          padding: "4px"
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
