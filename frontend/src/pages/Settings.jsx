import { useAuth } from "../auth/context";

export default function Settings() {
  const { user, initials } = useAuth();
  return <div className="page-container">
    <div className="page-header"><h1 className="page-header-title">Profile & Settings</h1></div>
    <section className="ds-card" style={{ padding: 28 }}>
      <h2>Profile Information</h2>
      <div className="user-avatar" aria-label="Your initials">{initials}</div>
      <dl>
        <dt>Name</dt><dd>{user.name}</dd>
        <dt>Email</dt><dd>{user.email}</dd>
        <dt>Role</dt><dd>{user.role}</dd>
        {user.createdAt && <><dt>Member since</dt><dd>{new Date(user.createdAt).toLocaleDateString()}</dd></>}
      </dl>
      <p>Your account profile is read-only. Profile editing and account preferences are not available yet.</p>
    </section>
  </div>;
}
