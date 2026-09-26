import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Database, FileCheck2, Layers, AlertTriangle } from "lucide-react";
import { useAuth } from "../auth/context";
import api from "../services/api";
import { loadAllJobs } from "../services/jobs";
import StatCard from "../components/StatCard";
import DataTable from "../components/DataTable";
import Button from "../components/Button";
import RequestError from "../components/RequestError";

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      setError(null); setData(null);
      Promise.all([api.getDatasets(), loadAllJobs()]).then(([datasets, jobs]) => {
        if (!Array.isArray(datasets.data)) throw new Error("The server returned an invalid dataset list.");
        if (active) setData({ datasets: datasets.data, jobs });
      }).catch(err => { if (active) setError(err.message); });
    }
    load();
    return () => { active = false; };
  }, [attempt]);
  const sum = key => data.jobs.reduce((total, job) => total + (job[key] || 0), 0);
  return <div className="page-container">
    <div className="page-header"><div><h1 className="page-header-title">Data Quality Dashboard</h1><p>Welcome back, {user.name}.</p></div><Link to="/upload"><Button>Upload Dataset</Button></Link></div>
    <RequestError message={error} onRetry={() => setAttempt(value => value + 1)} />
    {!data && !error && <p role="status">Loading dashboard...</p>}
    {data && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 18, marginBottom: 24 }}>
        <StatCard title="Total Datasets" value={data.datasets.length} icon={Database} />
        <StatCard title="Cleaning Jobs" value={data.jobs.length} subtext={`${sum("totalRecords")} records processed across jobs`} icon={FileCheck2} />
        <StatCard title="Duplicate Records" value={sum("duplicateRecords")} subtext="Across cleaning jobs" icon={Layers} />
        <StatCard title="Missing Values" value={sum("missingValueRecords")} subtext="Across cleaning jobs" icon={AlertTriangle} />
      </div>
      <h2>Your Datasets</h2>
      <DataTable data={data.datasets} emptyMessage="No datasets yet" columns={[
        { key: "name", header: "Dataset", render: (_, row) => <Link to={`/preview?datasetId=${row.id}`}>{row.name}</Link> },
        { key: "status", header: "Status" }, { key: "totalRows", header: "Rows" }
      ]} />
      <h2>Recent Cleaning Jobs</h2>
      <DataTable data={data.jobs.slice(0, 5)} emptyMessage="No cleaning jobs yet" columns={[
        { key: "datasetName", header: "Dataset", render: (_, row) => <Link to={`/results?jobId=${row.id}`}>{row.datasetName}</Link> },
        { key: "status", header: "Status" }, { key: "totalRecords", header: "Rows" }
      ]} />
    </>}
  </div>;
}
