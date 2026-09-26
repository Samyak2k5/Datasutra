import React, { useState } from "react";
import { Outlet, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../auth/context";
import RequestError from "../components/RequestError";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";

export default function DashboardLayout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const location = useLocation();
  const { user, loading, error, retry, logout } = useAuth();
  if (loading) return <p role="status">Loading your account...</p>;
  if (error) return <main className="page-container"><RequestError message={error} onRetry={retry} /><button onClick={logout}>Return to login</button></main>;
  if (!user) return <Navigate to="/login" replace />;

  const getPageTitle = (pathname) => {
    switch (pathname) {
      case "/dashboard":
        return "Dashboard";
      case "/upload":
        return "Upload Dataset";
      case "/preview":
        return "Data Preview";
      case "/configure":
        return "Cleaning Configuration";
      case "/progress":
        return "Cleaning Progress";
      case "/results":
        return "Cleaning Results";
      case "/review":
        return "Review AI Suggestions";
      case "/history":
        return "Cleaning History & Reports";
      case "/settings":
        return "Profile & Settings";
      default:
        return "Data Quality Dashboard";
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar with responsive mobile drawer */}
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="main-content-wrapper">
        <Topbar
          onToggleSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          pageTitle={getPageTitle(location.pathname)}
        />

        <main style={{ flex: 1, minHeight: 0 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
