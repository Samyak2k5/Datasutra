import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import EmptyState from "./EmptyState";

export default function DataTable({
  columns = [],
  data = [],
  keyField = "id",
  pageSize = 5,
  showPagination = true,
  emptyMessage = "No records to display",
  loading = false,
  onRowClick
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(pageSize);

  const totalPages = Math.ceil(data.length / rowsPerPage) || 1;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentData = data.slice(startIndex, startIndex + rowsPerPage);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  return (
    <div className="ds-card" style={{ overflow: "hidden" }}>
      <div className="ds-table-container" style={{ border: "none", borderRadius: 0 }}>
        <table className="ds-table">
          <thead>
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={col.key || idx}
                  style={{
                    textAlign: col.align || "left",
                    width: col.width || "auto"
                  }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: "center", padding: "40px" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--color-text-muted)" }}>
                    <span className="spinner">●</span> Loading records...
                  </div>
                </td>
              </tr>
            ) : currentData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: "30px 16px" }}>
                  <EmptyState description={emptyMessage} />
                </td>
              </tr>
            ) : (
              currentData.map((row, rowIdx) => (
                <tr
                  key={row[keyField] || rowIdx}
                  onClick={() => onRowClick && onRowClick(row)}
                  style={{ cursor: onRowClick ? "pointer" : "default" }}
                >
                  {columns.map((col, colIdx) => (
                    <td
                      key={col.key || colIdx}
                      style={{
                        textAlign: col.align || "left"
                      }}
                    >
                      {col.render ? col.render(row, startIndex + rowIdx) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showPagination && data.length > 0 && (
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
              aria-label="Rows per page"
              style={{
                padding: "3px 8px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-color)",
                background: "var(--color-bg-surface)",
                fontSize: "0.8rem"
              }}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span>
              Showing {startIndex + 1} - {Math.min(startIndex + rowsPerPage, data.length)} of {data.length}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="Previous page"
              style={{
                padding: "4px 8px",
                border: "1px solid var(--border-color)",
                background: "var(--color-bg-surface)",
                borderRadius: "var(--radius-sm)",
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
                opacity: currentPage === 1 ? 0.4 : 1,
                display: "inline-flex",
                alignItems: "center"
              }}
            >
              <ChevronLeft size={16} />
            </button>

            <span style={{ fontWeight: 600, color: "var(--color-text-main)", padding: "0 6px" }}>
              Page {currentPage} of {totalPages}
            </span>

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              aria-label="Next page"
              style={{
                padding: "4px 8px",
                border: "1px solid var(--border-color)",
                background: "var(--color-bg-surface)",
                borderRadius: "var(--radius-sm)",
                cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                opacity: currentPage === totalPages ? 0.4 : 1,
                display: "inline-flex",
                alignItems: "center"
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
