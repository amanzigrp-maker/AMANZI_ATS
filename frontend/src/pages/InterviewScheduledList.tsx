import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Search } from 'lucide-react';

interface ScheduledCandidate {
  application_id: number;
  candidate_id: number;
  full_name: string;
  email: string;
  phone?: string;
  status: string;
  applied_date: string;
  job_title?: string;
  recruiter_name?: string;
}

const InterviewScheduledList: React.FC = () => {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<ScheduledCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchScheduled = async () => {
      try {
        const res = await fetch('/api/applications/interviews', {
          headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        });
        if (res.ok) {
          const data = await res.json();
          const all: ScheduledCandidate[] = data.data || data || [];
          const interviewStatuses = ['interview_l1', 'interview_l2', 'interview_l3'];
          const filtered = all.filter((c) =>
            interviewStatuses.includes((c.status || '').toLowerCase())
          );
          setCandidates(filtered);
        }
      } catch (err) {
        console.error('Error fetching scheduled interviews list:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchScheduled();
  }, []);

  const visibleCandidates = candidates.filter((c) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      c.full_name.toLowerCase().includes(term) ||
      c.email.toLowerCase().includes(term) ||
      (c.phone || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-blue-50 px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
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
              Interviews Scheduled
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Clean list of all candidates currently scheduled for interview.
            </p>
          </div>
        </div>

        <Card className="shadow-sm border-border/80">
          <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-slate-100 bg-card/60 backdrop-blur-sm">
            <div>
              <CardTitle className="text-base">Scheduled interview candidates</CardTitle>
              <CardDescription className="text-xs">
                Filtered from the interview pipeline (status = interview).
              </CardDescription>
            </div>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, phone..."
                className="pl-9 h-9 text-sm bg-background border-border focus:bg-card"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading scheduled interviews...</div>
            ) : visibleCandidates.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No candidates with interview scheduled.</div>
            ) : (
              <div className="overflow-x-auto rounded-b-md">
                <table className="min-w-full text-sm">
                  <thead className="bg-background/80">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Candidate</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Job</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Contact</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Applied</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-card">
                    {visibleCandidates.map((c, idx) => (
                      <tr
                        key={c.application_id}
                        className={`border-t border-slate-100 ${idx % 2 === 0 ? 'bg-card' : 'bg-background/40'}`}
                      >
                        <td className="px-4 py-2 text-xs text-foreground">
                          <div className="font-medium text-[13px]">{c.full_name}</div>
                          <div className="text-[11px] text-muted-foreground">ID: {c.application_id}</div>
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-700">
                          <div className="text-[13px] font-medium truncate max-w-[220px]">
                            {c.job_title || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-700">
                          <div className="text-[12px]">{c.email}</div>
                          <div className="text-[11px] text-muted-foreground">{c.phone || '—'}</div>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {new Date(c.applied_date).toLocaleDateString(undefined, {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-4 py-2 text-xs capitalize text-indigo-700">{c.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default InterviewScheduledList;
