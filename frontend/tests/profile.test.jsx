import React from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '../src/auth/AuthContext';
import Settings from '../src/pages/Settings';
import api from '../src/services/api';

let stored;
let submitted;
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
beforeEach(() => {
  stored = { id: 'profile-user', name: 'Original Name', email: 'original@example.com', role: 'user', authProvider: 'local', avatar: null };
  submitted = [];
  api.setToken('test-app-token');
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    if (url.endsWith('/auth/me')) return response({ data: { user: stored } });
    if (url.endsWith('/auth/profile')) {
      const input = JSON.parse(options.body); submitted.push(input);
      const { currentPassword: _password, ...fields } = input;
      stored = { ...stored, ...fields };
      return response({ data: { user: stored } });
    }
    throw new Error('Unexpected URL');
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
// Wait for hydration before mounting Settings, just like the application's protected route.
import { useAuth } from '../src/auth/context';
function LoadedSettings() { const { user } = useAuth(); return user ? <Settings /> : null; }
async function mount() {
  const view = render(<AuthProvider><LoadedSettings /></AuthProvider>);
  await screen.findByText('Edit Profile');
  return view;
}
test('save stays disabled without changes and cancel resets unsaved inputs', async () => {
  await mount(); fireEvent.click(screen.getByText('Edit Profile'));
  expect(screen.getByText('Save Changes').closest('button').disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Discarded' } });
  fireEvent.click(screen.getByText('Cancel')); fireEvent.click(screen.getByText('Edit Profile'));
  expect(screen.getByLabelText('Full name').value).toBe('Original Name');
  expect(submitted).toHaveLength(0);
});
test('name/email/avatar save updates context immediately and survives refresh', async () => {
  const view = await mount(); fireEvent.click(screen.getByText('Edit Profile'));
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Updated Name' } });
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'updated@example.com' } });
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'test-password' } });
  fireEvent.change(screen.getByLabelText('Avatar image URL'), { target: { value: 'https://example.com/avatar.png' } });
  fireEvent.click(screen.getByText('Save Changes'));
  expect(await screen.findByText('Profile saved.')).toBeTruthy();
  expect(submitted[0]).toEqual({ name: 'Updated Name', email: 'updated@example.com', avatar: 'https://example.com/avatar.png', currentPassword: 'test-password' });
  expect(screen.getByText('updated@example.com')).toBeTruthy();
  expect(api.getCurrentUser().name).toBe('Updated Name');
  expect(localStorage.getItem('datasutra_user')).not.toContain('test-password');
  view.unmount(); api.token = null; await mount();
  expect(screen.getByText('Updated Name')).toBeTruthy();
  expect(screen.getByAltText('Profile avatar').getAttribute('src')).toBe('https://example.com/avatar.png');
});
test('Google email remains disabled while display name is editable', async () => {
  stored.authProvider = 'google'; await mount(); fireEvent.click(screen.getByText('Edit Profile'));
  expect(screen.getByLabelText('Email address').disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Google Display' } });
  fireEvent.click(screen.getByText('Save Changes'));
  await screen.findByText('Profile saved.'); expect(submitted[0]).toEqual({ name: 'Google Display' });
});
test('duplicate email error preserves editing state and shows the server message', async () => {
  await mount(); fireEvent.click(screen.getByText('Edit Profile'));
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'used@example.com' } });
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'test-password' } });
  fetch.mockResolvedValue(response({ message: 'An account with this email address already exists.' }, 409));
  fireEvent.click(screen.getByText('Save Changes'));
  expect(await screen.findByText('An account with this email address already exists.')).toBeTruthy();
  expect(screen.getByLabelText('Email address').value).toBe('used@example.com');
});
test('invalid avatar prevents submission and pending save disables controls', async () => {
  await mount(); fireEvent.click(screen.getByText('Edit Profile'));
  fireEvent.change(screen.getByLabelText('Avatar image URL'), { target: { value: 'http://example.com/a' } });
  fireEvent.click(screen.getByText('Save Changes'));
  expect(await screen.findByText('Avatar must be an HTTPS image URL.')).toBeTruthy(); expect(submitted).toHaveLength(0);
  fireEvent.change(screen.getByLabelText('Avatar image URL'), { target: { value: 'https://example.com/a' } });
  let finish;
  fetch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByText('Save Changes'));
  expect(screen.getByLabelText('Full name').disabled).toBe(true);
  expect(screen.getByText('Cancel').closest('button').disabled).toBe(true);
  finish(response({ data: { user: { ...stored, avatar: 'https://example.com/a' } } }));
  await waitFor(() => expect(screen.getByText('Profile saved.')).toBeTruthy());
});
test('API client strips protected fields from profile requests', async () => {
  await api.updateProfile({ name: 'Allowed', role: 'admin', googleId: 'forbidden' });
  expect(submitted[0]).toEqual({ name: 'Allowed' });
});
