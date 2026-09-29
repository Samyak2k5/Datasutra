import React, { StrictMode } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../src/auth/AuthContext';
import { useAuth } from '../src/auth/context';
import Login from '../src/pages/Login';
import Register from '../src/pages/Register';
import api from '../src/services/api';

let callback;
let google;
const user = { id: 'test-user', name: 'Google Tester', email: 'google@example.com' };
function Dashboard() {
  const auth = useAuth();
  return <><div>{auth.user?.name} {auth.user?.email} {auth.initials}</div><button onClick={auth.logout}>Logout</button><span>{auth.user ? 'Authenticated' : 'Signed out'}</span></>;
}
function mount(path = '/login', strict = false) {
  const app = <AuthProvider><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/login" element={<Login />} /><Route path="/register" element={<Register />} />
    <Route path="/dashboard" element={<Dashboard />} />
  </Routes></MemoryRouter></AuthProvider>;
  return render(strict ? <StrictMode>{app}</StrictMode> : app);
}
beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', `test-client-${Math.random()}`);
  api.setToken(null); api.setCurrentUser(null);
  google = { initialize: vi.fn(config => { callback = config.callback; }),
    renderButton: vi.fn(element => {
      const button = document.createElement('button'); button.textContent = 'Continue with Google';
      button.onclick = () => callback({ credential: 'test-only-google-credential' }); element.appendChild(button);
    }), disableAutoSelect: vi.fn() };
  window.google = { accounts: { id: google } };
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); delete window.google; localStorage.clear(); });

test.each(['/login', '/register'])('official GIS button initializes on %s', async path => {
  mount(path);
  expect(await screen.findByText('Continue with Google')).toBeTruthy();
  expect(google.initialize).toHaveBeenCalledWith(expect.objectContaining({ auto_select: false, client_id: expect.stringMatching(/^test-client-/) }));
  expect(google.renderButton).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ text: 'continue_with' }));
});
test('missing client ID preserves email authentication without loading GIS', () => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', ''); mount();
  expect(screen.getByRole('status').textContent).toContain('not configured');
  expect(screen.getByLabelText('Email Address')).toBeTruthy();
  expect(google.initialize).not.toHaveBeenCalled();
});
test('Google auth updates context, redirects, persists only app session, refreshes and logs out', async () => {
  const fetchMock = vi.fn(async (url, options) => {
    if (url.endsWith('/auth/google')) {
      expect(JSON.parse(options.body)).toEqual({ credential: 'test-only-google-credential' });
      return new Response(JSON.stringify({ data: { user, accessToken: 'app-session-token' } }), { status: 200 });
    }
    if (url.endsWith('/auth/me')) {
      expect(options.headers.Authorization).toBe('Bearer app-session-token');
      return new Response(JSON.stringify({ data: { user } }), { status: 200 });
    }
    throw new Error('Unexpected request');
  });
  vi.stubGlobal('fetch', fetchMock);
  const view = mount(); fireEvent.click(await screen.findByText('Continue with Google'));
  expect(await screen.findByText('Google Tester google@example.com GT')).toBeTruthy();
  expect(localStorage.getItem('datasutra_token')).toBe('app-session-token');
  expect(JSON.stringify(localStorage)).not.toContain('test-only-google-credential');
  view.unmount(); api.token = null; mount('/dashboard');
  expect(await screen.findByText('Google Tester google@example.com GT')).toBeTruthy();
  fireEvent.click(screen.getByText('Logout'));
  expect(screen.getByText('Signed out')).toBeTruthy();
  expect(api.getToken()).toBeNull(); expect(api.getCurrentUser()).toBeNull();
  expect(google.disableAutoSelect).toHaveBeenCalledOnce();
});
test('StrictMode does not leave a stale or duplicate GIS button', async () => {
  mount('/login', true);
  expect(await screen.findByText('Continue with Google')).toBeTruthy();
  expect(google.renderButton).toHaveBeenCalledTimes(1);
});
test('account conflicts and unavailable backend surface errors without storing Google credentials', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Sign in with your existing account.' }), { status: 409 })));
  mount(); fireEvent.click(await screen.findByText('Continue with Google'));
  expect((await screen.findByRole('alert')).textContent).toContain('existing account');
  expect(api.getToken()).toBeNull();
  fetch.mockRejectedValue(new TypeError('Failed to fetch'));
  fireEvent.click(screen.getByText('Continue with Google'));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Cannot reach DataSutra'));
});
test('incomplete server response and missing Google credential cannot establish a session', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { user } }), { status: 200 })));
  mount(); fireEvent.click(await screen.findByText('Continue with Google'));
  expect((await screen.findByRole('alert')).textContent).toContain('incomplete');
  callback({});
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('did not return'));
  expect(api.getToken()).toBeNull();
});
test('GIS script load failures leave a useful error', async () => {
  delete window.google; mount();
  const script = await waitFor(() => {
    const value = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    expect(value).toBeTruthy(); return value;
  });
  fireEvent.error(script);
  expect((await screen.findByRole('alert')).textContent).toContain('could not load');
});
