import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../services/api";
import Button from "../components/Button";
import RequestError from "../components/RequestError";

export default function CleaningConfiguration() {
  const [params] = useSearchParams();
  const datasetId = params.get("datasetId");
  const [mode, setMode] = useState("rules_only");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  async function start() {
    setError(null); setLoading(true);
    try {
      const response = await api.cleanDataset(datasetId, { cleaningMode: mode });
      const jobId = response?.data?.job?.id;
      if (!jobId) throw new Error("The server did not return a cleaning job ID.");
      navigate(`/progress?jobId=${encodeURIComponent(jobId)}&datasetId=${encodeURIComponent(datasetId)}`);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  return <div className="page-container">
    <h1 className="page-header-title">Cleaning Configuration</h1>
    {!datasetId ? <p>Choose a dataset before cleaning. <Link to="/preview">View datasets</Link></p> : <section className="ds-card" style={{ padding: 24 }}>
      <p>The cleaning pipeline trims whitespace, normalizes recognized fields, detects duplicates, and flags missing values.</p>
      <label>Cleaning mode <select className="ds-select" value={mode} onChange={event => setMode(event.target.value)} disabled={loading}>
        <option value="rules_only">Deterministic rules</option>
        <option value="rules_then_ai">Rules followed by AI suggestions</option>
      </select></label>
      {mode === "rules_then_ai" && <p>AI suggestions require a configured AI provider on the server.</p>}
      <RequestError message={error} />
      <Button onClick={start} loading={loading}>Start Cleaning</Button>
    </section>}
  </div>;
}
