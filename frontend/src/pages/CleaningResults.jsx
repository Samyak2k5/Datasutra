import CleaningComparison from "../components/CleaningComparison";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../services/api";
import DataTable from "../components/DataTable";
import Button from "../components/Button";
import RequestError from "../components/RequestError";

const display = value => value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
export default function CleaningResults() {
  const [params] = useSearchParams();
  const jobId = params.get("jobId");
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [format, setFormat] = useState("csv");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  useEffect(() => {
    let active = true;
    async function load() {
      setReport(null); setError(null); setExportError(null);
      if (jobId) api.getCleaningJobReport(jobId).then(response => {
        if (!response?.data?.jobId) throw new Error("The server returned an invalid cleaning report.");
        if (active) setReport(response.data);
      }).catch(err => { if (active) setError(err.message); });
    }
    load();
    return () => { active = false; };
  }, [jobId, attempt]);
  async function download() {
    setExporting(true); setExportError(null);
    try { await api.exportCleanedData(jobId, format); }
    catch (err) { setExportError(err.message); }
    finally { setExporting(false); }
  }
  const rows = (report?.preview || []).map(row => row.cleaned || row.original || {});
  const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return <div className="page-container">
    <h1 className="page-header-title">Cleaning Results</h1>
    {!jobId && <p>No cleaning job selected. <Link to="/history">View cleaning jobs</Link></p>}
    <RequestError message={error} onRetry={() => setAttempt(value => value + 1)} />
    {jobId && !report && !error && <p role="status">Loading results...</p>}
    {report && <>
      <h2>{report.dataset?.name}</h2><p>Status: {report.status}</p>
      {report.status !== "completed" ? <Link to={`/progress?jobId=${jobId}`}>View job status</Link> : <>
        <div className="ds-card" style={{ padding: 20, marginBottom: 20 }}>
          <p>Rows: {report.metrics?.totalRows ?? 0} · Changed: {report.metrics?.modifiedRows ?? 0} · Duplicates: {report.duplicateReport?.duplicateRows ?? 0} · Missing values: {report.missingReport?.missingValueCount ?? 0}</p>
          <p>Quality score: {report.qualityScore?.overall == null ? "Not available" : `${report.qualityScore.overall}%`}</p>
          <Link to={`/review?jobId=${jobId}`}>Review suggestions ({report.reviewSummary?.pending ?? 0} pending)</Link>
        </div>
        <CleaningComparison report={report.comparisonReport} />
        <label>Export format <select className="ds-select" value={format} onChange={event => setFormat(event.target.value)}>
          <option value="csv">CSV</option><option value="json">JSON</option><option value="report-csv">Audit CSV</option><option value="pdf">Text report</option>
        </select></label>
        <Button onClick={download} loading={exporting}>Download</Button>
        <RequestError message={exportError} />
        <h2>Cleaned Records</h2><p>Preview of up to 50 records. Download the cleaned dataset for all rows.</p>
        <DataTable data={rows} emptyMessage="No records found" columns={headers.map(header => ({ key: header, header, render: display }))} />
        <h2>Changes</h2>
        <DataTable data={report.transformationLog || []} emptyMessage="No changes recorded" columns={[
          { key: "rowNumber", header: "Row" }, { key: "field", header: "Field" },
          { key: "originalValue", header: "Original", render: display }, { key: "cleanedValue", header: "Cleaned", render: display },
          { key: "reason", header: "Reason" }
        ]} />
      </>}
    </>}
  </div>;
}
