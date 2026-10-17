import React, { useState } from 'react';
import { X } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

// Dialog for adding an event (milestone) to an existing project's timeline.
// onCreated receives the API response: { milestone, progress }.
export default function AddEventModal({ projectId, onClose, onCreated, accent = 'brand' }) {
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The server sorts the timeline by this date and builds its "Apr 2" label
        body: JSON.stringify({ title: title.trim(), details: details.trim(), dueOn: date || null }),
      });
      const data = await res.json();
      if (res.ok) {
        onCreated(data);
      } else {
        setError(data.error || 'Could not add the event');
      }
    } catch {
      setError('Could not reach the server');
    } finally {
      setSaving(false);
    }
  };

  const ring = accent === 'indigo' ? 'focus:ring-indigo-500/50' : 'focus:ring-brand-500/50';
  const button =
    accent === 'indigo'
      ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20'
      : 'bg-brand-600 hover:bg-brand-700 shadow-brand-500/20';
  const input = `w-full bg-surface-50 border border-surface-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 ${ring}`;

  return (
    <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-heading font-bold text-lg text-surface-900">Add Event</h3>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600 p-1 rounded-lg cursor-pointer" title="Close">
            <X size={18} />
          </button>
        </div>
        <div>
          <label className="block text-xs font-semibold text-surface-700 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            maxLength={200}
            placeholder="e.g. Peer review of drafts"
            className={input}
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-surface-700 mb-1">Details (optional)</label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            placeholder="What needs to happen for this event?"
            className={`${input} resize-none`}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-surface-700 mb-1">Due date (optional)</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-surface-600 hover:bg-surface-100 cursor-pointer">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className={`px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50 cursor-pointer shadow-sm ${button}`}
          >
            {saving ? 'Adding...' : 'Add Event'}
          </button>
        </div>
      </div>
    </div>
  );
}
