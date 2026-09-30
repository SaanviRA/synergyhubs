import React, { useState, useEffect, useCallback } from 'react';
import { 
  CheckCircle2, Circle, Clock, AlertCircle, BellRing, ArrowLeft, ArrowRight, 
  Users, Calendar, Sparkles, FileText, MessageSquare, Activity, ChevronDown, 
  ChevronUp, MousePointerClick, Send, ShieldCheck, Mail
} from 'lucide-react';

export default function TeacherDashboard({ classData, projectData, onBack, onNavigate, onUpdateProject }) {
  const [students, setStudents] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [nudgedMap, setNudgedMap] = useState({});
  const [studentNudgeMap, setStudentNudgeMap] = useState({});
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'visited' | 'not_visited'
  const [expandedStudentIds, setExpandedStudentIds] = useState({});

  const fetchData = useCallback(async () => {
    if (!projectData?.id) {
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
      const [historyRes, milestonesRes] = await Promise.all([
        fetch(`${apiUrl}/api/projects/${projectData.id}/student-history`),
        fetch(`${apiUrl}/api/projects/${projectData.id}/milestones`)
      ]);

      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setStudents(historyData);
        // By default expand all students who have updates
        const initialExpanded = {};
        historyData.forEach(s => {
          if (s.updates && s.updates.length > 0) {
            initialExpanded[s.id] = true;
          }
        });
        setExpandedStudentIds(initialExpanded);
      }
      if (milestonesRes.ok) {
        const milestonesData = await milestonesRes.json();
        setMilestones(milestonesData);
      }
    } catch (err) {
      console.error('Error fetching teacher dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectData?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Dynamic progress calculation from milestones
  const completedCount = milestones.filter(m => m.status === 'completed').length;
  const currentProgress = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : (projectData?.progress || 0);

  useEffect(() => {
    if (milestones.length > 0 && onUpdateProject) {
      const calculated = Math.round((completedCount / milestones.length) * 100);
      if (calculated !== projectData?.progress) {
        onUpdateProject({ progress: calculated });
      }
    }
  }, [milestones, completedCount, projectData?.progress, onUpdateProject]);

  const handleNudgeMilestone = (id) => {
    setNudgedMap(prev => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setNudgedMap(prev => ({ ...prev, [id]: false }));
    }, 3000);
  };

  const handleNudgeStudent = (studentId) => {
    setStudentNudgeMap(prev => ({ ...prev, [studentId]: true }));
    setTimeout(() => {
      setStudentNudgeMap(prev => ({ ...prev, [studentId]: false }));
    }, 3000);
  };

  const toggleStudentExpanded = (studentId) => {
    setExpandedStudentIds(prev => ({
      ...prev,
      [studentId]: !prev[studentId]
    }));
  };

  const upcomingMilestones = milestones.filter(m => m.status !== 'completed');
  const displayMilestones = upcomingMilestones.length > 0 ? upcomingMilestones : milestones;
  const allCompleted = milestones.length > 0 && upcomingMilestones.length === 0;

  const getStatusIcon = (status) => {
    switch (status) {
      case 'delayed':
        return <AlertCircle className="text-rose-500 shrink-0" size={22} />;
      case 'in-progress':
        return <Clock className="text-indigo-600 shrink-0" size={22} />;
      case 'completed':
        return <CheckCircle2 className="text-emerald-500 shrink-0" size={22} />;
      default:
        return <Circle className="text-indigo-300 shrink-0" size={22} />;
    }
  };

  const getUpdateIcon = (type) => {
    switch (type) {
      case 'submission':
        return <FileText size={15} className="text-emerald-600" />;
      case 'status_update':
        return <MessageSquare size={15} className="text-indigo-600" />;
      case 'milestone_completed':
        return <CheckCircle2 size={15} className="text-emerald-600" />;
      case 'project_visit':
        return <MousePointerClick size={15} className="text-brand-600" />;
      default:
        return <Activity size={15} className="text-brand-600" />;
    }
  };

  const formatUpdateType = (type) => {
    switch (type) {
      case 'submission': return 'Submission';
      case 'status_update': return 'Status Post';
      case 'milestone_completed': return 'Milestone Completed';
      case 'project_visit': return 'Workspace Access';
      default: return 'Work Log';
    }
  };

  const formatLastActive = (timestamp) => {
    if (!timestamp) return 'No visits recorded';
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch {
      return 'Recently';
    }
  };

  const filteredStudents = students.filter(student => {
    if (filterMode === 'visited') return student.hasVisited;
    if (filterMode === 'not_visited') return !student.hasVisited;
    return true;
  });

  const visitedCount = students.filter(s => s.hasVisited).length;
  const notVisitedCount = students.length - visitedCount;

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
        <div className="inline-flex items-center space-x-2 bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-indigo-200 mb-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <span>Teacher View</span>
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
          <span className="text-2xl font-bold text-indigo-600">
            {currentProgress}%
          </span>
        </div>
        <div className="w-full h-3 bg-surface-200 rounded-full overflow-hidden">
          <div 
            className={`h-full bg-gradient-to-r ${projectData ? projectData.color : 'from-indigo-500 to-indigo-700'} rounded-full transition-all duration-1000 ease-out`} 
            style={{ width: `${currentProgress}%` }}
          />
        </div>
      </div>

      {/* Student Engagement & Activity Widgets */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-surface-200">
          <div>
            <h2 className="text-xl font-heading font-bold text-surface-900 flex items-center gap-2">
              <Users size={22} className="text-indigo-600" />
              <span>Student Engagement & Update History</span>
              {students.length > 0 && (
                <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full border border-indigo-200">
                  {students.length} Students
                </span>
              )}
            </h2>
            <p className="text-xs text-surface-500 mt-0.5">
              Live widgets for each student who clicked into the project, including their full update history.
            </p>
          </div>

          {/* Filter options */}
          <div className="flex items-center gap-1.5 bg-surface-100 p-1 rounded-xl self-start sm:self-auto">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-white text-indigo-900 shadow-sm'
                  : 'text-surface-600 hover:text-surface-900'
              }`}
            >
              All ({students.length})
            </button>
            <button
              onClick={() => setFilterMode('visited')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filterMode === 'visited'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-surface-600 hover:text-surface-900'
              }`}
            >
              Clicked Project ({visitedCount})
            </button>
            <button
              onClick={() => setFilterMode('not_visited')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filterMode === 'not_visited'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-surface-600 hover:text-surface-900'
              }`}
            >
              Not Opened ({notVisitedCount})
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="glass rounded-2xl p-5 space-y-3 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-surface-200 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-surface-200 rounded w-1/3" />
                    <div className="h-3 bg-surface-100 rounded w-1/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center space-y-3 border border-surface-200">
            <Users className="mx-auto text-surface-400" size={36} />
            <p className="text-surface-700 font-semibold text-base">No students found matching this filter.</p>
            <p className="text-surface-500 text-sm">Switch filters to see all students assigned to this group.</p>
            <button
              onClick={() => setFilterMode('all')}
              className="mt-2 px-4 py-2 bg-indigo-50 text-indigo-700 font-semibold text-xs rounded-xl hover:bg-indigo-100 transition-colors"
            >
              Show All Students
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredStudents.map((student) => {
              const isExpanded = !!expandedStudentIds[student.id];
              const updatesCount = student.updates?.length || 0;

              return (
                <div 
                  key={student.id} 
                  className={`glass rounded-2xl p-5 border transition-all duration-300 ${
                    student.hasVisited 
                      ? 'border-indigo-100/80 hover:border-indigo-200 hover:shadow-md bg-white/80' 
                      : 'border-surface-200/80 bg-surface-50/50'
                  }`}
                >
                  {/* Student Widget Top Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                      {/* Avatar with visit status badge */}
                      <div className="relative shrink-0">
                        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 text-indigo-700 font-bold border-2 border-white shadow-sm flex items-center justify-center text-sm">
                          {student.avatar}
                        </div>
                        <span 
                          className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                            student.hasVisited ? 'bg-emerald-500' : 'bg-surface-300'
                          }`}
                          title={student.hasVisited ? 'Active / Visited' : 'Not yet visited'}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-surface-900 text-base truncate">
                            {student.name}
                          </h3>
                          {student.email && (
                            <span className="text-xs text-surface-400 font-medium">
                              ({student.email})
                            </span>
                          )}
                        </div>

                        {/* Roles */}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {student.roles && student.roles.length > 0 ? (
                            student.roles.map((r, i) => (
                              <span key={i} className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                                <ShieldCheck size={11} />
                                {r}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-surface-500 italic">No role specified</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Engagement / Click Status Badge & Quick Action */}
                    <div className="flex items-center gap-2 flex-wrap self-start sm:self-center">
                      {student.hasVisited ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
                            <CheckCircle2 size={13} className="text-emerald-600" />
                            <span>Clicked on Project</span>
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full font-bold">
                              {student.visitCount} {student.visitCount === 1 ? 'visit' : 'visits'}
                            </span>
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock size={13} className="text-amber-600" />
                          <span>Has not opened yet</span>
                        </span>
                      )}

                      <button
                        onClick={() => handleNudgeStudent(student.id)}
                        className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all border flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                          studentNudgeMap[student.id]
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : 'bg-surface-50 text-surface-700 hover:bg-surface-100 border-surface-200'
                        }`}
                        title="Send a quick reminder to this student"
                      >
                        <Send size={12} className={studentNudgeMap[student.id] ? 'animate-bounce text-emerald-600' : ''} />
                        <span>{studentNudgeMap[student.id] ? 'Sent! ✓' : 'Nudge'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Active / Current Log Snapshot */}
                  {student.activeLog && (
                    <div className="mt-3.5 p-3 rounded-xl bg-surface-50/80 border border-surface-200/60 text-xs text-surface-700 flex items-start gap-2">
                      <Activity size={14} className="text-indigo-600 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-surface-900 mr-1.5">Latest Active Status:</span>
                        <span>"{student.activeLog}"</span>
                      </div>
                      {student.lastVisitedAt && (
                        <span className="text-[11px] text-surface-400 shrink-0">
                          {formatLastActive(student.lastVisitedAt)}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Update History Toggle & Feed */}
                  <div className="mt-4 pt-3.5 border-t border-surface-200/60">
                    <div className="flex items-center justify-between">
                      <button 
                        onClick={() => toggleStudentExpanded(student.id)}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-surface-700 hover:text-indigo-600 transition-colors cursor-pointer group"
                      >
                        <span>History of Student Updates</span>
                        <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.2 rounded-full border border-indigo-200">
                          {updatesCount} {updatesCount === 1 ? 'entry' : 'entries'}
                        </span>
                        {isExpanded ? (
                          <ChevronUp size={15} className="text-surface-400 group-hover:text-indigo-600 transition-colors" />
                        ) : (
                          <ChevronDown size={15} className="text-surface-400 group-hover:text-indigo-600 transition-colors" />
                        )}
                      </button>

                      <button
                        onClick={() => onNavigate?.('Team')}
                        className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 hover:underline cursor-pointer"
                      >
                        Manage in Team Hub →
                      </button>
                    </div>

                    {/* Collapsible History Feed */}
                    {isExpanded && (
                      <div className="mt-3 space-y-2 animate-in fade-in duration-200">
                        {updatesCount === 0 ? (
                          <div className="p-3 rounded-xl bg-surface-50 border border-surface-200/50 text-center">
                            <p className="text-xs text-surface-500 italic">No updates logged yet by this student.</p>
                          </div>
                        ) : (
                          student.updates.map((upd) => (
                            <div 
                              key={upd.id} 
                              className="p-3 rounded-xl bg-surface-50 hover:bg-surface-100/70 border border-surface-200/70 transition-colors flex items-start gap-3 text-xs"
                            >
                              <div className="p-1.5 rounded-lg bg-white shadow-xs border border-surface-200 shrink-0 mt-0.5">
                                {getUpdateIcon(upd.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-surface-800 font-medium leading-relaxed">
                                  {upd.text}
                                </p>
                                <div className="flex items-center gap-2 mt-1 text-[11px] text-surface-400">
                                  <span className="font-semibold text-indigo-700">
                                    {formatUpdateType(upd.type)}
                                  </span>
                                  <span>•</span>
                                  <span>{upd.date}</span>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Upcoming Milestones */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-heading font-bold text-surface-900 flex items-center gap-2">
            <Clock size={20} className="text-indigo-600" />
            <span>Upcoming Milestones</span>
            {upcomingMilestones.length > 0 && (
              <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                {upcomingMilestones.length}
              </span>
            )}
          </h2>
          <button 
            onClick={() => onNavigate?.('Timeline')}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors group cursor-pointer"
            title="Go to Teacher Timeline"
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
            <p className="text-sm text-surface-600">Students have completed all milestones for this project.</p>
            <button 
              onClick={() => onNavigate?.('Timeline')}
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer"
            >
              <span>Review completed timeline</span>
              <ArrowRight size={14} />
            </button>
          </div>
        ) : displayMilestones.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center space-y-3 border border-surface-200">
            <Calendar className="mx-auto text-surface-400" size={32} />
            <p className="text-surface-600 font-medium text-sm">No milestones scheduled yet for this group.</p>
            <button 
              onClick={() => onNavigate?.('Timeline')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer border border-indigo-200"
            >
              <Sparkles size={16} />
              <span>Open Timeline</span>
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {displayMilestones.map((ms) => (
              <div 
                key={ms.id} 
                onClick={() => onNavigate?.('Timeline')}
                className="glass rounded-2xl p-4 flex items-start gap-4 transition-all hover:bg-white/95 hover:shadow-md cursor-pointer border border-transparent hover:border-indigo-200 group"
              >
                <div className="pt-0.5">
                  {getStatusIcon(ms.status)}
                </div>
                <div className="flex-1 space-y-1 min-w-0">
                  <h3 className="font-medium text-surface-900 group-hover:text-indigo-700 transition-colors truncate">
                    {ms.title}
                  </h3>
                  <div className="flex items-center text-sm text-surface-500 gap-2 flex-wrap">
                    <span className="font-semibold text-[11px] uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
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
                      handleNudgeMilestone(ms.id);
                    }}
                    className={`h-10 px-3 rounded-xl transition-all flex items-center gap-2 text-sm font-medium border active:scale-95 cursor-pointer shrink-0 ${
                      nudgedMap[ms.id] 
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                        : 'bg-rose-50 text-rose-600 hover:bg-rose-100 border-rose-200'
                    }`}
                    title={nudgedMap[ms.id] ? 'Nudge sent!' : 'Send a friendly reminder to the team'}
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
    </div>
  );
}
