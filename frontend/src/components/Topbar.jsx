import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, Search, Bell, ChevronDown, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { mockUserProfile } from "../data/mockData";

export default function Topbar({ onToggleSidebar, pageTitle = "Dashboard" }) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const notifications = [
    {
      id: 1,
      title: "Cleaning completed",
      desc: "leads.csv cleaned with 94% quality score",
      time: "10m ago",
      icon: CheckCircle2,
      color: "var(--color-success)"
    },
    {
      id: 2,
      title: "18 AI suggestions ready",
      desc: "Pending human review on enterprise_clients.csv",
      time: "1h ago",
      icon: Sparkles,
      color: "var(--color-ai)"
    },
    {
      id: 3,
      title: "High missing rate",
      desc: "56 missing entries flagged in contacts.xlsx",
      time: "3h ago",
      icon: AlertTriangle,
      color: "var(--color-warning)"
    }
  ];

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/preview?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="topbar-wrapper">
      {/* Left: Mobile hamburger & Context title */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <button
          onClick={onToggleSidebar}
          aria-label="Open sidebar"
          style={{
            border: "1px solid var(--border-color)",
            background: "var(--color-bg-surface)",
            borderRadius: "var(--radius-md)",
            padding: "8px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "var(--color-text-main)"
          }}
          className="mobile-only-btn"
        >
          <Menu size={18} />
        </button>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--color-text-main)" }}>
            {pageTitle}
          </span>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
            DataSutra Workspace
          </span>
        </div>
      </div>

      {/* Center: Global Search Bar */}
      <form
        onSubmit={handleSearchSubmit}
        style={{
          flex: 1,
          maxWidth: 420,
          margin: "0 24px",
          position: "relative"
        }}
      >
        <Search
          size={16}
          style={{
            position: "absolute",
            left: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--color-text-light)"
          }}
        />
        <input
          type="search"
          placeholder="Search datasets, rules, records..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Global search"
          style={{
            width: "100%",
            padding: "8px 12px 8px 36px",
            fontSize: "0.85rem",
            backgroundColor: "var(--color-bg-subtle)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-full)",
            color: "var(--color-text-main)"
          }}
          className="ds-input"
        />
      </form>

      {/* Right: Notifications & User Avatar */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        {/* Notifications Dropdown */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="Notifications"
            style={{
              position: "relative",
              background: "transparent",
              border: "1px solid var(--border-color)",
              borderRadius: "50%",
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--color-text-muted)"
            }}
          >
            <Bell size={18} />
            <span
              style={{
                position: "absolute",
                top: 6,
                right: 7,
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "var(--color-danger)",
                border: "2px solid #ffffff"
              }}
            />
          </button>

          {showNotifications && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 8px)",
                width: 320,
                backgroundColor: "var(--color-bg-surface)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-dropdown)",
                border: "1px solid var(--border-color)",
                zIndex: 150,
                padding: "12px 0"
              }}
            >
              <div
                style={{
                  padding: "6px 16px 10px 16px",
                  borderBottom: "1px solid var(--border-color-subtle)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}
              >
                <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>Notifications</span>
                <span style={{ fontSize: "0.75rem", color: "var(--color-primary)", cursor: "pointer" }}>
                  Mark all as read
                </span>
              </div>

              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                {notifications.map((n) => {
                  const Icon = n.icon;
                  return (
                    <div
                      key={n.id}
                      style={{
                        padding: "10px 16px",
                        borderBottom: "1px solid var(--border-color-subtle)",
                        display: "flex",
                        gap: "12px",
                        cursor: "pointer"
                      }}
                      onClick={() => setShowNotifications(false)}
                    >
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: "50%",
                          backgroundColor: "var(--color-bg-subtle)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: n.color,
                          flexShrink: 0
                        }}
                      >
                        <Icon size={16} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "0.825rem", fontWeight: 600 }}>{n.title}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                          {n.desc}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--color-text-light)", marginTop: 2 }}>
                          {n.time}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ padding: "8px 16px 0 16px", textAlign: "center" }}>
                <Link
                  to="/history"
                  onClick={() => setShowNotifications(false)}
                  style={{ fontSize: "0.8rem", color: "var(--color-primary)", fontWeight: 500 }}
                >
                  View full activity log
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User Pill */}
        <Link
          to="/settings"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "4px 8px",
            borderRadius: "var(--radius-full)",
            border: "1px solid var(--border-color-subtle)",
            backgroundColor: "var(--color-bg-subtle)",
            textDecoration: "none"
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              backgroundColor: "var(--color-primary)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.8rem",
              fontWeight: 700
            }}
          >
            {mockUserProfile.initials}
          </div>
          <div style={{ display: "none", md: "block" }} className="topbar-user-text">
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-main)" }}>
              {mockUserProfile.name}
            </span>
          </div>
          <ChevronDown size={14} style={{ color: "var(--color-text-muted)" }} />
        </Link>
      </div>
    </header>
  );
}
