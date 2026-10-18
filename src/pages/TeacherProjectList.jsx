import React, { useState } from 'react';
import { ArrowLeft, Clock, CalendarHeart, LibraryBig, ArrowRight, Plus, Trash2 } from 'lucide-react';
import MoveProject from '../components/MoveProject';
import DeleteProject from '../components/DeleteProject';

export default function TeacherProjectList({ classData, onSelectProject, onBack, onUpdateClass, isStudentOwner = false }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [status, setStatus] = useState('present');
  const [selectedHue, setSelectedHue] = useState('blue');
  const [timeline, setTimeline] = useState([]);
  
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestoneDetails, setNewMilestoneDetails] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const projects = classData?.projects || [];
  
  const past = projects.filter(p => p.status === 'past');
  const present = projects.filter(p => p.status === 'present');
  const future = projects.filter(p => p.status === 'future');

  const colorOptions = [
    { hue: 'blue', color: 'from-blue-500 to-indigo-600', bgClass: 'bg-blue-500 shadow-blue-500/20' },
    { hue: 'emerald', color: 'from-emerald-400 to-teal-500', bgClass: 'bg-emerald-500 shadow-emerald-500/20' },
    { hue: 'rose', color: 'from-rose-500 to-pink-600', bgClass: 'bg-rose-500 shadow-rose-500/20' },
    { hue: 'amber', color: 'from-amber-400 to-orange-500', bgClass: 'bg-amber-500 shadow-amber-500/20' },
    { hue: 'violet', color: 'from-violet-500 to-purple-600', bgClass: 'bg-violet-500 shadow-violet-500/20' },
    { hue: 'cyan', color: 'from-cyan-400 to-blue-500', bgClass: 'bg-cyan-500 shadow-cyan-500/20' },
    { hue: 'gray', color: 'from-gray-500 to-gray-600', bgClass: 'bg-gray-500 shadow-gray-500/20' }
  ];

  const handleAddMilestone = () => {
    if (newMilestoneTitle.trim()) {
      let formattedDate = 'TBD';
      if (newMilestoneDate) {
        // Parse date carefully in local time
        const dateParts = newMilestoneDate.split('-');
        if (dateParts.length === 3) {
          const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
          formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
      }
      
      setTimeline([...timeline, {
        title: newMilestoneTitle.trim(),
        details: newMilestoneDetails.trim(),
        // Sent to the server, which sorts the timeline by it; `date` is only shown in this form
        dueOn: newMilestoneDate || null,
        date: formattedDate
      }]);

      setNewMilestoneTitle('');
      setNewMilestoneDetails('');
      setNewMilestoneDate('');
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    setIsSubmitting(true);
    try {
      const selectedColorOpt = colorOptions.find(o => o.hue === selectedHue);
      const payload = {
        name: projectName.trim(),
        status,
        color: selectedColorOpt ? selectedColorOpt.color : 'from-blue-500 to-indigo-600',
        hue: selectedHue,
        timeline
      };

      const token = localStorage.getItem('authToken');
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/classes/${classData.id}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create project');
      }

      const newProject = await res.json();

      const updatedProjects = [...(classData.projects || []), newProject];
      if (onUpdateClass) {
        onUpdateClass({
          ...classData,
          projects: updatedProjects
        });
      }

      handleCloseModal();
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
    setProjectName('');
    setStatus('present');
    setSelectedHue('blue');
    setTimeline([]);
    setNewMilestoneTitle('');
    setNewMilestoneDetails('');
    setNewMilestoneDate('');
  };

  const ProjectCard = ({ project }) => (
    <button 
      onClick={() => onSelectProject(project)}
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

  const dropProject = (dropped) => onUpdateClass({
    ...classData,
    projects: projects.filter(p => p.id !== dropped.id)
  });

  // Each project gets a control to file it under another class, and a student owner can delete
  // projects
  const renderProject = (project) => (
    <div key={project.id} className="space-y-2">
      <ProjectCard project={project} />
      <div className="flex items-center gap-3 px-2 text-sm">
        <MoveProject project={project} currentClassId={classData.id} onMoved={dropProject} />
        {isStudentOwner && <DeleteProject project={project} onDeleted={dropProject} />}
      </div>
    </div>
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

      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 pb-4 border-b border-surface-200">
        <div className="space-y-2">
          {isStudentOwner ? (
            <div className="inline-flex items-center space-x-2 bg-brand-100 text-brand-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-brand-200">
              <span>Your Class</span>
            </div>
          ) : (
            <div className="inline-flex items-center space-x-2 bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-indigo-200">
              <span>Teacher Portal</span>
            </div>
          )}
          <h1 className="text-3xl sm:text-4xl font-heading font-bold text-surface-900 tracking-tight">{classData?.name} Projects</h1>
          <p className="text-surface-600 text-lg">
            {isStudentOwner ? 'Select a project to view its workspace, or create a new one.' : 'Select a project to view and evaluate workspaces.'}
          </p>
        </div>
        {!classData?.shared && (
          <button 
            onClick={() => setShowCreateModal(true)}
            className="bg-brand-600 text-white p-3 sm:px-4 sm:py-2.5 flex items-center gap-2 rounded-xl font-medium shadow-md shadow-brand-500/20 hover:bg-brand-700 transition-colors active:scale-95 cursor-pointer self-stretch sm:self-auto justify-center"
          >
            <Plus size={20} />
            <span>Create Project</span>
          </button>
        )}
      </header>

      {present.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-heading font-bold text-surface-900 flex items-center gap-2">
            <CalendarHeart className="text-brand-500" /> Active Workspace
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {present.map(renderProject)}
          </div>
        </section>
      )}

      {future.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-heading font-bold text-surface-900 flex items-center gap-2 mt-8">
            <LibraryBig className="text-amber-500" /> Upcoming
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {future.map(renderProject)}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-heading font-bold text-surface-900 flex items-center gap-2 mt-8">
            <Clock className="text-surface-500" /> Past Projects
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {past.map(renderProject)}
          </div>
        </section>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-250">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-250 overflow-hidden max-h-[90vh] flex flex-col border border-surface-200/50">
            {/* Modal Header */}
            <div className="p-6 border-b border-surface-100 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-heading font-bold text-surface-900">Create New Project</h2>
                <p className="text-xs text-surface-500 mt-1">Setup the workspace parameters and build the milestone timeline.</p>
              </div>
              <button 
                onClick={handleCloseModal} 
                className="text-surface-400 hover:text-surface-600 p-2 rounded-xl hover:bg-surface-50 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateProject} className="p-6 overflow-y-auto space-y-5 flex-1 text-left">
              {/* Project Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-surface-600 uppercase tracking-wider pl-1">Project Name</label>
                <input 
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. WWII Presentation or DNA Modeling Lab"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full bg-surface-50 border border-surface-200 rounded-xl p-3 text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-medium text-sm"
                />
              </div>

              {/* Status and Color Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-surface-600 uppercase tracking-wider pl-1">Initial Status</label>
                  <select 
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full bg-surface-50 border border-surface-200 rounded-xl p-3 text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-medium text-sm"
                  >
                    <option value="present">Active</option>
                    <option value="future">Upcoming</option>
                    <option value="past">Completed</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-surface-600 uppercase tracking-wider pl-1">Theme Color</label>
                  <div className="flex items-center h-[46px] bg-surface-50 border border-surface-200 rounded-xl px-3 gap-2">
                    {colorOptions.map(opt => (
                      <button
                        key={opt.hue}
                        type="button"
                        onClick={() => setSelectedHue(opt.hue)}
                        className={`h-6 w-6 rounded-full ${opt.bgClass} border-2 transition-all cursor-pointer flex-shrink-0 ${
                          selectedHue === opt.hue 
                            ? 'border-surface-900 scale-110 shadow-md ring-2 ring-white' 
                            : 'border-white hover:scale-105'
                        }`}
                        title={opt.hue}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Timeline Section */}
              <div className="space-y-3 border-t border-surface-100 pt-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-surface-600 uppercase tracking-wider pl-1">Project Timeline (Milestones)</label>
                  <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full border border-indigo-100">
                    {timeline.length} {timeline.length === 1 ? 'Milestone' : 'Milestones'}
                  </span>
                </div>
                
                {/* List of currently added milestones */}
                {timeline.length > 0 ? (
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {timeline.map((m, idx) => (
                      <div key={idx} className="flex justify-between items-start bg-surface-50 p-3 rounded-2xl border border-surface-200/60 text-xs shadow-sm">
                        <div className="space-y-1">
                          <p className="font-bold text-surface-900">{m.title}</p>
                          {m.details && <p className="text-surface-500 leading-normal">{m.details}</p>}
                          <p className="text-brand-600 font-semibold flex items-center gap-1 mt-1">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-500" />
                            Due: {m.date}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTimeline(timeline.filter((_, i) => i !== idx))}
                          className="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Remove Milestone"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-surface-50/50 border border-dashed border-surface-300 rounded-2xl p-4 text-center">
                    <p className="text-xs text-surface-500 italic">No milestones added yet. Add milestones below to configure the timeline.</p>
                  </div>
                )}

                {/* Inline Add Milestone Form */}
                <div className="bg-surface-50 border border-surface-200/80 rounded-2xl p-4 space-y-3">
                  <p className="text-xs font-bold text-surface-700 uppercase tracking-wider">Add Milestone</p>
                  
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="e.g. Topic Selection & Approval"
                      value={newMilestoneTitle}
                      onChange={(e) => setNewMilestoneTitle(e.target.value)}
                      className="w-full bg-white border border-surface-200 rounded-xl p-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                    />
                    
                    <textarea
                      placeholder="Instructions/description for students (optional)"
                      rows={2}
                      value={newMilestoneDetails}
                      onChange={(e) => setNewMilestoneDetails(e.target.value)}
                      className="w-full bg-white border border-surface-200 rounded-xl p-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/50 resize-none"
                    />
                    
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <input
                          type="date"
                          value={newMilestoneDate}
                          onChange={(e) => setNewMilestoneDate(e.target.value)}
                          className="w-full bg-white border border-surface-200 rounded-xl p-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/50 h-[38px]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddMilestone}
                        disabled={!newMilestoneTitle.trim()}
                        className="bg-indigo-600 disabled:opacity-50 text-white px-4 rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Plus size={14} /> Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 border-t border-surface-100 pt-5">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 bg-surface-100 hover:bg-surface-200 text-surface-700 px-6 py-3 rounded-xl font-medium transition-colors cursor-pointer text-center text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!projectName.trim() || isSubmitting}
                  className="flex-1 bg-brand-600 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-medium shadow-md shadow-brand-500/20 hover:bg-brand-700 transition-colors active:scale-95 cursor-pointer text-center text-sm"
                >
                  {isSubmitting ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
