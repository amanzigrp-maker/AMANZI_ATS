import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '@/utils/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const PAGE_SIZE = 10;

const buildPageRange = (current: number, total: number) => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>();
  set.add(1);
  set.add(total);
  [current - 1, current, current + 1].forEach((p) => {
    if (p >= 1 && p <= total) set.add(p);
  });
  const pages = Array.from(set).sort((a, b) => a - b);
  const out: (number | '...')[] = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    if (i > 0 && p - pages[i - 1] > 1) out.push('...');
    out.push(p);
  }
  return out;
};

const JobsList: React.FC = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();

  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });

  const fetchJobs = async (pg: number) => {
    try {
      setLoading(true);
      const res = await api.get(`/api/jobs?page=${pg}&limit=${PAGE_SIZE}`);
      const data = (res as any)?.data ?? res;
      const list = (data as any)?.data ?? data ?? [];
      setJobs(Array.isArray(list) ? list : []);

      const p = (data as any)?.pagination;
      if (p && typeof p === 'object') {
        setPagination({
          page: Number(p.page) || pg,
          limit: Number(p.limit) || PAGE_SIZE,
          total: Number(p.total) || 0,
          totalPages: Number(p.totalPages) || 1,
        });
      } else {
        setPagination({ page: pg, limit: PAGE_SIZE, total: (Array.isArray(list) ? list.length : 0), totalPages: 1 });
      }
    } catch (err) {
      console.error('Failed to fetch jobs list:', err);
      setJobs([]);
      setPagination({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs(1);
  }, []);

  useEffect(() => {
    fetchJobs(page);
  }, [page]);

  const formatDMY = (value: string | Date) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const getStatusColor = (status: string) => {
    switch ((status || '').toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'on hold':
        return 'bg-yellow-100 text-yellow-800';
      case 'closed':
      case 'inactive':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const statusFilter = (searchParams.get('status') || '').toLowerCase();
  const hasApplicantsFilter = searchParams.get('hasApplicants') === '1';
  const viewMode = (searchParams.get('view') || '').toLowerCase();

  let headerTitle = 'All Jobs';
  let headerSubtitle = 'Showing all jobs you have access to.';

  if (viewMode === 'active' || statusFilter === 'active') {
    headerTitle = 'Active Jobs';
    headerSubtitle = 'Only jobs that are currently active.';
  } else if (viewMode === 'applicants' && hasApplicantsFilter) {
    headerTitle = 'Jobs with Applicants';
    headerSubtitle = 'Jobs that have at least one applicant. Use the Applicants column to drill into candidates.';
  } else if (viewMode === 'interviews' && hasApplicantsFilter) {
    headerTitle = 'Jobs with Interviews Scheduled';
    headerSubtitle = 'Jobs that have applicants in interview-related stages.';
  } else if (viewMode === 'offers' && hasApplicantsFilter) {
    headerTitle = 'Jobs with Offers Extended';
    headerSubtitle = 'Jobs where at least one applicant has been offered.';
  } else if (viewMode === 'total') {
    headerTitle = 'All Jobs';
    headerSubtitle = 'Complete list of jobs you can access.';
  }

  const filteredJobs = useMemo(() => {
    const statusFilter = (searchParams.get('status') || '').toLowerCase();
    const hasApplicantsFilter = searchParams.get('hasApplicants') === '1';

    return jobs.filter((job: any) => {
      const totalApplicants =
        job.total_applicants ??
        job.totalApplicants ??
        job.application_count ??
        job.applicants_count ??
        job.applicantsCount ??
        0;

      if (statusFilter && String(job.status || '').toLowerCase() !== statusFilter) {
        return false;
      }

      if (hasApplicantsFilter && !totalApplicants) {
        return false;
      }

      return true;
    });
  }, [jobs, searchParams]);

  const goToPage = (p: number) => {
    if (p < 1 || p > pagination.totalPages) return;
    setPage(p);
  };

  return (
    <div className="min-h-screen bg-background px-4 py-6 lg:px-8 animate-fade-in">
      <Card>
        <CardHeader>
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
              <CardTitle className="text-2xl leading-tight">{headerTitle}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {headerSubtitle}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-4">
              <div className="space-y-3">
                <Skeleton className="h-4 w-32" />
                <div className="border rounded-md divide-y">
                  {[0, 1, 2, 3, 4].map((idx) => (
                    <div key={idx} className="flex items-center justify-between px-4 py-3">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (() => {
            if (filteredJobs.length === 0) {
              return <div className="py-8 text-center text-muted-foreground text-sm">No jobs found.</div>;
            }

            const renderTotalJobsTable = () => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Job Code</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Posted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.map((job: any, idx: number) => {
                    const id = job.job_id ?? job.id ?? idx;
                    return (
                      <TableRow
                        key={id}
                        className="transition-colors duration-150 hover:bg-background"
                      >
                        <TableCell className="font-medium">{job.title}</TableCell>
                        <TableCell>{job.job_code ?? ''}</TableCell>
                        <TableCell>{(job as any).client_name || job.company || ''}</TableCell>
                        <TableCell>{job.location ?? ''}</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(job.status)}>{job.status}</Badge>
                        </TableCell>
                        <TableCell>{formatDMY(job.posted_date)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/jobs/${job.job_id ?? job.id}?tab=applicants`)}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            );

            const renderApplicantsFocusedTable = () => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job Code</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Posted</TableHead>
                    <TableHead className="text-right">Total Applicants</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.map((job: any, idx: number) => {
                    const id = job.job_id ?? job.id ?? idx;
                    const totalApplicants =
                      job.total_applicants ??
                      job.totalApplicants ??
                      job.application_count ??
                      job.applicants_count ??
                      job.applicantsCount ??
                      0;

                    return (
                      <TableRow key={id} className="transition-colors duration-150 hover:bg-background">
                        <TableCell>{job.job_code ?? ''}</TableCell>
                        <TableCell className="font-medium">{job.title}</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(job.status)}>{job.status}</Badge>
                        </TableCell>
                        <TableCell>{formatDMY(job.posted_date)}</TableCell>
                        <TableCell className="text-right font-semibold">{totalApplicants}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/jobs/${job.job_id ?? job.id}/applicants`)}
                          >
                            View Applicants
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            );

            // For Total Applicants card: ultra-simple 2-column view
            if (viewMode === 'applicants') {
              return (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead className="text-right">Total Applicants</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredJobs.map((job: any, idx: number) => {
                      const id = job.job_id ?? job.id ?? idx;
                      const totalApplicants =
                        job.total_applicants ??
                        job.totalApplicants ??
                        job.application_count ??
                        job.applicants_count ??
                        job.applicantsCount ??
                        0;

                      return (
                        <TableRow
                          key={id}
                          className="transition-colors duration-150 hover:bg-background cursor-pointer"
                          onClick={() => navigate(`/jobs/${job.job_id ?? job.id}/applicants`)}
                        >
                          <TableCell className="font-medium">{job.title}</TableCell>
                          <TableCell className="text-right font-semibold">{totalApplicants}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              );
            }

            // Interviews / offers → richer applicants-focused view
            if (viewMode === 'interviews' || viewMode === 'offers') {
              return renderApplicantsFocusedTable();
            }

            // Default / total / active views
            return renderTotalJobsTable();
          })()}

          {!loading && pagination.totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3 mt-6 flex-wrap">
              <div className="text-xs text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => goToPage(page - 1)}
                >
                  Prev
                </Button>

                {buildPageRange(pagination.page, pagination.totalPages).map((p, i) =>
                  p === '...' ? (
                    <span key={`ellipsis-${i}`} className="px-1 text-gray-400 text-sm">
                      ...
                    </span>
                  ) : (
                    <Button
                      key={p}
                      variant={Number(p) === page ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => goToPage(Number(p))}
                    >
                      {p}
                    </Button>
                  )
                )}

                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => goToPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default JobsList;
