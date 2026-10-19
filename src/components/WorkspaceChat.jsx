import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, MessageSquare, ShieldAlert, Heart } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const POLL_MS = 4000;
const MAX_LENGTH = 2000;

function formatTime(iso) {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? time : `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

// Right-hand chat about one workspace document. Render it with key={workspace.id} so switching
// documents starts a fresh conversation instead of carrying over the previous one.
export default function WorkspaceChat({ workspace, onClose, accent = 'brand' }) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  // The safety check asked the writer to think again before this text is posted
  const [nudgedText, setNudgedText] = useState(null);
  // A message suggested the writer may be struggling: show where to get help
  const [showSupport, setShowSupport] = useState(false);
  const lastIdRef = useRef(0);
  const listRef = useRef(null);

  const addMessages = useCallback((incoming) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !known.has(m.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
    lastIdRef.current = Math.max(lastIdRef.current, ...incoming.map((m) => m.id));
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/api/workspaces/${workspace.id}/messages?after=${lastIdRef.current}`);
        const data = await res.json();
        if (!active) return;
        if (res.ok) {
          addMessages(data);
          setError('');
        } else {
          setError(data.error || 'Could not load messages');
        }
      } catch {
        if (active) setError('Could not reach the server');
      } finally {
        if (active) setIsLoading(false);
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [workspace.id, addMessages]);

  // Keep the newest message in view
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSend = async (confirmed = false) => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/workspaces/${workspace.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, confirmed }),
      });
      const data = await res.json();
      if (res.ok && data.nudge) {
        setNudgedText(text);
        setError('');
      } else if (res.ok) {
        addMessages([data]);
        setDraft('');
        setNudgedText(null);
        setError('');
        if (data.support) setShowSupport(true);
      } else {
        setError(data.error || 'Could not send the message');
      }
    } catch {
      setError('Could not reach the server');
    } finally {
      setSending(false);
    }
  };

  const mineBubble = accent === 'indigo' ? 'bg-indigo-600' : 'bg-brand-600';
  const sendButton = accent === 'indigo' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-brand-600 hover:bg-brand-700';

  return (
    <aside
      className="fixed right-0 top-0 bottom-[68px] sm:top-[68px] sm:bottom-0 w-full sm:w-96 bg-white border-l border-surface-200 shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-200"
      aria-label={`Chat about ${workspace.title}`}
    >
      <header className="flex items-center gap-3 px-4 py-3 border-b border-surface-200">
        <MessageSquare size={18} className="text-surface-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-surface-500">Chat about</p>
          <h2 className="font-semibold text-surface-900 truncate" title={workspace.title}>{workspace.title}</h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-surface-400 hover:text-surface-700 hover:bg-surface-100 rounded-lg transition-colors cursor-pointer"
          title="Close chat"
        >
          <X size={18} />
        </button>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-surface-50">
        {isLoading ? (
          <p className="text-sm text-surface-500 text-center mt-8">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-surface-500 text-center mt-8">
            No messages yet. Start the conversation about the changes in this document.
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex gap-2 ${m.mine ? 'flex-row-reverse' : ''}`}>
              {!m.mine && (
                <div className="h-8 w-8 shrink-0 rounded-full bg-surface-200 text-surface-700 text-xs font-bold flex items-center justify-center">
                  {m.avatar}
                </div>
              )}
              <div className={`max-w-[80%] flex flex-col ${m.mine ? 'items-end' : 'items-start'}`}>
                <span className="text-[11px] text-surface-500 mb-0.5">
                  {m.mine ? 'You' : m.author} · {formatTime(m.createdAt)}
                </span>
                <p
                  className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                    m.mine ? `${mineBubble} text-white rounded-tr-sm` : 'bg-white border border-surface-200 text-surface-900 rounded-tl-sm'
                  } ${m.status !== 'visible' ? 'opacity-60' : ''}`}
                >
                  {m.text}
                </p>
                {m.status === 'held' && (
                  <span className="text-[11px] text-amber-700 mt-0.5">Waiting for a teacher to review. Only you can see it.</span>
                )}
                {m.status === 'removed' && (
                  <span className="text-[11px] text-rose-700 mt-0.5">Removed by a teacher. Only you can see it.</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-surface-200 p-3 space-y-2">
        {showSupport && (
          <div className="flex gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
            <Heart size={16} className="shrink-0 text-sky-600 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">You don't have to go through this alone.</p>
              <p>
                Please talk to someone you trust, like a parent, teacher or school counselor. In the US you can
                call or text 988 any time to reach the Suicide &amp; Crisis Lifeline. If you are in danger right
                now, call 911.
              </p>
              <button onClick={() => setShowSupport(false)} className="text-sky-700 font-medium underline cursor-pointer">
                Close
              </button>
            </div>
          </div>
        )}
        {nudgedText !== null && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <ShieldAlert size={16} className="shrink-0 text-amber-600 mt-0.5" />
            <div className="space-y-2">
              <p>This message might hurt or upset someone. Do you want to change it before sending? If you send it, a teacher may review it.</p>
              <div className="flex gap-3 font-medium">
                <button onClick={() => setNudgedText(null)} className="text-amber-800 underline cursor-pointer">
                  Edit message
                </button>
                <button onClick={() => handleSend(true)} disabled={sending} className="text-amber-800 underline cursor-pointer disabled:opacity-50">
                  Send anyway
                </button>
              </div>
            </div>
          </div>
        )}
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              // A changed message is checked again when sent
              if (nudgedText !== null && e.target.value.trim() !== nudgedText) setNudgedText(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            maxLength={MAX_LENGTH}
            rows={2}
            placeholder="Message… (Enter to send, Shift+Enter for a new line)"
            className="flex-1 resize-none bg-white border border-surface-200 rounded-lg px-3 py-2 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          />
          <button
            onClick={() => handleSend()}
            disabled={!draft.trim() || sending}
            className={`p-2.5 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${sendButton}`}
            title="Send"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}
