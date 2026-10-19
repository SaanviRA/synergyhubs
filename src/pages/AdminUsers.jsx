import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, Trash2, Loader2, ShieldCheck, ShieldAlert, X, Bell, Send } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

const SIGN_IN_LABELS = { google: 'Google', password: 'Email & password', invited: 'Invited, not signed up yet' };

const NOTIFICATION_TYPES = [
  ['user_added', 'User added', 'Someone creates an account'],
  ['user_deleted', 'User deleted', 'An admin deletes an account'],
  ['user_logged_in', 'User logged in', 'Someone signs in'],
  ['user_logged_out', 'User logged out', 'Someone signs out'],
];

export default function AdminUsers({ onBack, onOpenSafety }) {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [busyId, setBusyId] = useState(null);
  const [autoApprove, setAutoApprove] = useState(null);
  // The value being switched to while the confirmation dialog is open
  const [pendingAutoApprove, setPendingAutoApprove] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [isSavingSetting, setIsSavingSetting] = useState(false);
  // This admin's own Discord webhook; `savedHook` is what the server has, `hookForm` what is being edited
  const [savedHook, setSavedHook] = useState(null);
  const [hookForm, setHookForm] = useState({ webhookUrl: '', events: ['user_added'] });
  const [hookBusy, setHookBusy] = useState(null);
  const [hookMessage, setHookMessage] = useState(null);
  // A tested URL is only shown by its host; this opens an empty box to paste a different one
  const [replacingUrl, setReplacingUrl] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/users`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch users');
      setUsers(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/settings`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch settings');
      setAutoApprove(data.autoApprove);
    } catch (err) {
      alert(err.message);
    }
  };

  const applyHook = (data) => {
    setSavedHook(data);
    setHookForm({ webhookUrl: data.webhookUrl || '', events: data.events });
    setReplacingUrl(false);
  };

  const hideUrl = savedHook?.verified && !replacingUrl;

  const cancelReplace = () => {
    setReplacingUrl(false);
    setHookMessage(null);
    setHookForm(form => ({ ...form, webhookUrl: '' }));
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/notifications`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch notification settings');
      setSavedHook(data);
      setHookForm({ webhookUrl: data.webhookUrl || '', events: data.events });
    } catch (err) {
      setHookMessage({ ok: false, text: err.message });
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchSettings();
    fetchNotifications();
  }, []);

  const hookDirty = savedHook !== null && (
    hookForm.webhookUrl.trim() !== (savedHook.webhookUrl || '') ||
    NOTIFICATION_TYPES.some(([key]) => hookForm.events.includes(key) !== savedHook.events.includes(key))
  );

  const toggleEvent = (key) => {
    setHookMessage(null);
    setHookForm(form => ({
      ...form,
      events: form.events.includes(key) ? form.events.filter(e => e !== key) : [...form.events, key],
    }));
  };

  // One request at a time; `kind` says which button shows the spinner
  const hookRequest = async (kind, method, path, body) => {
    setHookBusy(kind);
    setHookMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/notifications${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    } catch (err) {
      setHookMessage({ ok: false, text: err.message });
      return null;
    } finally {
      setHookBusy(null);
    }
  };

  const saveHook = async (e) => {
    e.preventDefault();
    // Without a URL the server keeps the saved, hidden one
    const data = await hookRequest('save', 'PUT', '', { webhookUrl: hookForm.webhookUrl.trim() || null, events: hookForm.events });
    if (data) {
      applyHook(data);
      setHookMessage({
        ok: true,
        text: data.verified ? 'Saved.' : 'Saved. Use "Send test" to check it reaches Discord; the URL is hidden once it works.',
      });
    }
  };

  const testHook = async () => {
    const data = await hookRequest('test', 'POST', '/test');
    if (data) {
      applyHook(data);
      setHookMessage({ ok: true, text: 'Test message sent. Check your Discord channel.' });
    }
  };

  const removeHook = async () => {
    if (!window.confirm('Stop sending notifications to this Discord webhook?')) return;
    const data = await hookRequest('remove', 'DELETE', '');
    if (data) {
      applyHook(data);
      setHookMessage({ ok: true, text: 'Webhook removed.' });
    }
  };

  const confirmWord = pendingAutoApprove ? 'ENABLE' : 'DISABLE';

  const openAutoApproveDialog = () => {
    setConfirmText('');
    setPendingAutoApprove(!autoApprove);
  };

  const closeAutoApproveDialog = () => {
    if (isSavingSetting) return;
    setPendingAutoApprove(null);
    setConfirmText('');
  };

  const saveAutoApprove = async () => {
    if (confirmText !== confirmWord || isSavingSetting) return;
    setIsSavingSetting(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/settings/auto-approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: pendingAutoApprove, confirmation: confirmText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update setting');
      setAutoApprove(data.autoApprove);
      setPendingAutoApprove(null);
      setConfirmText('');
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSavingSetting(false);
    }
  };

  const runAction = async (user, method, path) => {
    setBusyId(user.id);
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${user.id}${path}`, { method });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      await fetchUsers();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleApprove = (user) => runAction(user, 'POST', '/approve');

  const handleDelete = (user) => {
    const confirmed = window.confirm(
      `Permanently delete ${user.name} (${user.email}, ${user.role})?\n\n` +
      'Their class and project memberships and work logs are deleted. Classes they created are kept. ' +
      'This cannot be undone.'
    );
    if (confirmed) runAction(user, 'DELETE', '');
  };

  const pendingCount = users.filter(u => !u.approved).length;
  const shown = filter === 'pending' ? users.filter(u => !u.approved) : users;

  return (
    <div className="pt-6 sm:pt-24 pb-24 px-4 max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-surface-500 hover:text-surface-900 transition-colors group"
      >
        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        <span className="font-medium">Back to Account</span>
      </button>

      <header className="space-y-2">
        <div className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-amber-200">
          <ShieldCheck size={14} />
          <span>Admin</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-heading font-bold text-surface-900 tracking-tight">Manage Users</h1>
        <p className="text-surface-600">
          {autoApprove
            ? 'New accounts are approved automatically and can sign in right away.'
            : 'New accounts cannot sign in until you approve them.'}
        </p>
      </header>

      <div className="bg-white rounded-2xl border border-surface-200 p-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-bold text-surface-900">Flagged chat messages</p>
          <p className="text-sm text-surface-600">
            Admins review messages the safety check flagged in classes that have no teacher.
          </p>
        </div>
        <button
          onClick={onOpenSafety}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 cursor-pointer"
        >
          <ShieldAlert size={16} /> Review
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-surface-200 p-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-bold text-surface-900">Auto-approve new accounts</p>
          <p className="text-sm text-surface-600">
            When on, anyone who signs up can use the app immediately. Accounts already waiting still need your approval.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!!autoApprove}
          aria-label="Auto-approve new accounts"
          onClick={openAutoApproveDialog}
          disabled={autoApprove === null}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            autoApprove ? 'bg-emerald-600' : 'bg-surface-300'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
              autoApprove ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <form onSubmit={saveHook} className="bg-white rounded-2xl border border-surface-200 p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
            <Bell size={18} />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-surface-900">Discord notifications</p>
            <p className="text-sm text-surface-600">
              Your own webhook: only you get these, and each admin sets up their own. In Discord, open a channel's
              settings, then Integrations, then Webhooks, and copy the webhook URL.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="discord-webhook" className="block text-sm font-medium text-surface-700 mb-2">
            Webhook URL
          </label>
          {hideUrl ? (
            <div className="flex items-center gap-2">
              <p
                id="discord-webhook"
                className="flex-1 min-w-0 truncate bg-surface-50 border border-surface-200 rounded-xl p-3 text-sm font-mono text-surface-600"
              >
                {savedHook.redactedUrl}
              </p>
              <button
                type="button"
                onClick={() => { setHookMessage(null); setReplacingUrl(true); }}
                className="shrink-0 border border-surface-200 text-surface-700 hover:bg-surface-50 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
              >
                Replace URL
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                id="discord-webhook"
                type="url"
                autoComplete="off"
                spellCheck={false}
                autoFocus={replacingUrl}
                value={hookForm.webhookUrl}
                onChange={(e) => { setHookMessage(null); setHookForm(form => ({ ...form, webhookUrl: e.target.value })); }}
                placeholder="https://discord.com/api/webhooks/..."
                disabled={savedHook === null}
                className="flex-1 min-w-0 bg-surface-50 border border-surface-200 rounded-xl p-3 text-sm font-mono text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 disabled:opacity-50"
              />
              {replacingUrl && (
                <button
                  type="button"
                  onClick={cancelReplace}
                  className="shrink-0 border border-surface-200 text-surface-700 hover:bg-surface-50 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
          <p className="text-xs text-surface-500 mt-2">
            {savedHook?.verified
              ? 'Tested and working. Only the host is shown, because the rest of the URL lets anyone post to your channel.'
              : 'After a successful test, only the host part of the URL is shown.'}
          </p>
        </div>

        <fieldset>
          <legend className="block text-sm font-medium text-surface-700 mb-2">Notify me when</legend>
          <div className="grid sm:grid-cols-2 gap-2">
            {NOTIFICATION_TYPES.map(([key, label, hint]) => (
              <label
                key={key}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  hookForm.events.includes(key) ? 'border-brand-300 bg-brand-50' : 'border-surface-200 hover:bg-surface-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={hookForm.events.includes(key)}
                  onChange={() => toggleEvent(key)}
                  disabled={savedHook === null}
                  className="mt-0.5 h-4 w-4 accent-brand-600"
                />
                <span>
                  <span className="block text-sm font-medium text-surface-900">{label}</span>
                  <span className="block text-xs text-surface-500">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-surface-500 mt-2">
            Urgent safety alerts (a student may be at risk of self-harm) are always sent. They never include the
            student's name or message.
          </p>
        </fieldset>

        {hookMessage && (
          <p role="status" className={`text-sm ${hookMessage.ok ? 'text-emerald-700' : 'text-rose-600'}`}>
            {hookMessage.text}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={
              savedHook === null || hookBusy !== null || !hookDirty ||
              (!hookForm.webhookUrl.trim() && !hideUrl)
            }
            className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors active:scale-95"
          >
            {hookBusy === 'save' && <Loader2 size={16} className="animate-spin" />}
            <span>Save</span>
          </button>
          {savedHook?.redactedUrl && (
            <>
              <button
                type="button"
                onClick={testHook}
                disabled={hookBusy !== null || hookDirty}
                title={hookDirty ? 'Save your changes first' : undefined}
                className="flex items-center gap-1.5 border border-surface-200 text-surface-700 hover:bg-surface-50 disabled:opacity-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors active:scale-95"
              >
                {hookBusy === 'test' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                <span>Send test</span>
              </button>
              <button
                type="button"
                onClick={removeHook}
                disabled={hookBusy !== null}
                className="flex items-center gap-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors active:scale-95"
              >
                {hookBusy === 'remove' ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                <span>Remove</span>
              </button>
            </>
          )}
        </div>
      </form>

      <div className="flex gap-2">
        {[['pending', `Waiting for approval (${pendingCount})`], ['all', `All users (${users.length})`]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
              filter === key
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-surface-700 border-surface-200 hover:bg-surface-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
        </div>
      ) : shown.length === 0 ? (
        <p className="text-center text-surface-500 py-12 bg-white rounded-2xl border border-surface-200">
          {filter === 'pending' ? 'No accounts are waiting for approval.' : 'No users yet.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map(user => (
            <li
              key={user.id}
              className="bg-white rounded-2xl border border-surface-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-surface-900">{user.name}</span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-surface-500 bg-surface-100 px-2 py-0.5 rounded-full">
                    {user.role}
                  </span>
                  {user.isAdmin && (
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                      Admin
                    </span>
                  )}
                  {!user.approved && (
                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full">
                      Pending
                    </span>
                  )}
                </div>
                <p className="text-sm text-surface-600 break-all">{user.email}</p>
                <p className="text-xs text-surface-400">
                  {SIGN_IN_LABELS[user.signIn]}
                  {user.createdAt && ` • Joined ${new Date(user.createdAt).toLocaleDateString()}`}
                </p>
              </div>

              <div className="flex gap-2 shrink-0">
                {!user.approved && (
                  <button
                    onClick={() => handleApprove(user)}
                    disabled={busyId === user.id}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors active:scale-95"
                  >
                    <Check size={16} />
                    <span>Approve</span>
                  </button>
                )}
                {!user.isAdmin && (
                  <button
                    onClick={() => handleDelete(user)}
                    disabled={busyId === user.id}
                    className="flex items-center gap-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors active:scale-95"
                  >
                    <Trash2 size={16} />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pendingAutoApprove !== null && (
        <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 border-b border-surface-100 flex justify-between items-center">
              <h2 className="text-xl font-heading font-bold text-surface-900">
                {pendingAutoApprove ? 'Turn on auto-approve?' : 'Turn off auto-approve?'}
              </h2>
              <button onClick={closeAutoApproveDialog} className="text-surface-400 hover:text-surface-600" aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-surface-600 mb-4">
                {pendingAutoApprove
                  ? 'Everyone who signs up from now on can sign in without waiting for an admin.'
                  : 'New accounts will wait for an admin to approve them again.'}
              </p>
              <label htmlFor="auto-approve-confirm" className="block text-sm font-medium text-surface-700 mb-2">
                Type <span className="font-mono font-bold text-surface-900">{confirmWord}</span> to confirm
              </label>
              <input
                id="auto-approve-confirm"
                type="text"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveAutoApprove()}
                className="w-full bg-surface-50 border border-surface-200 rounded-xl p-3 font-mono text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 mb-6"
              />
              <div className="flex gap-2">
                <button
                  onClick={closeAutoApproveDialog}
                  disabled={isSavingSetting}
                  className="flex-1 border border-surface-200 text-surface-700 hover:bg-surface-50 disabled:opacity-50 px-4 py-3 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveAutoApprove}
                  disabled={confirmText !== confirmWord || isSavingSetting}
                  className={`flex-1 flex items-center justify-center gap-2 text-white px-4 py-3 rounded-xl font-medium transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                    pendingAutoApprove ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {isSavingSetting && <Loader2 size={16} className="animate-spin" />}
                  <span>{pendingAutoApprove ? 'Turn on' : 'Turn off'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
