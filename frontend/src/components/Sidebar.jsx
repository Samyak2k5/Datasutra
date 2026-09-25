import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  UploadCloud,
  Database,
  Sliders,
  FileCheck2,
  Clock,
  Sparkles,
  Settings,
  X,
  LogOut
} from "lucide-react";
import Logo from "./Logo";
import { mockUserProfile } from "../data/mockData";

export default function Sidebar({ mobileOpen = false, onCloseMobile }) {
  const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/upload", label: "Upload Data", icon: UploadCloud },
    { to: "/preview", label: "Datasets", icon: Database },
    { to: "/configure", label: "Configure Rules", icon: Sliders },
    { to: "/results", label: "Cleaning Jobs", icon: FileCheck2 },
    { to: "/review", label: "Review Suggestions", icon: Sparkles, badge: "18" },
    { to: "/history", label: "Reports & History", icon: Clock },
    { to: "/settings", label: "Settings", icon: Settings }
  ];

  return (
    <>
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar-wrapper ${mobileOpen ? "mobile-open" : ""}`}>
        {/* Brand Header */}
        <div
          style={{
            height: "var(--topbar-height)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 20px",
            borderBottom: "1px solid var(--border-color-subtle)"
          }}
        >
          <Logo size="sm" linkTo="/dashboard" />
          {mobileOpen && (
            <button
              onClick={onCloseMobile}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                padding: "6px",
                borderRadius: "var(--radius-sm)",
                color: "var(--color-text-muted)"
              }}
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Navigation List */}
        <nav
          style={{
            flex: 1,
            padding: "16px 12px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "4px"
          }}
        >
          <div
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--color-text-light)",
              padding: "4px 12px 8px 12px"
            }}
          >
            Main Menu
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onCloseMobile}
                style={({ isActive }) => ({
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "9px 12px",
                  borderRadius: "var(--radius-md)",
                  fontSize: "0.875rem",
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "var(--color-primary)" : "var(--color-text-main)",
                  backgroundColor: isActive ? "var(--color-primary-light)" : "transparent",
                  transition: "all 0.15s ease",
                  textDecoration: "none"
                })}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Icon size={18} style={{ flexShrink: 0 }} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: "var(--radius-full)",
                      backgroundColor: "var(--color-ai-bg)",
                      color: "var(--color-ai-text)",
                      border: "1px solid var(--color-ai-border)"
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User Profile Footer */}
        <div
          style={{
            padding: "14px 16px",
            borderTop: "1px solid var(--border-color-subtle)",
            backgroundColor: "var(--color-bg-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px"
          }}
        >
          <NavLink
            to="/settings"
            onClick={onCloseMobile}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              minWidth: 0,
              textDecoration: "none"
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                backgroundColor: "var(--color-primary)",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.85rem",
                fontWeight: 700,
                flexShrink: 0
              }}
            >
              {mockUserProfile.initials}
            </div>
            <div style={{ minWidth: 0, overflow: "hidden" }}>
              <div
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: "var(--color-text-main)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
              >
                {mockUserProfile.name}
              </div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--color-text-muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
              >
                {mockUserProfile.email}
              </div>
            </div>
          </NavLink>
          <NavLink
            to="/login"
            style={{
              color: "var(--color-text-muted)",
              padding: "6px",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
            title="Sign Out"
            aria-label="Sign Out"
          >
            <LogOut size={16} />
          </NavLink>
        </div>
      </aside>
    </>
  );
}
