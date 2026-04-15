import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from "next-themes";
import { useNavigate, useLocation } from 'react-router-dom';
import api from '@/utils/api'; // <-- new centralized API client
import { isAuthenticated } from '@/lib/auth';

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { VendorJobApplicationModal } from '@/components/VendorJobApplicationModal';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Calendar,
  BarChart3,
  Settings,
  Search,
  Bell,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Eye,
  Edit,
  Trash2,
  UserPlus,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  Clock,
  Upload,
  FileText,
  MapPin,
  Building,
  Moon,
  Sun,
  FileIcon,
  MessageSquare,
  ChevronDown,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import DashboardResumeUploader from '@/components/DashboardResumeUploader';

interface UserProfile {
  id: number;
  email: string;
  role: string;
  status: string;
  avatar_url?: string | null;
  lastLogin?: string;
  createdAt?: string;
}

interface FileStatus {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error' | 'duplicate';
  progress: number;
  error?: string;
  resumeId?: number;
  candidateId?: number;
}



export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation(); // ✅ CORRECT PLACE
  const activePath = location.pathname;


  // Profile & UI state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authOk, setAuthOk] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Lock background scroll when upload modal is open
  useEffect(() => {
    if (showUploader) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [showUploader]);


  // File upload state
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Dashboard data
  const [stats, setStats] = useState({
    totalJobs: 0,
    activeJobs: 0,
    closedJobs: 0,
    holdJobs: 0,
    totalApplicants: 0,
    interviewsScheduled: 0,
    offersExtended: 0,
    totalCandidates: 0,
  });
  const [animatedStats, setAnimatedStats] = useState({
    totalJobs: 0,
    activeJobs: 0,
    closedJobs: 0,
    holdJobs: 0,
    totalApplicants: 0,
    interviewsScheduled: 0,
    offersExtended: 0,
    totalCandidates: 0,
  });

  const [pipelineActivity, setPipelineActivity] = useState<{ timestamp: string; total_applicants: number; total_offers: number; total_jobs: number }[]>([]);
  const [pipelineTimeframe, setPipelineTimeframe] = useState<'1m' | '10m' | '30m' | '1h' | '6h' | '24h'>('1h');
  const pipelineTimeframeRef = useRef<typeof pipelineTimeframe>('1h');

  const [jobOpenings, setJobOpenings] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [recentApplications, setRecentApplications] = useState<any[]>([]);

  // UX / animation helpers
  const [statsMounted, setStatsMounted] = useState(false);
  const [pipelineUpdating, setPipelineUpdating] = useState(false);
  const [notificationIds, setNotificationIds] = useState<Set<number>>(new Set());

  // Loading states for nicer UI
  const [statsLoading, setStatsLoading] = useState(true);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [recentApplicationsLoading, setRecentApplicationsLoading] = useState(true);

  // Application modal / eligibility
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [isApplicationModalOpen, setIsApplicationModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [applicationEligibility, setApplicationEligibility] = useState<Record<string, any>>({});

  // Recruiter: job view + upload resume per job
  const [jobViewOpen, setJobViewOpen] = useState(false);
  const [jobViewData, setJobViewData] = useState<any | null>(null);
  const [selectedJobForUpload, setSelectedJobForUpload] = useState<any | null>(null);

  // Recruiter: applicants for job in View Job modal
  const [jobApplicants, setJobApplicants] = useState<any[]>([]);
  const [loadingApplicants, setLoadingApplicants] = useState(false);
  const [appDetailsOpen, setAppDetailsOpen] = useState(false);
  const [appDetailsLoading, setAppDetailsLoading] = useState(false);
  const [appDetails, setAppDetails] = useState<any | null>(null);
  const [appEditMode, setAppEditMode] = useState(false);
  const [appEditDraft, setAppEditDraft] = useState<any | null>(null);
  const [appEditSaving, setAppEditSaving] = useState(false);

  // Resume Preview
  const [resumePreviewUrl, setResumePreviewUrl] = useState<string | null>(null);
  const [resumePreviewType, setResumePreviewType] = useState<'pdf' | 'image' | 'unsupported' | null>(null);
  const [resumePreviewLoading, setResumePreviewLoading] = useState(false);

  // Application status update
  const [selectedApplicationForStatus, setSelectedApplicationForStatus] = useState<any | null>(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Helper: format dates as dd/mm/yyyy (for jobs and applicants)
  const formatDMY = (value: string | Date) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  /** RECENT APPLICATIONS */
  const fetchRecentApplications = async () => {
    try {
      const res = await api.get('/api/dashboard/recent-applications?limit=5');
      const data = unwrap(res);
      const list = data?.data ?? data ?? [];
      setRecentApplications(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Failed to fetch recent applications:', err);
      setRecentApplications([]);
    } finally {
      setRecentApplicationsLoading(false);
    }
  };

  const handleDownloadResume = (resumeId: number) => {
    const token = localStorage.getItem('accessToken');

    if (!token) {
      alert('Session expired. Please login again.');
      return;
    }

    // ✅ IMPORTANT:
    // Use browser-native download so Content-Disposition filename is respected
    window.location.href = `/api/resumes/${resumeId}/download?token=${token}`;
  };

  const handlePreviewResume = async (resumeId: number, autoLoad = false) => {
    if (resumePreviewUrl) {
      if (autoLoad) return;
      URL.revokeObjectURL(resumePreviewUrl);
      setResumePreviewUrl(null);
      return;
    }
    const token = localStorage.getItem('accessToken');
    if (!token) {
      if (!autoLoad) alert('Session expired. Please login again.');
      return;
    }
    setResumePreviewLoading(true);
    try {
      const res = await fetch(`/api/resumes/${resumeId}/download?token=${token}`);
      if (!res.ok) throw new Error('Failed to load resume');
      const data = await res.blob();

      // Determine file type from headers or fallback
      const contentDisposition = res.headers.get('content-disposition') || '';
      let filename = '';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }
      const ext = filename.split('.').pop()?.toLowerCase() || '';

      if (['pdf'].includes(ext)) {
        const blob = new Blob([data], { type: 'application/pdf' });
        setResumePreviewUrl(URL.createObjectURL(blob));
        setResumePreviewType('pdf');
      } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) {
        const blob = new Blob([data], { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
        setResumePreviewUrl(URL.createObjectURL(blob));
        setResumePreviewType('image');
      } else {
        // Doc, docx, xls, etc.
        setResumePreviewUrl(filename || 'Document');
        setResumePreviewType('unsupported');
      }
    } catch (err) {
      console.error('Preview error:', err);
      if (!autoLoad) alert('Could not load resume preview.');
    } finally {
      setResumePreviewLoading(false);
    }
  };

  useEffect(() => {
    if (appDetailsOpen && appDetails?.resume?.resume_id && !resumePreviewUrl && !resumePreviewLoading) {
      handlePreviewResume(appDetails.resume.resume_id, true);
    }
  }, [appDetailsOpen, appDetails, resumePreviewUrl]);



  useEffect(() => {
    if (location.pathname !== '/dashboard') return;

    fetchProfile();
    fetchDashboardStats();
    fetchPipelineActivity();
    fetchJobOpenings();
    fetchNotifications();
    fetchRecentApplications();

    const interval = setInterval(() => {
      fetchDashboardStats();
      fetchJobOpenings();
      fetchNotifications();
      fetchRecentApplications();
      fetchPipelineActivity(pipelineTimeframeRef.current);
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [location.pathname]);


  useEffect(() => {
    pipelineTimeframeRef.current = pipelineTimeframe;
  }, [pipelineTimeframe]);

  useEffect(() => {
    const to = {
      totalJobs: Number(stats.totalJobs) || 0,
      activeJobs: Number(stats.activeJobs) || 0,
      closedJobs: Number(stats.closedJobs) || 0,
      holdJobs: Number(stats.holdJobs) || 0,
      totalApplicants: Number(stats.totalApplicants) || 0,
      interviewsScheduled: Number(stats.interviewsScheduled) || 0,
      offersExtended: Number(stats.offersExtended) || 0,
      totalCandidates: Number(stats.totalCandidates) || 0,
    };

    const from = { ...animatedStats };

    const changed =
      from.totalJobs !== to.totalJobs ||
      from.activeJobs !== to.activeJobs ||
      from.closedJobs !== to.closedJobs ||
      from.holdJobs !== to.holdJobs ||
      from.totalApplicants !== to.totalApplicants ||
      from.interviewsScheduled !== to.interviewsScheduled ||
      from.offersExtended !== to.offersExtended ||
      from.totalCandidates !== to.totalCandidates;

    if (!changed) return;

    const durationMs = 3000;
    const start = performance.now();

    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 2);
      setAnimatedStats({
        totalJobs: Math.round(from.totalJobs + (to.totalJobs - from.totalJobs) * eased),
        activeJobs: Math.round(from.activeJobs + (to.activeJobs - from.activeJobs) * eased),
        closedJobs: Math.round(from.closedJobs + (to.closedJobs - from.closedJobs) * eased),
        holdJobs: Math.round(from.holdJobs + (to.holdJobs - from.holdJobs) * eased),
        totalApplicants: Math.round(from.totalApplicants + (to.totalApplicants - from.totalApplicants) * eased),
        interviewsScheduled: Math.round(from.interviewsScheduled + (to.interviewsScheduled - from.interviewsScheduled) * eased),
        offersExtended: Math.round(from.offersExtended + (to.offersExtended - from.offersExtended) * eased),
        totalCandidates: Math.round(from.totalCandidates + (to.totalCandidates - from.totalCandidates) * eased),
      });
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stats]);


  // storage event listener for cross-tab updates
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'jobsUpdated') {
        console.log('Storage event: jobsUpdated detected — refreshing dashboard');
        refreshDashboard();
      }
      if (e.key === 'accessToken' || e.key === 'refreshToken') {
        setAuthOk(isAuthenticated());
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  useEffect(() => {
    setAuthOk(isAuthenticated());
    const id = setInterval(() => {
      setAuthOk(isAuthenticated());
    }, 10000);
    return () => clearInterval(id);
  }, []);

  // Helper to unwrap API responses that may be { data: ... } or direct
  const unwrap = (res: any) => res?.data ?? res;

  const refreshDashboard = async () => {
    await Promise.all([fetchDashboardStats(), fetchJobOpenings(), fetchNotifications()]);
  };

  /** PROFILE */
  const fetchProfile = async () => {
    try {
      console.log('Fetching profile...');
      const res = await api.get('/api/users/profile');
      const data = unwrap(res);
      console.log('Profile response:', data);
      setProfile(data);
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      setError('Unable to load profile. You may need to login again.');
    }
  };

  /** STATS */
  const fetchDashboardStats = async () => {
    try {
      const res = await api.get('/api/dashboard/stats');
      const data = unwrap(res);
      console.log('Dashboard stats received:', data);
      const nextStats = {
        totalJobs: data.totalJobs ?? data.total_jobs ?? 0,
        activeJobs: data.activeJobs ?? data.active_jobs ?? 0,
        closedJobs: data.closedJobs ?? data.closed_jobs ?? 0,
        holdJobs: data.holdJobs ?? data.hold_jobs ?? 0,
        totalApplicants: data.totalApplicants ?? data.total_applicants ?? 0,
        interviewsScheduled: data.interviewsScheduled ?? data.interviews_scheduled ?? 0,
        offersExtended: data.offersExtended ?? data.offers_extended ?? 0,
        totalCandidates: data.totalCandidates ?? data.total_candidates ?? 0,
      };
      setStats(nextStats);

    } catch (err) {
      console.error('Failed to fetch dashboard stats:', err);
    } finally {
      setStatsLoading(false);
      // mark that first stats load has completed so we can trigger entry animations
      if (!statsMounted) setStatsMounted(true);
    }
  };

  /** PIPELINE ACTIVITY (5-minute buckets from backend) */
  const fetchPipelineActivity = async (timeframeOverride?: typeof pipelineTimeframe) => {
    try {
      const tfResolved = timeframeOverride ?? pipelineTimeframe;

      const getTrendParamsForTimeframe = (tf: typeof pipelineTimeframe) => {
        switch (tf) {
          case '1m':
            return { hours: 1 / 60, granularity: '10s' };
          case '10m':
            return { hours: 10 / 60, granularity: '1m' };
          case '30m':
            return { hours: 0.5, granularity: '5m' };
          case '1h':
            return { hours: 1, granularity: '5m' };
          case '6h':
            return { hours: 6, granularity: '30m' };
          case '24h':
            return { hours: 24, granularity: '2h' };
          default:
            return { hours: 1, granularity: '5m' };
        }
      };

      const { hours, granularity } = getTrendParamsForTimeframe(tfResolved);

      const res = await api.get('/api/dashboard/pipeline-trend', {
        params: { hours, granularity },
      } as any);
      const data = unwrap(res);
      const list = data?.data ?? data ?? [];
      if (!Array.isArray(list)) {
        console.warn('Unexpected pipeline trend response:', data);
        setPipelineActivity([]);
        return;
      }
      setPipelineActivity(list);
    } catch (err) {
      console.error('Failed to fetch pipeline activity trend:', err);
      setPipelineActivity([]);
    } finally {
      setPipelineUpdating(false);
    }
  };

  /** JOB OPENINGS */
  const fetchJobOpenings = async () => {
    try {
      const res = await api.get('/api/jobs?status=active&limit=5');
      const data = unwrap(res);
      console.log('Job openings received:', data);
      // Support either { data: [...] } or direct array
      const list = data?.data ?? data ?? [];
      setJobOpenings(list);

      // If vendor, check eligibility for returned jobs
      if (profile?.role === 'vendor' && Array.isArray(list) && list.length > 0) {
        checkApplicationEligibility(list);
      }
    } catch (err) {
      console.error('Failed to fetch job openings:', err);
    } finally {
      setJobsLoading(false);
    }
  };

  /** NOTIFICATIONS */
  const fetchNotifications = async () => {
    try {
      const res = await api.get('/api/notifications?unread=true');
      const data = unwrap(res);
      console.log('Notifications received:', data);
      // backend might return { notifications: [], unread_count: n } or { data: ... }
      const next = data.notifications ?? data?.data ?? [];
      setNotifications(next);
      // track ids we've seen for animation (keep set stable across updates)
      if (Array.isArray(next)) {
        setNotificationIds((prev) => {
          const updated = new Set(prev);
          next.forEach((n: any) => {
            if (n?.id != null) updated.add(n.id);
          });
          return updated;
        });
      }
      setUnreadNotifications(data.unread_count ?? data.unreadCount ?? 0);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setNotificationsLoading(false);
    }
  };

  const markNotificationAsRead = async (notificationId: number) => {
    try {
      await api.post(`/api/notifications/${notificationId}/read`);
      // refresh list
      fetchNotifications();
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  /**
   * Application eligibility check (vendor)
   * Loop over job list and call eligibility endpoint.
   * Debug logs kept.
   */
  const checkApplicationEligibility = async (jobList: any[] = jobOpenings) => {
    if (profile?.role !== 'vendor') return;
    if (!Array.isArray(jobList) || jobList.length === 0) {
      console.log('No jobs to check eligibility for.');
      return;
    }

    console.log('Checking application eligibility for jobs:', jobList.map(j => j.job_id ?? j.id));
    const map: Record<string, any> = {};

    for (const job of jobList) {
      const id = job.job_id ?? job.id;
      try {
        const res = await api.get(`/api/applications/jobs/${id}/can-apply`);
        const data = unwrap(res);
        console.log(`Eligibility for job ${id}:`, data);
        map[id] = data;
      } catch (err) {
        console.warn(`Eligibility check failed for ${id}:`, err);
        // default allow to avoid blocking vendor UI in debug mode
        map[id] = { canApply: true, reason: 'error' };
      }
    }

    console.log('Eligibility map:', map);
    setApplicationEligibility(map);
  };

  /** Apply button interactions */
  const handleApplyClick = (job: any) => {
    console.log('Apply clicked for job', job);
    setSelectedJob(job);
    setIsApplicationModalOpen(true);
  };

  const handleUploadForJob = (job: any) => {
    setSelectedJobForUpload(job);
    setShowUploader(true);
  };

  // Recruiter, vendor, admin, lead: open job details modal
  const handleViewJob = async (job: any) => {
    setJobViewData(job);
    setJobViewOpen(true);

    // Recruiters, vendors, admins, leads can load applicants here
    if (profile?.role !== 'recruiter' && profile?.role !== 'vendor' && profile?.role !== 'admin' && profile?.role !== 'lead') return;

    const jobId = job.job_id ?? job.id;
    if (!jobId) return;

    try {
      setLoadingApplicants(true);
      const res = await api.get(`/api/applications/jobs/${jobId}`);
      const data = unwrap(res);
      const list = data?.data ?? data ?? [];

      const normalized = Array.isArray(list) ? list : [];

      if (profile?.role === 'vendor') {
        const currentUserId = profile?.userid ?? profile?.id;
        const vendorApps = normalized.filter((a: any) => {
          if (a.application_type === 'vendor') return true;
          if (currentUserId && a.vendor_id === currentUserId) return true;
          return false;
        });
        setJobApplicants(vendorApps);
      } else {
        setJobApplicants(normalized);
      }
    } catch (err) {
      console.error('Failed to fetch job applicants for recruiter view:', err);
      setJobApplicants([]);
    } finally {
      setLoadingApplicants(false);
    }
  };


  const handleRecruiterViewMore = async (application: any) => {
    setAppDetailsOpen(true);
    setAppDetailsLoading(true);
    setAppDetails(null);
    setAppEditMode(false);
    setAppEditDraft(null);
    try {
      const resp = await api.get(`/api/applications/${application.application_id}/details`);
      const data = unwrap(resp);
      setAppDetails(data.data ?? data ?? null);
    } catch (err) {
      console.error('Failed to load application details for recruiter:', err);
      setAppDetailsOpen(false);
    } finally {
      setAppDetailsLoading(false);
    }
  };

  const handleStatusUpdate = (application: any, initialStatus?: string) => {
    setSelectedApplicationForStatus(application);
    setNewStatus(initialStatus || application.status || '');
    setAdminNotes(application.notes || '');
    setIsStatusModalOpen(true);
  };

  const submitStatusUpdate = async () => {
    if (!selectedApplicationForStatus) return;

    setIsUpdatingStatus(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/applications/${selectedApplicationForStatus.application_id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: newStatus,
          notes: adminNotes,
        }),
      });

      if (response.ok) {
        alert('Application status updated successfully!');
        setIsStatusModalOpen(false);

        // Refresh application details if modal is open
        if (appDetails?.application_id === selectedApplicationForStatus.application_id) {
          const resp = await api.get(`/api/applications/${selectedApplicationForStatus.application_id}/details`);
          const data = unwrap(resp);
          setAppDetails(data.data ?? data ?? null);
        }

        // Refresh applicants list for the current job view if open
        if (jobViewData) {
          const jobId = jobViewData.job_id ?? jobViewData.id;
          if (jobId) {
            const res = await api.get(`/api/applications/jobs/${jobId}`);
            const data = unwrap(res);
            setJobApplicants(Array.isArray(data?.data ?? data) ? (data?.data ?? data) : []);
          }
        }
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.error || 'Failed to update status'}`);
      }
    } catch (error) {
      console.error('Error updating application status:', error);
      alert('Failed to update status. Please try again.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const openApplicationEdit = async (application: any) => {
    await handleRecruiterViewMore(application);
    setAppEditMode(true);
  };

  const startEditFromDetails = (details: any) => {
    const candidate = details?.candidate || {};
    const resume = details?.resume || {};
    const parsed = resume?.parsed_json || {};

    setAppEditDraft({
      candidate_id: details?.candidate_id ?? details?.candidate?.candidate_id ?? null,
      full_name: candidate.full_name ?? parsed.full_name ?? '',
      email: candidate.email ?? parsed.email ?? '',
      phone: candidate.phone ?? parsed.phone ?? '',
      location: candidate.location ?? parsed.location ?? '',
      gender: candidate.gender ?? parsed.gender ?? '',
      designation: candidate.designation ?? parsed.designation ?? '',
      total_experience: candidate.total_experience ?? parsed.total_experience ?? null,
      deployment_type: candidate.deployment_type ?? parsed.deployment_type ?? '',
      availability: candidate.availability ?? parsed.availability ?? '',
      country: candidate.country ?? parsed.country ?? '',
      city: candidate.city ?? parsed.city ?? '',
      primary_skills: candidate.primary_skills ?? parsed.primary_skills ?? [],
      secondary_skills: candidate.secondary_skills ?? parsed.secondary_skills ?? [],
      experience: parsed.experience ?? candidate.experience ?? [],
      projects: parsed.projects ?? candidate.projects ?? [],
      education: parsed.education ?? candidate.education ?? [],
    });
  };

  const saveApplicationEdit = async () => {
    if (!appEditDraft?.candidate_id) {
      alert('Candidate ID missing');
      return;
    }

    setAppEditSaving(true);
    try {
      const payload = {
        full_name: appEditDraft.full_name,
        email: appEditDraft.email,
        phone: appEditDraft.phone,
        location: appEditDraft.location,
        gender: appEditDraft.gender,
        designation: appEditDraft.designation,
        total_experience: Number(appEditDraft.total_experience) || 0,
        deployment_type: appEditDraft.deployment_type,
        availability: appEditDraft.availability,
        country: appEditDraft.country,
        city: appEditDraft.city,
        primary_skills: appEditDraft.primary_skills,
        secondary_skills: appEditDraft.secondary_skills,
        parsed_json: {
          experience: appEditDraft.experience,
          projects: appEditDraft.projects,
          education: appEditDraft.education,
        },
      };

      await api.put(`/api/candidates/${appEditDraft.candidate_id}`, payload);

      // Refresh details so modal shows saved data
      if (appDetails?.application_id) {
        const refreshed = await api.get(`/api/applications/${appDetails.application_id}/details`);
        const data = unwrap(refreshed);
        setAppDetails(data.data ?? data ?? null);
      }

      setAppEditMode(false);
      setAppEditDraft(null);
      alert('Updated successfully');
    } catch (e: any) {
      console.error('Failed to save candidate edit', e);
      const status = e?.response?.status;
      if (status === 403) {
        alert('Edit window expired (only admin can edit after 24 hours)');
      } else {
        alert(e?.message || 'Failed to update');
      }
    } finally {
      setAppEditSaving(false);
    }
  };

  const handleApplicationSubmit = async (applicationData: any) => {
    if (!selectedJob) return;
    setIsSubmitting(true);
    try {
      const id = selectedJob.job_id ?? selectedJob.id;
      console.log('Submitting application for job:', id, applicationData);
      const res = await api.post(`/api/applications/jobs/${id}/apply`, applicationData);
      const data = unwrap(res);
      console.log('Application submit response:', data);
      alert('Application submitted successfully!');
      setIsApplicationModalOpen(false);

      // Refresh eligibility for this job
      await checkApplicationEligibility([selectedJob]);
      // Refresh jobs and eligibility shortly after
      setTimeout(() => {
        fetchJobOpenings().then(() => checkApplicationEligibility());
      }, 500);
    } catch (err: any) {
      console.error('Application submit failed:', err);
      alert(`Failed to submit application: ${err?.message ?? 'unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Helpers for application button text & enabled state */
  const getApplicationButtonText = (jobId: any) => {
    const eligibility = applicationEligibility[jobId];
    if (!eligibility) return 'Apply';
    if (!eligibility.canApply) {
      if (eligibility.reason === 'Already applied') {
        return `Applied (${eligibility.applicationStatus ?? 'Pending'})`;
      }
      return 'Cannot Apply';
    }
    return 'Apply';
  };

  const isApplicationButtonDisabled = (jobId: any) => {
    const eligibility = applicationEligibility[jobId];
    if (!eligibility) return false;
    return !eligibility.canApply;
  };

  /** Files / uploader helpers (multipart) 
   *
   * We implement a safe upload flow:
   * 1. Build FormData
   * 2. Try upload with current access token via fetch (so we can send multipart)
   * 3. If 401 and refresh token exists: call /api/auth/refresh directly, save access token, retry
   * 4. Update file statuses accordingly
   *
   * We keep extensive logs since you asked for debug mode.
   */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selected = Array.from(e.target.files) as File[];
    addFiles(selected);
  };

  const addFiles = (newFiles: File[]) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];

    const activePath = location.pathname;
    const valid = newFiles.filter(f => allowed.includes(f.type) && f.size <= 10 * 1024 * 1024);
    const newStatuses: FileStatus[] = valid.map(f => ({ file: f, status: 'pending', progress: 0 }));
    setFiles(prev => [...prev, ...newStatuses]);
    console.log('Files added:', newStatuses);
  };

  // Low-level helper to refresh access token manually (used only here for multipart retry)
  const manualRefreshAccessToken = async (): Promise<string> => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) throw new Error('No refresh token available for manual refresh');

    console.log('Manually refreshing access token for multipart upload...');
    const resp = await fetch(`/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    if (!resp.ok) throw new Error('Manual refresh failed');
    const json = await resp.json();
    if (!json.accessToken) throw new Error('Refresh response missing accessToken');

    // Save accessToken (and refreshToken if present)
    localStorage.setItem('accessToken', json.accessToken);
    if (json.refreshToken) localStorage.setItem('refreshToken', json.refreshToken);

    console.log('Manual refresh succeeded, new access token saved.');
    return json.accessToken;
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;
    setUploading(true);
    console.log('Starting file upload for', files.length, 'files');

    // Create form data
    const form = new FormData();
    files.forEach(fs => form.append('files', fs.file));

    // Set all to uploading
    setFiles(prev => prev.map(f => ({ ...f, status: 'uploading', progress: 0 })));

    // helper to execute upload with current token
    const doUpload = async (accessToken?: string) => {
      const token = accessToken ?? localStorage.getItem('accessToken') ?? '';
      const res = await fetch('/api/parse-resumes-bulk', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
          // Note: do NOT set Content-Type — browser will set the multipart boundary
        } as any,
        body: form
      });
      return res;
    };

    try {
      let response = await doUpload();

      // If unauthorized, try manual refresh and retry once
      if (response.status === 401) {
        console.warn('Upload returned 401 — attempting manual refresh and retry');
        try {
          const newAccessToken = await manualRefreshAccessToken();
          response = await doUpload(newAccessToken);
        } catch (refreshErr) {
          console.error('Manual refresh failed during upload:', refreshErr);
          throw refreshErr;
        }
      }

      if (!response.ok) {
        const text = await response.text().catch(() => 'no body');
        console.error('Upload failed:', response.status, text);
        throw new Error('Upload failed');
      }

      const result = await response.json();
      console.log('Upload result:', result);

      // Map results back to file statuses (server should return an array aligned with files)
      if (result?.data?.results && Array.isArray(result.data.results)) {
        setFiles(prev => prev.map((fs, idx) => {
          const match = result.data.results[idx];
          if (!match) return { ...fs, status: 'error', progress: 0, error: 'No server result' };

          const status: FileStatus['status'] =
            match.status === 'duplicate' ? 'duplicate' :
              (match.status === 'success' || match.status === 'processed' || match.status === 'completed') ? 'success' : 'error';

          return {
            ...fs,
            status,
            progress: status === 'success' || status === 'duplicate' ? 100 : 0,
            error: match.error || undefined,
            resumeId: match.resume_id ?? undefined,
            candidateId: match.candidate_id ?? undefined,
          };
        }));
      } else {
        // fallback: mark all success if no detailed results
        setFiles(prev => prev.map(f => ({ ...f, status: 'success', progress: 100 })));
      }

      // refresh UI after upload
      fetchDashboardStats();
      fetchJobOpenings();
    } catch (err) {
      console.error('Upload error:', err);
      setFiles(prev => prev.map(f => ({ ...f, status: 'error', progress: 0, error: (err as any).message || 'Upload failed' })));
      alert('Upload failed. See console for details (debug mode).');
    } finally {
      setUploading(false);
    }
  };

  /** Delete / other helpers */
  const handleDeleteJob = async (jobId: any) => {
    if (!confirm('Are you sure you want to delete this job?')) return;
    try {
      await api.delete(`/api/jobs/${jobId}`);
      alert('Job deleted');
      fetchJobOpenings();
    } catch (err) {
      console.error('Failed to delete job:', err);
      alert('Failed to delete job');
    }
  };

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: Briefcase, label: 'Jobs', path: '/jobs' },
    {
      icon: Users,
      label: 'Candidates',
      path: '/candidates',
      badge: stats.totalCandidates,
    },
    { icon: Calendar, label: 'Interviews', path: '/interviews' },
    { icon: BarChart3, label: 'Reports', path: '/reports' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ];

  const getStatusColor = (status: string) => {
    switch ((status || '').toLowerCase()) {
      case 'new': return 'bg-blue-100 text-blue-800';
      case 'shortlisted': return 'bg-green-100 text-green-800';
      case 'interview scheduled': return 'bg-purple-100 text-purple-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'active': return 'bg-green-100 text-green-800';
      case 'on hold': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Stats cards (derived)
  const handleStatCardClick = (label: string) => {
    const role = profile?.role;

    if (label === 'Total Jobs' || label === 'Active Jobs') {
      if (role === 'vendor') {
        navigate('/vendor/jobs');
      } else {
        // Recruiter/other: use /jobs with optional status filter
        if (label === 'Active Jobs') {
          navigate('/jobs?status=active&view=active');
        } else {
          navigate('/jobs?view=total');
        }
      }
      return;
    }

    if (label === 'Interviews Scheduled') {
      navigate('/interviews/scheduled');
      return;
    }

    if (label === 'Total Applicants') {
      navigate('/applicants/total');
      return;
    }

    if (label === 'Offers') {
      // Reuse same destinations as Total Applicants
      if (role === 'admin' || role === 'lead') {
        navigate('/admin/jobs');
      } else if (role === 'vendor') {
        navigate('/vendor/applications');
      } else {
        navigate('/jobs?hasApplicants=1&view=interviews');
      }
      return;
    }

    if (label === 'Offers Extended') {
      navigate('/applicants/total?status=offered');
      return;
    }
  };

  const statsCards = [
    {
      label: 'Total Jobs',
      value: (animatedStats?.totalJobs ?? 0).toString(),
      change: '+12%',
      trend: 'up',
      icon: Briefcase,
      cardClass: 'border border-blue-100 bg-blue-50',
      iconBgClass: 'bg-blue-100',
      iconColorClass: 'text-blue-600',
      changeColorClass: 'text-blue-700',
    },
    {
      label: 'Active Jobs',
      value: (animatedStats?.activeJobs ?? 0).toString(),
      change: '+8%',
      trend: 'up',
      icon: Briefcase,
      cardClass: 'border border-green-100 bg-green-50',
      iconBgClass: 'bg-green-100',
      iconColorClass: 'text-green-600',
      changeColorClass: 'text-green-700',
    },
    {
      label: 'Total Applicants',
      value: (animatedStats?.totalApplicants ?? 0).toString(),
      change: '+23%',
      trend: 'up',
      icon: Users,
      cardClass: 'border border-purple-100 bg-purple-50',
      iconBgClass: 'bg-purple-100',
      iconColorClass: 'text-purple-600',
      changeColorClass: 'text-purple-700',
    },
    {
      label: 'Interviews Scheduled',
      value: (animatedStats?.interviewsScheduled ?? 0).toString(),
      change: '+8%',
      trend: 'up',
      icon: Calendar,
      cardClass: 'border border-orange-100 bg-orange-50',
      iconBgClass: 'bg-orange-100',
      iconColorClass: 'text-orange-600',
      changeColorClass: 'text-orange-700',
    },
    {
      label: 'Offers Extended',
      value: (animatedStats?.offersExtended ?? 0).toString(),
      change: '+15%',
      trend: 'up',
      icon: CheckCircle2,
      cardClass: 'border border-teal-100 bg-teal-50',
      iconBgClass: 'bg-teal-100',
      iconColorClass: 'text-teal-600',
      changeColorClass: 'text-teal-700',
    },
  ] as const;

  const recentJobOpenings = useMemo(() => {
    const list = Array.isArray(jobOpenings) ? jobOpenings : [];
    if (profile?.role === 'admin') return list.slice(0, 5);
    return list;
  }, [jobOpenings, profile?.role]);

  const jobOverviewData = [
    { name: 'Active Jobs', value: stats?.activeJobs ?? 0 },
    { name: 'Closed Jobs', value: stats?.closedJobs ?? 0 },
    { name: 'On Hold', value: stats?.holdJobs ?? 0 },
  ];
  const jobOverviewColors = ['#4F46E5', '#10B981', '#F59E0B'];

  const jobActivityChartData = pipelineActivity.map((p) => {
    const ts = new Date(p.timestamp);
    return {
      timeLabel: ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      totalApplicants: p.total_applicants ?? 0,
      totalOffers: p.total_offers ?? 0,
      totalJobs: p.total_jobs ?? 0,
    };
  });


  // Header greeting + role label
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const roleLabel = useMemo(() => {
    const r = (profile?.role || '').toLowerCase().trim();
    if (r === 'admin') return 'Admin';
    if (r === 'recruiter') return 'Recruiter';
    if (r === 'vendor') return 'Vendor';
    if (r === 'lead') return 'Lead';
    // Fallback for any other role
    if (r) return r.charAt(0).toUpperCase() + r.slice(1);
    return null;
  }, [profile?.role]);

  return (
    <div className="bg-gradient-subtle min-h-screen">
      {/* File Upload Notification */}
      {files.length > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 p-3">
          <div className="flex items-center justify-between max-w-7xl mx-auto px-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-blue-800">{files.length} file{files.length > 1 ? 's' : ''} selected</span>
            </div>
            <Button size="sm" variant="outline" onClick={uploadFiles} disabled={uploading} className="text-blue-600 border-blue-200 hover:bg-blue-100">
              {uploading ? (<><Clock className="h-3 w-3 mr-1 animate-spin" /> Uploading...</>) : (<><Upload className="h-3 w-3 mr-1" /> Upload Now</>)}
            </Button>
          </div>
        </div>
      )}

      {/* Topbar */}
      <header className="h-16 bg-card/80 dark:bg-slate-950/70 backdrop-blur supports-[backdrop-filter]:bg-card/60 border-b border-border/70 sticky top-0 z-30">
        <div className="h-full max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set('menu', '1');
                navigate(url.pathname + url.search);
              }}
              className="lg:hidden p-2 hover:bg-slate-100 dark:hover:bg-card/10 rounded-lg transition-colors relative z-50 pointer-events-auto"
              type="button"
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
          </div>

          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="relative p-2 hover:bg-slate-100 dark:hover:bg-card/10 rounded-lg transition-colors">
                  <Bell size={18} />
                  {unreadNotifications > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center animate-pulse">
                      {unreadNotifications > 9 ? '9+' : unreadNotifications}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="text-foreground">Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.length > 0 ? notifications.slice(0, 5).map((note) => (
                  <DropdownMenuItem
                    key={note.id}
                    className="flex flex-col items-start p-3 cursor-pointer"
                    onClick={() => markNotificationAsRead(note.id)}
                  >
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="flex items-center gap-2 w-full"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-sm text-foreground">{note.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{note.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">{new Date(note.created_at).toLocaleDateString()}</p>
                      </div>
                      {!note.read && (
                        <span className="relative flex h-2 w-2">
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                        </span>
                      )}
                    </motion.div>
                  </DropdownMenuItem>
                )) : (
                  <DropdownMenuItem disabled>
                    <p className="text-sm text-muted-foreground">No new notifications</p>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-card/10 rounded-lg p-2 transition-colors">
                  <Avatar className="w-8 h-8">
                    <AvatarImage
                      src={profile?.avatar_url || '/avatars/default.png'}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = '/avatars/default.png';
                      }}
                    />
                    <AvatarFallback className="bg-[#4F46E5] text-white">{profile?.email?.charAt(0).toUpperCase() ?? 'U'}</AvatarFallback>
                  </Avatar>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium">{profile?.email ?? 'User'}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {roleLabel && (
                        <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-card/10 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-200">
                          {roleLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/settings')}><Settings className="mr-2 h-4 w-4" /> Settings</DropdownMenuItem>
                {(profile?.role === 'admin' || profile?.role === 'lead') && <DropdownMenuItem onClick={() => navigate('/admin/dashboard')}><LayoutDashboard className="mr-2 h-4 w-4" /> {profile?.role === 'lead' ? 'Lead Panel' : 'Admin Panel'}</DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { localStorage.removeItem('accessToken'); localStorage.removeItem('refreshToken'); setProfile(null); navigate('/login'); }} className="text-red-600">
                  <X className="mr-2 h-4 w-4" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="p-4 lg:p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
                {greeting},{' '}
                {profile?.email?.split('@')[0] ?? 'User'}
              </h1>
              <span className="inline-flex items-center gap-1 ">
                <span className="relative flex h-2 w-2">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full ${authOk ? 'bg-emerald-400' : 'bg-red-400'} opacity-75`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${authOk ? 'bg-emerald-500' : 'bg-red-500'}`}
                  />
                </span>
              </span>
            </div>
            <p className="text-muted-foreground mt-1">Here's what's happening with your recruitment today.</p>
          </div>

          <div className="flex-shrink-0 flex gap-3" />
        </div>

        {/* Resume uploader modal (keeps your DashboardResumeUploader component) */}
        {showUploader && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onWheel={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
          >
            <div className="relative bg-card dark:bg-slate-950 rounded-2xl shadow-2xl max-w-7xl w-full max-h-[95vh] overflow-y-auto border border-border dark:border-white/10">
              <button onClick={() => setShowUploader(false)} className="absolute top-4 right-4 z-10 p-2 hover:bg-gray-100 dark:hover:bg-card/10 rounded-full transition-colors"><X className="h-5 w-5 text-muted-foreground dark:text-slate-300" /></button>
              <DashboardResumeUploader onClose={() => setShowUploader(false)} userRole={profile?.role} selectedJob={selectedJobForUpload} />
            </div>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">{error}</div>}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          {statsLoading
            ? Array.from({ length: 5 }).map((_, idx) => (
              <Card key={idx} className="h-full">
                <CardContent className="p-6 space-y-3 h-full flex flex-col justify-center">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-4 w-20" />
                </CardContent>
              </Card>
            ))
            : statsCards.map((stat, idx) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 12 }}
                animate={statsMounted ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.25, delay: idx * 0.04, ease: 'easeOut' }}
                className="h-full"
              >
                <motion.button
                  type="button"
                  whileHover={{ y: -4, scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                  className={`w-full h-full text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 ${stat.cardClass}`}
                  onClick={() => handleStatCardClick(stat.label)}
                >
                  <Card className="shadow-none border-none bg-transparent h-full">
                    <CardContent className="p-6 h-full flex flex-col justify-center">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                          <motion.p
                            key={stat.value}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            className="text-3xl font-bold text-foreground mt-2 tabular-nums"
                          >
                            {stat.value}
                          </motion.p>
                          <div className={`flex items-center mt-2 text-sm ${stat.changeColorClass}`}>
                            {stat.trend === 'up' ? (
                              <TrendingUp className="h-4 w-4 mr-1" />
                            ) : (
                              <TrendingDown className="h-4 w-4 mr-1" />
                            )}
                            {stat.change}
                          </div>
                        </div>
                        <motion.div
                          whileHover={{ scale: 1.05, rotate: 3 }}
                          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                          className={`p-3 rounded-full ${stat.iconBgClass}`}
                        >
                          <stat.icon className={`h-6 w-6 ${stat.iconColorClass}`} />
                        </motion.div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.button>
              </motion.div>
            ))}
        </div>

        {/* Job Overview + Job Activity graph */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
          <Card className="shadow-sm border border-gray-100 dark:border-white/10 bg-card dark:bg-slate-950">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold text-foreground dark:text-white">Job Overview</CardTitle>
                  <p className="text-xs text-muted-foreground dark:text-slate-300 mt-1">Distribution of active and finished jobs</p>
                </div>
                <Badge variant="outline" className="text-xs px-2 py-1 rounded-full">
                  Total Jobs: {stats.totalJobs ?? 0}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col lg:flex-row items-center gap-6">
                <div className="relative w-52 h-52 mx-auto">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={jobOverviewData}
                        innerRadius={70}
                        outerRadius={100}
                        paddingAngle={4}
                        dataKey="value"
                        stroke="none"
                      >
                        {jobOverviewData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={jobOverviewColors[index]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xs text-muted-foreground">Total Jobs</span>
                    <span className="text-2xl font-semibold text-foreground">{stats.totalJobs ?? 0}</span>
                  </div>
                </div>

                <div className="flex-1 space-y-3 rounded-xl p-3 bg-transparent dark:bg-card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: jobOverviewColors[0] }} />
                      <span className="text-sm font-medium text-gray-800 dark:text-foreground">Active Jobs</span>
                    </div>
                    <span className="text-sm font-semibold text-foreground dark:text-foreground">{stats.activeJobs ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: jobOverviewColors[1] }} />
                      <span className="text-sm font-medium text-gray-800 dark:text-foreground">Closed Jobs</span>
                    </div>
                    <span className="text-sm font-semibold text-foreground dark:text-foreground">{stats.closedJobs ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: jobOverviewColors[2] }} />
                      <span className="text-sm font-medium text-gray-800 dark:text-foreground">On Hold</span>
                    </div>
                    <span className="text-sm font-semibold text-foreground dark:text-foreground">{stats.holdJobs ?? 0}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border border-border dark:border-white/10 shadow-sm rounded-2xl bg-card dark:bg-slate-950">
            <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-indigo-50/40 dark:from-slate-950 dark:to-slate-900">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold text-foreground dark:text-white">Pipeline Activity (Live)</CardTitle>
                  <p className="text-xs text-muted-foreground dark:text-slate-300 mt-1">Recent movement of applicants, offers vs jobs</p>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground dark:text-slate-200 bg-card/60 dark:bg-card/10 rounded-full px-1.5 py-0.5 border border-transparent dark:border-white/10">
                  {(['1m', '10m', '30m', '1h', '6h', '24h'] as const).map(tf => (
                    <button
                      key={tf}
                      onClick={() => {
                        if (pipelineTimeframe === tf || pipelineUpdating) return;
                        setPipelineTimeframe(tf);
                        setPipelineUpdating(true);
                        // Fetch with new timeframe (keeps API identical)
                        fetchPipelineActivity(tf);
                      }}
                      className={`px-1.5 py-0.5 rounded-full border text-[10px] leading-none transition-colors ${pipelineTimeframe === tf
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-transparent text-muted-foreground dark:text-slate-200 border-transparent hover:bg-indigo-50 dark:hover:bg-card/10'
                        }`}
                      disabled={pipelineUpdating}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 bg-background/60 dark:bg-slate-950">
              {pipelineUpdating && (
                <div className="mb-2 flex items-center justify-end text-[11px] text-muted-foreground dark:text-slate-300">
                  <Clock className="h-3 w-3 mr-1 animate-spin" /> Updating…
                </div>
              )}
              {jobActivityChartData.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">No activity data yet</div>
              ) : (
                <motion.div
                  key={pipelineTimeframe}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="h-64"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={jobActivityChartData} margin={{ top: 24, right: 24, left: 0, bottom: 8 }}>
                      <defs>
                        <linearGradient id="areaApplicants" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="areaOffers" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="areaJobs" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                      <XAxis
                        dataKey="timeLabel"
                        tick={{ fontSize: 10, fill: '#6B7280' }}
                        tickLine={false}
                        axisLine={{ stroke: '#E5E7EB' }}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#9CA3AF' }}
                        tickLine={false}
                        axisLine={{ stroke: '#E5E7EB' }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        cursor={{ stroke: '#E5E7EB', strokeWidth: 1 }}
                        contentStyle={{ fontSize: 12, borderRadius: 10, borderColor: '#E5E7EB', padding: 10 }}
                        labelStyle={{ fontWeight: 600 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="totalApplicants"
                        name="Total Applicants"
                        stroke="#4F46E5"
                        strokeWidth={2}
                        fill="url(#areaApplicants)"
                        dot={{ r: 3, strokeWidth: 1.5, stroke: '#EEF2FF', fill: '#4F46E5' }}
                        activeDot={{ r: 4.5 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="totalOffers"
                        name="Offers"
                        stroke="#10B981"
                        strokeWidth={2}
                        fill="url(#areaOffers)"
                        dot={{ r: 3, strokeWidth: 1.5, stroke: '#ECFDF5', fill: '#10B981' }}
                        activeDot={{ r: 4.5 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="totalJobs"
                        name="Jobs"
                        stroke="#F59E0B"
                        strokeWidth={2}
                        fill="url(#areaJobs)"
                        dot={{ r: 3, strokeWidth: 1.5, stroke: '#FEF3C7', fill: '#F59E0B' }}
                        activeDot={{ r: 4.5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </motion.div>
              )}
              {jobActivityChartData.length > 0 && (
                <div className="mt-3 flex items-center justify-end gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded-full bg-[#4F46E5]" />
                    <span>Total Applicants</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded-full bg-[#10B981]" />
                    <span>Offers</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded-full bg-[#F59E0B]" />
                    <span>Jobs</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Job Openings Table */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base font-semibold tracking-tight text-foreground">
                Recent Job Openings
              </CardTitle>
              <div className="mt-1 text-xs text-muted-foreground">
                Latest roles that candidates can apply to.
              </div>
            </div>
            <div className="text-xs text-muted-foreground hidden sm:block">
              Showing
              <span className="mx-1 font-semibold text-foreground">
                {jobsLoading ? '—' : recentJobOpenings.length}
              </span>
              job{!jobsLoading && recentJobOpenings.length === 1 ? '' : 's'}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {jobsLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : recentJobOpenings.length > 0 ? (
              <div className="rounded-lg border border-slate-100 overflow-hidden bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-background/80">
                      <TableHead className="w-[32%]">Position</TableHead>
                      <TableHead className="w-[12%]">Job Code</TableHead>
                      <TableHead className="w-[18%]">Client</TableHead>
                      <TableHead className="w-[14%]">Location</TableHead>
                      <TableHead className="w-[10%]">Type</TableHead>
                      <TableHead className="w-[8%]">Status</TableHead>
                      <TableHead className="w-[10%]">Posted</TableHead>
                      <TableHead className="w-[10%] text-right">Applicants</TableHead>
                      {(profile?.role === 'vendor' || profile?.role === 'recruiter' || profile?.role === 'admin' || profile?.role === 'lead') && (
                        <TableHead className="w-[16%] text-right">Actions</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentJobOpenings.map((job, idx) => {
                      const id = job.job_id ?? job.id ?? `${job.title}-${idx}`;
                      return (
                        <motion.tr
                          key={id}
                          whileHover={{ y: -2 }}
                          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                          className="group hover:bg-background/70 transition-colors cursor-pointer"
                        >
                          <TableCell className="align-top">
                            <div className="flex flex-col">
                              <span className="font-medium text-sm text-foreground truncate max-w-xs">
                                {job.title}
                              </span>
                              {(job as any).client_name && (
                                <span className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400 sm:hidden">
                                  {(job as any).client_name}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-slate-700">
                            {job.job_code ?? ''}
                          </TableCell>
                          <TableCell className="text-xs text-slate-800">
                            {(job as any).client_name || job.company || job.department || '-'}
                          </TableCell>
                          <TableCell className="text-xs text-slate-700">
                            {job.location || '-'}
                          </TableCell>
                          <TableCell className="text-xs text-slate-700 capitalize">
                            {job.employment_type || job.type || '-'}
                          </TableCell>
                          <TableCell>
                            <Badge className={`${getStatusColor(job.status)} text-[11px] px-2 py-0.5 capitalize`}>
                              {job.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-slate-700">
                            {formatDMY(job.posted_date)}
                          </TableCell>
                          <TableCell className="text-right text-xs text-foreground font-medium">
                            {job.application_count ?? job.total_applicants ?? job.totalApplicants ?? job.applicants_count ?? job.applicantsCount ?? 0}
                          </TableCell>
                          {(profile?.role === 'vendor' || profile?.role === 'recruiter' || profile?.role === 'admin' || profile?.role === 'lead') && (
                            <TableCell className="text-right">
                              <div className="inline-flex gap-2">
                                {(profile?.role === 'recruiter' || profile?.role === 'vendor' || profile?.role === 'admin' || profile?.role === 'lead') && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleUploadForJob(job)}
                                    className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                                  >
                                    <Upload className="h-3.5 w-3.5 mr-1" /> Upload
                                  </Button>
                                )}
                                {profile?.role === 'recruiter' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      // open job + applicants first
                                      await handleViewJob(job);
                                    }}
                                    className="h-8 px-3 text-xs"
                                  >
                                    <Eye className="h-3.5 w-3.5 mr-1" /> Applicants
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleViewJob(job)}
                                  className="h-8 px-3 text-xs"
                                >
                                  <Eye className="h-3.5 w-3.5 mr-1" /> View
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </motion.tr>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No job openings available.</div>
            )}
          </CardContent>
        </Card>

        {/* Recent Applications */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Recent Applications</CardTitle>
            <div className="text-sm text-muted-foreground">
              Latest applications received
            </div>
          </CardHeader>

          <CardContent>
            {recentApplicationsLoading ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="space-y-3"
              >
                {[0, 1, 2].map((idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-40" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </motion.div>
            ) : recentApplications.length > 0 ? (
              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {recentApplications.slice(0, 5).map((app, idx) => {
                    const genderRaw = String(
                      app?.gender ??
                      app?.candidate_gender ??
                      app?.candidateGender ??
                      app?.candidate?.gender ??
                      ''
                    ).toLowerCase();
                    const isFemale =
                      genderRaw === 'female' ||
                      genderRaw === 'f' ||
                      genderRaw.startsWith('f') ||
                      genderRaw.includes('fem') ||
                      genderRaw.includes('woman') ||
                      genderRaw.includes('girl') ||
                      genderRaw === '2' ||
                      genderRaw === '0' ||
                      genderRaw === 'false';

                    const isMale =
                      genderRaw === 'male' ||
                      genderRaw === 'm' ||
                      genderRaw.startsWith('m') ||
                      genderRaw.includes('man') ||
                      genderRaw === '1' ||
                      genderRaw === 'true';

                    const avatarSrc = isFemale
                      ? '/avatars/avatar-5.png'
                      : isMale
                        ? '/avatars/avatar-1.png'
                        : '/avatars/default.png';
                    const candidateName =
                      app?.candidate_name ??
                      app?.applicant_name ??
                      app?.full_name ??
                      app?.name ??
                      'Candidate';
                    const jobTitle = app?.job_title ?? app?.title ?? app?.jobTitle ?? '';
                    const candidateCode =
                      app?.candidate_code ??
                      app?.candidateCode ??
                      app?.candidate_id ??
                      app?.candidateId ??
                      '';
                    const appliedAt = app?.applied_date ?? app?.applied_at ?? app?.appliedAt ?? app?.application_date ?? app?.created_at;
                    const status = app?.display_status ?? app?.status ?? app?.application_status ?? 'New';
                    const statusNorm = String(status || '').trim().toLowerCase();
                    const isNewStatus = statusNorm === 'pending' || statusNorm === 'new';

                    return (
                      <motion.div
                        key={app?.application_id ?? app?.id ?? `${candidateName}-${idx}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className="flex items-start gap-3 rounded-lg border border-slate-100 bg-card px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                        onClick={() => handleRecruiterViewMore(app)}
                      >
                        <img
                          src={avatarSrc}
                          alt="avatar"
                          className="h-9 w-9 rounded-full border border-border object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = '/avatars/default.png';
                          }}
                        />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">
                                {candidateName}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {jobTitle || candidateCode ? (
                                  <>
                                    {jobTitle || 'Job'}
                                    {candidateCode ? ` • ${candidateCode}` : ''}
                                  </>
                                ) : (
                                  'Application received'
                                )}
                              </p>
                            </div>

                            {isNewStatus ? (
                              <span className="relative inline-flex items-center overflow-hidden rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 whitespace-nowrap">
                                <span className="relative z-10">NEW</span>
                                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/70 to-transparent animate-[shine_1.6s_ease-in-out_infinite]" />
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 whitespace-nowrap">
                                {status}
                              </span>
                            )}
                          </div>

                          {appliedAt && (
                            <p className="text-[11px] text-slate-400 mt-1">
                              Applied: {new Date(appliedAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No recent applications yet.</p>
            )}
          </CardContent>
        </Card>

        <style>
          {`@keyframes shine { 0% { transform: translateX(-120%); } 60% { transform: translateX(120%); } 100% { transform: translateX(120%); } }`}
        </style>


        {/* Vendor modal */}
        {profile?.role === 'vendor' && (
          <VendorJobApplicationModal
            job={selectedJob}
            isOpen={isApplicationModalOpen}
            onClose={() => setIsApplicationModalOpen(false)}
            onSubmit={handleApplicationSubmit}
            isSubmitting={isSubmitting}
          />
        )}

        {/* Application Details Modal (overlay on top of dashboard) */}
        {appDetailsOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
            <div className="relative bg-card rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-y-auto p-6">
              <button
                onClick={() => {
                  setAppDetailsOpen(false);
                  if (resumePreviewUrl) {
                    URL.revokeObjectURL(resumePreviewUrl);
                    setResumePreviewUrl(null);
                  }
                }}
                className="absolute top-4 right-4 z-10 p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>

              {appDetailsLoading && (
                <div className="py-8 text-center text-muted-foreground">Loading details...</div>
              )}

              {!appDetailsLoading && appDetails && (() => {
                const candidate = appDetails.candidate || {};
                const resume = appDetails.resume || {};
                const parsed = resume.parsed_json || {};

                const canEdit = profile?.role === 'recruiter' || profile?.role === 'vendor' || profile?.role === 'admin' || profile?.role === 'lead';

                const fullName = parsed.full_name ?? candidate.full_name ?? candidate.name ?? candidate.email ?? 'Unknown Candidate';
                const email = parsed.email ?? candidate.email ?? '';
                const phone = parsed.phone ?? candidate.phone ?? '';
                const location = parsed.location ?? candidate.location ?? '';

                const profileData = {
                  gender: parsed.gender ?? candidate.gender ?? 'N/A',
                  designation: parsed.designation ?? candidate.designation ?? 'N/A',
                  total_experience: parsed.total_experience ?? candidate.total_experience ?? candidate.total_experience_years ?? 'N/A',
                  deployment_type: parsed.deployment_type ?? candidate.deployment_type ?? 'N/A',
                  availability: parsed.availability ?? candidate.availability ?? 'N/A',
                  country: parsed.country ?? candidate.country ?? 'N/A',
                  city: parsed.city ?? candidate.city ?? 'N/A',
                };

                const primarySkills = parsed.primary_skills ?? candidate.primary_skills ?? [];
                const secondarySkills = parsed.secondary_skills ?? candidate.secondary_skills ?? [];
                const experience = parsed.experience ?? candidate.experience ?? [];
                const education = parsed.education ?? candidate.education ?? [];
                const projects = parsed.projects ?? candidate.projects ?? [];

                if (appEditMode && !appEditDraft) {
                  startEditFromDetails(appDetails);
                }

                return (
                  <>
                    <div className="space-y-6 mt-2">
                      <div className="flex items-start justify-between gap-4 pr-10">
                        <div className="min-w-0 flex-1">
                          {appEditMode ? (
                            <div className="space-y-2">
                              <Input
                                value={appEditDraft?.full_name ?? ''}
                                onChange={(e) => setAppEditDraft({ ...appEditDraft, full_name: e.target.value })}
                                placeholder="Full Name"
                              />
                              <Input
                                value={appEditDraft?.email ?? ''}
                                onChange={(e) => setAppEditDraft({ ...appEditDraft, email: e.target.value })}
                                placeholder="Email"
                              />
                              <Input
                                value={appEditDraft?.phone ?? ''}
                                onChange={(e) => setAppEditDraft({ ...appEditDraft, phone: e.target.value })}
                                placeholder="Phone"
                              />
                            </div>
                          ) : (
                            <>
                              <h2 className="text-xl font-semibold truncate">{fullName}</h2>
                              {email && <p className="text-sm text-muted-foreground truncate">{email}</p>}
                              {phone && <p className="text-sm text-muted-foreground">{phone}</p>}
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {resume.resume_id && (
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                onClick={() => handleDownloadResume(resume.resume_id)}
                              >
                                Download Resume
                              </Button>
                            </div>
                          )}
                          {appDetails && (profile?.role === 'admin' || profile?.role === 'lead' || profile?.role === 'recruiter') && (
                            <Button
                              variant="outline"
                              onClick={() => handleStatusUpdate(appDetails)}
                              className="border-blue-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all shadow-sm"
                            >
                              <MessageSquare className="h-4 w-4 mr-1 text-blue-600" />
                              Update
                            </Button>
                          )}
                          <Button
                            variant={appEditMode ? 'default' : 'outline'}
                            onClick={() => {
                              if (appEditMode) {
                                setAppEditMode(false);
                                setAppEditDraft(null);
                              } else {
                                setAppEditMode(true);
                                startEditFromDetails(appDetails);
                              }
                            }}
                            disabled={!canEdit}
                          >
                            {appEditMode ? 'Cancel Edit' : 'Edit'}
                          </Button>
                          {appEditMode && (
                            <Button
                              onClick={saveApplicationEdit}
                              disabled={appEditSaving}
                            >
                              {appEditSaving ? 'Saving…' : 'Save'}
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h3 className="text-sm font-semibold text-gray-700 mb-2">Profile</h3>
                          {appEditMode ? (
                            <div className="space-y-2">
                              <Input value={appEditDraft?.location ?? ''} onChange={(e) => setAppEditDraft({ ...appEditDraft, location: e.target.value })} placeholder="Location" />
                              <Input value={appEditDraft?.gender ?? ''} onChange={(e) => setAppEditDraft({ ...appEditDraft, gender: e.target.value })} placeholder="Gender" />
                              <Input value={appEditDraft?.designation ?? ''} onChange={(e) => setAppEditDraft({ ...appEditDraft, designation: e.target.value })} placeholder="Designation" />
                              <Input
                                type="number"
                                step="0.1"
                                value={
                                  appEditDraft?.total_experience === null ||
                                    appEditDraft?.total_experience === undefined ||
                                    String(appEditDraft?.total_experience) === '0'
                                    ? ''
                                    : String(appEditDraft?.total_experience)
                                }
                                onChange={(e) =>
                                  setAppEditDraft({
                                    ...appEditDraft,
                                    total_experience:
                                      e.target.value === '' ? null : Number(e.target.value),
                                  })
                                }
                                placeholder="Total Experience"
                              />
                              <Input value={appEditDraft?.deployment_type ?? ''} onChange={(e) => setAppEditDraft({ ...appEditDraft, deployment_type: e.target.value })} placeholder="Deployment Type" />
                              <Input value={appEditDraft?.availability ?? ''} onChange={(e) => setAppEditDraft({ ...appEditDraft, availability: e.target.value })} placeholder="Availability" />
                            </div>
                          ) : (
                            <>
                              <p className="text-sm text-gray-700">Location: {location || 'N/A'}</p>
                              <p className="text-sm text-gray-700">Gender: {profileData.gender}</p>
                              <p className="text-sm text-gray-700">Designation: {profileData.designation}</p>
                              <p className="text-sm text-gray-700">Total Experience: {profileData.total_experience}</p>
                              <p className="text-sm text-gray-700">Deployment Type: {profileData.deployment_type}</p>
                              <p className="text-sm text-gray-700">Availability: {profileData.availability}</p>
                            </>
                          )}
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-gray-700 mb-2">Location & Preferences</h3>
                          {appEditMode ? (
                            <div className="space-y-2">
                              <Input value={appEditDraft?.country ?? ''} onChange={(e) => setAppEditDraft({ ...appEditDraft, country: e.target.value })} placeholder="Country" />
                              <Input value={appEditDraft?.city ?? ''} onChange={(e) => setAppEditDraft({ ...appEditDraft, city: e.target.value })} placeholder="City" />
                            </div>
                          ) : (
                            <>
                              <p className="text-sm text-gray-700">Country: {profileData.country}</p>
                              <p className="text-sm text-gray-700">City: {profileData.city}</p>
                            </>
                          )}
                        </div>
                      </div>

                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">Primary Skills</h3>
                        {appEditMode ? (
                          <Input
                            value={Array.isArray(appEditDraft?.primary_skills) ? appEditDraft.primary_skills.join(', ') : ''}
                            onChange={(e) =>
                              setAppEditDraft({
                                ...appEditDraft,
                                primary_skills: e.target.value
                                  .split(',')
                                  .map((x) => x.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="Enter skills separated by comma"
                          />
                        ) : Array.isArray(primarySkills) && primarySkills.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {primarySkills.map((s: string, idx: number) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {s}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">N/A</p>
                        )}
                      </div>

                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">Secondary Skills</h3>
                        {appEditMode ? (
                          <Input
                            value={Array.isArray(appEditDraft?.secondary_skills) ? appEditDraft.secondary_skills.join(', ') : ''}
                            onChange={(e) =>
                              setAppEditDraft({
                                ...appEditDraft,
                                secondary_skills: e.target.value
                                  .split(',')
                                  .map((x) => x.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="Enter skills separated by comma"
                          />
                        ) : Array.isArray(secondarySkills) && secondarySkills.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {secondarySkills.map((s: string, idx: number) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {s}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">N/A</p>
                        )}
                      </div>

                      {Array.isArray(experience) && experience.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-gray-700 mb-2">Experience</h3>
                          <ul className="space-y-2 text-sm text-gray-700">
                            {experience.map((exp: any, idx: number) => (
                              <li key={idx} className="border rounded-md p-2">
                                <p className="font-medium">{exp.company || 'Company N/A'}</p>
                                <p>{exp.role || exp.title || 'Role N/A'}</p>
                                {(exp.start_year || exp.end_year) && (
                                  <p className="text-xs text-muted-foreground">
                                    {exp.start_year || '?'} - {exp.end_year || 'Present'}
                                  </p>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {((appEditMode ? appEditDraft?.education || [] : education).length > 0) || appEditMode ? (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-gray-700">Education</h3>
                            {appEditMode && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const currentEdus = appEditDraft?.education || [];
                                  setAppEditDraft({
                                    ...appEditDraft,
                                    education: [...currentEdus, { degree: '', institute: '', passing_year: '' }]
                                  });
                                }}
                              >
                                Add Education
                              </Button>
                            )}
                          </div>
                          <ul className="space-y-2 text-sm text-gray-700">
                            {(appEditMode ? appEditDraft?.education || [] : education).map((edu: any, idx: number) => (
                              <li key={idx} className="border rounded-md p-2 relative">
                                {appEditMode ? (
                                  <div className="space-y-2 pr-8 mt-1">
                                    <Input
                                      placeholder="Degree"
                                      value={edu.degree || ''}
                                      onChange={(e) => {
                                        const newEdus = [...appEditDraft.education];
                                        newEdus[idx] = { ...newEdus[idx], degree: e.target.value };
                                        setAppEditDraft({ ...appEditDraft, education: newEdus });
                                      }}
                                    />
                                    <Input
                                      placeholder="Institution"
                                      value={edu.institute || edu.institution_name || ''}
                                      onChange={(e) => {
                                        const newEdus = [...appEditDraft.education];
                                        newEdus[idx] = { ...newEdus[idx], institute: e.target.value };
                                        setAppEditDraft({ ...appEditDraft, education: newEdus });
                                      }}
                                    />
                                    <Input
                                      placeholder="Passing Year"
                                      value={edu.passing_year || ''}
                                      onChange={(e) => {
                                        const newEdus = [...appEditDraft.education];
                                        newEdus[idx] = { ...newEdus[idx], passing_year: e.target.value };
                                        setAppEditDraft({ ...appEditDraft, education: newEdus });
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newEdus = appEditDraft.education.filter((_: any, i: number) => i !== idx);
                                        setAppEditDraft({ ...appEditDraft, education: newEdus });
                                      }}
                                      className="absolute top-2 right-2 text-red-500 hover:text-red-700 p-1"
                                      title="Remove"
                                    >
                                      <XCircle className="h-4 w-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <p className="font-medium">{edu.degree || 'Degree N/A'}</p>
                                    <p>{edu.institute || edu.institution_name || 'Institute N/A'}</p>
                                    {edu.passing_year && (
                                      <p className="text-xs text-muted-foreground">Year: {edu.passing_year}</p>
                                    )}
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {Array.isArray(projects) && projects.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-gray-700 mb-2">Projects</h3>
                          <ul className="space-y-2 text-sm text-gray-700">
                            {projects.map((proj: any, idx: number) => (
                              <li key={idx} className="border rounded-md p-2">
                                <p className="font-medium">{proj.project_title || 'Project'}</p>
                                {proj.description && <p>{proj.description}</p>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Resume Preview Box */}
                    {resumePreviewUrl && (
                      <div className="mt-8 border-t pt-6 w-full animate-in fade-in zoom-in-95 duration-300">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Resume Preview</h3>
                        <div className="w-full h-[600px] border rounded-xl overflow-hidden bg-slate-50 relative group flex items-center justify-center transition-transform duration-300 ease-in-out hover:scale-[1.01] hover:shadow-lg">
                          {resumePreviewType === 'pdf' && (
                            <iframe
                              src={`${resumePreviewUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                              title="Resume Preview"
                              className="w-full h-full rounded-xl"
                            />
                          )}
                          {resumePreviewType === 'image' && (
                            <img
                              src={resumePreviewUrl}
                              alt="Resume Preview"
                              className="w-full h-full object-contain bg-muted"
                            />
                          )}
                          {resumePreviewType === 'unsupported' && (
                            <div className="text-center p-8 text-gray-500">
                              <FileIcon className="mx-auto h-16 w-16 mb-4 text-gray-400" />
                              <p className="font-medium text-lg mb-2">Browser Preview Not Supported</p>
                              <p className="text-sm">
                                The attached file <strong>{resumePreviewUrl}</strong> uses a proprietary format (like Word or Excel) which cannot be safely rendered inside the browser without third-party plugins. <br /> Please download the file to view it natively on your device.
                              </p>
                              <Button
                                variant="default"
                                className="mt-6"
                                onClick={() => {
                                  // Resume preview URL acts as the filename for unsupported
                                  handleDownloadResume(appDetails.resume.resume_id);
                                }}
                              >
                                Download {resumePreviewUrl}
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Job details modal (recruiter + vendor + admin + lead) */}
        {(profile?.role === 'recruiter' || profile?.role === 'vendor' || profile?.role === 'admin' || profile?.role === 'lead') && jobViewData && (
          <div
            className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 transition-opacity ${jobViewOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            onClick={() => setJobViewOpen(false)}
          >
            <div
              className="bg-card rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="absolute top-4 right-4 text-gray-400 hover:text-muted-foreground"
                onClick={() => setJobViewOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>

              {/* Job details */}
              <h2 className="text-2xl font-bold mb-1">{jobViewData.title}</h2>
              <p className="text-sm text-muted-foreground mb-1">{jobViewData.company}</p>
              <p className="text-xs text-muted-foreground mb-2">
                Job ID: {jobViewData.job_id} {jobViewData.job_code && `• Code: ${jobViewData.job_code}`}
              </p>

              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700 mb-4">
                {jobViewData.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {jobViewData.location}
                  </span>
                )}
                {jobViewData.type && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-4 w-4" />
                    {jobViewData.type}
                  </span>
                )}
                {jobViewData.experience_level && (
                  <span className="flex items-center gap-1">
                    <Building className="h-4 w-4" />
                    {jobViewData.experience_level}
                  </span>
                )}
              </div>

              {/* Applicants section */}
              <div className="mt-2 mb-4">
                <h3 className="text-lg font-semibold mb-2">
                  Applicants ({loadingApplicants ? '...' : jobApplicants.length})
                </h3>

                {loadingApplicants ? (
                  <div className="py-4 text-sm text-muted-foreground">Loading applicants...</div>
                ) : jobApplicants.length === 0 ? (
                  <div className="py-4 text-sm text-muted-foreground">No applications received yet.</div>
                ) : (
                  <div className="space-y-2">
                    {jobApplicants.map((app: any) => (
                      <button
                        key={app.application_id}
                        className="w-full text-left border rounded-lg p-3 hover:bg-background transition-all"
                        onClick={() => handleRecruiterViewMore(app)}
                      >
                        <p className="font-medium text-foreground">{app.applicant_name || app.candidate_name || app.applicant_email}</p>
                        <p className="text-sm text-muted-foreground">{app.applicant_email}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Applied: {formatDMY(app.applied_date)} • Status: <span className="font-semibold">{app.display_status ?? app.status}</span>
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer area intentionally left without upload actions; use main uploader instead */}
            </div>
          </div>
        )}
        {/* Status Update Modal */}
        <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}>
          <DialogContent className="max-w-md z-[100]">
            <DialogHeader>
              <DialogTitle>Update Application Status</DialogTitle>
              <DialogDescription>
                Select a new status and add administrative notes for this application.
              </DialogDescription>
            </DialogHeader>

            {selectedApplicationForStatus && (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Applicant</Label>
                  <p className="text-sm text-muted-foreground">
                    {selectedApplicationForStatus.applicant_name ||
                      selectedApplicationForStatus.candidate_name ||
                      selectedApplicationForStatus.applicant_email ||
                      (selectedApplicationForStatus.candidate?.full_name) ||
                      'Unknown Applicant'}
                  </p>
                </div>

                <div>
                  <Label htmlFor="status" className="mb-2 block">Status</Label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a status" />
                    </SelectTrigger>
                    <SelectContent className="z-[110]">
                      {selectedApplicationForStatus.application_type === 'vendor' ? (
                        <>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="vendor_applied">Applied</SelectItem>
                          <SelectItem value="vendor_reviewing">Under Review</SelectItem>
                          <SelectItem value="vendor_shortlisted">Shortlisted</SelectItem>
                          <SelectItem value="vendor_rejected">Rejected</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="applied">Applied</SelectItem>
                          <SelectItem value="profile_share">Profile Share</SelectItem>
                          <SelectItem value="screen_selected">Screen Selected</SelectItem>
                          <SelectItem value="interview_l1">Interview L1</SelectItem>
                          <SelectItem value="interview_l2">Interview L2</SelectItem>
                          <SelectItem value="interview_l3">L3 Interview</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                          <SelectItem value="offered">Offered</SelectItem>
                          <SelectItem value="backout">Backout</SelectItem>
                          <SelectItem value="bg_status">BG Status</SelectItem>
                          <SelectItem value="joined">Joined</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="notes" className="mb-2 block">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Add notes about this application..."
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <Button variant="outline" onClick={() => setIsStatusModalOpen(false)} disabled={isUpdatingStatus}>
                    Cancel
                  </Button>
                  <Button onClick={submitStatusUpdate} disabled={isUpdatingStatus} className="bg-blue-600 hover:bg-blue-700 text-white">
                    {isUpdatingStatus ? 'Updating...' : 'Update Status'}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}