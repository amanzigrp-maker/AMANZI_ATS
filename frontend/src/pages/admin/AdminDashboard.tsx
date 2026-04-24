import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authenticatedFetch } from '@/lib/api';
import { logout } from '@/lib/auth';
import { Link } from 'react-router-dom';
import { Shield, Fingerprint, UserPlus, Users, AlertTriangle, Briefcase, Building2, Megaphone, Zap, ArrowRight, ArrowLeft, SendHorizontal, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { jwtDecode } from 'jwt-decode';
import SendInterviewLinkModal from '@/components/admin/SendInterviewLinkModal';

interface AdminStats {
  failedLoginAttempts: number;
  activeSessions: number;
}

const ADMIN_DASHBOARD_REFRESH_INTERVAL_MS = 120_000;

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

        const failedCount = failedData.reduce((acc: number, curr: any) => acc + Number(curr.failed_attempts || 0), 0);

        setStats({
          failedLoginAttempts: failedCount,
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
    const interval = setInterval(fetchStats, ADMIN_DASHBOARD_REFRESH_INTERVAL_MS);

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

      <div className="max-w-7xl mx-auto px-8 pt-4 pb-8">

        {/* Desktop Back Button */}
        <div className="mb-3 hidden md:block">
          <Button variant="ghost" onClick={() => navigate('/dashboard')} className="text-slate-500 -ml-4 font-outfit font-semibold hover:bg-slate-50 transition-all flex items-center">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to User Dashboard
          </Button>
        </div>

        {/* Desktop Header */}
        <div className="mb-5 hidden md:block">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-1.5 bg-blue-50 rounded-lg">
              <Shield className="w-7 h-7 text-blue-600" />
            </div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight font-outfit">Security Dashboard</h1>
          </div>
          <p className="text-slate-500 text-sm font-medium ml-11 font-outfit max-w-2xl">Monitor and manage your application's security architecture and access audit logs.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg animate-in slide-in-from-left">
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

          {/* Failed Logins */}
          <Link to="/admin/logins/failed" className="group h-full">
            <div className="bg-card rounded-2xl shadow-sm border border-border p-6 transition-all duration-300 hover:shadow-xl hover:border-red-200 hover:-translate-y-1 flex flex-col h-full">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-red-50 rounded-xl group-hover:bg-red-100 transition-colors">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-full border border-red-100 uppercase tracking-wider">Last 24h</span>
              </div>
              <h3 className="text-slate-500 text-[10px] font-semibold uppercase tracking-widest mb-1 font-outfit">Suspicious Failed Logins</h3>
              <p className="text-4xl font-extrabold text-slate-800 mb-4 font-outfit tracking-tight">
                {stats ? stats.failedLoginAttempts : <span className="animate-pulse">...</span>}
              </p>
              <div className="mt-auto flex items-center text-xs text-red-600 font-bold group-hover:gap-2 transition-all">
                <span>VIEW SECURITY LOGS</span>
                <span className="opacity-0 group-hover:opacity-100 transition-all font-serif">→</span>
              </div>
            </div>
          </Link>

          {/* Active Sessions */}
          <Link to="/admin/sessions/active" className="group h-full">
            <div className="bg-card rounded-2xl shadow-sm border border-border p-6 transition-all duration-300 hover:shadow-xl hover:border-blue-200 hover:-translate-y-1 flex flex-col h-full">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-blue-50 rounded-xl group-hover:bg-blue-100 transition-colors">
                  <Activity className="w-6 h-6 text-blue-600" />
                </div>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100 uppercase tracking-wider">Live Monitoring</span>
              </div>
              <h3 className="text-slate-500 text-[10px] font-semibold uppercase tracking-widest mb-1 font-outfit">Multiple Active Sessions</h3>
              <p className="text-4xl font-extrabold text-slate-800 mb-4 font-outfit tracking-tight">
                {stats ? stats.activeSessions : <span className="animate-pulse">...</span>}
              </p>
              <div className="mt-auto flex items-center text-xs text-blue-600 font-bold group-hover:gap-2 transition-all">
                <span>VIEW ACTIVE SESSIONS</span>
                <span className="opacity-0 group-hover:opacity-100 transition-all font-serif">→</span>
              </div>
            </div>
          </Link>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 cards-container">

          {/* Recent Logins */}
          <Link to="/admin/logins/recent" className="group h-full">
            <div className="bg-card rounded-2xl shadow-sm border border-slate-200 p-6 transition-all duration-500 hover:shadow-2xl hover:border-slate-400 hover:-translate-y-1 h-full flex flex-col items-center text-center group-hover:bg-slate-50/50">
              <div className="p-4 bg-slate-100 rounded-2xl mb-4 group-hover:bg-white group-hover:scale-105 transition-all duration-500 shadow-sm">
                <Fingerprint className="w-7 h-7 text-slate-700" strokeWidth={2.5} />
              </div>
              <h3 className="text-lg font-extrabold text-slate-800 mb-2 font-outfit tracking-tight">Login Activity</h3>
              <p className="text-slate-500 text-xs leading-relaxed mb-6 flex-grow max-w-[180px]">Track all successful and failed user access patterns across the platform.</p>
              <div className="flex items-center gap-2 text-[10px] text-slate-800 font-black tracking-widest uppercase py-2.5 px-5 bg-slate-100 rounded-full group-hover:bg-slate-800 group-hover:text-white transition-all duration-300">
                <span>Explore logs</span>
                <ArrowRight className="w-3 h-3" />
              </div>
            </div>
          </Link>

          {/* Create User */}
          <Link to="/admin/users/create" className="group h-full">
            <div className="bg-card rounded-2xl shadow-sm border border-slate-200 p-6 transition-all duration-500 hover:shadow-2xl hover:border-green-400 hover:-translate-y-1 h-full flex flex-col items-center text-center group-hover:bg-green-50/30">
              <div className="p-4 bg-green-50 rounded-2xl mb-4 group-hover:bg-white group-hover:scale-105 transition-all duration-500 shadow-sm">
                <UserPlus className="w-7 h-7 text-green-600" strokeWidth={2.5} />
              </div>
              <h3 className="text-lg font-extrabold text-slate-800 mb-2 font-outfit tracking-tight">Onboard User</h3>
              <p className="text-slate-500 text-xs leading-relaxed mb-6 flex-grow max-w-[180px]">Provision new recruiter or vendor access with specific roles.</p>
              <div className="flex items-center gap-2 text-[10px] text-green-700 font-black tracking-widest uppercase py-2.5 px-5 bg-green-50 rounded-full group-hover:bg-green-600 group-hover:text-white transition-all duration-300">
                <span>Create User</span>
                <ArrowRight className="w-3 h-3" />
              </div>
            </div>
          </Link>

          {/* Manage Users */}
          <Link to="/admin/users/manage" className="group h-full">
            <div className="bg-card rounded-2xl shadow-sm border border-slate-200 p-6 transition-all duration-500 hover:shadow-2xl hover:border-purple-400 hover:-translate-y-1 h-full flex flex-col items-center text-center group-hover:bg-purple-50/30">
              <div className="p-4 bg-purple-50 rounded-2xl mb-4 group-hover:bg-white group-hover:scale-105 transition-all duration-500 shadow-sm">
                <Users className="w-7 h-7 text-purple-600" strokeWidth={2.5} />
              </div>
              <h3 className="text-lg font-extrabold text-slate-800 mb-2 font-outfit tracking-tight">Manage Team</h3>
              <p className="text-slate-500 text-xs leading-relaxed mb-6 flex-grow max-w-[180px]">Audit and update user accounts and system access privileges.</p>
              <div className="flex items-center gap-2 text-[10px] text-purple-700 font-black tracking-widest uppercase py-2.5 px-5 bg-purple-50 rounded-full group-hover:bg-purple-600 group-hover:text-white transition-all duration-300">
                <span>Team Directory</span>
                <ArrowRight className="w-3 h-3" />
              </div>
            </div>
          </Link>

          {/* Manage Clients */}
          <Link to="/admin/clients" className="group h-full">
            <div className="bg-card rounded-2xl shadow-sm border border-slate-200 p-6 transition-all duration-500 hover:shadow-2xl hover:border-orange-400 hover:-translate-y-1 h-full flex flex-col items-center text-center group-hover:bg-orange-50/30">
              <div className="p-4 bg-orange-50 rounded-2xl mb-4 group-hover:bg-white group-hover:scale-105 transition-all duration-500 shadow-sm">
                <Building2 className="w-7 h-7 text-orange-600" strokeWidth={2.5} />
              </div>
              <h3 className="text-lg font-extrabold text-slate-800 mb-2 font-outfit tracking-tight">Client Hub</h3>
              <p className="text-slate-500 text-xs leading-relaxed mb-6 flex-grow max-w-[180px]">Register and manage hiring organizations and brands.</p>
              <div className="flex items-center gap-2 text-[10px] text-orange-700 font-black tracking-widest uppercase py-2.5 px-5 bg-orange-50 rounded-full group-hover:bg-orange-600 group-hover:text-white transition-all duration-300">
                <span>View clients</span>
                <ArrowRight className="w-3 h-3" />
              </div>
            </div>
          </Link>

          {/* Manage Jobs */}
          <Link to="/admin/jobs" className="group h-full">
            <div className="bg-card rounded-2xl shadow-sm border border-slate-200 p-6 transition-all duration-500 hover:shadow-2xl hover:border-cyan-400 hover:-translate-y-1 h-full flex flex-col items-center text-center group-hover:bg-cyan-50/30">
              <div className="p-4 bg-cyan-50 rounded-2xl mb-4 group-hover:bg-white group-hover:scale-105 transition-all duration-500 shadow-sm">
                <Briefcase className="w-7 h-7 text-cyan-600" strokeWidth={2.5} />
              </div>
              <h3 className="text-lg font-extrabold text-slate-800 mb-2 font-outfit tracking-tight">Job Board</h3>
              <p className="text-slate-500 text-xs leading-relaxed mb-6 flex-grow max-w-[180px]">Track active job openings across client portfolios.</p>
              <div className="flex items-center gap-2 text-[10px] text-cyan-700 font-black tracking-widest uppercase py-2.5 px-5 bg-cyan-50 rounded-full group-hover:bg-cyan-600 group-hover:text-white transition-all duration-300">
                <span>View Jobs</span>
                <ArrowRight className="w-3 h-3" />
              </div>
            </div>
          </Link>

          {/* Bulk Upload */}
          {!isLead && (
            <Link to="/admin/resumes/bulk-upload" className="group h-full">
              <div className="bg-card rounded-2xl shadow-sm border border-slate-200 p-6 transition-all duration-500 hover:shadow-2xl hover:border-violet-400 hover:-translate-y-1 h-full flex flex-col items-center text-center group-hover:bg-violet-50/30">
                <div className="p-4 bg-violet-50 rounded-2xl mb-4 group-hover:bg-white group-hover:scale-105 transition-all duration-500 shadow-sm">
                  <Zap className="w-7 h-7 text-violet-600" strokeWidth={2.5} />
                </div>
                <h3 className="text-lg font-extrabold text-slate-800 mb-2 font-outfit tracking-tight">Bulk Parsing</h3>
                <p className="text-slate-500 text-xs leading-relaxed mb-6 flex-grow max-w-[180px]">Process up to 1000 resumes with high-accuracy AI extraction.</p>
                <div className="flex items-center gap-2 text-[10px] text-violet-700 font-black tracking-widest uppercase py-2.5 px-5 bg-violet-50 rounded-full group-hover:bg-violet-600 group-hover:text-white transition-all duration-300">
                  <span>Start Batch</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </div>
            </Link>
          )}

          {/* Send Notification */}
          {!isLead && (
            <Link to="/admin/notifications" className="group h-full">
              <div className="bg-card rounded-2xl shadow-sm border border-slate-200 p-6 transition-all duration-500 hover:shadow-2xl hover:border-rose-400 hover:-translate-y-1 h-full flex flex-col items-center text-center group-hover:bg-rose-50/30">
                <div className="p-4 bg-rose-50 rounded-2xl mb-4 group-hover:bg-white group-hover:scale-105 transition-all duration-500 shadow-sm">
                  <Megaphone className="w-7 h-7 text-rose-600" strokeWidth={2.5} />
                </div>
                <h3 className="text-lg font-extrabold text-slate-800 mb-2 font-outfit tracking-tight">Broadcast</h3>
                <p className="text-slate-500 text-xs leading-relaxed mb-6 flex-grow max-w-[180px]">Dispatch important platform updates to all internal teams.</p>
                <div className="flex items-center gap-2 text-[10px] text-rose-700 font-black tracking-widest uppercase py-2.5 px-5 bg-rose-50 rounded-full group-hover:bg-rose-600 group-hover:text-white transition-all duration-300">
                  <span>Send Alert</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </div>
            </Link>
          )}

          {/* Send Secure Interview Link */}
          <div 
            onClick={() => setIsInterviewModalOpen(true)}
            className="group cursor-pointer bg-card rounded-2xl shadow-sm border border-slate-200 p-6 transition-all duration-500 hover:shadow-2xl hover:border-blue-400 hover:-translate-y-1 h-full flex flex-col items-center text-center group-hover:bg-blue-50/30"
          >
            <div className="p-4 bg-blue-50 rounded-2xl mb-4 group-hover:bg-white group-hover:scale-105 transition-all duration-500 shadow-sm">
              <SendHorizontal className="w-7 h-7 text-blue-600" strokeWidth={2.5} />
            </div>
            <h3 className="text-lg font-extrabold text-slate-800 mb-2 font-outfit tracking-tight">Secure Invite</h3>
            <p className="text-slate-500 text-xs leading-relaxed mb-6 flex-grow max-w-[180px]">Generate and dispatch secure assessment links to candidates.</p>
            <div className="flex items-center gap-2 text-[10px] text-blue-700 font-black tracking-widest uppercase py-2.5 px-5 bg-blue-50 rounded-full group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
              <span>Send link</span>
              <ArrowRight className="w-3 h-3" />
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
