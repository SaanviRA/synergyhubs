import React from 'react';

// Red bubble with an unread count, pinned to the top-right corner of its (relatively positioned)
// parent. Renders nothing when there is nothing unread.
export default function UnreadBadge({ count, className = '' }) {
  if (!count) return null;
  return (
    <span
      className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-[18px] text-center shadow-sm ring-2 ring-white pointer-events-none ${className}`}
      aria-label={`${count} unread`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
