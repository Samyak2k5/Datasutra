let loading;
let initializedId;
let receiver;

export function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(fail, 15000);
    function fail() {
      clearTimeout(timer);
      script.remove();
      loading = undefined;
      reject(new Error('Google sign-in could not load. Check your connection or use email and password.'));
    }
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      if (!window.google?.accounts?.id) return fail();
      clearTimeout(timer);
      resolve(window.google.accounts.id);
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return loading;
}

export async function renderGoogleButton(element, clientId, callback, isActive = () => true) {
  const id = await loadGoogleIdentity();
  if (!isActive() || !element.isConnected) return () => {};
  receiver = callback;
  if (initializedId !== clientId) {
    id.initialize({ client_id: clientId, auto_select: false, callback: response => receiver?.(response) });
    initializedId = clientId;
  }
  id.renderButton(element, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', width: 320 });
  return () => {
    if (receiver === callback) receiver = undefined;
    element.replaceChildren();
  };
}

export function disableGoogleAutoSelect() {
  // Logout must still complete if GIS is unavailable or blocked by the browser.
  try { window.google?.accounts?.id?.disableAutoSelect(); } catch { /* local logout remains authoritative */ }
}
