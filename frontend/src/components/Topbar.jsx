import { Link } from "react-router-dom";
import { Menu } from "lucide-react";
import { useAuth } from "../auth/context";

export default function Topbar({ onToggleSidebar, pageTitle = "Dashboard" }) {
  const { user, initials } = useAuth();
  return <header className="topbar-wrapper">
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <button onClick={onToggleSidebar} aria-label="Open sidebar" className="ds-btn ds-btn-secondary"><Menu size={18} /></button>
      <strong>{pageTitle}</strong>
    </div>
    <Link to="/settings" style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span className="user-avatar" aria-label="Your initials">{initials}</span>
      <span>{user.name}<small style={{ display: "block" }}>{user.email}</small></span>
    </Link>
  </header>;
}
