import React, { useState, useEffect } from 'react';
import { FolderInput } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

// Shown under a project card: lets the user file it under another of their classes (a project
// shared with them can also go back to "Shared"). Only changes where they see it.
export default function MoveProject({ project, currentClassId, onMoved }) {
  const [classes, setClasses] = useState([]);
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/classes`)
      .then(res => (res.ok ? res.json() : []))
      .then(data => setClasses(data.filter(cls => !cls.shared && cls.id !== currentClassId)))
      .catch(err => console.error('Error fetching classes:', err));
  }, [currentClassId]);

  const canGoToShared = project.shared && currentClassId !== 'shared';

  const handleMove = async (value) => {
    const classId = value === 'shared' ? null : Number(value);
    setIsMoving(true);
    try {
      const res = await fetch(`${API_URL}/api/projects/${project.id}/class`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to move project');
      }
      onMoved(project, classId);
    } catch (err) {
      alert(err.message);
      setIsMoving(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {project.shared && <span className="text-surface-500 font-medium">Shared with you</span>}
      {(classes.length > 0 || canGoToShared) && (
        <label className="flex items-center gap-1.5 text-brand-600 font-medium">
          <FolderInput size={16} />
          <select
            value=""
            disabled={isMoving}
            onChange={(e) => handleMove(e.target.value)}
            className="bg-transparent text-brand-600 font-medium focus:outline-none cursor-pointer disabled:opacity-50"
          >
            <option value="" disabled>{isMoving ? 'Moving...' : 'Move to class...'}</option>
            {classes.map(cls => (
              <option key={cls.id} value={cls.id}>{cls.name}</option>
            ))}
            {canGoToShared && <option value="shared">Shared</option>}
          </select>
        </label>
      )}
    </div>
  );
}
