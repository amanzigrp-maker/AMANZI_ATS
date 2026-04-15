import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Calendar,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authenticatedFetch } from '@/lib/api';
import { cn } from "@/lib/utils";

interface Candidate {
  application_id: number;
  candidate_id: number;
  full_name: string;
  email: string;
  phone?: string;
  status:
  | 'profile_share'
  | 'screen_selected'
  | 'interview_l1'
  | 'interview_l2'
  | 'interview_l3'
  | 'interview_rejected'
  | 'offered'
  | 'backout'
  | 'bg_status'
  | 'joined'
  | 'profile_shared'
  | 'screen_select'
  | 'interview_accepted'
  | 'bg_check_pending'
  | 'pending'
  | 'screening'
  | 'interview'
  | 'accepted'
  | 'rejected';
  applied_date: string;
  job_title?: string;
  job_id?: number;
  recruiter_name?: string;
  notes?: string;
  interview_type?: string;
  source?: string;
  current_designation?: string;
  experience_years?: number;
  skills?: string[];
}

const PAGE_SIZE_OPTIONS = [40, 80, 160, 320];

const STATUS_CONFIG: Record<string, { label: string; colorClass: string; bgClass: string }> = {
  profile_share: { label: 'Profile Share', colorClass: 'text-indigo-600 dark:text-indigo-400', bgClass: 'bg-indigo-100 dark:bg-indigo-900/30' },
  profile_shared: { label: 'Profile Share', colorClass: 'text-indigo-600 dark:text-indigo-400', bgClass: 'bg-indigo-100 dark:bg-indigo-900/30' },
  screen_selected: { label: 'Shortlist - Pending', colorClass: 'text-amber-600 dark:text-amber-400', bgClass: 'bg-amber-100 dark:bg-amber-900/30' },
  screen_select: { label: 'Shortlist - CV Sent', colorClass: 'text-emerald-600 dark:text-emerald-400', bgClass: 'bg-emerald-100 dark:bg-emerald-900/30' },
  interview_l1: { label: 'Interview - Scheduled', colorClass: 'text-blue-600 dark:text-blue-400', bgClass: 'bg-blue-100 dark:bg-blue-900/30' },
  interview_accepted: { label: 'Interview - Scheduled', colorClass: 'text-blue-600 dark:text-blue-400', bgClass: 'bg-blue-100 dark:bg-blue-900/30' },
  interview: { label: 'Interview - Scheduled', colorClass: 'text-blue-600 dark:text-blue-400', bgClass: 'bg-blue-100 dark:bg-blue-900/30' },
  interview_l2: { label: 'Interview L2', colorClass: 'text-violet-600 dark:text-violet-400', bgClass: 'bg-violet-100 dark:bg-violet-900/30' },
  interview_l3: { label: 'L3 Interview', colorClass: 'text-violet-600 dark:text-violet-400', bgClass: 'bg-violet-100 dark:bg-violet-900/30' },
  interview_rejected: { label: 'Screening - Rejected', colorClass: 'text-rose-600 dark:text-rose-400', bgClass: 'bg-rose-100 dark:bg-rose-900/30' },
  rejected: { label: 'Screening - Rejected', colorClass: 'text-rose-600 dark:text-rose-400', bgClass: 'bg-rose-100 dark:bg-rose-900/30' },
  offered: { label: 'Offered', colorClass: 'text-emerald-600 dark:text-emerald-400', bgClass: 'bg-emerald-100 dark:bg-emerald-900/30' },
  accepted: { label: 'Joined', colorClass: 'text-emerald-600 dark:text-emerald-400', bgClass: 'bg-emerald-100 dark:bg-emerald-900/30' },
  joined: { label: 'Joined', colorClass: 'text-emerald-600 dark:text-emerald-400', bgClass: 'bg-emerald-100 dark:bg-emerald-900/30' },
  backout: { label: 'Backout', colorClass: 'text-orange-600 dark:text-orange-400', bgClass: 'bg-orange-100 dark:bg-orange-900/30' },
  bg_status: { label: 'BG Status', colorClass: 'text-slate-600 dark:text-slate-400', bgClass: 'bg-slate-100 dark:bg-slate-900/30' },
  bg_check_pending: { label: 'BG Check Pending', colorClass: 'text-slate-600 dark:text-slate-400', bgClass: 'bg-slate-100 dark:bg-slate-900/30' },
  pending: { label: 'Profile Share', colorClass: 'text-indigo-600 dark:text-indigo-400', bgClass: 'bg-indigo-100 dark:bg-indigo-900/30' },
  screening: { label: 'Shortlist - Pending', colorClass: 'text-amber-600 dark:text-amber-400', bgClass: 'bg-amber-100 dark:bg-amber-900/30' },
};

const STAGE_TABS = [
  { key: 'all', label: 'All' },
  { key: 'profile_share', label: 'Profile Share' },
  { key: 'screen_selected', label: 'Screen Selected' },
  { key: 'interview_l1', label: 'Interview L1' },
  { key: 'interview_l2', label: 'Interview L2' },
  { key: 'interview_l3', label: 'L3 Interview' },
  { key: 'interview_rejected', label: 'Rejected' },
  { key: 'offered', label: 'Offered' },
  { key: 'backout', label: 'Backout' },
  { key: 'bg_status', label: 'BG Status' },
  { key: 'joined', label: 'Joined' },
];

const normalizeStatus = (status: string): string => {
  const s = String(status || '').toLowerCase();
  if (s === 'profile_shared') return 'profile_share';
  if (s === 'screen_select') return 'screen_selected';
  if (s === 'interview_accepted') return 'interview_l1';
  if (s === 'l3interview') return 'interview_l3';
  if (s === 'bg_check_pending') return 'bg_status';
  if (s === 'rejected') return 'interview_rejected';
  if (s === 'accepted') return 'joined';
  if (s === 'pending') return 'profile_share';
  if (s === 'screening') return 'screen_selected';
  if (s === 'interview') return 'interview_l1';
  return s;
};

const Interviews: React.FC = () => {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [pageSize, setPageSize] = useState(40);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authenticatedFetch('/api/applications/interviews');
      if (!res.ok) throw new Error('Failed to load data');
      const data = await res.json();
      setCandidates(Array.isArray(data.data) ? data.data : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredCandidates = useMemo(() => {
    let result = candidates;

    if (activeTab !== 'all') {
      result = result.filter(c => normalizeStatus(c.status) === activeTab);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(c =>
        c.full_name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.job_title?.toLowerCase().includes(q) ||
        c.recruiter_name?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [candidates, activeTab, searchTerm]);

  const paginatedCandidates = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCandidates.slice(start, start + pageSize);
  }, [filteredCandidates, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredCandidates.length / pageSize) || 1;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 rounded-full border-4 border-muted border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-7 px-6 lg:p-8 font-sans space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full border border-border hover:bg-slate-100 mt-1"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground leading-tight">Interview Pipeline</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {filteredCandidates.length} candidate(s) in selected view
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-sm font-semibold hover:bg-accent transition-all shadow-soft"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full max-w-md">
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 w-full lg:w-auto invisible-scrollbar">
          {STAGE_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setCurrentPage(1); }}
              className={cn(
                "px-4 py-2 rounded-full text-[13px] font-bold whitespace-nowrap border transition-all duration-200",
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground border-primary shadow-glow"
                  : "bg-card text-muted-foreground border-border hover:bg-accent hover:border-primary/20"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-[#8D5DF4] text-white">
                {['#', 'Candidate', 'Job Details', 'Recruiter', 'Notes', 'Current Status', 'Applied Date'].map(h => (
                  <th key={h} className="px-4 py-4 text-left text-[11px] font-bold uppercase tracking-widest first:pl-6 rounded-t-sm">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginatedCandidates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center text-muted-foreground font-medium text-sm">
                    No candidates found in this stage.
                  </td>
                </tr>
              ) : (
                paginatedCandidates.map((c, idx) => {
                  const statusDisplay = STATUS_CONFIG[normalizeStatus(c.status)] || { label: c.status, colorClass: 'text-slate-600', bgClass: 'bg-slate-100' };
                  return (
                    <tr key={c.application_id} className="hover:bg-accent/30 transition-colors duration-150 group">
                      <td className="px-4 py-4 text-xs font-semibold text-primary/60 pl-6">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">{c.full_name}</span>
                          <span className="text-[11px] text-muted-foreground font-medium">{c.email}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-foreground line-clamp-1">{c.job_title || '—'}</span>
                          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">ID: {c.job_id || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm font-medium text-foreground">{c.recruiter_name || '—'}</td>
                      <td className="px-4 py-4">
                        <span className="text-[11px] text-muted-foreground font-medium line-clamp-1 italic max-w-[200px]" title={c.notes}>
                          {c.notes || 'No notes'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={cn(
                          "inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                          statusDisplay.bgClass,
                          statusDisplay.colorClass,
                          "border-current/20"
                        )}>
                          {statusDisplay.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs text-muted-foreground font-medium">
                        {c.applied_date ? new Date(c.applied_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between p-5 border-t border-border bg-muted/20 gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            {PAGE_SIZE_OPTIONS.map(size => (
              <button
                key={size}
                onClick={() => { setPageSize(size); setCurrentPage(1); }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border",
                  pageSize === size
                    ? "bg-primary text-primary-foreground border-primary shadow-glow"
                    : "bg-card text-muted-foreground border-border hover:bg-accent"
                )}
              >
                {size}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-muted-foreground mr-4">
              {filteredCandidates.length === 0 ? '0 results' : `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filteredCandidates.length)} of ${filteredCandidates.length}`}
            </span>
            <PageNavBtn
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft size={16} />
            </PageNavBtn>
            <div className="min-w-[40px] h-8 flex items-center justify-center bg-primary text-primary-foreground rounded-lg text-xs font-bold border border-primary shadow-glow">
              {currentPage}
            </div>
            <PageNavBtn
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight size={16} />
            </PageNavBtn>
          </div>
        </div>
      </div>
    </div>
  );
};

const PageNavBtn: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ onClick, disabled, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "w-8 h-8 rounded-lg flex items-center justify-center border transition-all duration-200",
      disabled
        ? "bg-muted text-muted-foreground/30 border-border cursor-not-allowed"
        : "bg-card border-border text-foreground hover:bg-accent"
    )}
  >
    {children}
  </button>
);

export default Interviews;
