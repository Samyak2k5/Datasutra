import api from "./api.js";

// Share in-flight parsing across mounts (including React StrictMode).
const pending = new Map();
export function loadDatasetPreview(datasetId) {
  if (!datasetId) return Promise.reject(new Error("Choose a dataset to preview."));
  if (!pending.has(datasetId)) {
    const request = (async () => {
      let dataset = (await api.getDataset(datasetId)).data;
      if (!dataset?.id) throw new Error("The server returned an invalid dataset.");
      if (dataset.status === "failed") throw new Error(dataset.parseError || "Dataset parsing failed. Upload a corrected file.");
      if (dataset.status === "uploaded") {
        await api.parseDataset(datasetId);
        dataset = (await api.getDataset(datasetId)).data;
      }
      if (dataset.status !== "completed") throw new Error("Dataset is still processing. Try again shortly.");
      const preview = (await api.getDatasetPreview(datasetId, 100)).data;
      if (!Array.isArray(preview?.headers) || !Array.isArray(preview?.rows)) {
        throw new Error("The server returned an invalid preview.");
      }
      return { dataset, preview };
    })();
    pending.set(datasetId, request);
    request.finally(() => pending.delete(datasetId)).catch(() => {});
  }
  return pending.get(datasetId);
}
