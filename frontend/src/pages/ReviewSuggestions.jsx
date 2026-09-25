import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Sparkles,
  CheckCircle,
  XCircle,
  Check,
  X,
  Edit3,
  Layers,
  FileText,
  Cpu,
  HelpCircle,
  ArrowRight,
  AlertTriangle
} from "lucide-react";
import Button from "../components/Button";
import Modal from "../components/Modal";
import api from "../services/api";
import { mockAiSuggestions } from "../data/mockData";

export default function ReviewSuggestions() {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get("jobId");

  const [items, setItems] = useState(() => {
    if (jobId) return [];
    return mockAiSuggestions.map((m) => ({
      reviewId: String(m.id),
      rowNumber: m.rowNumber || 18,
      field: m.field,
      originalValue: m.originalValue,
      suggestedValue: m.aiSuggestion,
      approvedValue: m.status === "approved" ? m.aiSuggestion : m.status === "rejected" ? m.originalValue : null,
      source: "ai",
      reason: m.reason,
      evidence: { rule: "ai.typo_correction", confidence: m.confidence },
      confidence: m.confidence || 0.85,
      status: m.status === "approved" ? "accepted" : m.status,
      provenance: { source: "leads.csv", row: m.rowNumber }
    }));
  });
  const [counts, setCounts] = useState(() => {
    if (jobId) return { total: 0, pending: 0, accepted: 0, rejected: 0, edited: 0 };
    return {
      total: mockAiSuggestions.length,
      pending: mockAiSuggestions.filter((i) => i.status === "pending").length,
      accepted: mockAiSuggestions.filter((i) => i.status === "approved").length,
      rejected: mockAiSuggestions.filter((i) => i.status === "rejected").length,
      edited: 0
    };
  });
  const [activeTab, setActiveTab] = useState("all");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(Boolean(jobId));
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  // Edit Modal State
  const [editingItem, setEditingItem] = useState(null);
  const [editValue, setEditValue] = useState("");

  const navigate = useNavigate();

  // Load review items from real backend if jobId present
  const loadReviewItems = useCallback(async () => {
    if (!jobId) return;
    try {
      setActionLoading(true);
      setError(null);
      const res = await api.getReviewItems(jobId, { status: activeTab, limit: 100 });
      if (res?.data) {
        setItems(res.data.items || []);
        if (res.data.counts) {
          setCounts(res.data.counts);
        }
      }
    } catch (err) {
      setError(err.message || "Failed to load review items from backend.");
    } finally {
      setActionLoading(false);
    }
  }, [jobId, activeTab]);

  useEffect(() => {
    let isMounted = true;
    if (!jobId) return;

    async function initFetch() {
      try {
        const res = await api.getReviewItems(jobId, { status: activeTab, limit: 100 });
        if (isMounted && res?.data) {
          setItems(res.data.items || []);
          if (res.data.counts) {
            setCounts(res.data.counts);
          }
        }
      } catch (err) {
        if (isMounted) setError(err.message || "Failed to load review items from backend.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initFetch();
    return () => {
      isMounted = false;
    };
  }, [jobId, activeTab]);

  // Actions
  const handleAccept = async (reviewId) => {
    if (jobId) {
      try {
        setActionLoading(true);
        await api.acceptReviewItem(jobId, reviewId);
        await loadReviewItems();
      } catch (err) {
        alert(err.message || "Accept failed.");
      } finally {
        setActionLoading(false);
      }
    } else {
      setItems((prev) =>
        prev.map((i) => (i.reviewId === reviewId ? { ...i, status: "accepted", approvedValue: i.suggestedValue } : i))
      );
      setCounts((prev) => ({ ...prev, pending: Math.max(0, prev.pending - 1), accepted: prev.accepted + 1 }));
    }
  };

  const handleReject = async (reviewId) => {
    if (jobId) {
      try {
        setActionLoading(true);
        await api.rejectReviewItem(jobId, reviewId);
        await loadReviewItems();
      } catch (err) {
        alert(err.message || "Reject failed.");
      } finally {
        setActionLoading(false);
      }
    } else {
      setItems((prev) =>
        prev.map((i) => (i.reviewId === reviewId ? { ...i, status: "rejected", approvedValue: i.originalValue } : i))
      );
      setCounts((prev) => ({ ...prev, pending: Math.max(0, prev.pending - 1), rejected: prev.rejected + 1 }));
    }
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setEditValue(item.suggestedValue || item.originalValue || "");
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    if (jobId) {
      try {
        setActionLoading(true);
        await api.editReviewItem(jobId, editingItem.reviewId, editValue);
        setEditingItem(null);
        await loadReviewItems();
      } catch (err) {
        alert(err.message || "Edit failed.");
      } finally {
        setActionLoading(false);
      }
    } else {
      setItems((prev) =>
        prev.map((i) =>
          i.reviewId === editingItem.reviewId
            ? { ...i, status: "edited", approvedValue: editValue }
            : i
        )
      );
      setCounts((prev) => ({ ...prev, pending: Math.max(0, prev.pending - 1), edited: prev.edited + 1 }));
      setEditingItem(null);
    }
  };

  // Bulk actions
  const handleToggleSelect = (reviewId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(reviewId)) next.delete(reviewId);
      else next.add(reviewId);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.reviewId)));
    }
  };

  const handleBulkAccept = async () => {
    const ids = Array.from(selectedIds);
    if (jobId) {
      try {
        setActionLoading(true);
        await api.bulkAcceptReviews(jobId, ids);
        setSelectedIds(new Set());
        await loadReviewItems();
      } catch (err) {
        alert(err.message || "Bulk accept failed.");
      } finally {
        setActionLoading(false);
      }
    } else {
      setItems((prev) =>
        prev.map((i) => (ids.includes(i.reviewId) ? { ...i, status: "accepted", approvedValue: i.suggestedValue } : i))
      );
      setSelectedIds(new Set());
    }
  };

  const handleBulkReject = async () => {
    const ids = Array.from(selectedIds);
    if (jobId) {
      try {
        setActionLoading(true);
        await api.bulkRejectReviews(jobId, ids);
        setSelectedIds(new Set());
        await loadReviewItems();
      } catch (err) {
        alert(err.message || "Bulk reject failed.");
      } finally {
        setActionLoading(false);
      }
    } else {
      setItems((prev) =>
        prev.map((i) => (ids.includes(i.reviewId) ? { ...i, status: "rejected", approvedValue: i.originalValue } : i))
      );
      setSelectedIds(new Set());
    }
  };

  const getSourceBadge = (source) => {
    switch (source) {
      case "ai":
        return { label: "AI Model", bg: "#f3e8ff", color: "#7e22ce", icon: Sparkles };
      case "rule_engine":
        return { label: "Rule Engine", bg: "#e0f2fe", color: "#0369a1", icon: Cpu };
      case "duplicate_detection":
        return { label: "Duplicate Match", bg: "#fef3c7", color: "#b45309", icon: Layers };
      case "parser":
        return { label: "Parser", bg: "#dcfce7", color: "#15803d", icon: FileText };
      default:
        return { label: source || "System", bg: "#f1f5f9", color: "#475569", icon: HelpCircle };
    }
  };

  const filteredItems = items.filter((item) => {
    if (activeTab === "all") return true;
    return item.status === activeTab;
  });

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h1 className="page-header-title">Human Operator Review & Explainability</h1>
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
              {counts.pending} Pending Review
            </span>
          </div>
          <p className="page-header-subtitle">
            Inspect every transformation: Understand WHAT changed, WHY, WHAT evidence was used, and explicitly Accept, Reject, or Edit values.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          {selectedIds.size > 0 && (
            <>
              <Button
                variant="secondary"
                size="sm"
                icon={XCircle}
                onClick={handleBulkReject}
                disabled={actionLoading}
              >
                Reject Selected ({selectedIds.size})
              </Button>
              <Button
                variant="success"
                size="sm"
                icon={CheckCircle}
                onClick={handleBulkAccept}
                disabled={actionLoading}
              >
                Accept Selected ({selectedIds.size})
              </Button>
            </>
          )}

          <Button
            variant="primary"
            size="md"
            icon={ArrowRight}
            iconPosition="right"
            onClick={() => navigate(jobId ? `/results?jobId=${jobId}` : "/results")}
          >
            Return to Results
          </Button>
        </div>
      </div>

      {/* Human Verification Notice */}
      <div
        style={{
          padding: "16px 20px",
          backgroundColor: "#faf5ff",
          border: "1px solid var(--color-ai-border)",
          borderRadius: "var(--radius-lg)",
          display: "flex",
          alignItems: "flex-start",
          gap: "14px",
          marginBottom: "20px"
        }}
      >
        <Sparkles size={20} color="var(--color-ai)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--color-ai-text)" }}>
            Zero-Hallucination Human Verification Boundary
          </div>
          <p style={{ fontSize: "0.825rem", color: "#581c87", marginTop: 2, lineHeight: 1.5 }}>
            DataSutra enforces full operator explainability. Original values are strictly preserved bit-for-bit in memory and storage.
            Rejected suggestions revert to raw inputs immediately. No AI or automated suggestion modifies production output without verified review.
          </p>
        </div>
      </div>

      {/* Error state */}
      {error && (
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
          <span>{error}</span>
        </div>
      )}

      {/* Filter Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border-color)",
          marginBottom: "18px",
          gap: "8px",
          overflowX: "auto"
        }}
      >
        {[
          { id: "pending", label: "Pending Review", count: counts.pending },
          { id: "accepted", label: "Accepted", count: counts.accepted },
          { id: "rejected", label: "Rejected", count: counts.rejected },
          { id: "edited", label: "Edited", count: counts.edited },
          { id: "all", label: "All Items", count: counts.total }
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedIds(new Set());
              }}
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
                  backgroundColor: isActive ? "var(--color-primary-light)" : "var(--color-bg-subtle)",
                  color: isActive ? "var(--color-primary)" : "var(--color-text-muted)",
                  fontWeight: 600
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bulk Toolbar */}
      {filteredItems.length > 0 && (
        <div
          style={{
            padding: "8px 12px",
            backgroundColor: "var(--color-bg-subtle)",
            borderRadius: "var(--radius-md)",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "0.825rem"
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
              onChange={handleSelectAll}
            />
            Select All ({filteredItems.length} items in this view)
          </label>
          <span style={{ color: "var(--color-text-muted)" }}>
            {selectedIds.size} of {filteredItems.length} selected
          </span>
        </div>
      )}

      {/* Review Items Card List */}
      {loading ? (
        <div
          className="ds-card"
          style={{
            padding: "48px 24px",
            textAlign: "center",
            color: "var(--color-text-muted)"
          }}
        >
          <Sparkles size={36} color="var(--color-primary)" style={{ margin: "0 auto 12px auto" }} />
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--color-text-main)" }}>
            Loading Review Items...
          </h3>
        </div>
      ) : filteredItems.length === 0 ? (
        <div
          className="ds-card"
          style={{
            padding: "48px 24px",
            textAlign: "center",
            color: "var(--color-text-muted)"
          }}
        >
          <CheckCircle size={40} color="#16a34a" style={{ margin: "0 auto 12px auto" }} />
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--color-text-main)" }}>
            No Review Items in "{activeTab}" Category
          </h3>
          <p style={{ fontSize: "0.85rem", marginTop: 4 }}>
            All items in this category have been processed or no ambiguous transformations were recorded.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {filteredItems.map((item) => {
            const src = getSourceBadge(item.source);
            const SrcIcon = src.icon;
            const isSelected = selectedIds.has(item.reviewId);

            return (
              <div
                key={item.reviewId}
                className="ds-card"
                style={{
                  padding: "18px 22px",
                  borderLeft:
                    item.status === "accepted"
                      ? "4px solid #16a34a"
                      : item.status === "rejected"
                      ? "4px solid #dc2626"
                      : item.status === "edited"
                      ? "4px solid #2563eb"
                      : "4px solid #f59e0b",
                  backgroundColor: isSelected ? "#f8fafc" : "#ffffff",
                  transition: "all 0.15s ease"
                }}
              >
                {/* Header row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px", marginBottom: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelect(item.reviewId)}
                      style={{ cursor: "pointer" }}
                    />
                    <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--color-text-main)" }}>
                      Row {item.rowNumber} • Field: <code style={{ color: "var(--color-primary)" }}>{item.field}</code>
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "0.725rem",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: src.bg,
                        color: src.color
                      }}
                    >
                      <SrcIcon size={12} />
                      {src.label}
                    </span>
                    <span
                      style={{
                        fontSize: "0.725rem",
                        padding: "2px 6px",
                        borderRadius: "var(--radius-xs)",
                        backgroundColor: "#ecfdf5",
                        color: "#065f46",
                        fontWeight: 600
                      }}
                    >
                      {Math.round((item.confidence || 0.8) * 100)}% Confidence
                    </span>
                  </div>

                  {/* Status indicator */}
                  <div>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        textTransform: "uppercase",
                        fontWeight: 700,
                        letterSpacing: "0.5px",
                        padding: "3px 8px",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor:
                          item.status === "accepted"
                            ? "#dcfce7"
                            : item.status === "rejected"
                            ? "#fee2e2"
                            : item.status === "edited"
                            ? "#dbeafe"
                            : "#fef3c7",
                        color:
                          item.status === "accepted"
                            ? "#15803d"
                            : item.status === "rejected"
                            ? "#991b1b"
                            : item.status === "edited"
                            ? "#1e40af"
                            : "#b45309"
                      }}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>

                {/* Diff Grid: Original vs Suggested / Approved */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: "12px",
                    marginBottom: "14px"
                  }}
                >
                  {/* Original */}
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius-md)",
                      backgroundColor: "#fef2f2",
                      border: "1px solid #fee2e2"
                    }}
                  >
                    <div style={{ fontSize: "0.725rem", color: "#991b1b", textTransform: "uppercase", fontWeight: 700, marginBottom: "2px" }}>
                      Original Value (Preserved)
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.9rem", color: "#7f1d1d", wordBreak: "break-all" }}>
                      {item.originalValue === "" ? <em style={{ color: "#9ca3af" }}>(Empty cell)</em> : String(item.originalValue)}
                    </div>
                  </div>

                  {/* Suggested / Approved */}
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius-md)",
                      backgroundColor: item.status === "edited" ? "#eff6ff" : "#ecfdf5",
                      border: item.status === "edited" ? "1px solid #bfdbfe" : "1px solid #d1fae5"
                    }}
                  >
                    <div style={{ fontSize: "0.725rem", color: item.status === "edited" ? "#1e40af" : "#065f46", textTransform: "uppercase", fontWeight: 700, marginBottom: "2px" }}>
                      {item.status === "edited" ? "Operator Approved Edit" : "Suggested Transformation"}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.9rem", color: item.status === "edited" ? "#1e3a8a" : "#064e3b", wordBreak: "break-all", fontWeight: 600 }}>
                      {item.status === "edited" ? String(item.approvedValue) : item.suggestedValue === "" ? <em style={{ color: "#9ca3af" }}>(Flagged for removal)</em> : String(item.suggestedValue)}
                    </div>
                  </div>
                </div>

                {/* Explainability Block: Reason & Evidence */}
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    marginBottom: "14px",
                    fontSize: "0.825rem"
                  }}
                >
                  <div style={{ marginBottom: "4px" }}>
                    <strong style={{ color: "var(--color-text-main)" }}>Why? </strong>
                    <span style={{ color: "var(--color-text-muted)" }}>{item.reason}</span>
                  </div>
                  {item.evidence && (
                    <div style={{ fontSize: "0.775rem", color: "var(--color-text-muted)" }}>
                      <strong>Supporting Evidence: </strong>
                      <code>{typeof item.evidence === "object" ? JSON.stringify(item.evidence) : String(item.evidence)}</code>
                    </div>
                  )}
                </div>

                {/* Actions Footer */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                    {item.reviewedAt && (
                      <span>Reviewed on {new Date(item.reviewedAt).toLocaleDateString()}</span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <Button
                      variant={item.status === "rejected" ? "secondary" : "outline"}
                      size="sm"
                      icon={X}
                      onClick={() => handleReject(item.reviewId)}
                      disabled={actionLoading}
                    >
                      {item.status === "rejected" ? "Rejected (Revert)" : "Reject"}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      icon={Edit3}
                      onClick={() => openEditModal(item)}
                      disabled={actionLoading}
                    >
                      Edit Custom
                    </Button>

                    <Button
                      variant={item.status === "accepted" ? "secondary" : "success"}
                      size="sm"
                      icon={Check}
                      onClick={() => handleAccept(item.reviewId)}
                      disabled={actionLoading}
                    >
                      {item.status === "accepted" ? "Accepted ✓" : "Accept Suggestion"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Custom Value Modal */}
      <Modal
        isOpen={Boolean(editingItem)}
        onClose={() => setEditingItem(null)}
        title={`Edit Value for Row ${editingItem?.rowNumber} (${editingItem?.field})`}
        subtitle="Provide an authoritative human value to override automated suggestions."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingItem(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveEdit} disabled={actionLoading}>
              Save Approved Value
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label className="ds-form-label">Original Value</label>
            <input
              type="text"
              className="ds-input"
              value={String(editingItem?.originalValue ?? "")}
              disabled
              style={{ backgroundColor: "#f8fafc" }}
            />
          </div>

          <div>
            <label className="ds-form-label">AI / Suggested Value</label>
            <input
              type="text"
              className="ds-input"
              value={String(editingItem?.suggestedValue ?? "")}
              disabled
              style={{ backgroundColor: "#f8fafc" }}
            />
          </div>

          <div>
            <label className="ds-form-label">Operator Approved Value (Authoritative)</label>
            <input
              type="text"
              className="ds-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder="Enter approved cell value..."
              autoFocus
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
