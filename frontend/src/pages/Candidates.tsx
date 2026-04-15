import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '../components/ui/input';
import {
  Search, Briefcase, Mail, Phone, MapPin,
  X, User, Calendar, Star, Award, Building2, Filter, ChevronDown,
  ChevronLeft, ChevronRight, ArrowLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authenticatedFetch } from '@/lib/api';
import { cn } from "@/lib/utils"

interface Candidate {
  candidate_id: number;
  full_name: string;
  email: string;
  phone?: string;
  location?: string;
  city?: string;
  country?: string;
  current_designation?: string;
  current_company?: string;
  total_experience?: number;
  total_experience_years?: number;
  skills?: string[];
  primary_skills?: string[];
  secondary_skills?: string[];
  uploaded_by_name?: string | null;
  uploaded_by_role?: string | null;
  created_at: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const getExp = (c: Candidate): number => {
  const v = c.total_experience ?? c.total_experience_years ?? null;
  if (v === null || v === undefined) return 0;
  return Math.round(Number(v) * 10) / 10;
};

const getSkills = (c: Candidate): string[] => {
  const all = [
    ...(c.skills || []),
    ...(c.primary_skills || []),
    ...(c.secondary_skills || []),
  ];
  return [...new Set(all)];
};

const Candidates: React.FC = () => {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState<Candidate | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 10, total: 0, totalPages: 1 });

  // Date filter
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDay, setFilterDay] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const filterRef = useRef<HTMLDivElement>(null);

  // ── Single fetch function ──
  const fetchCandidates = useCallback(async (search: string, pg: number, lim: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      params.set('page', String(pg));
      params.set('limit', String(lim));

      const res = await authenticatedFetch(`/api/candidates?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const rows = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
            ? data.data
            : [];
        setCandidates(rows);
        if (data?.pagination) {
          setPagination(data.pagination);
        } else {
          setPagination({ page: pg, limit: lim, total: rows.length, totalPages: 1 });
        }
      } else {
        setCandidates([]);
        setPagination({ page: 1, limit: lim, total: 0, totalPages: 1 });
      }
    } catch (err) {
      setCandidates([]);
      setPagination({ page: 1, limit: lim, total: 0, totalPages: 1 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCandidates('', 1, limit);
  }, [fetchCandidates]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      setPage(1);
      fetchCandidates(searchTerm, 1, limit);
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    if (isFirstRender.current) return;
    fetchCandidates(searchTerm, page, limit);
  }, [page]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fmt = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
    } catch {
      return d;
    }
  };

  const availableYears = ([...new Set(
    candidates.map(c => new Date(c.created_at).getFullYear())
  )] as number[]).sort((a, b) => b - a);

  const filtered = candidates.filter(c => {
    const d = new Date(c.created_at);
    if (filterYear && d.getFullYear() !== Number(filterYear)) return false;
    if (filterMonth !== '' && d.getMonth() !== Number(filterMonth)) return false;
    if (filterDay && d.getDate() !== Number(filterDay)) return false;
    return true;
  });

  const hasFilter = !!(filterDay || filterMonth !== '' || filterYear);

  const clearFilter = () => {
    setFilterDay('');
    setFilterMonth('');
    setFilterYear('');
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
    fetchCandidates(searchTerm, 1, newLimit);
  };

  const goToPage = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    setPage(newPage);
  };

  const startRow = (pagination.page - 1) * pagination.limit + 1;
  const endRow = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="p-7 px-6 lg:p-8 font-sans max-w-full space-y-6">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full border border-border hover:bg-slate-100 mt-1.5"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground leading-tight">Candidates</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {pagination.total} candidate(s) in the system
            </p>
          </div>
        </div>

        <div ref={filterRef} className="relative">
          <button
            onClick={() => setFilterOpen(o => !o)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer border transition-all duration-200 text-sm font-semibold shadow-soft",
              hasFilter
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-foreground hover:bg-accent"
            )}
          >
            <Filter size={14} />
            {hasFilter ? 'Filtered by Date' : 'Filter by Date'}
            <ChevronDown size={14} className={cn("transition-transform duration-200", filterOpen && "rotate-180")} />
          </button>

          {filterOpen && (
            <div className="absolute top-full right-0 mt-2 bg-card rounded-xl border border-border shadow-large p-5 min-w-[260px] z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">
                Filter by Added Date
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Year</label>
                  <select
                    value={filterYear}
                    onChange={e => setFilterYear(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm cursor-pointer outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">All Years</option>
                    {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Month</label>
                  <select
                    value={filterMonth}
                    onChange={e => setFilterMonth(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm cursor-pointer outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">All Months</option>
                    {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Day</label>
                  <input
                    type="number" min={1} max={31} placeholder="e.g. 14"
                    value={filterDay}
                    onChange={e => setFilterDay(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="flex gap-2 mt-4">
                  {hasFilter && (
                    <button
                      onClick={clearFilter}
                      className="flex-1 py-2 rounded-lg border border-border bg-muted text-muted-foreground text-xs font-bold hover:bg-accent transition-colors"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={() => setFilterOpen(false)}
                    className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-all shadow-glow"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <Input
          placeholder="Search by name, email, skills..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-10 text-sm focus-visible:ring-primary/20 transition-all"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
          </div>
        )}
      </div>

      {hasFilter && (
        <div className="flex items-center gap-2 flex-wrap text-sm text-foreground">
          <span className="text-muted-foreground">Active filters:</span>
          {filterDay && <Chip label={`Day ${filterDay}`} onRemove={() => setFilterDay('')} />}
          {filterMonth !== '' && <Chip label={MONTHS[Number(filterMonth)]} onRemove={() => setFilterMonth('')} />}
          {filterYear && <Chip label={filterYear} onRemove={() => setFilterYear('')} />}
        </div>
      )}

      <div className="bg-card rounded-2xl border border-border shadow-soft overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-20 px-6 space-y-4">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto text-muted-foreground/40">
              <Briefcase size={32} />
            </div>
            <p className="text-muted-foreground text-base">
              {hasFilter
                ? 'No candidates match the selected date filter'
                : searchTerm
                  ? 'No candidates match your search'
                  : 'No candidates found'}
            </p>
            {hasFilter && (
              <button
                onClick={clearFilter}
                className="mt-2 px-6 py-2 rounded-full h-10 bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all shadow-glow"
              >
                Clear Filter
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  {['#', 'Name', 'Email', 'Phone', 'Location', 'Uploaded By', 'Added'].map(h => (
                    <th key={h} className="px-5 py-4 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((c, idx) => (
                  <tr
                    key={c.candidate_id}
                    onClick={() => setSelected(c)}
                    className="hover:bg-accent/50 cursor-pointer transition-colors duration-200 group"
                  >
                    <td className="px-5 py-4 text-xs font-semibold text-primary/60">
                      {(pagination.page - 1) * pagination.limit + idx + 1}
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-bold text-foreground text-sm truncate max-w-[160px] block group-hover:text-primary transition-colors">{c.full_name}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-muted-foreground text-sm truncate max-w-[200px] block font-medium">{c.email}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-muted-foreground text-sm font-medium">{c.phone || <span className="text-muted-foreground/30">—</span>}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-muted-foreground text-sm font-medium truncate max-w-[130px] block">
                        {c.location || c.city || <span className="text-muted-foreground/30">—</span>}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {c.uploaded_by_name ? (
                        <div className="flex flex-col">
                          <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-bold w-fit">
                            <User size={12} />
                            {c.uploaded_by_name}
                          </span>
                          {c.uploaded_by_role && (
                            <span className="text-[10px] text-muted-foreground capitalize mt-1 ml-1 font-medium">
                              {c.uploaded_by_role}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/30 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground text-xs font-medium whitespace-nowrap">{fmt(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between p-5 border-t border-border bg-muted/20 gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Show</label>
            <select
              value={limit}
              onChange={e => handleLimitChange(Number(e.target.value))}
              className="px-2 py-1.5 rounded-lg border border-border bg-card text-xs font-bold text-foreground cursor-pointer outline-none focus:ring-2 focus:ring-primary/20"
            >
              {PAGE_SIZE_OPTIONS.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <span className="text-xs font-bold text-muted-foreground tracking-wide">
            {pagination.total > 0
              ? `${startRow}–${endRow} of ${pagination.total}`
              : '0 results'}
          </span>

          <div className="flex items-center gap-2">
            <PageBtn
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              title="Previous page"
            >
              <ChevronLeft size={16} />
            </PageBtn>

            <div className="flex items-center gap-1.5 mx-1">
              {buildPageRange(pagination.page, pagination.totalPages).map((p, i) =>
                p === '...' ? (
                  <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground/50 text-xs">…</span>
                ) : (
                  <PageBtn
                    key={p}
                    onClick={() => goToPage(Number(p))}
                    active={p === pagination.page}
                  >
                    {p}
                  </PageBtn>
                )
              )}
            </div>

            <PageBtn
              onClick={() => goToPage(page + 1)}
              disabled={page >= pagination.totalPages}
              title="Next page"
            >
              <ChevronRight size={16} />
            </PageBtn>
          </div>
        </div>
      </div>

      {selected && (
        <div
          onClick={() => setSelected(null)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4 animate-in fade-in duration-300"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-card rounded-3xl w-full max-w-xl shadow-large overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
          >
            <div className="relative p-7 pb-10 bg-gradient-to-br from-primary to-primary/80">
              <button
                onClick={() => setSelected(null)}
                className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all border border-white/10"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-6">
                <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20 backdrop-blur-md shadow-xl">
                  <User size={32} className="text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">{selected.full_name}</h2>
                  <p className="text-white/80 text-sm mt-1 font-medium italic">
                    {selected.current_designation || 'No designation on record'}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-8 space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-7 gap-x-10">
                <InfoItem icon={<Mail size={14} />} label="Email" value={selected.email} />
                <InfoItem icon={<Phone size={14} />} label="Phone" value={selected.phone} />
                <InfoItem icon={<MapPin size={14} />} label="Location" value={selected.location || selected.city} />
                <InfoItem icon={<Building2 size={14} />} label="Company" value={selected.current_company} />
                <InfoItem icon={<Award size={14} />} label="Designation" value={selected.current_designation} />
                <InfoItem icon={<Star size={14} />} label="Experience" value={getExp(selected) > 0 ? `${getExp(selected)} year${getExp(selected) !== 1 ? 's' : ''}` : null} fallback="Not specified" />
                <InfoItem icon={<Calendar size={14} />} label="Added On" value={fmt(selected.created_at)} />
                <InfoItem
                  icon={<User size={14} />}
                  label="Uploaded By"
                  value={
                    selected.uploaded_by_name
                      ? `${selected.uploaded_by_name}${selected.uploaded_by_role ? ` (${selected.uploaded_by_role})` : ''}`
                      : null
                  }
                  fallback="Not recorded"
                />
              </div>

              {getSkills(selected).length > 0 && (
                <div className="pt-4 border-t border-border">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Skills & Keywords</p>
                  <div className="flex flex-wrap gap-2">
                    {getSkills(selected).map((s, i) => (
                      <span key={i} className="bg-primary/5 text-primary border border-primary/10 rounded-lg px-3 py-1 text-xs font-bold transition-all hover:bg-primary/10">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function buildPageRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [];
  if (current <= 4) {
    pages.push(1, 2, 3, 4, 5, '...', total);
  } else if (current >= total - 3) {
    pages.push(1, '...', total - 4, total - 3, total - 2, total - 1, total);
  } else {
    pages.push(1, '...', current - 1, current, current + 1, '...', total);
  }
  return pages;
}

const PageBtn: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
  children: React.ReactNode;
}> = ({ onClick, disabled, active, title, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={cn(
      "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all duration-200 border",
      active
        ? "bg-primary text-primary-foreground border-primary shadow-glow"
        : "bg-card border-border text-foreground hover:bg-accent hover:border-primary/30",
      disabled && "opacity-40 cursor-not-allowed grayscale"
    )}
  >
    {children}
  </button>
);

const Chip: React.FC<{ label: string; onRemove: () => void }> = ({ label, onRemove }) => (
  <span className="inline-flex items-center gap-2 bg-primary/10 text-primary border border-primary/20 rounded-full px-3 py-1 text-[11px] font-bold">
    {label}
    <button onClick={onRemove} className="hover:text-foreground transition-colors p-0.5">
      <X size={12} />
    </button>
  </span>
);

const InfoItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  value?: string | null;
  fallback?: string;
}> = ({ icon, label, value, fallback = '—' }) => (
  <div className="space-y-1.5">
    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
    <div className="flex items-center gap-3">
      <span className="text-primary p-1.5 bg-primary/5 rounded-lg border border-primary/10">{icon}</span>
      <span className={cn("text-sm font-semibold", value ? "text-foreground" : "text-muted-foreground/50")}>
        {value || fallback}
      </span>
    </div>
  </div>
);

export default Candidates;
