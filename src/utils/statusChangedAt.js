// When a milestone moved to In Progress / Completed, for the timeline ("Oct 17, 2026, 3:45 PM").
// Milestones changed before these times were recorded have no timestamp, so they show nothing.

export function formatChangedAt(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Hover text for a status button
export function statusChangedTitle(label, timestamp) {
  if (!timestamp) return undefined;
  return `Moved to ${label} on ${formatChangedAt(timestamp)}`;
}
