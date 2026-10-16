import React from 'react';

// Links to the static policy pages in public/, shown on the signed-out screens
export default function LegalLinks() {
  return (
    <p className="text-center text-xs text-surface-500 font-medium">
      <a href="/privacy.html" className="hover:text-brand-600 underline underline-offset-2">Privacy Policy</a>
      <span className="mx-2 text-surface-300">•</span>
      <a href="/terms.html" className="hover:text-brand-600 underline underline-offset-2">Terms of Service</a>
      <span className="mx-2 text-surface-300">•</span>
      <a href="mailto:support@synergyhubs.org" className="hover:text-brand-600 underline underline-offset-2">Contact</a>
    </p>
  );
}
