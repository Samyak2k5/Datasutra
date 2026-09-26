import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { loadAllJobs } from "../services/jobs";
import DataTable from "../components/DataTable";
import RequestError from "../components/RequestError";

export default function CleaningHistory() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError(null); setJobs([]);
      loadAllJobs().then(data => { if (active) setJobs(data); })
        .catch(err => { if (active) setError(err.message); })
        .finally(() => { if (active) setLoading(false); });
    }
    load();
    return () => { active = false; };
  }, [attempt]);
  const filtered = jobs.filter(job => job.datasetName.toLowerCase().includes(query.toLowerCase()) && (status === "all" || job.status === status));
  return <div className="page-container">
    <h1 className="page-header-title">Cleaning History</h1>
    <RequestError message={error} onRetry={() => setAttempt(value => value + 1)} />
    <input className="ds-input" type="search" aria-label="Search jobs" placeholder="Search datasets" value={query} onChange={event => setQuery(event.target.value)} />
    <select className="ds-select" aria-label="Job status" value={status} onChange={event => setStatus(event.target.value)}>{["all", "completed", "processing", "failed"].map(value => <option key={value}>{value}</option>)}</select>
    {!error && <DataTable key={`${query}:${status}`} data={filtered} loading={loading} emptyMessage="No cleaning jobs yet" columns={[
      { key: "datasetName", header: "Dataset", render: (_, row) => <Link to={`/results?jobId=${row.id}`}>{row.datasetName}</Link> },
      { key: "status", header: "Status", render: (_, row) => <Link to={`/progress?jobId=${row.id}`}>{row.status}</Link> },
      { key: "totalRecords", header: "Rows" }, { key: "modifiedRecords", header: "Changed" },
      { key: "createdAt", header: "Created", render: value => value ? new Date(value).toLocaleString() : "—" },
      { key: "id", header: "Review", render: value => <Link to={`/review?jobId=${value}`}>Review suggestions</Link> }
    ]} />}
  </div>;
}
