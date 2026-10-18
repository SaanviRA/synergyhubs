import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Clock, AlertCircle, ArrowLeft, ChevronDown, Plus } from 'lucide-react';
import AddEventModal from '../components/AddEventModal';
import { formatChangedAt, statusChangedTitle } from '../utils/statusChangedAt';

export default function TeacherMilestones({ classData, projectData, onBack, onNavigate, onUpdateProject }) {
  const [expandedId, setExpandedId] = useState(null);
  const [showAddEvent, setShowAddEvent] = useState(false);
  
  const [milestones, setMilestones] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMilestones = useCallback(async () => {
    if (!projectData?.id) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${projectData.id}/milestones`);
      if (res.ok) {
        const data = await res.json();
        setMilestones(data);
        const completed = data.filter(m => m.status === 'completed').length;
        if (data.length > 0 && onUpdateProject) {
          onUpdateProject({ progress: Math.round((completed / data.length) * 100) });
        }
      }
    } catch (err) {
      console.error('Error fetching milestones:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectData?.id, onUpdateProject]);

  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  const handleUpdateStatus = async (milestoneId, newStatus, e) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${projectData.id}/milestones/${milestoneId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        const data = await res.json();
        setMilestones(prev => prev.map(m => m.id === milestoneId
          ? { ...m, status: newStatus, startedAt: data.startedAt, completedAt: data.completedAt }
          : m));
        if (data.progress !== undefined && onUpdateProject) {
          onUpdateProject({ progress: data.progress });
        }
      }
    } catch (err) {
      console.error('Error updating milestone status:', err);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="text-emerald-500 bg-white rounded-full" size={28} />;
      case 'in-progress': return <Clock className="text-brand-500 bg-white rounded-full" size={28} />;
      case 'delayed': return <AlertCircle className="text-rose-500 bg-white rounded-full" size={28} />;
      default: return <div className="w-7 h-7 rounded-full border-2 border-surface-300 bg-surface-50" />;
    }
  };

  // Reload rather than append: the new event belongs wherever its date puts it
  const handleEventCreated = async () => {
    setShowAddEvent(false);
    await fetchMilestones();
  };

  const toggleExpand = (id) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <div className="pt-6 sm:pt-24 pb-32 px-4 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Back Navigation */}
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-surface-500 hover:text-surface-900 transition-colors mb-6 group"
      >
        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        <span className="font-medium">Back to Projects</span>
      </button>

      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="inline-flex items-center space-x-2 bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-indigo-200 mb-2">
            <span>Teacher Portal</span>
          </div>
          <h1 className="text-3xl font-heading font-bold text-surface-900 tracking-tight font-bold">Timeline (Teacher View)</h1>
          <p className="text-surface-600 mt-1">{projectData ? projectData.name : 'Manage project micro-milestones'}</p>
        </div>
        <button
          onClick={() => setShowAddEvent(true)}
          className="bg-indigo-600 text-white px-4 py-2 flex items-center justify-center gap-2 rounded-xl font-medium shadow-md shadow-indigo-500/20 hover:bg-indigo-700 transition-colors active:scale-[0.98] cursor-pointer shrink-0"
        >
          <Plus size={18} className="text-indigo-100" />
          <span>Add Event</span>
        </button>
      </div>

      {!isLoading && milestones.length === 0 && (
        <div className="glass rounded-2xl p-8 text-center text-surface-500">
          No events on this timeline yet. Use Add Event to plan the first one.
        </div>
      )}

      <div className="relative mt-8 ml-3 sm:ml-0">
        {/* Vertical Line */}
        <div className="absolute left-[13px] sm:left-1/2 top-4 bottom-4 w-0.5 bg-surface-200 -translate-x-1/2 sm:translate-x-0" />

        <div className="space-y-6 lg:space-y-8">
          {milestones.map((ms, index) => {
            const isLeft = index % 2 === 0;
            const isExpanded = expandedId === ms.id;
            
            return (
              <div key={ms.id} className={`relative flex items-start sm:items-center justify-between sm:justify-start w-full ${isLeft ? 'sm:flex-row-reverse' : ''}`}>
                {/* Timeline Node */}
                <div className="absolute left-0 sm:left-1/2 -translate-x-1/2 mt-5 sm:mt-0 flex items-center justify-center w-8 h-8 z-10">
                  <div className="bg-surface-50 rounded-full p-0.5 shadow-sm">
                    {getStatusIcon(ms.status)}
                  </div>
                </div>

                {/* Content Card */}
                <div className={`w-full pl-10 sm:pl-0 sm:w-[calc(50%-2rem)] ${isLeft ? 'sm:text-right sm:pr-8' : 'sm:pl-8 sm:ml-auto'}`}>
                  <div 
                    onClick={() => toggleExpand(ms.id)}
                    className={`glass rounded-2xl p-5 hover:shadow-md transition-all duration-300 cursor-pointer border ${isExpanded ? 'border-indigo-300 ring-2 ring-indigo-100 ring-offset-2' : 'border-surface-200 hover:border-surface-300'} group bg-white/70 backdrop-blur-md`}
                  >
                    <div className={`flex items-center gap-2 mb-2 ${isLeft ? 'sm:flex-row-reverse' : ''}`}>
                      <span className="text-sm font-semibold text-indigo-600 px-2.5 py-1 bg-indigo-50 rounded-lg">{ms.date}</span>
                      <span className="text-xs font-medium text-surface-500 bg-surface-100 px-2 py-0.5 rounded-md">Team Milestone</span>
                      <div className="flex-1" />
                      <div className="h-7 w-7 rounded-full bg-surface-100 flex items-center justify-center text-surface-500 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
                        <ChevronDown size={18} className={`transform transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    
                    <h3 className="text-lg font-bold text-surface-900 mb-1 leading-tight">{ms.title}</h3>
                    <p className="text-surface-600 text-sm mb-4 leading-relaxed">{ms.details}</p>
                    
                    {/* Expandable Status Area */}
                    <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100 mt-5' : 'grid-rows-[0fr] opacity-0 mt-0'} pt-0`}>
                      <div className="overflow-hidden">
                        <div className={`pt-5 border-t border-surface-200/60 ${isLeft ? 'sm:text-right' : 'sm:text-left'} text-left`}>
                          
                          {/* Quick Status Toggles */}
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                              <p className="text-xs font-bold text-surface-600 uppercase tracking-wider">Milestone Status</p>
                              <p className="text-[11px] text-surface-400">Team milestone progress</p>
                            </div>
                            <div className="flex items-center gap-1.5 bg-surface-100 p-1 rounded-xl">
                              <button
                                onClick={(e) => handleUpdateStatus(ms.id, 'pending', e)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                                  ms.status === 'pending'
                                    ? 'bg-white text-surface-900 shadow-sm font-semibold'
                                    : 'text-surface-600 hover:text-surface-900'
                                }`}
                              >
                                Pending
                              </button>
                              <button
                                onClick={(e) => handleUpdateStatus(ms.id, 'in-progress', e)}
                                title={statusChangedTitle('In Progress', ms.startedAt)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                                  ms.status === 'in-progress'
                                    ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                                    : 'text-surface-600 hover:text-surface-900'
                                }`}
                              >
                                In Progress
                              </button>
                              <button
                                onClick={(e) => handleUpdateStatus(ms.id, 'completed', e)}
                                title={statusChangedTitle('Completed', ms.completedAt)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                                  ms.status === 'completed'
                                    ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                                    : 'text-surface-600 hover:text-surface-900'
                                }`}
                              >
                                Completed ✓
                              </button>
                            </div>
                          </div>
                          {(ms.startedAt || ms.completedAt) && (
                            <div className="mt-2 text-[11px] text-surface-500 space-y-0.5">
                              {ms.startedAt && <p>Moved to In Progress on {formatChangedAt(ms.startedAt)}</p>}
                              {ms.completedAt && <p>Completed on {formatChangedAt(ms.completedAt)}</p>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showAddEvent && (
        <AddEventModal
          projectId={projectData.id}
          accent="indigo"
          onClose={() => setShowAddEvent(false)}
          onCreated={handleEventCreated}
        />
      )}
    </div>
  );
}
