import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Circle, Clock, AlertCircle, BellRing, ArrowLeft, ArrowRight, Users, Calendar, Sparkles } from 'lucide-react';

export default function Dashboard({ classData, projectData, onBack, onNavigate, onUpdateProject }) {
  const [team, setTeam] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [nudgedMap, setNudgedMap] = useState({});

  const fetchData = useCallback(async () => {
    if (!projectData?.id) {
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
      const [teamRes, milestonesRes] = await Promise.all([
        fetch(`${apiUrl}/api/projects/${projectData.id}/team`),
        fetch(`${apiUrl}/api/projects/${projectData.id}/milestones`)
      ]);

      if (teamRes.ok) {
        const teamData = await teamRes.json();
        setTeam(teamData);
      }
      if (milestonesRes.ok) {
        const milestonesData = await milestonesRes.json();
        setMilestones(milestonesData);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectData?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const completedCount = milestones.filter(m => m.status === 'completed').length;
  const currentProgress = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : (projectData?.progress || 0);

  // Sync calculated milestone progress back to parent project state
  useEffect(() => {
    if (milestones.length > 0 && onUpdateProject) {
      const calculated = Math.round((completedCount / milestones.length) * 100);
      if (calculated !== projectData?.progress) {
        onUpdateProject({ progress: calculated });
      }
    }
  }, [milestones, completedCount, projectData?.progress, onUpdateProject]);

  const handleNudge = (id) => {
    setNudgedMap(prev => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setNudgedMap(prev => ({ ...prev, [id]: false }));
    }, 3000);
  };

  const upcomingMilestones = milestones.filter(m => m.status !== 'completed');
  const displayMilestones = upcomingMilestones.length > 0 ? upcomingMilestones : milestones;
  const allCompleted = milestones.length > 0 && upcomingMilestones.length === 0;

  const getStatusIcon = (status) => {
    switch (status) {
      case 'delayed':
        return <AlertCircle className="text-rose-500 shrink-0" size={22} />;
      case 'in-progress':
        return <Clock className="text-brand-500 shrink-0" size={22} />;
      case 'completed':
        return <CheckCircle2 className="text-emerald-500 shrink-0" size={22} />;
      default:
        return <Circle className="text-brand-300 shrink-0" size={22} />;
    }
  };

  return (
    <div className="pt-6 sm:pt-24 pb-24 px-4 max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Back Navigation */}
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-surface-500 hover:text-surface-900 transition-colors -mb-2 group cursor-pointer"
      >
        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        <span className="font-medium">Back to Projects</span>
      </button>

      {/* Header Section */}
      <header className="space-y-2">
        <div className="inline-flex items-center space-x-2 bg-brand-100/50 text-brand-800 px-3 py-1 rounded-full text-sm font-medium mb-2 border border-brand-200">
          <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
          <span>Active Project</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-heading font-bold text-surface-900 tracking-tight">
          {projectData ? projectData.name : 'Cold War Perspectives'}
        </h1>
        <p className="text-surface-600 text-lg">
          {classData ? classData.name : 'History 101'} • Due in 5 days
        </p>
      </header>
      
      {/* Progress Bar */}
      <div className="glass rounded-2xl p-5 space-y-4">
        <div className="flex justify-between items-end">
          <h2 className="font-semibold text-surface-800">Overall Progress</h2>
          <span className="text-2xl font-bold text-brand-600">
            {currentProgress}%
          </span>
        </div>
        <div className="w-full h-3 bg-surface-200 rounded-full overflow-hidden">
          <div 
            className={`h-full bg-gradient-to-r ${projectData ? projectData.color : 'from-brand-400 to-brand-600'} rounded-full transition-all duration-1000 ease-out`} 
            style={{ width: `${currentProgress}%` }}
          />
        </div>
      </div>

      {/* Up Next / Upcoming Milestones */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-heading font-bold text-surface-900 flex items-center gap-2">
            <Clock size={20} className="text-brand-600" />
            <span>Up Next</span>
            {upcomingMilestones.length > 0 && (
              <span className="text-xs font-semibold bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full border border-brand-200">
                {upcomingMilestones.length}
              </span>
            )}
          </h2>
          <button 
            onClick={() => onNavigate?.('Timeline')}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors group cursor-pointer"
            title="Go to Timeline tab"
          >
            <span>View Timeline</span>
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((n) => (
              <div key={n} className="glass rounded-2xl p-4 flex items-center gap-4 animate-pulse">
                <div className="w-6 h-6 rounded-full bg-surface-200 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-surface-200 rounded w-1/3" />
                  <div className="h-3 bg-surface-100 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : allCompleted ? (
          <div className="glass rounded-2xl p-6 text-center space-y-2 border border-emerald-200 bg-emerald-50/30">
            <CheckCircle2 className="mx-auto text-emerald-500" size={32} />
            <h3 className="font-semibold text-surface-900">All milestones completed!</h3>
            <p className="text-sm text-surface-600">Great job! All scheduled project milestones have been achieved.</p>
            <button 
              onClick={() => onNavigate?.('Timeline')}
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700 cursor-pointer"
            >
              <span>View full timeline</span>
              <ArrowRight size={14} />
            </button>
          </div>
        ) : displayMilestones.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center space-y-3 border border-surface-200">
            <Calendar className="mx-auto text-surface-400" size={32} />
            <p className="text-surface-600 font-medium text-sm">No upcoming events or milestones scheduled yet.</p>
            <button 
              onClick={() => onNavigate?.('Timeline')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors cursor-pointer border border-brand-200"
            >
              <Sparkles size={16} />
              <span>Plan Timeline</span>
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {displayMilestones.map((ms) => (
              <div 
                key={ms.id} 
                onClick={() => onNavigate?.('Timeline')}
                className="glass rounded-2xl p-4 flex items-start gap-4 transition-all hover:bg-white/95 hover:shadow-md cursor-pointer border border-transparent hover:border-brand-200 group"
              >
                <div className="pt-0.5">
                  {getStatusIcon(ms.status)}
                </div>
                <div className="flex-1 space-y-1 min-w-0">
                  <h3 className="font-medium text-surface-900 group-hover:text-brand-700 transition-colors truncate">
                    {ms.title}
                  </h3>
                  <div className="flex items-center text-sm text-surface-500 gap-2 flex-wrap">
                    <span className="font-semibold text-[11px] uppercase tracking-wider text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md border border-brand-100">
                      Team Milestone
                    </span>
                    <span>•</span>
                    <span className={ms.status === 'delayed' ? 'text-rose-500 font-medium' : ''}>
                      {ms.date || ms.due}
                    </span>
                    {ms.submission && (
                      <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded ml-1">
                        Submitted
                      </span>
                    )}
                  </div>
                </div>
                {ms.status === 'delayed' && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNudge(ms.id);
                    }}
                    className={`h-10 px-3 rounded-xl transition-all flex items-center gap-2 text-sm font-medium border active:scale-95 cursor-pointer shrink-0 ${
                      nudgedMap[ms.id] 
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                        : 'bg-rose-50 text-rose-600 hover:bg-rose-100 border-rose-200'
                    }`}
                    title={nudgedMap[ms.id] ? 'Nudge sent to team!' : 'Send a friendly reminder to team'}
                  >
                    <BellRing size={16} className={nudgedMap[ms.id] ? 'animate-bounce text-emerald-600' : ''} />
                    <span className="hidden sm:inline">
                      {nudgedMap[ms.id] ? 'Nudged Team! ✓' : 'Nudge Team'}
                    </span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Team Roles */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-heading font-bold text-surface-900 flex items-center gap-2">
            <Users size={20} className="text-brand-600" />
            <span>Team Roles</span>
            {team.length > 0 && (
              <span className="text-xs font-semibold bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full border border-brand-200">
                {team.length}
              </span>
            )}
          </h2>
          <button 
            onClick={() => onNavigate?.('Team')}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors group cursor-pointer"
            title="Go to Team tab"
          >
            <span>View Team</span>
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="glass rounded-2xl p-4 flex items-center gap-4 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-surface-200 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-surface-200 rounded w-1/2" />
                  <div className="h-3 bg-surface-100 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : team.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center space-y-3 border border-surface-200">
            <Users className="mx-auto text-surface-400" size={32} />
            <p className="text-surface-600 font-medium text-sm">No team members assigned yet.</p>
            <button 
              onClick={() => onNavigate?.('Team')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors cursor-pointer border border-brand-200"
            >
              <Users size={16} />
              <span>Invite & Assign Roles</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {team.map((member) => (
              <div 
                key={member.id} 
                onClick={() => onNavigate?.('Team')}
                className="glass rounded-2xl p-4 flex items-center gap-4 hover:bg-white/95 hover:shadow-md transition-all cursor-pointer border border-transparent hover:border-brand-200 group"
              >
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-brand-700 font-semibold border-2 border-white shadow-sm flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  {member.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-medium text-surface-900 truncate group-hover:text-brand-700 transition-colors">
                      {member.name}
                    </h3>
                    {(member.isMe || member.is_me) && (
                      <span className="text-[10px] font-bold text-brand-600 bg-brand-50 border border-brand-200/60 px-1.5 py-0.2 rounded-full uppercase tracking-wider shrink-0">
                        You
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-brand-600 font-medium truncate">
                    {member.roles && member.roles.length > 0 ? member.roles.join(', ') : 'Team Member'}
                  </p>
                  {member.activeLog && (
                    <p className="text-xs text-surface-500 truncate mt-0.5" title={member.activeLog}>
                      {member.activeLog}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
