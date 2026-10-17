// Default title for a workspace link when the user doesn't type one. Links to Google files don't
// carry the file's name, so they get a readable label for the kind of file ("Google Doc") and a
// number when the project already has one with that name ("Google Doc 2").

const GOOGLE_KINDS = {
  document: 'Google Doc',
  spreadsheets: 'Google Sheet',
  presentation: 'Google Slides',
  forms: 'Google Form',
  drawings: 'Google Drawing',
};

const unslug = (slug) => decodeURIComponent(slug).replace(/[-_]+/g, ' ').trim();

function labelFor(rawUrl) {
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    return rawUrl;
  }
  const host = url.hostname.replace(/^www\./, '');
  const parts = url.pathname.split('/').filter(Boolean);

  if (host === 'docs.google.com') return GOOGLE_KINDS[parts[0]] || 'Google Doc';
  if (host === 'drive.google.com') return parts.includes('folders') ? 'Google Drive Folder' : 'Google Drive File';
  // figma.com/design/<key>/<File-Name>
  if (host.endsWith('figma.com') && parts[2]) return unslug(parts[2]) || 'Figma File';
  if (host.endsWith('figma.com')) return 'Figma File';
  if (host === 'github.com' && parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  if (host.endsWith('miro.com')) return 'Miro Board';
  return host || rawUrl;
}

export function defaultWorkspaceTitle(rawUrl, existingTitles = []) {
  let base = labelFor(rawUrl.trim());
  if (base.length > 30) base = base.substring(0, 30) + '...';
  const taken = new Set(existingTitles);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}
