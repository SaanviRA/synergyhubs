import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ShieldAlert, AlertTriangle, Eye, Loader2, Check, Trash2, X } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

const CATEGORY_LABELS = {
  toxic: 'Hurtful',
  severe: 'Very hurtful',
  profanity: 'Swearing',
  threat: 'Threat',
  insult: 'Insult',
  hate: 'Hate',
  sexual: 'Sexual',
  self_harm: 'May be at risk of self-harm',
  self_harm_incitement: 'Tells someone to hurt themselves',
  self_harm_mention: 'Mentions self-harm',
  exclusion: 'Tells someone they are not wanted',
};

const ACTIONS = {
  escalate: {
    label: 'Urgent: the writer may be at risk',
    style: 'bg-rose-50 border-rose-200 text-rose-800',
    icon: AlertTriangle,
    note: "Held. Follow your school's safeguarding procedure: check in with the student and involve the counselor.",
  },
  block: {
    label: 'Held for review',
    style: 'bg-amber-50 border-amber-200 text-amber-800',
    icon: ShieldAlert,
    note: 'Only the writer can see it until you decide.',
  },
  review: {
    label: 'Posted, please check',
    style: 'bg-sky-50 border-sky-200 text-sky-800',
    icon: Eye,
    note: 'The writer was asked to think again and sent it anyway. Classmates can already see it.',
  },
};

function formatWhen(iso) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Chat messages the safety check flagged, for the class teacher (or an admin when a class has no teacher)
export default function SafetyReview({ onBack, backLabel = 'Back' }) {
  const [flags, setFlags] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const fetchFlags = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/safety/flags`);
      if (res.ok) setFlags(await res.json());
    } catch (err) {
      console.error('Error fetching flagged messages:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  const review = async (flag, decision) => {
    setBusyId(flag.id);
    try {
      const res = await fetch(`${API_URL}/api/safety/flags/${flag.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save the review');
      setFlags(prev => prev.filter(f => f.id !== flag.id));
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="pt-6 sm:pt-24 pb-24 px-4 max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-surface-500 hover:text-surface-900 transition-colors group"
      >
        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        <span className="font-medium">{backLabel}</span>
      </button>

      <header className="space-y-2">
        <div className="inline-flex items-center gap-1.5 bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-indigo-200">
          <ShieldAlert size={14} />
          <span>Safety</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-heading font-bold text-surface-900 tracking-tight">Flagged Messages</h1>
        <p className="text-surface-600">
          Chat messages the safety check flagged in your classes. Nothing happens to a student automatically:
          you decide. Reviewed flags are deleted after 180 days.
        </p>
      </header>

      {isLoading ? (
        <p className="text-surface-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</p>
      ) : flags.length === 0 ? (
        <div className="bg-white rounded-2xl border border-surface-200 p-8 text-center text-surface-500">
          Nothing to review right now.
        </div>
      ) : (
        <div className="space-y-4">
          {flags.map(flag => {
            const action = ACTIONS[flag.action];
            const Icon = action.icon;
            const held = flag.message.status === 'held';
            return (
              <article key={flag.id} className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
                <div className={`flex items-start gap-2 px-4 py-3 border-b ${action.style}`}>
                  <Icon size={18} className="shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-bold">{action.label}</p>
                    <p>{action.note}</p>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  <p className="text-xs text-surface-500">
                    {flag.className} · {flag.projectName} · chat about “{flag.workspaceTitle}” · {formatWhen(flag.createdAt)}
                  </p>

                  {flag.context.length > 0 && (
                    <div className="space-y-1 border-l-2 border-surface-200 pl-3">
                      {flag.context.map((c, i) => (
                        <p key={i} className="text-xs text-surface-500">
                          <span className="font-semibold">{c.author}:</span> {c.text}
                        </p>
                      ))}
                    </div>
                  )}

                  <div>
                    <p className="text-sm font-semibold text-surface-900">{flag.message.author}</p>
                    <p className="text-surface-800 whitespace-pre-wrap break-words">{flag.message.text}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {flag.categories.map(c => (
                      <span key={c} className="text-xs font-medium bg-surface-100 text-surface-700 px-2 py-0.5 rounded-md">
                        {CATEGORY_LABELS[c] || c}
                      </span>
                    ))}
                    {flag.otherFlags > 0 && (
                      <span className="text-xs font-medium bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md">
                        {flag.otherFlags} other flagged {flag.otherFlags === 1 ? 'message' : 'messages'} from this student in the last 180 days
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={() => review(flag, 'approved')}
                      disabled={busyId === flag.id}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                    >
                      <Check size={16} /> {held ? 'Publish' : 'Keep'}
                    </button>
                    <button
                      onClick={() => review(flag, 'removed')}
                      disabled={busyId === flag.id}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                    >
                      <Trash2 size={16} /> Remove
                    </button>
                    <button
                      onClick={() => review(flag, 'false_positive')}
                      disabled={busyId === flag.id}
                      title="The check got this wrong. Marking it helps tune the model."
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-white border border-surface-200 text-surface-700 hover:bg-surface-50 disabled:opacity-50 cursor-pointer"
                    >
                      <X size={16} /> False alarm
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
