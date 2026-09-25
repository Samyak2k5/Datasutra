import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  UploadCloud,
  Database,
  Layers,
  AlertTriangle,
  FileCheck2,
  ArrowRight,
  Sparkles
} from "lucide-react";
import StatCard from "../components/StatCard";
import QualityChart from "../components/QualityChart";
import StatusBadge from "../components/StatusBadge";
import Button from "../components/Button";
import api from "../services/api";
import { mockDashboardStats, mockCleaningJobs } from "../data/mockData";

export default function Dashboard() {
  const [datasets, setDatasets] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [hasLoadedFromApi, setHasLoadedFromApi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [user] = useState(() => api.getCurrentUser());
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      try {
        setLoading(true);
        const [dsRes, jobsRes] = await Promise.all([
          api.getDatasets().catch(() => null),
          api.getCleaningJobs().catch(() => null)
        ]);

        if (!isMounted) return;

        let gotData = false;
        if (dsRes?.data?.datasets !== undefined) {
          setDatasets(dsRes.data.datasets);
          gotData = true;
        }
        if (jobsRes?.data?.jobs !== undefined) {
          setJobs(jobsRes.data.jobs);
          gotData = true;
        }
        if (gotData) {
          setHasLoadedFromApi(true);
        }
      } catch {
        // Fallback to sample data for presentation if offline
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadDashboardData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Authoritative live metrics when connected to backend; fallback only when offline
  const totalDatasetsCount = hasLoadedFromApi
    ? datasets.length
    : mockDashboardStats.totalDatasets;
  const totalJobsCount = hasLoadedFromApi
    ? jobs.length
    : mockDashboardStats.cleaningJobsCount;
  
  const totalRowsProcessed = hasLoadedFromApi
    ? jobs.reduce((acc, j) => acc + (j.totalRecords || 0), 0)
    : mockDashboardStats.rowsProcessed;

  const totalDuplicates = hasLoadedFromApi
    ? jobs.reduce((acc, j) => acc + (j.duplicateRecords || 0), 0)
    : mockDashboardStats.duplicateCandidates;

  const totalMissing = hasLoadedFromApi
    ? jobs.reduce((acc, j) => acc + (j.missingValueRecords || 0), 0)
    : mockDashboardStats.missingValues;

  const totalReviewsPending = hasLoadedFromApi
    ? jobs.reduce((acc, j) => acc + (j.reviewCount || 0), 0)
    : 18;

  const displayJobs = hasLoadedFromApi
    ? jobs.slice(0, 5)
    : mockCleaningJobs.slice(0, 4);

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Data Quality Dashboard</h1>
          <p className="page-header-subtitle">
            Welcome back{user?.name ? `, ${user.name}` : ", Operator"}! Here is your real-time data cleaning and quality overview.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {totalReviewsPending > 0 && (
            <Link to="/review">
              <Button variant="outline" size="md" icon={Sparkles}>
                Pending Reviews ({totalReviewsPending})
              </Button>
            </Link>
          )}

          <Link to="/upload">
            <Button variant="primary" size="md" icon={UploadCloud}>
              Upload Dataset
            </Button>
          </Link>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "18px",
          marginBottom: "24px"
        }}
      >
        <StatCard
          title="Total Datasets"
          value={totalDatasetsCount}
          subtext={datasets.length > 0 ? `${datasets.length} in tenant storage` : mockDashboardStats.trends.datasets}
          icon={Database}
          accentColor="#0176d3"
        />

        <StatCard
          title="Cleaning Jobs"
          value={totalJobsCount}
          subtext={`${totalRowsProcessed.toLocaleString()} records processed`}
          icon={FileCheck2}
          accentColor="#16a34a"
        />

        <StatCard
          title="Duplicate Records"
          value={totalDuplicates}
          subtext="Detected & clustered"
          icon={Layers}
          accentColor="#f59e0b"
        />

        <StatCard
          title="Missing Values"
          value={totalMissing}
          subtext="Analyzed & imputed"
          icon={AlertTriangle}
          accentColor="#dc2626"
        />
      </div>

      {/* Main Grid: Data Quality Donut Chart + Recent Cleaning Jobs Table */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: "24px"
        }}
      >
        {/* Left Column: Data Quality Overview Donut */}
        <div style={{ flex: "1 1 360px" }}>
          <QualityChart />
        </div>

        {/* Right Column: Recent Cleaning Jobs Table */}
        <div className="ds-card" style={{ flex: "1 1 540px", display: "flex", flexDirection: "column" }}>
          <div className="ds-card-header">
            <div>
              <h3 className="ds-card-title">Recent Cleaning Jobs</h3>
              <p className="ds-card-subtitle">Activity stream across your uploaded files</p>
            </div>
            <Link
              to="/history"
              style={{
                fontSize: "0.825rem",
                color: "var(--color-primary)",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 4
              }}
            >
              View all <ArrowRight size={14} />
            </Link>
          </div>

          <div className="ds-table-container" style={{ border: "none", borderRadius: 0, flex: 1 }}>
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Dataset / Job</th>
                  <th>Status</th>
                  <th>Processed</th>
                  <th>Quality</th>
                  <th>Date</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: "center", padding: "32px 16px", color: "var(--color-text-muted)" }}>
                      Loading recent jobs...
                    </td>
                  </tr>
                ) : displayJobs.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: "center", padding: "40px 16px", color: "var(--color-text-muted)" }}>
                      <Database size={32} style={{ margin: "0 auto 8px auto", opacity: 0.4 }} />
                      <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--color-text-main)" }}>
                        No cleaning jobs yet
                      </div>
                      <p style={{ fontSize: "0.825rem", margin: "4px 0 16px 0" }}>
                        Upload your first dataset to start data cleaning and quality analytics.
                      </p>
                      <Button variant="primary" size="sm" onClick={() => navigate("/upload")}>
                        Upload Dataset
                      </Button>
                    </td>
                  </tr>
                ) : (
                  displayJobs.map((job) => {
                    const jobStatus = job.status === "completed" ? "Completed" : job.status === "processing" ? "Processing" : job.status || "Completed";
                    const qualityVal = job.qualityScore ?? job.quality ?? 98;
                    const dateStr = job.createdAt ? new Date(job.createdAt).toLocaleDateString() : job.date || "Just now";

                    return (
                      <tr key={job.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: "var(--color-text-main)" }}>
                            {job.datasetName || job.fileName || "Dataset"}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                            {job.processingMode || job.cleaningMode || "Standard Rule Pipeline"}
                          </div>
                        </td>
                        <td>
                          <StatusBadge status={jobStatus} />
                        </td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>
                          {(job.totalRecords || job.rowsProcessed || 0).toLocaleString()}
                        </td>
                        <td>
                          <span
                            style={{
                              fontWeight: 600,
                              color: qualityVal >= 90 ? "var(--color-success)" : "var(--color-warning)"
                            }}
                          >
                            {qualityVal}%
                          </span>
                        </td>
                        <td style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
                          {dateStr}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {jobStatus === "Completed" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(job.id ? `/results?jobId=${job.id}` : "/results")}
                            >
                              Results
                            </Button>
                          ) : jobStatus === "Processing" ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => navigate(job.id ? `/progress?jobId=${job.id}` : "/progress")}
                            >
                              Progress
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/preview${job.datasetId ? `?datasetId=${job.datasetId}` : ""}`)}
                            >
                              Inspect
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
