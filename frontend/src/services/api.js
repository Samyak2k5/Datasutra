/**
 * DataSutra Frontend API Client (Step 13)
 *
 * Centralized, production-ready HTTP client for Authentication, Datasets,
 * Cleaning Pipelines, Quality Analytics Reports, and Human Review.
 */

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? "/api/v1"
    : (typeof window !== "undefined" && window.location.port === "5173"
        ? "/api/v1"
        : "http://localhost:5000/api/v1"));

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = null;
  }

  setToken(token) {
    this.token = token;
    if (typeof window !== "undefined") {
      if (token) {
        localStorage.setItem("datasutra_token", token);
      } else {
        localStorage.removeItem("datasutra_token");
      }
    }
  }

  getToken() {
    if (!this.token && typeof window !== "undefined") {
      this.token = localStorage.getItem("datasutra_token");
    }
    return this.token;
  }

  getCurrentUser() {
    if (typeof window !== "undefined") {
      const uStr = localStorage.getItem("datasutra_user");
      if (uStr) {
        try {
          return JSON.parse(uStr);
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  setCurrentUser(user) {
    if (typeof window !== "undefined") {
      if (user) {
        localStorage.setItem("datasutra_user", JSON.stringify(user));
      } else {
        localStorage.removeItem("datasutra_user");
      }
    }
  }

  async request(endpoint, options = {}) {
    const isFormData = options.body instanceof FormData;
    const headers = {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    };

    const token = this.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 30000);

    const config = {
      ...options,
      headers,
      signal: controller.signal
    };

    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

    try {
      const response = await fetch(url, config);
      clearTimeout(timeout);

      // Handle file blob responses (for exports)
      if (options.responseType === "blob") {
        if (!response.ok) {
          throw new Error(`Export failed with HTTP status ${response.status}`);
        }
        return await response.blob();
      }

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg =
          data?.message || data?.error || `Request failed with status ${response.status}`;
        const err = new Error(errorMsg);
        err.status = response.status;
        err.data = data;

        if (response.status === 401) {
          this.setToken(null);
          this.setCurrentUser(null);
        }

        throw err;
      }

      return data;
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        const timeoutErr = new Error("Request timed out. Please try again.");
        timeoutErr.status = 408;
        throw timeoutErr;
      }
      throw err;
    }
  }

  // ==========================================
  // Auth Endpoints
  // ==========================================
  async login(credentials) {
    const res = await this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials)
    });
    if (res?.data?.accessToken) {
      this.setToken(res.data.accessToken);
      this.setCurrentUser(res.data.user);
    }
    return res;
  }

  async register(userData) {
    const res = await this.request("/auth/register", {
      method: "POST",
      body: JSON.stringify(userData)
    });
    if (res?.data?.accessToken) {
      this.setToken(res.data.accessToken);
      this.setCurrentUser(res.data.user);
    }
    return res;
  }

  async logout() {
    try {
      await this.request("/auth/logout", { method: "POST" });
    } catch {
      // Continue cleanup on client
    } finally {
      this.setToken(null);
      this.setCurrentUser(null);
    }
    return { success: true };
  }

  async getMe() {
    return this.request("/auth/me", { method: "GET" });
  }

  // ==========================================
  // Dataset Endpoints
  // ==========================================
  async getDatasets(params = {}) {
    const query = new URLSearchParams(params).toString();
    const endpoint = `/datasets${query ? `?${query}` : ""}`;
    return this.request(endpoint, { method: "GET" });
  }

  async getDataset(datasetId) {
    return this.request(`/datasets/${datasetId}`, { method: "GET" });
  }

  async uploadDataset(formData) {
    return this.request("/datasets", {
      method: "POST",
      body: formData
    });
  }

  async importJsonApi(payload) {
    return this.request("/datasets/import/json-api", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async parseDataset(datasetId) {
    return this.request(`/datasets/${datasetId}/parse`, {
      method: "POST"
    });
  }

  async getDatasetPreview(datasetId, limit = 20) {
    return this.request(`/datasets/${datasetId}/preview?limit=${limit}`, {
      method: "GET"
    });
  }

  async deleteDataset(datasetId) {
    return this.request(`/datasets/${datasetId}`, {
      method: "DELETE"
    });
  }

  async cleanDataset(datasetId, options = {}) {
    return this.request(`/datasets/${datasetId}/clean`, {
      method: "POST",
      body: JSON.stringify(options)
    });
  }

  // ==========================================
  // Cleaning Job & Quality Analytics Endpoints
  // ==========================================
  async getCleaningJobs(params = {}) {
    const query = new URLSearchParams(params).toString();
    const endpoint = `/cleaning-jobs${query ? `?${query}` : ""}`;
    return this.request(endpoint, { method: "GET" });
  }

  async getCleaningJob(jobId) {
    return this.request(`/cleaning-jobs/${jobId}`, { method: "GET" });
  }

  async getCleaningJobReport(jobId) {
    return this.request(`/cleaning-jobs/${jobId}/report`, { method: "GET" });
  }

  async exportCleanedData(jobId, format = "csv") {
    const blob = await this.request(`/cleaning-jobs/${jobId}/export?format=${format}`, {
      method: "GET",
      responseType: "blob"
    });

    // Create a client-side download anchor
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dataset_cleaned_${jobId.slice(-6)}.${format === "pdf" ? "txt" : format === "report-csv" ? "csv" : format}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    return { success: true };
  }

  // ==========================================
  // Human Review & Explainability Endpoints
  // ==========================================
  async getReviewItems(jobId, params = {}) {
    const query = new URLSearchParams(params).toString();
    const endpoint = `/cleaning-jobs/${jobId}/review${query ? `?${query}` : ""}`;
    return this.request(endpoint, { method: "GET" });
  }

  async getReviewItem(jobId, reviewId) {
    return this.request(`/cleaning-jobs/${jobId}/review/${reviewId}`, {
      method: "GET"
    });
  }

  async acceptReviewItem(jobId, reviewId) {
    return this.request(`/cleaning-jobs/${jobId}/review/${reviewId}/accept`, {
      method: "POST"
    });
  }

  async rejectReviewItem(jobId, reviewId) {
    return this.request(`/cleaning-jobs/${jobId}/review/${reviewId}/reject`, {
      method: "POST"
    });
  }

  async editReviewItem(jobId, reviewId, editedValue) {
    return this.request(`/cleaning-jobs/${jobId}/review/${reviewId}/edit`, {
      method: "POST",
      body: JSON.stringify({ editedValue })
    });
  }

  async bulkAcceptReviews(jobId, reviewIds = []) {
    return this.request(`/cleaning-jobs/${jobId}/review/bulk-accept`, {
      method: "POST",
      body: JSON.stringify({ reviewIds })
    });
  }

  async bulkRejectReviews(jobId, reviewIds = []) {
    return this.request(`/cleaning-jobs/${jobId}/review/bulk-reject`, {
      method: "POST",
      body: JSON.stringify({ reviewIds })
    });
  }
}

export const api = new ApiClient(API_BASE_URL);
export default api;
