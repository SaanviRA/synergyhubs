import React from 'react';
import { CheckCircle2, Circle, AlertCircle, BellRing, ArrowLeft } from 'lucide-react';

export default function TeacherDashboard({ classData, projectData, onBack }) {
  const team = [
    { name: 'Alex M.', role: 'Researcher', avatar: 'AM', status: 'On Track' },
    { name: 'Sarah K.', role: 'Editor', avatar: 'SK', status: 'Delayed' },
    { name: 'Student Test', role: 'Presenter', avatar: 'ST', status: 'Done' },
  ];

  const nextMilestones = [
    { title: 'Gather primary sources', due: 'Today, 5:00 PM', assignee: 'Alex M.', status: 'pending' },
    { title: 'Draft introduction', due: 'Tomorrow, 12:00 PM', assignee: 'Sarah K.', status: 'delayed' },
  ];

  return (
    <div className="pt-6 sm:pt-24 pb-24 px-4 max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Back Navigation */}
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-surface-500 hover:text-surface-900 transition-colors -mb-2 group"
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
        <h1 className="text-3xl sm:text-4xl font-heading font-bold text-surface-900 tracking-tight">{projectData ? projectData.name : 'Cold War Perspectives'}</h1>
        <p className="text-surface-600 text-lg">{classData ? classData.name : 'History 101'} • Due in 5 days</p>
      </header>
      
      {/* Progress Bar */}
      <div className="glass rounded-2xl p-5 space-y-4">
        <div className="flex justify-between items-end">
          <h2 className="font-semibold text-surface-800">Overall Progress</h2>
          <span className="text-2xl font-bold text-indigo-600">{projectData ? projectData.progress : 65}%</span>
        </div>
        <div className="w-full h-3 bg-surface-200 rounded-full overflow-hidden">
          <div 
            className={`h-full bg-gradient-to-r ${projectData ? projectData.color : 'from-brand-400 to-brand-600'} rounded-full transition-all duration-1000 ease-out`} 
            style={{ width: `${projectData ? projectData.progress : 65}%` }}
          />
        </div>
      </div>

      {/* Up Next / Milestones */}
      <section className="space-y-4">
        <h2 className="text-xl font-heading font-bold text-surface-900 flex items-center gap-2">
          Upcoming Milestones
        </h2>
        <div className="grid gap-3">
          {nextMilestones.map((ms, i) => (
            <div key={i} className="glass rounded-2xl p-4 flex items-start gap-4 transition-all hover:bg-white/90">
              <div className="pt-1">
                {ms.status === 'delayed' ? (
                  <AlertCircle className="text-rose-500" size={24} />
                ) : (
                  <Circle className="text-indigo-300" size={24} />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <h3 className="font-medium text-surface-900">{ms.title}</h3>
                <div className="flex items-center text-sm text-surface-500 gap-2">
                  <span>{ms.assignee}</span>
                  <span>•</span>
                  <span className={ms.status === 'delayed' ? 'text-rose-500 font-medium' : ''}>{ms.due}</span>
                </div>
              </div>
              {ms.status === 'delayed' && (
                <button className="h-10 px-3 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors flex items-center gap-2 text-sm font-medium border border-rose-200 active:scale-95">
                  <BellRing size={16} />
                  <span className="hidden sm:inline">Nudge Team</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Team Roles */}
      <section className="space-y-4">
        <h2 className="text-xl font-heading font-bold text-surface-900">Student Team Roles</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {team.map((member, i) => (
            <div key={i} className="glass rounded-2xl p-4 flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 text-indigo-700 font-semibold border-2 border-white shadow-sm flex items-center justify-center shrink-0">
                {member.avatar}
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-surface-900">{member.name}</h3>
                <p className="text-sm text-indigo-600 font-medium">{member.role}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
