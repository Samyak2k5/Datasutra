import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Layout
import DashboardLayout from "./layouts/DashboardLayout";

// Pages
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import UploadDataset from "./pages/UploadDataset";
import DataPreview from "./pages/DataPreview";
import CleaningConfiguration from "./pages/CleaningConfiguration";
import CleaningProgress from "./pages/CleaningProgress";
import CleaningResults from "./pages/CleaningResults";
import CleaningHistory from "./pages/CleaningHistory";
import ReviewSuggestions from "./pages/ReviewSuggestions";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected / Dashboard Workspace Routes */}
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/upload" element={<UploadDataset />} />
          <Route path="/preview" element={<DataPreview />} />
          <Route path="/configure" element={<CleaningConfiguration />} />
          <Route path="/progress" element={<CleaningProgress />} />
          <Route path="/results" element={<CleaningResults />} />
          <Route path="/review" element={<ReviewSuggestions />} />
          <Route path="/history" element={<CleaningHistory />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
