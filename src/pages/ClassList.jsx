import React, { useState, useEffect } from 'react';
import { Plus, Book, Users, ArrowRight } from 'lucide-react';

export default function ClassList({ onSelectClass }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [classes, setClasses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchClasses = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/classes`);
      if (!res.ok) throw new Error('Failed to fetch classes');
      const data = await res.json();
      setClasses(data);
    } catch (err) {
      console.error('Error fetching classes:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  const handleJoinClass = async () => {
    if (joinCode.trim()) {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/classes/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ joinCode })
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to join class');
        }
        await fetchClasses();
        setJoinCode('');
        setShowAddModal(false);
      } catch (err) {
        alert(err.message);
      }
    }
  };

  return (
    <div className="pt-6 sm:pt-24 pb-24 px-4 max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex justify-between items-end">
        <div className="space-y-2">
          <div className="inline-flex items-center space-x-2 bg-brand-100 text-brand-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-brand-200">
            <span>Student Portal</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-heading font-bold text-surface-900 tracking-tight">My Classes</h1>
          <p className="text-surface-600">Select a project to view its workspace.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-brand-600 text-white p-3 sm:px-4 sm:py-2.5 flex items-center gap-2 rounded-xl font-medium shadow-md shadow-brand-500/20 hover:bg-brand-700 transition-colors active:scale-95"
        >
          <Plus size={20} />
          <span className="hidden sm:inline">Join Class</span>
        </button>
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {classes.map((cls) => (
          <button 
            key={cls.id}
            onClick={() => onSelectClass(cls)}
            className="group relative text-left overflow-hidden bg-white rounded-3xl border border-surface-200 shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-brand-300 transition-all duration-300"
          >
            {/* Top color banner */}
            <div className={`h-24 sm:h-32 w-full bg-gradient-to-br ${cls.color} p-5 flex flex-col justify-end text-white relative`}>
               {/* decorative backdrop */}
              <div className="absolute right-0 top-0 opacity-20 pointer-events-none translate-x-4 -translate-y-4">
                <Book size={120} />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold z-10 drop-shadow-sm">{cls.name}</h2>
              <p className="text-white/90 text-sm font-medium z-10">{cls.projects.length} Projects</p>
            </div>
            
            {/* Bottom details area */}
            <div className="p-5 space-y-4 relative">
              <div className="flex justify-between items-center text-sm font-medium">
                 <span className="text-surface-600 flex items-center gap-1.5">
                   Instructor: {cls.teacher} 
                   <span className="text-surface-300">•</span>
                   <span className="font-mono text-brand-600 font-bold text-xs bg-brand-50 px-1.5 py-0.5 rounded border border-brand-100 uppercase tracking-wide">
                     {cls.joinCode}
                   </span>
                 </span>
                <div className="flex items-center gap-1.5 text-surface-500 bg-surface-50 px-2 py-1 rounded-md">
                  <Users size={14} />
                  <span>{cls.members} Members</span>
                </div>
              </div>
              
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm font-medium pb-1">
                  <span className="text-surface-600">Active Project Progress</span>
                  <span className="text-brand-600">
                    {cls.projects.find(p => p.status === 'present')?.progress || 0}%
                  </span>
                </div>
                <div className="w-full h-2 bg-surface-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full bg-gradient-to-r ${cls.color} rounded-full transition-all duration-1000 ease-out`}
                    style={{ width: `${cls.projects.find(p => p.status === 'present')?.progress || 0}%` }}
                  />
                </div>
              </div>
              
               <div className="absolute bottom-5 right-5 text-brand-600 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                <ArrowRight size={20} />
              </div>
            </div>
          </button>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 border-b border-surface-100 flex justify-between items-center">
              <h2 className="text-xl font-heading font-bold text-surface-900">Join a Class</h2>
              <button 
                onClick={() => setShowAddModal(false)} 
                className="text-surface-400 hover:text-surface-600 p-1 rounded-md hover:bg-surface-50 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-surface-700 mb-2">Enter Invite Code</label>
              <input 
                type="text"
                autoFocus
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. 8XYZ-2PLQ"
                className="w-full uppercase bg-surface-50 border border-surface-200 rounded-xl p-3 text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 mb-6 font-mono font-medium tracking-wide"
              />
              <button 
                onClick={handleJoinClass}
                disabled={!joinCode.trim()}
                className="w-full bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-medium shadow-md shadow-brand-500/20 hover:bg-brand-700 transition-colors active:scale-95"
              >
                Join Project
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
