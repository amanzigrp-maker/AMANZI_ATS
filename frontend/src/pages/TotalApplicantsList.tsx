import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ApplicantRow {
  application_id: number;
  candidate_id?: number;
  candidate_name?: string;
  candidate_email?: string;
  job_id: number;
  job_title?: string;
  status: string;
  applied_date?: string;
}

const TotalApplicantsList = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ApplicantRow[]>([]);
  const [loading, setLoading] = useState(true);

  const searchParams = new URLSearchParams(location.search);
  const statusFilter = searchParams.get('status') || undefined;
  const jobIdFilter = searchParams.get('job_id') || undefined;
  const days = searchParams.get('days') || undefined;
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (days) params.set('days', days);
        if (from && to) {
          params.set('from', from);
          params.set('to', to);
        }

        const token = localStorage.getItem('accessToken');
        const res = await fetch(`/api/applications/interviews?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = await res.json();
        const list: any[] = data?.data ?? data ?? [];

        let mapped: ApplicantRow[] = list.map((item: any) => ({
          application_id: item.application_id,
          candidate_id: item.candidate_id ?? item.candidateId,
          candidate_name:
            item.candidate_name ??
            item.candidate_full_name ??
            item.full_name ??
            (item.first_name && item.last_name
              ? `${item.first_name} ${item.last_name}`
              : item.first_name ?? item.name),
          candidate_email: item.candidate_email ?? item.email,
          job_id: item.job_id,
          job_title: item.job_title ?? item.title,
          status: item.status,
          applied_date: item.applied_date,
        }));

        if (statusFilter) {
          const target = statusFilter.toLowerCase();
          mapped = mapped.filter(row => (row.status || '').toLowerCase() === target);
        }

        if (jobIdFilter) {
          const jobIdNum = parseInt(jobIdFilter, 10);
          if (!Number.isNaN(jobIdNum)) {
            mapped = mapped.filter(row => row.job_id === jobIdNum);
          }
        }

        setRows(mapped);
      } catch (err) {
        console.error('Failed to load applicants list', err);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [statusFilter, jobIdFilter, days, from, to]);

  return (
    <div className="min-h-screen bg-background py-6 px-4 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-4">
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
            <h1 className="text-2xl font-semibold tracking-tight text-foreground leading-tight">
              Total Applicants
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Candidate application history.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : rows.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground text-sm">No applicants found for this selection.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Candidate Code</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Applied</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(row => (
                    <TableRow key={row.application_id}>
                      <TableCell className="font-medium">{row.candidate_name ?? '-'}</TableCell>
                      <TableCell>{row.candidate_id != null ? `AT${String(row.candidate_id).padStart(6, '0')}` : '-'}</TableCell>
                      <TableCell>{row.candidate_email ?? '-'}</TableCell>
                      <TableCell>{row.job_title ?? `Job #${row.job_id}`}</TableCell>
                      <TableCell className="capitalize">{row.status}</TableCell>
                      <TableCell>{row.applied_date ? new Date(row.applied_date).toLocaleDateString() : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TotalApplicantsList;
