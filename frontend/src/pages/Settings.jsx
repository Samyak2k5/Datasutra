import React, { useState } from "react";
import {
  User,
  Shield,
  Bell,
  Sliders,
  Key,
  CheckCircle2,
  Camera,
  Save,
  Copy,
  RefreshCw
} from "lucide-react";
import Button from "../components/Button";
import CleaningRuleCard from "../components/CleaningRuleCard";
import { mockUserProfile, defaultDeterministicRules, defaultAiAssistedRules } from "../data/mockData";

export default function Settings() {
  const [activeTab, setActiveTab] = useState("profile");
  const [profile, setProfile] = useState(mockUserProfile);
  const [rules, setRules] = useState(defaultDeterministicRules);
  const [aiRules, setAiRules] = useState(defaultAiAssistedRules);
  const [maxFileSize, setMaxFileSize] = useState("50MB");
  const [retentionDays, setRetentionDays] = useState("30");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const tabs = [
    { id: "profile", label: "Profile", icon: User },
    { id: "cleaning", label: "Cleaning Preferences", icon: Sliders },
    { id: "security", label: "Security", icon: Shield },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "api", label: "API Keys", icon: Key }
  ];

  const handleSave = (e) => {
    e.preventDefault();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleToggleRule = (id, checked) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: checked } : r)));
  };

  const handleToggleAiRule = (id, checked) => {
    setAiRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: checked } : r)));
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Profile & Settings</h1>
          <p className="page-header-subtitle">
            Manage your account settings, cleaning defaults, and data retention policies.
          </p>
        </div>
      </div>

      {saveSuccess && (
        <div
          style={{
            marginBottom: "20px",
            padding: "12px 18px",
            backgroundColor: "var(--color-success-bg)",
            border: "1px solid var(--color-success-border)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            color: "var(--color-success-text)",
            fontSize: "0.875rem"
          }}
        >
          <CheckCircle2 size={18} />
          <span>Preferences and configuration updated successfully.</span>
        </div>
      )}

      {/* Main Container with Sidebar Tabs + Form Card */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "240px 1fr",
          gap: "24px",
          alignItems: "start"
        }}
        className="settings-grid"
      >
        {/* Left Side Tab Navigation */}
        <div className="ds-card" style={{ padding: "8px" }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  backgroundColor: isActive ? "var(--color-primary-light)" : "transparent",
                  color: isActive ? "var(--color-primary)" : "var(--color-text-main)",
                  fontWeight: isActive ? 600 : 500,
                  fontSize: "0.875rem",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                  marginBottom: 2
                }}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Side Content Pane */}
        <div className="ds-card" style={{ padding: "28px" }}>
          {/* TAB 1: Profile Settings */}
          {activeTab === "profile" && (
            <form onSubmit={handleSave}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "20px" }}>
                Profile Information
              </h3>

              {/* Avatar Section */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "20px",
                  marginBottom: "28px",
                  paddingBottom: "24px",
                  borderBottom: "1px solid var(--border-color-subtle)"
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: "50%",
                    backgroundColor: "var(--color-primary)",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.75rem",
                    fontWeight: 700
                  }}
                >
                  {profile.initials}
                </div>
                <div>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Camera}
                    type="button"
                    onClick={() => alert("Upload photo functionality placeholder")}
                  >
                    Change Photo
                  </Button>
                  <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: 6 }}>
                    JPG, GIF or PNG. Max size 2MB.
                  </p>
                </div>
              </div>

              {/* Fields */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px", marginBottom: "20px" }}>
                <div className="ds-form-group">
                  <label className="ds-form-label">Full Name</label>
                  <input
                    type="text"
                    className="ds-input"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    required
                  />
                </div>

                <div className="ds-form-group">
                  <label className="ds-form-label">Email Address</label>
                  <input
                    type="email"
                    className="ds-input"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    required
                  />
                </div>

                <div className="ds-form-group">
                  <label className="ds-form-label">Organization</label>
                  <input
                    type="text"
                    className="ds-input"
                    value={profile.organization}
                    onChange={(e) => setProfile({ ...profile, organization: e.target.value })}
                  />
                </div>

                <div className="ds-form-group">
                  <label className="ds-form-label">Role</label>
                  <input
                    type="text"
                    className="ds-input"
                    value={profile.role}
                    disabled
                    style={{ backgroundColor: "var(--color-bg-subtle)" }}
                  />
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <Button type="submit" variant="primary" size="md" icon={Save}>
                  Update Profile
                </Button>
              </div>
            </form>
          )}

          {/* TAB 2: Cleaning Preferences (Requested in Section 20) */}
          {activeTab === "cleaning" && (
            <form onSubmit={handleSave}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "8px" }}>
                Default Cleaning Preferences
              </h3>
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginBottom: "24px" }}>
                Configure global defaults automatically pre-selected when running datasets.
              </p>

              {/* Section 1: Default Deterministic Rules */}
              <div style={{ marginBottom: "24px" }}>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "12px", color: "var(--color-text-main)" }}>
                  Default Deterministic Rules
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {rules.slice(0, 4).map((rule) => (
                    <CleaningRuleCard
                      key={rule.id}
                      id={rule.id}
                      label={rule.label}
                      description={rule.description}
                      enabled={rule.enabled}
                      onChange={handleToggleRule}
                    />
                  ))}
                </div>
              </div>

              {/* Section 2: Default AI-assisted Rules */}
              <div style={{ marginBottom: "24px" }}>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "12px", color: "var(--color-ai)" }}>
                  Default AI-Assisted Processing
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {aiRules.slice(0, 2).map((rule) => (
                    <CleaningRuleCard
                      key={rule.id}
                      id={rule.id}
                      label={rule.label}
                      description={rule.description}
                      enabled={rule.enabled}
                      onChange={handleToggleAiRule}
                      isAi={true}
                    />
                  ))}
                </div>
              </div>

              {/* Section 3: File Size & Data Retention Preferences */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "18px",
                  paddingTop: "16px",
                  borderTop: "1px solid var(--border-color-subtle)",
                  marginBottom: "24px"
                }}
              >
                <div className="ds-form-group">
                  <label className="ds-form-label">File Size Limit Preference</label>
                  <select
                    className="ds-select"
                    value={maxFileSize}
                    onChange={(e) => setMaxFileSize(e.target.value)}
                  >
                    <option value="25MB">25 MB (Standard)</option>
                    <option value="50MB">50 MB (Default recommended)</option>
                    <option value="100MB">100 MB (Enterprise high throughput)</option>
                  </select>
                  <div className="ds-form-hint">Maximum upload size allowed per file</div>
                </div>

                <div className="ds-form-group">
                  <label className="ds-form-label">Data Retention Preference</label>
                  <select
                    className="ds-select"
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(e.target.value)}
                  >
                    <option value="0">Immediate Purge (Zero persistence)</option>
                    <option value="7">7 Days</option>
                    <option value="30">30 Days (Recommended)</option>
                    <option value="90">90 Days (Enterprise audit)</option>
                  </select>
                  <div className="ds-form-hint">Automatic purge of raw and cleaned temporary files</div>
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <Button type="submit" variant="primary" size="md" icon={Save}>
                  Save Cleaning Preferences
                </Button>
              </div>
            </form>
          )}

          {/* TAB 3: Security */}
          {activeTab === "security" && (
            <div>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "8px" }}>
                Security Settings
              </h3>
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginBottom: "24px" }}>
                Manage authentication credentials and tenant session security.
              </p>

              <div style={{ maxWidth: 440, display: "flex", flexDirection: "column", gap: "16px" }}>
                <div className="ds-form-group">
                  <label className="ds-form-label">Current Password</label>
                  <input type="password" className="ds-input" placeholder="••••••••" />
                </div>
                <div className="ds-form-group">
                  <label className="ds-form-label">New Password</label>
                  <input type="password" className="ds-input" placeholder="••••••••" />
                </div>
                <div className="ds-form-group">
                  <label className="ds-form-label">Confirm New Password</label>
                  <input type="password" className="ds-input" placeholder="••••••••" />
                </div>
                <Button variant="primary" size="md" onClick={() => alert("Password updated successfully.")}>
                  Update Password
                </Button>
              </div>
            </div>
          )}

          {/* TAB 4: Notifications */}
          {activeTab === "notifications" && (
            <div>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "8px" }}>
                Notification Preferences
              </h3>
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginBottom: "24px" }}>
                Choose when you want to receive alerts and summaries.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                  <input type="checkbox" defaultChecked />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>Cleaning Job Completed</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                      Send an email notification whenever a batch dataset finishes cleaning.
                    </div>
                  </div>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                  <input type="checkbox" defaultChecked />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>Pending AI Suggestions Alert</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                      Alert when ambiguous records require human operator approval.
                    </div>
                  </div>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                  <input type="checkbox" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>Weekly Quality Digest</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                      Receive a weekly summary report of health score trends and total cleaned records.
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* TAB 5: API Keys */}
          {activeTab === "api" && (
            <div>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "8px" }}>
                API Access & Automation Keys
              </h3>
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginBottom: "24px" }}>
                Use API tokens to trigger automated data cleaning pipelines from your CRM or ETL workflows.
              </p>

              <div
                style={{
                  padding: "16px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--color-bg-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px"
                }}
              >
                <div>
                  <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Production Key</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem", fontWeight: 600 }}>
                    ds_live_9f8a2b3c4d5e6f7a8b9c0d1e2f3a4b
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Copy}
                    onClick={() => alert("API Key copied to clipboard.")}
                  >
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={RefreshCw}
                    onClick={() => alert("New API key generated.")}
                  >
                    Roll Key
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
