import api from "./api.js";

export async function loadAllJobs() {
  const jobs = [];
  let page = 1;
  let totalPages = 1;
  do {
    const response = await api.getCleaningJobs({ page, limit: 100 });
    if (!Array.isArray(response?.data?.jobs)) throw new Error("The server returned an invalid job list.");
    jobs.push(...response.data.jobs);
    totalPages = response.data.pagination?.totalPages || 1;
    page++;
  } while (page <= totalPages);
  return jobs;
}
