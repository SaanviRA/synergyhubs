import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Monitor, Plus, Link as LinkIcon, Search, Trash2, LayoutDashboard, MessageSquare } from 'lucide-react';
import WorkspaceChat from '../components/WorkspaceChat';
import { getGoogleCredentials } from '../utils/googleDriveConfig';

export default function TeacherWorkspaces({ classData, projectData, onBack }) {
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newType, setNewType] = useState('figma');
  const [searchQuery, setSearchQuery] = useState('');
  const [creds] = useState(getGoogleCredentials());
  const pickerNodeRef = useRef(null);
  const [isPickerActive, setIsPickerActive] = useState(false);

  const storageKey = projectData && projectData.id ? `workspaces_${projectData.id}` : 'workspaces_default';

  const [workspaces, setWorkspaces] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // The workspace whose chat is open in the right sidebar
  const [chatWorkspace, setChatWorkspace] = useState(null);
  const closeChat = useCallback(() => setChatWorkspace(null), []);

  const fetchWorkspaces = useCallback(async () => {
    if (!projectData?.id) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${projectData.id}/workspaces`);
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data);
      }
    } catch (err) {
      console.error('Error fetching workspaces:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectData?.id]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const handleOpenChat = (ws, e) => {
    e.preventDefault();
    e.stopPropagation();
    setChatWorkspace((current) => (current?.id === ws.id ? null : ws));
  };

  const handleDeleteWorkspace = async (workspaceToDelete, e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/workspaces/${workspaceToDelete.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setChatWorkspace((current) => (current?.id === workspaceToDelete.id ? null : current));
        await fetchWorkspaces();
      }
    } catch (err) {
      console.error('Error deleting workspace:', err);
    }
  };

  const handleSaveWorkspace = async () => {
    if (!newUrl.trim()) return;
    
    let defaultTitle = newUrl.replace(/^https?:\/\//, '').split('/')[0] || newUrl;
    if (defaultTitle.length > 30) defaultTitle = defaultTitle.substring(0, 30) + '...';

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${projectData.id}/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim() || defaultTitle || 'New Workspace',
          type: newType,
          url: newUrl
        })
      });
      if (res.ok) {
        await fetchWorkspaces();
        setNewUrl('');
        setNewTitle('');
        setNewType('figma');
        setShowUploadForm(false);
      }
    } catch (err) {
      console.error('Error saving workspace:', err);
    }
  };

  const handleOpenDrivePicker = () => {
    if (!creds.clientId || !creds.appId || !creds.developerKey) {
      alert('Google Drive integration is not configured. Please define VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_APP_ID, and VITE_GOOGLE_API_KEY in your .env file.');
      return;
    }
    setIsPickerActive(true);
  };

  useEffect(() => {
    if (!isPickerActive) return;
    const node = pickerNodeRef.current;
    if (!node) return;

    const openTimer = setTimeout(() => {
      if (node && typeof node.open === 'function') {
        node.open();
      }
    }, 0);

    const handlePicked = (event) => {
      const selectedDocs = event.detail.docs;
      if (selectedDocs && selectedDocs.length > 0) {
        const doc = selectedDocs[0];
        setNewTitle(doc.name || '');
        setNewUrl(doc.url || '');
        setNewType('drive');
      }
      setIsPickerActive(false);
    };

    const handleCanceled = () => {
      setIsPickerActive(false);
    };

    node.addEventListener('picker:picked', handlePicked);
    node.addEventListener('picker:canceled', handleCanceled);

    return () => {
      clearTimeout(openTimer);
      node.removeEventListener('picker:picked', handlePicked);
      node.removeEventListener('picker:canceled', handleCanceled);
    };
  }, [isPickerActive, setNewTitle, setNewUrl, setNewType, setIsPickerActive]);

  const getIcon = (type) => {
    switch(type) {
      case 'figma': return <Monitor className="text-purple-500" size={24} />;
      case 'drive': return <LayoutDashboard className="text-emerald-500" size={24} />;
      case 'miro': return <LayoutDashboard className="text-amber-500" size={24} />;
      case 'github': return <Monitor className="text-surface-800" size={24} />;
      default: return <LinkIcon className="text-brand-500" size={24} />;
    }
  };

  const fuzzyMatch = (text, query) => {
    let tIdx = 0;
    let qIdx = 0;
    const t = text.toLowerCase();
    const q = query.toLowerCase();
    while (tIdx < t.length && qIdx < q.length) {
      if (t[tIdx] === q[qIdx]) qIdx++;
      tIdx++;
    }
    return qIdx === q.length;
  };

  const filteredWorkspaces = workspaces.filter(ws => {
    if (!searchQuery.trim()) return true;
    const searchTarget = `${ws.title} ${ws.creator} ${ws.type}`.toLowerCase();
    return fuzzyMatch(searchTarget, searchQuery.trim());
  });

  return (
    <div className={`transition-[padding] duration-200 ${chatWorkspace ? 'lg:pr-96' : ''}`}>
    <div className="pt-6 sm:pt-24 pb-24 px-4 max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Back Navigation */}
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-surface-500 hover:text-surface-900 transition-colors mb-2 group"
      >
        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        <span className="font-medium">Back to Projects</span>
      </button>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-2">
        <div>
          <div className="inline-flex items-center space-x-2 bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-indigo-200 mb-2">
            <span>Teacher Portal</span>
          </div>
          <h1 className="text-3xl font-heading font-bold text-surface-900 tracking-tight font-bold">Workspaces (Teacher View)</h1>
          <p className="text-surface-600 mt-1">{projectData ? projectData.name : 'Active workspaces and environments'}</p>
        </div>
        
        {showUploadForm ? (
          <div className="w-full sm:w-auto bg-surface-50 p-4 rounded-xl border border-surface-200 mt-4 sm:mt-0 shadow-sm space-y-3 animate-in slide-in-from-top-2 duration-200">
            <div className="flex flex-col sm:flex-row gap-2">
              <select 
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="bg-white border border-surface-200 rounded-lg px-3 py-2 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/50 shrink-0 cursor-pointer"
              >
                <option value="figma">Figma</option>
                <option value="drive">Google Drive</option>
                <option value="miro">Miro</option>
                <option value="github">GitHub</option>
                <option value="other">Other</option>
              </select>
              {newType === 'drive' && (
                <button
                  type="button"
                  onClick={handleOpenDrivePicker}
                  className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-2 text-sm font-semibold text-emerald-800 focus:outline-none transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <svg className="w-4 h-4" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                    <path fill="#34A853" d="M16.002 12.451L12.541 6.343C12.656 6.226 12.788 6.150 12.920 6.098C11.900 6.434 11.432 7.580 11.432 7.580L5.109 18.735C5.020 19.084 4.995 19.400 5.006 19.678H11.907L16.002 12.451Z"/>
                    <path fill="#FBBC05" d="M16.002 12.451L20.097 19.678H26.998C27.009 19.400 26.984 19.084 26.895 18.735L20.572 7.580C20.572 7.580 20.103 6.434 19.084 6.098C19.215 6.150 19.348 6.226 19.463 6.343L16.002 12.451Z"/>
                    <path fill="#4285F4" d="M11.908 19.678L8.487 25.717C8.487 25.717 8.373 25.661 8.219 25.547C8.704 25.921 9.176 26.000 9.176 26.000H22.613C23.355 26.000 23.509 25.717 23.509 25.717L20.097 19.678H11.908Z"/>
                  </svg>
                  <span>Select Folder/File</span>
                </button>
              )}
              <input 
                type="text" 
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveWorkspace()}
                placeholder="Workspace title (optional)" 
                className="w-full sm:max-w-[200px] bg-white border border-surface-200 rounded-lg px-3 py-2 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
              />
              <input 
                type="url" 
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveWorkspace()}
                placeholder="Paste URL here..." 
                className="flex-1 bg-white border border-surface-200 rounded-lg px-3 py-2 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/50 min-w-[200px]" 
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowUploadForm(false)} className="px-3 py-1.5 text-xs font-semibold text-surface-600 hover:bg-surface-200 rounded-lg transition-colors cursor-pointer">Cancel</button>
              <button 
                onClick={handleSaveWorkspace}
                disabled={!newUrl.trim()}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shadow-sm cursor-pointer"
              >
                Save Workspace
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 w-full sm:w-auto mt-4 sm:mt-0">
            <button 
              onClick={() => setShowUploadForm(true)}
              className="flex-1 sm:flex-none bg-indigo-600 text-white px-4 py-2 flex items-center justify-center gap-2 rounded-xl font-medium shadow-md shadow-indigo-500/20 hover:bg-indigo-700 transition-colors active:scale-[0.98] cursor-pointer"
            >
              <Plus size={18} className="text-indigo-100" />
              <span>Add Workspace</span>
            </button>
          </div>
        )}
      </div>

      {workspaces.length === 0 ? (
        <div className="glass rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-4">
          <div className="h-16 w-16 bg-brand-50 rounded-full flex items-center justify-center text-brand-500 mb-2 shadow-inner border border-brand-100">
            <Monitor size={32} />
          </div>
          <h2 className="text-2xl font-bold text-surface-900">Workspaces Coming Soon</h2>
          <p className="text-surface-500 max-w-md text-lg leading-relaxed">
            Students have not added workspaces for this project yet.
          </p>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" size={20} />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search workspaces..." 
              className="w-full pl-10 pr-4 py-3 glass rounded-xl border border-surface-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-surface-900"
            />
          </div>

          <div className="grid gap-3">
            {filteredWorkspaces.map((ws, i) => (
              <a 
                key={i} 
                href={ws.url || '#'} 
                target={ws.url ? "_blank" : "_self"}
                rel="noopener noreferrer"
                className={`glass rounded-xl p-4 flex items-center gap-4 hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer group ${
                  chatWorkspace?.id === ws.id ? 'ring-2 ring-indigo-500/60' : ''
                }`}
              >
                <div className="p-3 bg-white rounded-lg border border-surface-100 group-hover:border-surface-200 transition-colors">
                  {getIcon(ws.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-surface-900 truncate">{ws.title}</h3>
                  <p className="text-sm text-surface-500 flex items-center gap-2">
                    <span>{ws.creator}</span>
                    <span>•</span>
                    <span>{ws.date}</span>
                  </p>
                </div>
                <div className={`flex items-center gap-2 group-hover:opacity-100 transition-all z-10 ${
                  chatWorkspace?.id === ws.id ? 'opacity-100' : 'opacity-0'
                }`}>
                  <button
                    onClick={(e) => handleOpenChat(ws, e)}
                    className={`p-2 rounded-lg transition-colors cursor-pointer ${
                      chatWorkspace?.id === ws.id
                        ? 'text-indigo-600 bg-indigo-50'
                        : 'text-surface-400 hover:text-indigo-600 hover:bg-indigo-50'
                    }`}
                    title="Chat about this document"
                  >
                    <MessageSquare size={18} />
                  </button>
                  <div className="hidden sm:flex text-indigo-600 px-3 py-1 rounded-full bg-indigo-50 text-sm font-medium">
                    Open
                  </div>
                  <button
                    onClick={(e) => handleDeleteWorkspace(ws, e)}
                    className="p-2 text-surface-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Delete workspace"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </a>
            ))}
          </div>
        </>
      )}

      {/* Google Drive Integration Elements */}
      {isPickerActive && creds.clientId && creds.appId && creds.developerKey && (
        <drive-picker
          ref={pickerNodeRef}
          client-id={creds.clientId}
          app-id={creds.appId}
          developer-key={creds.developerKey}
          select-folder-enabled="true"
        >
          <drive-picker-docs-view
            owned-by-me="true"
          />
        </drive-picker>
      )}
    </div>

    {chatWorkspace && (
      <WorkspaceChat key={chatWorkspace.id} workspace={chatWorkspace} onClose={closeChat} accent="indigo" />
    )}
    </div>
  );
}
