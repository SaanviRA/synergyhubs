import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, Trash2, Loader2, ShieldCheck } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

const SIGN_IN_LABELS = { google: 'Google', password: 'Email & password', invited: 'Invited, not signed up yet' };

export default function AdminUsers({ onBack }) {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [busyId, setBusyId] = useState(null);

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

  useEffect(() => {
    fetchUsers();
  }, []);

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
        <p className="text-surface-600">New accounts cannot sign in until you approve them.</p>
      </header>

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
    </div>
  );
}
