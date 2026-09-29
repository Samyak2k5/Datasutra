import { useState } from 'react';
import { useAuth } from '../auth/context';
import Button from '../components/Button';
import RequestError from '../components/RequestError';

export default function Settings() {
  const { user, initials, updateProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [avatar, setAvatar] = useState(user.avatar || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const googleLinked = user.authProvider === 'google';
  const emailChanged = !googleLinked && email.trim().toLowerCase() !== user.email;
  const changed = name.trim() !== user.name || emailChanged || avatar.trim() !== (user.avatar || '');
  function reset() {
    setName(user.name); setEmail(user.email); setAvatar(user.avatar || '');
    setCurrentPassword(''); setError(null);
  }
  async function save(event) {
    event.preventDefault(); setError(null); setSaved(false);
    if (!changed || saving) return;
    if (name.trim().length < 2 || name.trim().length > 100) { setError('Name must contain 2–100 characters.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 254) { setError('Enter a valid email address.'); return; }
    if (emailChanged && !currentPassword) { setError('Enter your current password to change your email.'); return; }
    if (avatar.trim()) {
      try {
        const url = new URL(avatar.trim());
        if (url.protocol !== 'https:' || url.username || url.password || avatar.trim().length > 2048) throw new Error();
      } catch { setError('Avatar must be an HTTPS image URL.'); return; }
    }
    const fields = {};
    if (name.trim() !== user.name) fields.name = name.trim();
    if (emailChanged) { fields.email = email.trim().toLowerCase(); fields.currentPassword = currentPassword; }
    if (avatar.trim() !== (user.avatar || '')) fields.avatar = avatar.trim() || null;
    setSaving(true);
    try { await updateProfile(fields); setEditing(false); setCurrentPassword(''); setSaved(true); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }
  return <div className="page-container">
    <div className="page-header"><h1 className="page-header-title">Profile & Settings</h1></div>
    <section className="ds-card" style={{ padding: 28, maxWidth: 680 }}>
      <h2>Profile Information</h2>
      {user.avatar ? <img src={user.avatar} alt="Profile avatar" referrerPolicy="no-referrer" width={48} height={48} style={{ borderRadius: '50%', objectFit: 'cover' }} /> : <div className="user-avatar" aria-label="Your initials">{initials}</div>}
      <dl><dt>Name</dt><dd>{user.name}</dd><dt>Email{googleLinked ? ' (managed by Google)' : ''}</dt><dd>{user.email}</dd>
        <dt>Role (read-only)</dt><dd>{user.role}</dd>
        {user.createdAt && <><dt>Member since</dt><dd>{new Date(user.createdAt).toLocaleDateString()}</dd></>}
      </dl>
      <RequestError message={error} />
      {saved && <p role="status">Profile saved.</p>}
      {editing ? <form onSubmit={save}>
        <div className="ds-form-group"><label className="ds-form-label" htmlFor="profile-name">Full name</label>
          <input id="profile-name" className="ds-input" value={name} onChange={event => setName(event.target.value)} required minLength={2} maxLength={100} disabled={saving} autoComplete="name" /></div>
        <div className="ds-form-group"><label className="ds-form-label" htmlFor="profile-email">Email address</label>
          <input id="profile-email" type="email" className="ds-input" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} disabled={saving || googleLinked} autoComplete="email" />
          {googleLinked ? <p>Email is managed by Google and cannot be edited here.</p> : <p>Changing this updates the email you use to log in.</p>}</div>
        {emailChanged && <div className="ds-form-group"><label className="ds-form-label" htmlFor="profile-password">Current password</label>
          <input id="profile-password" type="password" className="ds-input" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required disabled={saving} autoComplete="current-password" />
          <p>Confirm your password to authorize the email change.</p></div>}
        <div className="ds-form-group"><label className="ds-form-label" htmlFor="profile-avatar">Avatar image URL</label>
          <input id="profile-avatar" type="url" className="ds-input" value={avatar} onChange={event => setAvatar(event.target.value)} maxLength={2048} disabled={saving} placeholder="https://…" />
          <p>Optional HTTPS image URL. Clear it to use your initials.</p></div>
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <Button type="submit" loading={saving} disabled={!changed}>Save Changes</Button>
          <Button variant="secondary" disabled={saving} onClick={() => { setEditing(false); reset(); }}>Cancel</Button>
        </div>
      </form> : <Button onClick={() => { reset(); setEditing(true); setSaved(false); }}>Edit Profile</Button>}
    </section>
  </div>;
}
