import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authenticatedFetch } from '@/lib/api';
import { logout } from '@/lib/auth';
import { Link } from 'react-router-dom';
import { Shield, Activity, UserPlus, Settings, AlertTriangle, Briefcase, Building2, Sparkles, FolderUp, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { jwtDecode } from 'jwt-decode';
import SendInterviewLinkModal from '@/components/admin/SendInterviewLinkModal';

interface AdminStats {
  failedLoginAttempts: number;
  activeSessions: number;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLead, setIsLead] = useState(false);
  const [isInterviewModalOpen, setIsInterviewModalOpen] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [failed, sessions] = await Promise.all([
          authenticatedFetch('/api/admin/logins/failed'),
          authenticatedFetch('/api/admin/sessions/active'),
        ]);

        if (!failed.ok || !sessions.ok) {
          throw new Error('Failed to fetch admin stats');
        }

        const failedData = await failed.json();
        const sessionsData = await sessions.json();

        setStats({
          failedLoginAttempts: failedData.length,
          activeSessions: sessionsData.length,
        });
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        }
      }
    };

    // 🚀 Fetch immediately on load
    fetchStats();

    // Check if lead
    const token = localStorage.getItem('accessToken');
    if (token) {
      try {
        const decoded: any = jwtDecode(token);
        setIsLead(decoded.role === 'lead');
      } catch (err) {
        // ignore
      }
    }

    // 🔁 Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);

    // 🧹 Clean up on component unmount
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <div className="bg-card border-b border-border p-4 md:hidden sticky top-0 z-40">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-800">Admin</h1>
          </div>
          <button
            className="relative w-10 h-10 flex items-center justify-center focus:outline-none group"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <div className="w-6 h-5 relative flex flex-col justify-between">
              <span className={`w-full h-0.5 bg-slate-800 rounded-full transition-all duration-300 ease-in-out ${mobileMenuOpen ? 'rotate-45 translate-y-2' : ''
                } group-hover:bg-blue-600`}></span>
              <span className={`w-full h-0.5 bg-slate-800 rounded-full transition-all duration-300 ease-in-out ${mobileMenuOpen ? 'opacity-0' : 'opacity-100'
                } group-hover:bg-blue-600`}></span>
              <span className={`w-full h-0.5 bg-slate-800 rounded-full transition-all duration-300 ease-in-out ${mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''
                } group-hover:bg-blue-600`}></span>
            </div>
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-300"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Menu */}
      <div className={`fixed top-16 right-0 w-72 h-[calc(100vh-4rem)] bg-card border-l border-border shadow-2xl z-50 md:hidden transition-transform duration-300 ease-in-out ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}>
        <div className="p-6 space-y-4">
          <Button
            onClick={() => {
              navigate('/');
              setMobileMenuOpen(false);
            }}
            variant="outline"
            className="w-full justify-start hover:bg-slate-100 hover:translate-x-1 transition-all duration-200"
          >
            Back to Home
          </Button>
          <Button
            onClick={() => {
              navigate('/dashboard');
              setMobileMenuOpen(false);
            }}
            variant="outline"
            className="w-full justify-start hover:bg-slate-100 hover:translate-x-1 transition-all duration-200"
          >
            User Dashboard
          </Button>
          <div className="border-t border-border pt-4 space-y-2">
            <Link to="/admin/users/manage" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start hover:bg-slate-100 hover:translate-x-1 transition-all duration-200">
                Manage Users
              </Button>
            </Link>
            <Link to="/admin/users/create" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start hover:bg-slate-100 hover:translate-x-1 transition-all duration-200">
                Create User
              </Button>
            </Link>
            <Link to="/admin/logins/recent" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start hover:bg-slate-100 hover:translate-x-1 transition-all duration-200">
                Recent Logins
              </Button>
            </Link>
            <Link to="/admin/clients" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start hover:bg-slate-100 hover:translate-x-1 transition-all duration-200">
                Manage Clients
              </Button>
            </Link>
            <Link to="/admin/jobs" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start hover:bg-slate-100 hover:translate-x-1 transition-all duration-200">
                Manage Jobs
              </Button>
            </Link>
            <Link to="/admin/resumes" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="ghost" className="w-full justify-start hover:bg-slate-100 hover:translate-x-1 transition-all duration-200">
                AI Resumes
              </Button>
            </Link>
          </div>
          <Button
            onClick={() => {
              logout();
              setMobileMenuOpen(false);
            }}
            variant="outline"
            className="w-full justify-start hover:bg-red-50 hover:text-red-600 hover:translate-x-1 transition-all duration-200"
          >
            Logout
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-8">

        {/* Desktop Back Button */}
        <div className="mb-4 hidden md:block">
          <Button variant="ghost" onClick={() => navigate('/dashboard')} className="text-muted-foreground -ml-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to User Dashboard
          </Button>
        </div>

        {/* Desktop Header */}
        <div className="mb-8 hidden md:block">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-8 h-8 text-blue-600" />
            <h1 className="text-4xl font-bold text-slate-800">Security Dashboard</h1>
          </div>
          <p className="text-muted-foreground ml-11">Monitor and manage your application's security</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg animate-in slide-in-from-left">
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">

          {/* Failed Logins */}
          <Link to="/admin/logins/failed" className="group">
            <div className="bg-card rounded-xl shadow-sm border border-border p-6 transition-all duration-300 hover:shadow-lg hover:border-red-300 hover:-translate-y-1">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-red-50 rounded-lg group-hover:bg-red-100 transition-colors">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-full">24h</span>
              </div>
              <h3 className="text-muted-foreground text-sm font-medium mb-2">Suspicious Failed Logins</h3>
              <p className="text-4xl font-bold text-slate-800 mb-3">
                {stats ? stats.failedLoginAttempts : <span className="animate-pulse">...</span>}
              </p>
              <div className="flex items-center text-sm text-red-600 font-medium group-hover:gap-2 transition-all">
                <span>View Details</span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </div>
            </div>
          </Link>

          {/* Active Sessions */}
          <Link to="/admin/sessions/active" className="group">
            <div className="bg-card rounded-xl shadow-sm border border-border p-6 transition-all duration-300 hover:shadow-lg hover:border-blue-300 hover:-translate-y-1">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                  <Activity className="w-6 h-6 text-blue-600" />
                </div>
                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">Live</span>
              </div>
              <h3 className="text-muted-foreground text-sm font-medium mb-2">Multiple Active Sessions</h3>
              <p className="text-4xl font-bold text-slate-800 mb-3">
                {stats ? stats.activeSessions : <span className="animate-pulse">...</span>}
              </p>
              <div className="flex items-center text-sm text-blue-600 font-medium group-hover:gap-2 transition-all">
                <span>View Details</span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </div>
            </div>
          </Link>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">

          {/* Recent Logins */}
          <Link to="/admin/logins/recent" className="group">
            <div className="bg-card rounded-xl shadow-sm border border-border p-6 transition-all duration-300 hover:shadow-lg hover:border-slate-300 hover:-translate-y-1 h-full">
              <div className="p-3 bg-background rounded-lg w-fit mb-4 group-hover:bg-slate-100 transition-colors">
                <Activity className="w-6 h-6 text-slate-700" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Recent Login Activity</h3>
              <p className="text-muted-foreground text-sm mb-4">View a live feed of all login attempts and track user access patterns.</p>
              <div className="flex items-center text-sm text-slate-700 font-medium group-hover:gap-2 transition-all">
                <span>View Logs</span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </div>
            </div>
          </Link>

          {/* Create User */}
          <Link to="/admin/users/create" className="group">
            <div className="bg-card rounded-xl shadow-sm border border-border p-6 transition-all duration-300 hover:shadow-lg hover:border-green-300 hover:-translate-y-1 h-full">
              <div className="p-3 bg-green-50 rounded-lg w-fit mb-4 group-hover:bg-green-100 transition-colors">
                <UserPlus className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Create New User</h3>
              <p className="text-muted-foreground text-sm mb-4">Create a new user account and assign appropriate roles and permissions.</p>
              <div className="flex items-center text-sm text-green-600 font-medium group-hover:gap-2 transition-all">
                <span>Create User</span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </div>
            </div>
          </Link>

          {/* Manage Users */}
          <Link to="/admin/users/manage" className="group">
            <div className="bg-card rounded-xl shadow-sm border border-border p-6 transition-all duration-300 hover:shadow-lg hover:border-purple-300 hover:-translate-y-1 h-full">
              <div className="p-3 bg-purple-50 rounded-lg w-fit mb-4 group-hover:bg-purple-100 transition-colors">
                <Settings className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Manage Users</h3>
              <p className="text-muted-foreground text-sm mb-4">Update user roles, modify permissions, or disable user accounts.</p>
              <div className="flex items-center text-sm text-purple-600 font-medium group-hover:gap-2 transition-all">
                <span>Manage Users</span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </div>
            </div>
          </Link>

          {/* Manage Clients */}
          <Link to="/admin/clients" className="group">
            <div className="bg-card rounded-xl shadow-sm border border-border p-6 transition-all duration-300 hover:shadow-lg hover:border-orange-300 hover:-translate-y-1 h-full">
              <div className="p-3 bg-orange-50 rounded-lg w-fit mb-4 group-hover:bg-orange-100 transition-colors">
                <Building2 className="w-6 h-6 text-orange-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Manage Clients</h3>
              <p className="text-muted-foreground text-sm mb-4">Create and manage client companies in the recruitment system.</p>
              <div className="flex items-center text-sm text-orange-600 font-medium group-hover:gap-2 transition-all">
                <span>Manage Clients</span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </div>
            </div>
          </Link>

          {/* Manage Jobs */}
          <Link to="/admin/jobs" className="group">
            <div className="bg-card rounded-xl shadow-sm border border-border p-6 transition-all duration-300 hover:shadow-lg hover:border-cyan-300 hover:-translate-y-1 h-full">
              <div className="p-3 bg-cyan-50 rounded-lg w-fit mb-4 group-hover:bg-cyan-100 transition-colors">
                <Briefcase className="w-6 h-6 text-cyan-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Manage Jobs</h3>
              <p className="text-muted-foreground text-sm mb-4">Create and manage job openings for your clients.</p>
              <div className="flex items-center text-sm text-cyan-600 font-medium group-hover:gap-2 transition-all">
                <span>Manage Jobs</span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </div>
            </div>
          </Link>

          {/* AI Upload */}
          {!isLead && (
            <Link to="/admin/resumes/upload" className="group">
              <div className="bg-card rounded-xl shadow-sm border border-border p-6 transition-all duration-300 hover:shadow-lg hover:border-indigo-300 hover:-translate-y-1 h-full">
                <div className="p-3 bg-indigo-50 rounded-lg w-fit mb-4 group-hover:bg-indigo-100 transition-colors">
                  <Sparkles className="w-6 h-6 text-indigo-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">Single Resume Upload</h3>
                <p className="text-muted-foreground text-sm mb-4">Upload one resume for AI-powered parsing and semantic matching.</p>
                <div className="flex items-center text-sm text-indigo-600 font-medium group-hover:gap-2 transition-all">
                  <span>Single Upload</span>
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                </div>
              </div>
            </Link>
          )}

          {/* Bulk Upload */}
          {!isLead && (
            <Link to="/admin/resumes/bulk-upload" className="group">
              <div className="bg-card rounded-xl shadow-sm border border-border p-6 transition-all duration-300 hover:shadow-lg hover:border-violet-300 hover:-translate-y-1 h-full">
                <div className="p-3 bg-violet-50 rounded-lg w-fit mb-4 group-hover:bg-violet-100 transition-colors">
                  <FolderUp className="w-6 h-6 text-violet-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">Bulk Resume Upload</h3>
                <p className="text-muted-foreground text-sm mb-4">Upload up to 1000 resumes with parallel AI processing.</p>
                <div className="flex items-center text-sm text-violet-600 font-medium group-hover:gap-2 transition-all">
                  <span>Bulk Upload</span>
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                </div>
              </div>
            </Link>
          )}

          {/* Send Notification */}
          {!isLead && (
            <Link to="/admin/notifications" className="group">
              <div className="bg-card rounded-xl shadow-sm border border-border p-6 transition-all duration-300 hover:shadow-lg hover:border-rose-300 hover:-translate-y-1 h-full">
                <div className="p-3 bg-rose-50 rounded-lg w-fit mb-4 group-hover:bg-rose-100 transition-colors">
                  <Sparkles className="w-6 h-6 text-rose-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">Send Notification</h3>
                <p className="text-muted-foreground text-sm mb-4">Broadcast important updates to all vendors and recruiters from a single place.</p>
                <div className="flex items-center text-sm text-rose-600 font-medium group-hover:gap-2 transition-all">
                  <span>Open Notification Center</span>
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                </div>
              </div>
            </Link>
          )}

          {/* Send Secure Interview Link */}
          <div 
            onClick={() => setIsInterviewModalOpen(true)}
            className="group cursor-pointer bg-card rounded-xl shadow-sm border border-border p-6 transition-all duration-300 hover:shadow-lg hover:border-blue-400 hover:-translate-y-1 h-full"
          >
            <div className="p-3 bg-blue-50 rounded-lg w-fit mb-4 group-hover:bg-blue-100 transition-colors">
              <Shield className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2 font-outfit">Send Interview Link</h3>
            <p className="text-muted-foreground text-sm mb-4">Search candidate and send a secure, one-time interview link.</p>
            <div className="flex items-center text-sm text-blue-600 font-medium group-hover:gap-2 transition-all">
              <span>Send Link</span>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
            </div>
          </div>

        </div>

        <SendInterviewLinkModal 
          isOpen={isInterviewModalOpen} 
          onClose={() => setIsInterviewModalOpen(false)} 
        />
      </div>
    </div>
  );
}
