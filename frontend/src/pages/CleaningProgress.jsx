import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../services/api";
import RequestError from "../components/RequestError";

export default function CleaningProgress() {
  const [params] = useSearchParams();
  const jobId = params.get("jobId");
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let timer;
    async function load() {
      setJob(null); setError(null);
      async function poll() {
        try {
          const result = (await api.getCleaningJob(jobId)).data?.job;
          if (!result) throw new Error("The server returned an invalid cleaning job.");
          if (!active) return;
          setJob(result);
          if (!["completed", "failed"].includes(result.status)) timer = setTimeout(poll, 1500);
        } catch (err) { if (active) setError(err.message); }
      }
      if (jobId) poll();
    }
    load();
    return () => { active = false; clearTimeout(timer); };
  }, [jobId, attempt]);
  return <div className="page-container">
    <h1 className="page-header-title">Cleaning Progress</h1>
    {!jobId && <p>No cleaning job selected. <Link to="/history">View cleaning jobs</Link></p>}
    <RequestError message={error} onRetry={() => setAttempt(value => value + 1)} />
    {jobId && !job && !error && <p role="status">Loading cleaning job...</p>}
    {job && <section className="ds-card" style={{ padding: 24 }}>
      <h2>{job.dataset?.name || job.dataset?.originalFileName || "Dataset"}</h2>
      <p>Status: {job.status}</p>
      {job.status === "failed" ? <RequestError message={job.errorMessage || "Cleaning failed."} /> : <>
        <progress max="100" value={job.status === "completed" ? 100 : job.progressPercent ?? undefined} aria-label="Cleaning progress" />
        <p>{job.status === "completed" ? job.totalRecords ?? 0 : job.processedRecords ?? 0} records processed</p>
      </>}
      {job.status === "completed" && <Link to={`/results?jobId=${jobId}`}>View cleaning results</Link>}
    </section>}
  </div>;
}
