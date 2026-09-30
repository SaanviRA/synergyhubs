import React from 'react';
import { ArrowLeft, Clock, CalendarHeart, LibraryBig, ArrowRight } from 'lucide-react';

export default function ProjectList({ classData, onSelectProject, onBack }) {
  const projects = classData?.projects || [];
  
  const past = projects.filter(p => p.status === 'past');
  const present = projects.filter(p => p.status === 'present');
  const future = projects.filter(p => p.status === 'future');

  const handleSelectProject = (project) => {
    // Record that student clicked on / visited the project
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${project.id}/visit`, {
      method: 'POST'
    }).catch(err => console.error('Error recording project visit:', err));
    onSelectProject(project);
  };

  const ProjectCard = ({ project }) => (
    <button 
      onClick={() => handleSelectProject(project)}
      className="group relative text-left w-full overflow-hidden bg-white rounded-3xl border border-surface-200 shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-brand-300 transition-all duration-300 flex flex-col"
    >
      <div className={`h-2 w-full absolute top-0 left-0 bg-gradient-to-r ${project.color} opacity-90`} style={{ height: '6px' }} />
      <div className="p-5 pt-6 space-y-4">
        <div>
          <h3 className="text-xl font-bold text-surface-900 drop-shadow-sm">{project.name}</h3>
          <p className="text-surface-500 text-sm mt-1">{project.status === 'present' ? 'Active Project' : project.status === 'past' ? 'Completed' : 'Upcoming'}</p>
        </div>
        
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm font-medium pb-1">
            <span className="text-surface-600">Completion</span>
            <span className="text-brand-600">{project.progress}%</span>
          </div>
          <div className="w-full h-2 bg-surface-100 rounded-full overflow-hidden">
            <div 
              className={`h-full bg-gradient-to-r ${project.color} rounded-full transition-all duration-1000 ease-out`}
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>
      </div>
      <div className="absolute right-5 bottom-5 text-brand-600 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
        <ArrowRight size={20} />
      </div>
    </button>
  );

  return (
    <div className="pt-6 sm:pt-24 pb-24 px-4 max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-surface-500 hover:text-surface-900 transition-colors mb-2 group"
      >
        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        <span className="font-medium">Back to Classes</span>
      </button>

      <header className="space-y-2 pb-4 border-b border-surface-200">
        <h1 className="text-3xl sm:text-4xl font-heading font-bold text-surface-900 tracking-tight">{classData?.name} Projects</h1>
        <p className="text-surface-600 text-lg">Select a project to view its workspace.</p>
      </header>

      {present.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-heading font-bold text-surface-900 flex items-center gap-2">
            <CalendarHeart className="text-brand-500" /> Active Workspace
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {present.map(p => <ProjectCard key={p.id} project={p} />)}
          </div>
        </section>
      )}

      {future.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-heading font-bold text-surface-900 flex items-center gap-2 mt-8">
            <LibraryBig className="text-amber-500" /> Upcoming
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {future.map(p => <ProjectCard key={p.id} project={p} />)}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-heading font-bold text-surface-900 flex items-center gap-2 mt-8">
            <Clock className="text-surface-500" /> Past Projects
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {past.map(p => <ProjectCard key={p.id} project={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}
