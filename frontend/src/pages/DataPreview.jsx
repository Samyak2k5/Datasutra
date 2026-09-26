import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../services/api";
import { loadDatasetPreview } from "../services/datasets";
import DataTable from "../components/DataTable";
import RequestError from "../components/RequestError";
import Button from "../components/Button";

export default function DataPreview() {
  const [params] = useSearchParams();
  const datasetId = params.get("datasetId");
  const [result, setResult] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError(null); setResult(null); setDatasets([]); setQuery("");
      const request = datasetId ? loadDatasetPreview(datasetId) : api.getDatasets();
      request.then(data => {
        if (!active) return;
        if (datasetId) setResult(data);
        else {
          if (!Array.isArray(data.data)) throw new Error("The server returned an invalid dataset list.");
          setDatasets(data.data);
        }
      }).catch(err => { if (active) setError(err.message); })
        .finally(() => { if (active) setLoading(false); });
    }
    load();
    return () => { active = false; };
  }, [datasetId, attempt]);
  const headers = result?.preview.headers || [];
  const rows = (result?.preview.rows || []).filter(row => headers.some(header => String(row[header] ?? "").toLowerCase().includes(query.toLowerCase())));
  const cell = value => value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return <div className="page-container">
    <div className="page-header">
      <div><h1 className="page-header-title">{datasetId ? "Data Preview" : "Datasets"}</h1>
        {result && <p>{result.dataset.originalFileName || result.dataset.name} · {result.preview.totalRows} rows · {headers.length} columns</p>}</div>
      <Link to="/upload"><Button>Upload Dataset</Button></Link>
    </div>
    <RequestError message={error} onRetry={() => setAttempt(value => value + 1)} />
    {loading && <p role="status">Loading dataset...</p>}
    {!loading && !error && !datasetId && <DataTable data={datasets} emptyMessage="No datasets yet" columns={[
      { key: "name", header: "Dataset", render: (_, row) => <Link to={`/preview?datasetId=${encodeURIComponent(row.id)}`}>{row.name}</Link> },
      { key: "status", header: "Status" }, { key: "totalRows", header: "Rows" }
    ]} />}
    {!loading && !error && result && <>
      <p>Showing up to the first 100 rows. Search and pagination apply to this preview.</p>
      <input className="ds-input" type="search" aria-label="Search preview" placeholder="Search records" value={query} onChange={event => setQuery(event.target.value)} />
      <DataTable key={`${datasetId}:${query}`} data={rows} pageSize={10} emptyMessage="No records found" columns={headers.map(header => ({ key: header, header, render: value => cell(value) }))} />
      {(result.preview.warnings || []).map((warning, index) => <p key={index}>{typeof warning === "string" ? warning : JSON.stringify(warning)}</p>)}
      <Link to={`/configure?datasetId=${encodeURIComponent(datasetId)}`}><Button disabled={!result.preview.totalRows}>Configure Cleaning</Button></Link>
    </>}
  </div>;
}
