import { useState } from 'react';
import { useAuth } from '../auth/context';
import Button from '../components/Button';
import RequestError from '../components/RequestError';

export default function Settings() {
  const { user, initials, updateProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  async function save(event) {
    event.preventDefault(); setError(null); setSaved(false);
    if (name.trim().length < 2 || name.trim().length > 100) { setError('Name must contain 2–100 characters.'); return; }
    setSaving(true);
    try { await updateProfile(name.trim()); setEditing(false); setSaved(true); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }
  return <div className="page-container">
    <div className="page-header"><h1 className="page-header-title">Profile & Settings</h1></div>
    <section className="ds-card" style={{ padding: 28, maxWidth: 680 }}>
      <h2>Profile Information</h2>
      <div className="user-avatar" aria-label="Your initials">{initials}</div>
      <dl><dt>Name</dt><dd>{user.name}</dd><dt>Email (read-only)</dt><dd>{user.email}</dd>
        <dt>Role</dt><dd>{user.role}</dd>
        {user.createdAt && <><dt>Member since</dt><dd>{new Date(user.createdAt).toLocaleDateString()}</dd></>}
      </dl>
      <RequestError message={error} />
      {saved && <p role="status">Profile saved.</p>}
      {editing ? <form onSubmit={save}>
        <label htmlFor="profile-name">Name</label>
        <input id="profile-name" className="ds-input" value={name} onChange={event => setName(event.target.value)} required minLength={2} maxLength={100} disabled={saving} autoComplete="name" />
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <Button type="submit" loading={saving}>Save Changes</Button>
          <Button variant="secondary" disabled={saving} onClick={() => { setEditing(false); setName(user.name); setError(null); }}>Cancel</Button>
        </div>
      </form> : <Button onClick={() => { setName(user.name); setEditing(true); setSaved(false); setError(null); }}>Edit Profile</Button>}
    </section>
  </div>;
}
