// A class's overall progress: the average of its projects' progress, counting every project shown
// under it (including shared projects filed there), so moving a project in or out changes it.
export function classProgress(projects = []) {
  if (projects.length === 0) return 0;
  const total = projects.reduce((sum, p) => sum + (Number(p.progress) || 0), 0);
  return Math.round(total / projects.length);
}
