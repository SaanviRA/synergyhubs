import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

// Shown under a project card for students. Deleting only removes the project for them:
// teammates and anyone it was shared with keep it.
export default function DeleteProject({ project, onDeleted }) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${project.name}"? It is removed for you only; anyone else on it keeps it.`)) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`${API_URL}/api/projects/${project.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to delete project');
      }
      onDeleted(project);
    } catch (err) {
      alert(err.message);
      setIsDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className="ml-auto flex items-center gap-1.5 text-surface-400 hover:text-red-600 font-medium transition-colors disabled:opacity-50"
    >
      <Trash2 size={16} />
      {isDeleting ? 'Deleting...' : 'Delete project'}
    </button>
  );
}
