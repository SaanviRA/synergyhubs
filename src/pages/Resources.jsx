import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileUp, Link as LinkIcon, FileText, Image as ImageIcon, Search, ArrowLeft, PlayCircle, Trash2 } from 'lucide-react';
import { getGoogleCredentials } from '../utils/googleDriveConfig';

export default function Resources({ classData, projectData, onBack }) {
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newType, setNewType] = useState('website');
  const [searchQuery, setSearchQuery] = useState('');
  const [creds] = useState(getGoogleCredentials());
  const [isPickerActive, setIsPickerActive] = useState(false);

  const pickerNodeRef = useRef(null);

  // Use a project-specific storage key if available
  const storageKey = projectData && projectData.id ? `resources_${projectData.id}` : 'resources_default';

  const [resources, setResources] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchResources = useCallback(async () => {
    if (!projectData?.id) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${projectData.id}/resources`);
      if (res.ok) {
        const data = await res.json();
        setResources(data);
      }
    } catch (err) {
      console.error('Error fetching resources:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectData?.id]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  const handleDeleteResource = async (resourceToDelete, e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/resources/${resourceToDelete.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchResources();
      }
    } catch (err) {
      console.error('Error deleting resource:', err);
    }
  };

  const handleSaveResource = async () => {
    if (!newUrl.trim()) return;
    
    let title = newUrl.replace(/^https?:\/\//, '').split('/')[0] || newUrl;
    if (title.length > 30) title = title.substring(0, 30) + '...';

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${projectData.id}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || 'New Resource',
          type: newType,
          url: newUrl
        })
      });
      if (res.ok) {
        await fetchResources();
        setNewUrl('');
        setNewType('website');
        setShowUploadForm(false);
      }
    } catch (err) {
      console.error('Error saving resource:', err);
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

    // Auto-trigger open when the element mounts (deferred to avoid synchronous render issues)
    const openTimer = setTimeout(() => {
      if (node && typeof node.open === 'function') {
        node.open();
      }
    }, 0);

    const handlePicked = async (event) => {
      const selectedDocs = event.detail.docs;
      if (selectedDocs && selectedDocs.length > 0) {
        try {
          await Promise.all(selectedDocs.map(async (doc) => {
            let type = 'doc';
            const mime = (doc.mimeType || '').toLowerCase();
            if (mime.startsWith('image/')) {
              type = 'image';
            } else if (mime === 'application/vnd.google-apps.video' || mime.startsWith('video/')) {
              type = 'video';
            } else if (mime === 'application/vnd.google-apps.shortcut' || mime.includes('link') || mime.includes('website')) {
              type = 'link';
            }

            await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${projectData.id}/resources`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: doc.name,
                type: type,
                url: doc.url
              })
            });
          }));

          await fetchResources();
        } catch (err) {
          console.error('Error saving picked documents:', err);
        }
      }
      setIsPickerActive(false);
    };

    const handleCanceled = () => {
      console.log('User closed the picker without selecting a file.');
      setIsPickerActive(false);
    };

    node.addEventListener('picker:picked', handlePicked);
    node.addEventListener('picker:canceled', handleCanceled);

    return () => {
      clearTimeout(openTimer);
      node.removeEventListener('picker:picked', handlePicked);
      node.removeEventListener('picker:canceled', handleCanceled);
    };
  }, [isPickerActive, projectData?.id, fetchResources, setIsPickerActive]);

  const getIcon = (type) => {
    switch(type) {
      case 'doc': 
      case 'document': return <FileText className="text-blue-500" size={24} />;
      case 'link': 
      case 'website': return <LinkIcon className="text-brand-500" size={24} />;
      case 'image': return <ImageIcon className="text-emerald-500" size={24} />;
      case 'video': return <PlayCircle className="text-rose-500" size={24} />;
      case 'article': return <FileText className="text-amber-500" size={24} />;
      default: return <FileText className="text-surface-500" size={24} />;
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

  const filteredResources = resources.filter(res => {
    if (!searchQuery.trim()) return true;
    const searchTarget = `${res.title} ${res.uploader} ${res.type}`.toLowerCase();
    return fuzzyMatch(searchTarget, searchQuery.trim());
  });

  return (
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
          <h1 className="text-3xl font-heading font-bold text-surface-900 tracking-tight">Resource Library</h1>
          <p className="text-surface-600 mt-1">{projectData ? projectData.name : 'Shared files, links, and documents'}</p>
        </div>
        {showUploadForm ? (
          <div className="w-full sm:w-auto bg-surface-50 p-4 rounded-xl border border-surface-200 mt-4 sm:mt-0 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <select 
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="bg-white border border-surface-200 rounded-lg px-3 py-2 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/50 shrink-0"
              >
                <option value="website">Website</option>
                <option value="video">Video</option>
                <option value="article">Article</option>
                <option value="document">Document</option>
              </select>
              <input 
                type="url" 
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveResource()}
                placeholder="Paste URL here..." 
                className="flex-1 bg-white border border-surface-200 rounded-lg px-3 py-2 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/50 min-w-[200px]" 
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowUploadForm(false)} className="px-3 py-1.5 text-xs font-semibold text-surface-600 hover:bg-surface-200 rounded-lg transition-colors">Cancel</button>
              <button 
                onClick={handleSaveResource}
                disabled={!newUrl.trim()}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shadow-sm"
              >
                Save Resource
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 w-full sm:w-auto mt-4 sm:mt-0 animate-in fade-in duration-300">
            <button 
              onClick={() => setShowUploadForm(true)}
              className="flex-1 sm:flex-none bg-brand-600 text-white px-4 py-2 flex items-center justify-center gap-2 rounded-xl font-medium shadow-md shadow-brand-500/20 hover:bg-brand-700 transition-colors active:scale-[0.98]"
            >
              <FileUp size={18} className="text-brand-100" />
              <span>Upload Resource</span>
            </button>
            
            <button 
              onClick={handleOpenDrivePicker}
              className="flex-1 sm:flex-none bg-white text-surface-700 border border-surface-200 px-4 py-2 flex items-center justify-center gap-2 rounded-xl font-medium hover:bg-surface-50 hover:border-surface-300 transition-all active:scale-[0.98] shadow-sm cursor-pointer"
            >
              <svg className="w-5 h-5" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <path fill="#34A853" d="M16.002 12.451L12.541 6.343C12.656 6.226 12.788 6.150 12.920 6.098C11.900 6.434 11.432 7.580 11.432 7.580L5.109 18.735C5.020 19.084 4.995 19.400 5.006 19.678H11.907L16.002 12.451Z"/>
                <path fill="#FBBC05" d="M16.002 12.451L20.097 19.678H26.998C27.009 19.400 26.984 19.084 26.895 18.735L20.572 7.580C20.572 7.580 20.103 6.434 19.084 6.098C19.215 6.150 19.348 6.226 19.463 6.343L16.002 12.451Z"/>
                <path fill="#4285F4" d="M11.908 19.678L8.487 25.717C8.487 25.717 8.373 25.661 8.219 25.547C8.704 25.921 9.176 26.000 9.176 26.000H22.613C23.355 26.000 23.509 25.717 23.509 25.717L20.097 19.678H11.908Z"/>
              </svg>
              <span>Google Drive</span>
            </button>
          </div>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" size={20} />
        <input 
          type="text" 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search resources..." 
          className="w-full pl-10 pr-4 py-3 glass rounded-xl border border-surface-200 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all text-surface-900"
        />
      </div>

      <div className="grid gap-3">
        {filteredResources.map((res, i) => (
          <a 
            key={i} 
            href={res.url || '#'} 
            target={res.url ? "_blank" : "_self"}
            rel="noopener noreferrer"
            className="glass rounded-xl p-4 flex items-center gap-4 hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="p-3 bg-white rounded-lg border border-surface-100 group-hover:border-surface-200 transition-colors">
              {getIcon(res.type)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-surface-900 truncate">{res.title}</h3>
              <p className="text-sm text-surface-500 flex items-center gap-2">
                <span>{res.uploader}</span>
                <span>•</span>
                <span>{res.date}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all z-10">
              <div className="hidden sm:flex text-brand-600 px-3 py-1 rounded-full bg-brand-50 text-sm font-medium">
                Open
              </div>
              <button
                onClick={(e) => handleDeleteResource(res, e)}
                className="p-2 text-surface-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                title="Delete resource"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </a>
        ))}
      </div>

      {/* Google Drive Integration Elements */}
      {isPickerActive && creds.clientId && creds.appId && creds.developerKey && (
        <drive-picker
          ref={pickerNodeRef}
          client-id={creds.clientId}
          app-id={creds.appId}
          developer-key={creds.developerKey}
        >
          <drive-picker-docs-view
            owned-by-me="true"
            mime-types="application/pdf,image/png,image/jpeg,application/vnd.google-apps.document,application/vnd.google-apps.spreadsheet,application/vnd.google-apps.presentation"
          />
        </drive-picker>
      )}
    </div>
  );
}
