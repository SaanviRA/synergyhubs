import React, { useState, useEffect } from 'react';
import { BottomNav } from './components/layout/BottomNav';
import Dashboard from './pages/Dashboard';
import Milestones from './pages/Milestones';
import Resources from './pages/Resources';
import Team from './pages/Team';
import ClassList from './pages/ClassList';
import ProjectList from './pages/ProjectList';
import Workspaces from './pages/Workspaces';
import Account from './pages/Account';
import Login from './pages/Login';
import RoleSelection from './pages/RoleSelection';

// Teacher components
import TeacherClassList from './pages/TeacherClassList';
import TeacherProjectList from './pages/TeacherProjectList';
import TeacherDashboard from './pages/TeacherDashboard';
import TeacherMilestones from './pages/TeacherMilestones';
import TeacherResources from './pages/TeacherResources';
import TeacherWorkspaces from './pages/TeacherWorkspaces';
import TeacherTeam from './pages/TeacherTeam';
import AdminUsers from './pages/AdminUsers';


function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [showAccount, setShowAccount] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [userAvatar, setUserAvatar] = useState('JD');
  const [selectedRole, setSelectedRole] = useState(() => {
    return localStorage.getItem('selectedRole') || null;
  });

  const isTeacher = user?.role === 'teacher';

  // The project cards show the class as it was when it was opened, so reload it each time the
  // project list comes back into view: progress may have changed (here or by a teammate) since.
  const classId = selectedClass?.id;
  const showingProjectList = Boolean(classId) && !selectedProject;
  useEffect(() => {
    if (!showingProjectList) return;
    let active = true;
    const refresh = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
        const res = await fetch(`${apiUrl}/api/classes`);
        if (!res.ok) return;
        const fresh = (await res.json()).find((cls) => cls.id === classId);
        if (fresh && active) {
          setSelectedClass((prev) => (prev?.id === fresh.id ? { ...prev, ...fresh } : prev));
        }
      } catch (err) {
        console.error('Error refreshing class:', err);
      }
    };
    refresh();
    return () => {
      active = false;
    };
  }, [showingProjectList, classId]);

  // Unread workspace chat messages in the open project, shown on the Workspaces tab
  const [workspaceUnread, setWorkspaceUnread] = useState(0);
  const projectId = selectedProject?.id;
  useEffect(() => {
    setWorkspaceUnread(0);
    if (!projectId) return;
    let active = true;
    const load = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
        const res = await fetch(`${apiUrl}/api/projects/${projectId}/workspaces/unread`);
        if (res.ok && active) setWorkspaceUnread((await res.json()).total);
      } catch {
        // Keep the last count; the next poll will try again
      }
    };
    load();
    const timer = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [projectId]);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('authToken');
      if (!token) {
        setAuthLoading(false);
        return;
      }
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
        const res = await fetch(`${apiUrl}/api/users/me`);
        if (res.ok) {
          const data = await res.json();
          setUser(data);
          setUserAvatar(data.avatar || 'JD');
          if (data.role) {
            setSelectedRole(data.role);
            localStorage.setItem('selectedRole', data.role);
          }
        } else {
          // Token expired or invalid
          localStorage.removeItem('authToken');
          localStorage.removeItem('selectedRole');
          setUser(null);
          setSelectedRole(null);
        }
      } catch (err) {
        console.error('Error verifying auth token:', err);
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [showAccount]);

  const handleLogout = () => {
    // Lets admins who asked for it hear about the logout. The fetch interceptor reads the token
    // before it is removed below, and a failure here never stops the logout.
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
    fetch(`${apiUrl}/api/auth/logout`, { method: 'POST', keepalive: true }).catch(() => {});
    localStorage.removeItem('authToken');
    localStorage.removeItem('selectedRole');
    setUser(null);
    setSelectedRole(null);
    setShowAccount(false);
    setShowAdmin(false);
    setSelectedClass(null);
    setSelectedProject(null);
  };

  const renderContent = () => {
    if (showAccount && showAdmin) {
      return <AdminUsers onBack={() => setShowAdmin(false)} />;
    }
    if (showAccount) {
      return (
        <Account
          onBack={() => setShowAccount(false)}
          onLogout={handleLogout}
          onOpenAdmin={() => setShowAdmin(true)}
        />
      );
    }

    if (!selectedClass) {
      if (isTeacher) {
        return <TeacherClassList onSelectClass={(cls) => setSelectedClass(cls)} />;
      }
      return <ClassList onSelectClass={(cls) => setSelectedClass(cls)} />;
    }
    
    if (!selectedProject) {
      if (isTeacher) {
        return (
          <TeacherProjectList 
            classData={selectedClass} 
            onSelectProject={(proj) => setSelectedProject(proj)} 
            onBack={() => setSelectedClass(null)} 
            onUpdateClass={(updatedClass) => setSelectedClass(updatedClass)}
          />
        );
      }
      // A student who created the class owns it and can add projects to it
      if (selectedClass.role === 'teacher') {
        return (
          <TeacherProjectList 
            classData={selectedClass} 
            isStudentOwner
            onSelectProject={(proj) => {
              // Record the visit, as the student project list does
              fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${proj.id}/visit`, {
                method: 'POST'
              }).catch(err => console.error('Error recording project visit:', err));
              setSelectedProject(proj);
            }} 
            onBack={() => setSelectedClass(null)} 
            onUpdateClass={(updatedClass) => setSelectedClass(updatedClass)}
          />
        );
      }
      return (
        <ProjectList 
          classData={selectedClass} 
          onSelectProject={(proj) => setSelectedProject(proj)} 
          onBack={() => setSelectedClass(null)} 
          onUpdateClass={(updatedClass) => setSelectedClass(updatedClass)}
        />
      );
    }

    // Keep the project's card in the class in step too, so it is current when going back
    const handleUpdateProject = (updatedFields) => {
      setSelectedProject((prev) => (prev ? { ...prev, ...updatedFields } : prev));
      setSelectedClass((prev) =>
        prev?.projects
          ? {
              ...prev,
              projects: prev.projects.map((p) => (p.id === selectedProject.id ? { ...p, ...updatedFields } : p)),
            }
          : prev
      );
    };

    if (isTeacher) {
      switch (activeTab) {
        case 'Dashboard':
          return (
            <TeacherDashboard 
              classData={selectedClass} 
              projectData={selectedProject} 
              onBack={() => setSelectedProject(null)} 
              onNavigate={setActiveTab}
              onUpdateProject={handleUpdateProject}
            />
          );
        case 'Timeline':
          return (
            <TeacherMilestones 
              classData={selectedClass} 
              projectData={selectedProject} 
              onBack={() => setSelectedProject(null)} 
              onNavigate={setActiveTab}
              onUpdateProject={handleUpdateProject}
            />
          );
        case 'Resources':
          return <TeacherResources classData={selectedClass} projectData={selectedProject} onBack={() => setSelectedProject(null)} />;
        case 'Workspaces':
          return <TeacherWorkspaces classData={selectedClass} projectData={selectedProject} onBack={() => setSelectedProject(null)} onUnreadChange={setWorkspaceUnread} />;
        case 'Team':
          return (
            <TeacherTeam 
              classData={selectedClass} 
              projectData={selectedProject} 
              onBack={() => setSelectedProject(null)} 
              onNavigate={setActiveTab}
              onUpdateProject={handleUpdateProject}
            />
          );
        default:
          return (
            <TeacherDashboard 
              classData={selectedClass} 
              projectData={selectedProject} 
              onBack={() => setSelectedProject(null)} 
              onNavigate={setActiveTab}
              onUpdateProject={handleUpdateProject}
            />
          );
      }
    }

    switch (activeTab) {
      case 'Dashboard':
        return (
          <Dashboard 
            classData={selectedClass} 
            projectData={selectedProject} 
            onBack={() => setSelectedProject(null)} 
            onNavigate={setActiveTab}
            onUpdateProject={handleUpdateProject}
          />
        );
      case 'Timeline':
        return (
          <Milestones 
            classData={selectedClass} 
            projectData={selectedProject} 
            onBack={() => setSelectedProject(null)} 
            onNavigate={setActiveTab}
            onUpdateProject={handleUpdateProject}
          />
        );
      case 'Resources':
        return <Resources classData={selectedClass} projectData={selectedProject} onBack={() => setSelectedProject(null)} />;
      case 'Workspaces':
        return <Workspaces classData={selectedClass} projectData={selectedProject} onBack={() => setSelectedProject(null)} onUnreadChange={setWorkspaceUnread} />;
      case 'Team':
        return (
          <Team 
            classData={selectedClass} 
            projectData={selectedProject} 
            onBack={() => setSelectedProject(null)} 
            onNavigate={setActiveTab}
            onUpdateProject={handleUpdateProject}
          />
        );
      default:
        return (
          <Dashboard 
            classData={selectedClass} 
            projectData={selectedProject} 
            onBack={() => setSelectedProject(null)} 
            onNavigate={setActiveTab}
            onUpdateProject={handleUpdateProject}
          />
        );
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="w-8 h-8 text-brand-600 animate-spin border-4 border-solid border-current border-r-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    if (!selectedRole) {
      return (
        <RoleSelection 
          onSelectRole={(role) => {
            setSelectedRole(role);
            localStorage.setItem('selectedRole', role);
          }} 
        />
      );
    }
    return (
      <Login 
        role={selectedRole}
        onBackToRole={() => {
          setSelectedRole(null);
          localStorage.removeItem('selectedRole');
        }}
        onAuthSuccess={(authenticatedUser) => {
          setUser(authenticatedUser);
          setUserAvatar(authenticatedUser.avatar || 'JD');
          if (authenticatedUser.role) {
            setSelectedRole(authenticatedUser.role);
            localStorage.setItem('selectedRole', authenticatedUser.role);
          }
        }} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-surface-50 text-surface-900 pb-20 sm:pb-0 sm:pt-20">
      {selectedProject && !showAccount && (
        <BottomNav 
          activeTab={activeTab} 
          onChange={setActiveTab} 
          onProfileClick={() => setShowAccount(true)} 
          userAvatar={userAvatar}
          badges={{ Workspaces: workspaceUnread }}
        />
      )}
      
      {!showAccount && (
        <button 
          onClick={() => setShowAccount(true)} 
          className={`fixed top-4 right-4 h-10 w-10 sm:h-11 sm:w-11 rounded-full bg-gradient-to-br ${
            isTeacher 
              ? 'from-indigo-100 to-violet-200 text-indigo-700' 
              : 'from-brand-100 to-indigo-200 text-brand-700'
          } font-bold border-2 border-white shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center z-[100] hover:scale-105 active:scale-95 cursor-pointer ${
            selectedProject ? 'sm:hidden' : ''
          }`}
          title={isTeacher ? "View Teacher Account" : "View Account"}
        >
          {userAvatar}
        </button>
      )}

      <main>
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
