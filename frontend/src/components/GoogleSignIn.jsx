import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/context';
import { renderGoogleButton } from '../auth/googleIdentity';

export default function GoogleSignIn({ disabled = false }) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  const target = useRef(null);
  const current = useRef(null);
  const inFlight = useRef(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { googleLogin } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { current.current = { googleLogin, navigate, disabled }; }, [googleLogin, navigate, disabled]);

  useEffect(() => {
    if (!clientId) return;
    let active = true;
    let dispose;
    renderGoogleButton(target.current, clientId, async response => {
      if (!active || inFlight.current || current.current.disabled) return;
      inFlight.current = true;
      setBusy(true);
      setError('');
      try {
        if (!response?.credential) throw new Error('Google did not return a sign-in credential. Please try again.');
        await current.current.googleLogin({ credential: response.credential });
        if (active) current.current.navigate('/dashboard', { replace: true });
      } catch (err) {
        if (active) setError(err instanceof TypeError ? 'Cannot reach DataSutra. Check your connection and try again.' : err.message || 'Google sign-in failed. Please try again.');
      } finally {
        inFlight.current = false;
        if (active) setBusy(false);
      }
    }, () => active).then(cleanup => { if (active) dispose = cleanup; else cleanup(); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; dispose?.(); };
  }, [clientId]);

  if (!clientId) return <p role="status">Google sign-in is not configured. Please use email and password.</p>;
  return <div aria-busy={busy}>
    <div ref={target} inert={busy || disabled} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />
    {busy && <p role="status">Signing in with Google…</p>}
    {error && <p role="alert" style={{ color: 'var(--color-danger-text)' }}>{error}</p>}
  </div>;
}
