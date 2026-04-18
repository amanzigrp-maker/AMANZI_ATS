import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Filter, BarChart3, Users, Briefcase, CalendarCheck, Award, ChevronDown, ArrowLeft, CheckCircle2, XCircle, Clock, Trophy } from 'lucide-react';
import { authenticatedFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  Cell,
  XAxis,
  YAxis,
} from 'recharts';

const Reports: React.FC = () => {
  const navigate = useNavigate();

  const [resumeUploadsLoading, setResumeUploadsLoading] = useState(true);
  const [resumeUploads, setResumeUploads] = useState<any[]>([]);

  const [statusUpdatesLoading, setStatusUpdatesLoading] = useState(true);
  const [statusUpdates, setStatusUpdates] = useState<any[]>([]);

  const [interviewReportLoading, setInterviewReportLoading] = useState(true);
  const [interviewReport, setInterviewReport] = useState<any[]>([]);

  const [activeReportTab, setActiveReportTab] = useState<'uploads' | 'activity' | 'interviews'>('uploads');

  const [fromDate, setFromDate] = useState(
    dayjs().format('YYYY-MM-DD')
  );

  const [toDate, setToDate] = useState(
    dayjs().format('YYYY-MM-DD')
  );

  const [loading, setLoading] = useState(true);
  const [jobsLoading, setJobsLoading] = useState(true);

  const [summary, setSummary] = useState({
    totalApplications: 0,
    totalJobs: 0,
    interviews: 0,
    offers: 0,
    hires: 0,
  });

  const [jobPerformance, setJobPerformance] = useState<any[]>([]);

  const [selectedMetric, setSelectedMetric] = useState<
    'totalJobs' | 'totalApplications' | 'interviews' | 'offers' | 'hires'
  >('totalApplications');

  const apiFrom = dayjs(fromDate).format('YYYY-MM-DD');
  const apiTo = dayjs(toDate).format('YYYY-MM-DD');

  const handleResumeExport = async () => {
    try {
      const url = `/api/reports/resume-uploads/export?from=${apiFrom}&to=${apiTo}`;

      const token = localStorage.getItem('accessToken');
      const res = await fetch(url, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to export report');
        return;
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `resume-upload-report_${apiFrom}_to_${apiTo}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (e) {
      console.error('Export failed', e);
      alert('Failed to export report');
    }
  };

  const handleExport = async () => {
    try {
      const url = `/api/reports/jobs/export?from=${apiFrom}&to=${apiTo}`;

      const token = localStorage.getItem('accessToken');
      const res = await fetch(url, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to export report');
        return;
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `job-report_${apiFrom}_to_${apiTo}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (e) {
      console.error('Export failed', e);
      alert('Failed to export report');
    }
  };

  const handleStatusExport = async () => {
    try {
      const url = `/api/reports/status-updates/export?from=${apiFrom}&to=${apiTo}`;
      const token = localStorage.getItem('accessToken');
      const res = await fetch(url, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to export report');
        return;
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `status-update-report_${apiFrom}_to_${apiTo}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (e) {
      console.error('Export failed', e);
      alert('Failed to export report');
    }
  };

  const filteredJobs = useMemo(() => {
    if (!Array.isArray(jobPerformance)) return [];

    switch (selectedMetric) {
      case 'totalApplications':
        return jobPerformance.filter((j) => (j.applications ?? 0) > 0);
      case 'offers':
        return jobPerformance.filter((j) => (j.offers ?? 0) > 0);
      case 'hires':
        return jobPerformance.filter((j) => (j.hires ?? 0) > 0);
      case 'interviews':
        return jobPerformance.filter((j) => (j.interviews ?? 0) > 0);
      case 'totalJobs':
      default:
        return jobPerformance;
    }
  }, [jobPerformance, selectedMetric]);

  const resumeUploadsByDay = useMemo(() => {
    const map = new Map<string, number>();
    (resumeUploads || []).forEach((r: any) => {
      const d = r?.uploading_date ? dayjs(r.uploading_date).format('YYYY-MM-DD') : null;
      if (!d) return;
      map.set(d, (map.get(d) || 0) + 1);
    });

    const start = dayjs(apiFrom);
    const end = dayjs(apiTo);
    const days = Math.max(0, end.diff(start, 'day'));
    const out: Array<{ date: string; uploads: number }> = [];
    for (let i = 0; i <= days; i++) {
      const d = start.add(i, 'day').format('YYYY-MM-DD');
      out.push({ date: d, uploads: map.get(d) || 0 });
    }
    return out;
  }, [resumeUploads, apiFrom, apiTo]);

  const resumeStatusBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    (resumeUploads || []).forEach((r: any) => {
      const s = String(r?.status || 'unknown').trim().toLowerCase() || 'unknown';
      map.set(s, (map.get(s) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [resumeUploads]);

  const kpi = useMemo(() => {
    const totalUploads = Array.isArray(resumeUploads) ? resumeUploads.length : 0;
    const uniqueJobs = new Set((resumeUploads || []).map((r: any) => r?.job_code || r?.job_id).filter(Boolean)).size;
    const uniqueCandidates = new Set((resumeUploads || []).map((r: any) => r?.candidate_code || r?.candidate_id).filter(Boolean)).size;
    const topStatus = resumeStatusBreakdown[0]?.status || '-';
    return { totalUploads, uniqueJobs, uniqueCandidates, topStatus };
  }, [resumeUploads, resumeStatusBreakdown]);

  const metricCards = useMemo(
    () => [
      {
        key: 'totalJobs' as const,
        label: 'Total Jobs',
        value: summary.totalJobs,
        icon: Briefcase,
        description: 'Openings with activity on this day',
        accent: 'from-sky-500/10 to-sky-500/5 border-sky-100',
        pill: 'Jobs',
      },
      {
        key: 'totalApplications' as const,
        label: 'Total Applications',
        value: summary.totalApplications,
        icon: Users,
        description: 'Candidates who applied on this day',
        accent: 'from-indigo-500/10 to-indigo-500/5 border-indigo-100',
        pill: 'Pipeline',
      },
      {
        key: 'interviews' as const,
        label: 'Interviews',
        value: summary.interviews,
        icon: CalendarCheck,
        description: 'Interviews scheduled for this day',
        accent: 'from-amber-500/10 to-amber-500/5 border-amber-100',
        pill: 'Mid-pipeline',
      },
      {
        key: 'offers' as const,
        label: 'Offers',
        value: summary.offers,
        icon: BarChart3,
        description: 'Offers extended on this day',
        accent: 'from-emerald-500/10 to-emerald-500/5 border-emerald-100',
        pill: 'Conversion',
      },
    ],
    [summary]
  );

  useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      setJobsLoading(true);
      setResumeUploadsLoading(true);

      try {
        /* -------- STATS -------- */
        const statsRes = await authenticatedFetch(
          `/api/dashboard/stats?from=${apiFrom}&to=${apiTo}`
        );
        if (!statsRes.ok) throw new Error('Stats fetch failed');
        const stats = await statsRes.json();

        setSummary((prev) => ({
          ...prev,
          totalApplications:
            stats.totalApplicants ??
            stats.total_applicants ??
            0,
          interviews:
            stats.interviewsScheduled ??
            stats.interviews_scheduled ??
            0,
          offers:
            stats.offersExtended ??
            stats.offers_extended ??
            0,
          hires:
            stats.hires ??
            stats.accepted ??
            0,
        }));

        /* -------- RESUME UPLOAD REPORT (ROW-LEVEL) -------- */
        const resumeRes = await authenticatedFetch(
          `/api/reports/resume-uploads?from=${apiFrom}&to=${apiTo}`
        );
        if (!resumeRes.ok) throw new Error('Resume upload report fetch failed');
        const resumePayload = await resumeRes.json();
        setResumeUploads(
          Array.isArray(resumePayload.data) ? resumePayload.data : []
        );

        /* -------- STATUS UPDATE REPORT -------- */
        const statusRes = await authenticatedFetch(
          `/api/reports/status-updates?from=${apiFrom}&to=${apiTo}`
        );
        if (!statusRes.ok) throw new Error('Status update report fetch failed');
        const statusPayload = await statusRes.json();
        setStatusUpdates(
          Array.isArray(statusPayload.data) ? statusPayload.data : []
        );

        /* -------- INTERVIEW ASSESSMENT REPORT -------- */
        const interviewRes = await authenticatedFetch(
          `/api/interview/report?from=${apiFrom}&to=${apiTo}`
        );
        if (interviewRes.ok) {
          const interviewPayload = await interviewRes.json();
          setInterviewReport(
            Array.isArray(interviewPayload.data) ? interviewPayload.data : []
          );
        }
      } catch (err) {
        console.error('Reports fetch failed:', err);
      } finally {
        setLoading(false);
        setJobsLoading(false);
        setResumeUploadsLoading(false);
        setStatusUpdatesLoading(false);
        setInterviewReportLoading(false);
      }
    };

    fetchReports();
  }, [apiFrom, apiTo]);

  return (
    <div className="min-h-screen bg-gradient-subtle px-4 py-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-full border border-border hover:bg-slate-100 mt-2"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 dark:bg-indigo-900 px-3 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-200 border border-indigo-100 dark:border-indigo-800">
                <BarChart3 className="h-3 w-3" />
                Pipeline & Performance Reports
              </div>
              <h1 className="mt-3 text-2xl md:text-3xl font-semibold tracking-tight text-foreground leading-tight">
                Hiring overview
              </h1>
              <p className="mt-1 text-sm text-muted-foreground max-w-xl">
                Track how your jobs, applications, and interviews are moving through the pipeline.
              </p>
              {!loading && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Showing data from <b>{dayjs(apiFrom).format('DD MMM YYYY')}</b> to{' '}
                  <b>{dayjs(apiTo).format('DD MMM YYYY')}</b>
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs flex items-end gap-2">
              <div>
                <label className="block mb-1 text-[11px] font-medium text-muted-foreground">
                  From
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-9 rounded-md border border-border bg-card px-3 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-medium text-muted-foreground">
                  To
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-9 rounded-md border border-border bg-card px-3 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1 text-xs"
              >
                <Filter className="h-4 w-4" />
                Filters
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1 text-xs"
                onClick={handleExport}
              >
                Export
              </Button>
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card className="bg-card/80 shadow-sm">
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">Resume Uploads</div>
              <div className="mt-1 text-2xl font-semibold text-foreground tabular-nums">{kpi.totalUploads}</div>
              <div className="mt-1 text-xs text-muted-foreground">in selected range</div>
            </CardContent>
          </Card>
          <Card className="bg-card/80 shadow-sm">
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">Unique Jobs</div>
              <div className="mt-1 text-2xl font-semibold text-foreground tabular-nums">{kpi.uniqueJobs}</div>
              <div className="mt-1 text-xs text-muted-foreground">jobs with uploads</div>
            </CardContent>
          </Card>
          <Card className="bg-card/80 shadow-sm">
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">Unique Candidates</div>
              <div className="mt-1 text-2xl font-semibold text-foreground tabular-nums">{kpi.uniqueCandidates}</div>
              <div className="mt-1 text-xs text-muted-foreground">candidates uploaded</div>
            </CardContent>
          </Card>
          <Card className="bg-card/80 shadow-sm">
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">Top Status</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">{kpi.topStatus}</div>
              <div className="mt-1 text-xs text-muted-foreground">most common status</div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="bg-card/80 shadow-sm lg:col-span-2 overflow-hidden">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-foreground">Resume uploads over time</CardTitle>
              <p className="text-xs text-muted-foreground">Daily uploads in the selected date range</p>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  uploads: { label: 'Uploads', color: '#8d5df4' },
                }}
                className="h-64"
              >
                <BarChart data={resumeUploadsByDay} margin={{ left: 12, right: 12, top: 18, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickMargin={8}
                    minTickGap={32}
                    tickFormatter={(v) => dayjs(v).format('DD MMM')}
                  />
                  <YAxis allowDecimals={false} width={32} />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        labelFormatter={(label) => dayjs(String(label)).format('DD MMM YYYY')}
                      />
                    }
                  />
                  <Bar
                    dataKey="uploads"
                    name="uploads"
                    fill="var(--color-uploads)"
                    radius={[6, 6, 2, 2]}
                    maxBarSize={26}
                  >
                    {resumeUploadsByDay.map((_, idx) => (
                      <Cell
                        key={`cell-${idx}`}
                        fill={idx % 2 === 0 ? '#8d5df4' : '#fe5857'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="bg-card/80 shadow-sm overflow-hidden">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-foreground">Status breakdown</CardTitle>
              <p className="text-xs text-muted-foreground">Distribution by latest status in report</p>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  profile_share: { label: 'Profile Share', color: '#6366f1' },
                  screen_selected: { label: 'Screen Selected', color: '#4f46e5' },
                  interview_l1: { label: 'Interview L1', color: '#8b5cf6' },
                  interview_l2: { label: 'Interview L2', color: '#7c3aed' },
                  interview_l3: { label: 'L3 Interview', color: '#6d28d9' },
                  offered: { label: 'Offered', color: '#10b981' },
                  joined: { label: 'Joined', color: '#059669' },
                  rejected: { label: 'Rejected', color: '#ef4444' },
                  backout: { label: 'Backout', color: '#f97316' },
                  bg_status: { label: 'BG Status', color: '#64748b' },
                  pending: { label: 'Pending', color: '#fe5857' },
                  screening: { label: 'Screening', color: '#ff7a79' },
                  accepted: { label: 'Accepted', color: '#a784ff' }
                }}
                className="h-64"
              >
                {resumeStatusBreakdown.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-gray-400">No data</div>
                ) : (
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
                    <Pie
                      data={resumeStatusBreakdown}
                      dataKey="count"
                      nameKey="status"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      labelLine={false}
                      label={({ percent }) => `${Math.round((percent || 0) * 100)}%`}
                    >
                      {resumeStatusBreakdown.map((entry) => (
                        <Cell key={entry.status} fill={`var(--color-${entry.status})`} />
                      ))}
                    </Pie>
                    <ChartLegend content={<ChartLegendContent nameKey="status" />} />
                  </PieChart>
                )}
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Dynamic Report Section */}
        <Card className="bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100 dark:border-white/5 pb-4">
            <div className="flex items-center gap-4">
              <div className="space-y-1">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Report Details
                </CardTitle>
                <p className="text-[11px] text-muted-foreground">Select a report type to view detailed data</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {activeReportTab === 'activity' && (
                <div className="hidden md:flex gap-4 text-xs text-muted-foreground mr-4">
                  <span>Interviews: <b className="text-purple-600">{statusUpdates.filter(s => s.status?.includes('interview')).length}</b></span>
                  <span>Rejections: <b className="text-red-600">{statusUpdates.filter(s => s.status === 'rejected').length}</b></span>
                </div>
              )}

              <Select
                value={activeReportTab}
                onValueChange={(v: any) => setActiveReportTab(v)}
              >
                <SelectTrigger className="w-[200px] h-9 text-xs border-blue-200 bg-blue-50/50 text-blue-700 hover:bg-blue-100/50 focus:ring-blue-500/20 transition-all font-medium">
                  <SelectValue placeholder="Select Report" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uploads" className="text-blue-700 font-medium">Resume Upload Report</SelectItem>
                  <SelectItem value="activity">Pipeline Status Activity</SelectItem>
                  <SelectItem value="interviews">Interview Assessment</SelectItem>
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1 text-xs h-9 border-gray-200"
                onClick={activeReportTab === 'uploads' ? handleResumeExport : handleStatusExport}
              >
                Export CSV
              </Button>
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            {activeReportTab === 'uploads' ? (
              <div className="space-y-4">
                {resumeUploadsLoading && (
                  <p className="text-sm text-gray-400 py-8 text-center">Loading resume data...</p>
                )}
                {!resumeUploadsLoading && resumeUploads.length === 0 && (
                  <p className="text-sm text-gray-400 py-8 text-center text-muted-foreground">No resume uploads in this period.</p>
                )}
                {!resumeUploadsLoading && resumeUploads.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-white/10 bg-card">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Job Name</th>
                          <th className="px-4 py-3 text-left font-medium">Job Code</th>
                          <th className="px-4 py-3 text-left font-medium">Company</th>
                          <th className="px-4 py-3 text-left font-medium">Recruiter</th>
                          <th className="px-4 py-3 text-left font-medium">Candidate</th>
                          <th className="px-4 py-3 text-left font-medium">Date</th>
                          <th className="px-4 py-3 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                        {resumeUploads.map((r, idx) => (
                          <tr key={`${r.candidate_id}-${idx}`} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 text-foreground font-medium">{r.job_name || r.position || '-'}</td>
                            <td className="px-4 py-3 text-foreground tabular-nums">{r.job_code || '-'}</td>
                            <td className="px-4 py-3 text-muted-foreground">{r.company_name || '-'}</td>
                            <td className="px-4 py-3 text-muted-foreground">{r.recruiter_name || '-'}</td>
                            <td className="px-4 py-3 text-foreground font-medium">{r.candidate_name || '-'}</td>
                            <td className="px-4 py-3 text-muted-foreground tabular-nums">
                              {r.uploading_date ? dayjs(r.uploading_date).format('DD MMM YYYY') : '-'}
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold bg-slate-100 text-slate-700">
                                {r.status || '-'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {statusUpdatesLoading && (
                  <p className="text-sm text-gray-400 py-8 text-center">Loading activity data...</p>
                )}
                {!statusUpdatesLoading && statusUpdates.length === 0 && (
                  <p className="text-sm text-gray-400 py-8 text-center text-muted-foreground">No status updates in this period.</p>
                )}
                {!statusUpdatesLoading && statusUpdates.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-white/10 bg-card">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Time Index</th>
                          <th className="px-4 py-3 text-left font-medium">Candidate</th>
                          <th className="px-4 py-3 text-left font-medium">New Status</th>
                          <th className="px-4 py-3 text-left font-medium">Job Details</th>
                          <th className="px-4 py-3 text-left font-medium">Recruiter</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                        {statusUpdates.map((r, idx) => (
                          <tr key={`${r.application_id}-${idx}`} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 text-muted-foreground tabular-nums">
                              {r.updated_at ? dayjs(r.updated_at).format('DD MMM, HH:mm') : '-'}
                            </td>
                            <td className="px-4 py-3 text-foreground font-semibold">{r.candidate_name || '-'}</td>
                            <td className="px-4 py-3">
                              <span className={cn(
                                "px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider",
                                r.status === 'rejected' ? "bg-red-50 text-red-600 border border-red-100" :
                                  r.status?.includes('interview') ? "bg-purple-50 text-purple-600 border border-purple-100" :
                                    "bg-blue-50 text-blue-600 border border-blue-100"
                              )}>
                                {r.status || '-'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-foreground text-xs font-medium">{r.job_name || '-'}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{r.job_code || '-'}</div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{r.recruiter_name || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeReportTab === 'interviews' && (
              <div className="space-y-4">
                {interviewReportLoading && (
                  <p className="text-sm text-gray-400 py-8 text-center">Loading interview data...</p>
                )}
                {!interviewReportLoading && interviewReport.length === 0 && (
                  <p className="text-sm text-gray-400 py-8 text-center text-muted-foreground">No interview assessments in this period.</p>
                )}
                {!interviewReportLoading && interviewReport.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-white/10 bg-card">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Candidate</th>
                          <th className="px-4 py-3 text-left font-medium">Role</th>
                          <th className="px-4 py-3 text-left font-medium">Score</th>
                          <th className="px-4 py-3 text-left font-medium">Percentage</th>
                          <th className="px-4 py-3 text-left font-medium">Time Taken</th>
                          <th className="px-4 py-3 text-left font-medium">Date</th>
                          <th className="px-4 py-3 text-center font-medium">Decision</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                        {interviewReport.map((r: any, idx: number) => {
                          const pct = r.percentage || 0;
                          const perfColor = pct >= 80 ? '#10B981' : pct >= 60 ? '#3B82F6' : pct >= 40 ? '#F59E0B' : '#EF4444';
                          const perfLabel = pct >= 80 ? 'Excellent' : pct >= 60 ? 'Good' : pct >= 40 ? 'Average' : 'Poor';
                          return (
                            <tr key={`interview-${r.session_id}-${idx}`} className="hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-3">
                                <div className="text-foreground font-semibold">{r.candidate_name || '-'}</div>
                                <div className="text-[10px] text-muted-foreground font-mono">{r.candidate_email}</div>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground text-xs">{r.job_role || '-'}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <Trophy className="w-3.5 h-3.5" style={{ color: perfColor }} />
                                  <span className="font-bold text-foreground tabular-nums">{r.score}/{r.total_questions}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: perfColor }} />
                                  </div>
                                  <span className="text-xs font-bold tabular-nums" style={{ color: perfColor }}>{pct}%</span>
                                </div>
                                <div className="text-[10px] mt-0.5" style={{ color: perfColor }}>{perfLabel}</div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <Clock className="w-3.5 h-3.5" />
                                  <span className="text-xs tabular-nums">{r.time_taken_mins != null ? `${r.time_taken_mins} min` : '-'}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground tabular-nums text-xs">
                                {r.completed_at ? dayjs(r.completed_at).format('DD MMM, HH:mm') : '-'}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={async () => {
                                      const newDecision = r.decision === 'selected' ? 'pending' : 'selected';
                                      try {
                                        await authenticatedFetch('/api/interview/decision', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ session_id: r.session_id, decision: newDecision }),
                                        });
                                        setInterviewReport(prev => prev.map(item =>
                                          item.session_id === r.session_id ? { ...item, decision: newDecision } : item
                                        ));
                                      } catch (e) { console.error(e); }
                                    }}
                                    className={cn(
                                      'p-1.5 rounded-lg border transition-all duration-200',
                                      r.decision === 'selected'
                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-600 shadow-sm shadow-emerald-100'
                                        : 'bg-white border-gray-200 text-gray-400 hover:border-emerald-300 hover:text-emerald-500'
                                    )}
                                    title="Select"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={async () => {
                                      const newDecision = r.decision === 'rejected' ? 'pending' : 'rejected';
                                      try {
                                        await authenticatedFetch('/api/interview/decision', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ session_id: r.session_id, decision: newDecision }),
                                        });
                                        setInterviewReport(prev => prev.map(item =>
                                          item.session_id === r.session_id ? { ...item, decision: newDecision } : item
                                        ));
                                      } catch (e) { console.error(e); }
                                    }}
                                    className={cn(
                                      'p-1.5 rounded-lg border transition-all duration-200',
                                      r.decision === 'rejected'
                                        ? 'bg-red-50 border-red-300 text-red-600 shadow-sm shadow-red-100'
                                        : 'bg-white border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-500'
                                    )}
                                    title="Reject"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                </div>
                                {r.decision && r.decision !== 'pending' && (
                                  <div className={cn(
                                    'text-center text-[10px] font-bold uppercase mt-1 tracking-wider',
                                    r.decision === 'selected' ? 'text-emerald-600' : 'text-red-600'
                                  )}>
                                    {r.decision}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default Reports;
