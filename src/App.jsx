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


function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [showAccount, setShowAccount] = useState(false);
  const [userAvatar, setUserAvatar] = useState('JD');
  const [selectedRole, setSelectedRole] = useState(() => {
    return localStorage.getItem('selectedRole') || null;
  });

  const isTeacher = user?.role === 'teacher';

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
    localStorage.removeItem('authToken');
    localStorage.removeItem('selectedRole');
    setUser(null);
    setSelectedRole(null);
    setShowAccount(false);
    setSelectedClass(null);
    setSelectedProject(null);
  };

  const renderContent = () => {
    if (showAccount) {
      return <Account onBack={() => setShowAccount(false)} onLogout={handleLogout} />;
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
          />
        );
      }
      return (
        <ProjectList 
          classData={selectedClass} 
          onSelectProject={(proj) => setSelectedProject(proj)} 
          onBack={() => setSelectedClass(null)} 
        />
      );
    }

    if (isTeacher) {
      switch (activeTab) {
        case 'Dashboard':
          return <TeacherDashboard classData={selectedClass} projectData={selectedProject} onBack={() => setSelectedProject(null)} />;
        case 'Timeline':
          return <TeacherMilestones classData={selectedClass} projectData={selectedProject} onBack={() => setSelectedProject(null)} />;
        case 'Resources':
          return <TeacherResources classData={selectedClass} projectData={selectedProject} onBack={() => setSelectedProject(null)} />;
        case 'Workspaces':
          return <TeacherWorkspaces classData={selectedClass} projectData={selectedProject} onBack={() => setSelectedProject(null)} />;
        case 'Team':
          return <TeacherTeam classData={selectedClass} projectData={selectedProject} onBack={() => setSelectedProject(null)} />;
        default:
          return <TeacherDashboard classData={selectedClass} projectData={selectedProject} onBack={() => setSelectedProject(null)} />;
      }
    }

    switch (activeTab) {
      case 'Dashboard':
        return <Dashboard classData={selectedClass} projectData={selectedProject} onBack={() => setSelectedProject(null)} />;
      case 'Timeline':
        return <Milestones classData={selectedClass} projectData={selectedProject} onBack={() => setSelectedProject(null)} />;
      case 'Resources':
        return <Resources classData={selectedClass} projectData={selectedProject} onBack={() => setSelectedProject(null)} />;
      case 'Workspaces':
        return <Workspaces classData={selectedClass} projectData={selectedProject} onBack={() => setSelectedProject(null)} />;
      case 'Team':
        return <Team classData={selectedClass} projectData={selectedProject} onBack={() => setSelectedProject(null)} />;
      default:
        return <Dashboard classData={selectedClass} projectData={selectedProject} onBack={() => setSelectedProject(null)} />;
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
