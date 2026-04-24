import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { authenticatedFetch } from '@/lib/api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  MapPin,
  Building2,
  Clock,
  DollarSign,
  Users,
  Calendar,
  Edit,
  Share2,
  MoreVertical,
  Briefcase,
  CheckCircle2
} from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface JobMatch {
  candidate_id: number;
  full_name: string;
  email: string;
  phone?: string;
  current_designation?: string;
  total_experience_years?: number;
  skills?: string[];
  experience_summary?: string;
  experience_score: number;
  skills_score: number;
  final_score: number;
}

const cleanSkills = (skills: string[] = []) =>
  skills
    .map((s) => String(s || '').trim().toLowerCase())
    .filter((s) => s.length >= 2)
    .filter((s) => /^[a-z0-9+.#]+$/.test(s));

const extractJobSkills = (text: string) =>
  cleanSkills(
    String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9+.#]+/)
      .filter(Boolean)
  );

function JobMatches({
  jobId,
  jobSkills,
  jobSkillsFallback,
  jobText,
}: {
  jobId: number;
  jobSkills: any;
  jobSkillsFallback?: any;
  jobText?: string;
}) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<JobMatch[]>([]);

  const splitSkills = (raw: any): string[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw.map((s) => String(s || '').trim()).filter(Boolean);
    }
    if (typeof raw === 'string') {
      const s = raw.trim();
      if (!s) return [];
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          return parsed.map((x) => String(x || '').trim()).filter(Boolean);
        }
      } catch {
        // ignore
      }
      return s
        .split(/[\n,|/]+/)
        .map((x) => x.trim())
        .filter(Boolean);
    }
    return [];
  };

  const normalizeSkill = (s: string): string => {
    const v = String(s || '')
      .toLowerCase()
      .replace(/\(.*?\)/g, ' ')
      .replace(/[^a-z0-9+#.\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const aliases: Record<string, string> = {
      js: 'javascript',
      ts: 'typescript',
      node: 'nodejs',
      'node.js': 'nodejs',
      reactjs: 'react',
      'react.js': 'react',
      nextjs: 'next',
      'next.js': 'next',
    };

    return aliases[v] || v;
  };

  const extractSkillsFromText = (text: string): string[] => {
    const t = String(text || '').toLowerCase();
    if (!t) return [];

    const knownSkills = [
      'python',
      'django',
      'flask',
      'fastapi',
      'javascript',
      'typescript',
      'react',
      'next',
      'nodejs',
      'express',
      'html',
      'css',
      'tailwind',
      'bootstrap',
      'postgresql',
      'mysql',
      'sqlite',
      'mongodb',
      'redis',
      'aws',
      'ec2',
      's3',
      'lambda',
      'docker',
      'kubernetes',
      'git',
      'github',
      'linux',
      'graphql',
      'rest',
      'api',
      'celery',
      'websocket',
      'flutter',
      'go',
    ];

    const hits = new Set<string>();

    for (const skill of knownSkills) {
      const needle = String(skill);
      if (!needle) continue;
      if (needle === 'api') {
        if (/\bapi\b/.test(t) || /\bapis\b/.test(t)) hits.add('api');
        continue;
      }
      if (needle === 'rest') {
        if (/\brest\b/.test(t) || /\brestful\b/.test(t)) hits.add('rest');
        continue;
      }
      if (needle === 'nodejs') {
        if (/\bnode\b/.test(t) || /node\.js/.test(t) || /\bnodejs\b/.test(t)) hits.add('nodejs');
        continue;
      }
      if (needle === 'next') {
        if (/\bnext\b/.test(t) || /next\.js/.test(t) || /\bnextjs\b/.test(t)) hits.add('next');
        continue;
      }
      if (needle === 'react') {
        if (/\breact\b/.test(t) || /react\.js/.test(t) || /\breactjs\b/.test(t)) hits.add('react');
        continue;
      }

      if (t.includes(needle)) hits.add(needle);
    }

    return Array.from(hits).map(normalizeSkill).filter(Boolean);
  };

  const fetchAiCandidates = async (id: number) => {
    const res = await authenticatedFetch(`/api/jobs/${id}/ai-candidates?forceRefresh=true`);
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401) throw new Error('Unauthorized. Please login again.');
      throw new Error(payload?.error || payload?.message || 'AI matching failed. Please try again.');
    }
    return payload;
  };

  const handleFindMatches = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAiCandidates(jobId);
      const raw = Array.isArray(data?.data) ? data.data : [];

      const normalized: JobMatch[] = raw
        .map((m: any) => ({
          candidate_id: Number(m?.candidate_id),
          full_name: String(m?.full_name || ''),
          email: String(m?.email || ''),
          phone: m?.phone ? String(m.phone) : '',
          current_designation: m?.current_designation ? String(m.current_designation) : '',
          total_experience_years: Number(m?.total_experience_years) || 0,
          skills: Array.isArray(m?.skills) ? m.skills.map(String) : [],
          experience_summary: m?.experience_summary ? String(m.experience_summary) : '',
          experience_score: Number(m?.experience_score) || 0,
          skills_score: Number(m?.skills_score) || 0,
          final_score: Number(m?.final_score) || 0,
        }))
        .filter((m: JobMatch) => Number.isFinite(m.candidate_id) && !!m.full_name);

      normalized.sort((a, b) => (b.final_score || 0) - (a.final_score || 0));
      setMatches(normalized);

      if (normalized.length === 0) {
        toast.message('No strong matches found');
      }
    } catch (e: any) {
      const msg = e.message || 'System busy. Please try ranking again in a moment.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Candidate Matches</CardTitle>
            <CardDescription>
              Find ranked candidates using semantic matching (pgvector)
            </CardDescription>
          </div>
          <Button onClick={handleFindMatches} disabled={loading}>
            {loading ? (
              <span className="flex items-center">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
                Loading...
              </span>
            ) : (
              'Find Matches'
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 text-sm text-red-600">{error}</div>
        )}

        <p className="text-sm text-muted-foreground mb-3">Top matches ranked by AI fit.</p>

        {matches.length === 0 ? (
          <div className="text-sm text-muted-foreground">No strong matches found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">Name</th>
                </tr>
              </thead>
              <tbody>
                {matches.slice(0, 10).map((m) => (
                  <tr key={m.candidate_id} className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/candidate/${m.candidate_id}`)}>
                    <td className="py-2 pr-4 font-medium">{m.full_name}</td>
                    <td className="py-2 pr-4 text-slate-500">{m.current_designation}</td>
                    <td className="py-2 pr-4 text-slate-500">{m.total_experience_years}y</td>
                    <td className="py-2 text-right">
                      <Badge variant="outline" className="bg-blue-50">{(m.final_score * 100).toFixed(0)}% Match</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CandidateMatchesCard({ jobId }: { jobId: number }) {
  const navigate = useNavigate();
  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailsCandidate, setDetailsCandidate] = useState<JobMatch | null>(null);

  const tryParseJson = (raw: string): any | null => {
    const s = String(raw || '').trim();
    if (!s) return null;
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  const pretty = (val: any) => {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val ?? '');
    }
  };

  const fetchAiCandidates = async (id: number) => {
    const res = await authenticatedFetch(`/api/jobs/${id}/ai-candidates`);
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401) throw new Error('Unauthorized. Please login again.');
      throw new Error(payload?.error || payload?.message || 'AI matching failed. Please try again.');
    }
    return payload;
  };

  const handleFindMatches = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch matches
      const data = await fetchAiCandidates(jobId);
      const raw = Array.isArray(data?.data) ? data.data : [];

      const normalized: JobMatch[] = raw
        .map((m: any) => ({
          candidate_id: Number(m?.candidate_id),
          full_name: String(m?.full_name || ''),
          email: String(m?.email || ''),
          phone: m?.phone ? String(m.phone) : '',
          current_designation: m?.current_designation ? String(m.current_designation) : '',
          total_experience_years: Number(m?.total_experience_years) || 0,
          skills: Array.isArray(m?.skills) ? m.skills.map(String) : [],
          experience_summary: m?.experience_summary ? String(m.experience_summary) : '',
          experience_score: Number(m?.experience_score) || 0,
          skills_score: Number(m?.skills_score) || 0,
          final_score: Number(m?.final_score) || 0,
        }))
        .filter((m: JobMatch) => Number.isFinite(m.candidate_id) && !!m.full_name);

      normalized.sort((a, b) => (b.final_score || 0) - (a.final_score || 0));
      setMatches(normalized);

      if (normalized.length === 0) {
        toast.message('No strong matches found');
      }
    } catch (e: any) {
      const msg = e.message || 'AI ranking currently unavailable. Check your internet or try again.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Candidate Matches</CardTitle>
            <CardDescription>
              Find ranked candidates using semantic matching (pgvector)
            </CardDescription>
          </div>
          <Button
            onClick={handleFindMatches}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
          >
            {loading ? (
              <span className="flex items-center">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
                Searching...
              </span>
            ) : (
              'Find Matches'
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 text-sm text-red-600">{error}</div>
        )}

        <p className="text-sm text-muted-foreground mb-3">Top matches ranked by AI fit.</p>

        {/* JD Match Reference Score */}
        {matches.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">
                  Job Match Reference: 100%
                </span>
              </div>
              <span className="text-xs text-blue-700">
                All candidate scores are relative to this baseline
              </span>
            </div>
          </div>
        )}

        {matches.length === 0 ? (
          <div className="text-sm text-muted-foreground">No strong matches found</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {matches.map((m, idx) => {
              const isTop3 = idx < 3;
              const safeName = String(m.full_name || '')
                .replace(/[^\x20-\x7E]/g, '')
                .trim();
              const fit = String((m as any).fit_label || '').trim();
              const fitLabel = fit || (idx < 2 ? 'Strong' : idx < 4 ? 'Good' : 'Partial');
              const safeEmail = String(m.email || '').trim();
              const safePhone = String(m.phone || '').trim();
              const safeDesignation = String(m.current_designation || '').trim();
              const expYears = Number(m.total_experience_years) || 0;
              const topSkills = Array.isArray(m.skills) ? m.skills.filter(Boolean).slice(0, 6) : [];

              // Calculate ranking explanation
              const finalScore = Number(m.final_score) || 0;
              const skillsScore = Number(m.skills_score) || 0;
              const expScore = Number(m.experience_score) || 0;

              // Determine strongest factor
              let rankingReason = '';
              if (skillsScore > expScore) {
                rankingReason = `Strong skills match (${(skillsScore * 100).toFixed(0)}%)`;
              } else if (expScore > skillsScore) {
                rankingReason = `Relevant experience (${(expScore * 100).toFixed(0)}%)`;
              } else {
                rankingReason = `Balanced profile (${(finalScore * 100).toFixed(0)}%)`;
              }

              // Add context based on rank
              if (idx === 0) {
                rankingReason = `🥇 Highest overall score - ${rankingReason}`;
              } else if (idx === 1) {
                const scoreDiff = ((matches[0].final_score - finalScore) * 100).toFixed(0);
                rankingReason = `🥈 ${scoreDiff}% below #1 - ${rankingReason}`;
              } else if (idx === 2) {
                const scoreDiff = ((matches[0].final_score - finalScore) * 100).toFixed(0);
                rankingReason = `🥉 ${scoreDiff}% below #1 - ${rankingReason}`;
              }

              return (
                <Card key={m.candidate_id} className="relative overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg font-bold text-foreground">#{idx + 1}</span>
                          {isTop3 && (
                            <Badge className="bg-green-100 text-green-800 text-xs">Top {idx + 1}</Badge>
                          )}
                        </div>
                        <h3 className="font-semibold text-foreground truncate">{safeName || 'Unnamed'}</h3>
                        <p className="text-sm text-muted-foreground truncate">{safeDesignation || 'Candidate'}</p>
                      </div>
                      <Badge
                        className={
                          fitLabel === 'Strong'
                            ? 'bg-green-100 text-green-800'
                            : fitLabel === 'Good'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                        }
                      >
                        {fitLabel}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Why Ranked Here?</p>
                        <p className="text-xs text-gray-700" title={rankingReason}>{rankingReason}</p>
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Exp: {expYears} yrs</span>
                        <span>Score: {(finalScore * 100).toFixed(1)}%</span>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDetailsCandidate(m)}
                          className="flex-1"
                        >
                          Details
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/candidate/${m.candidate_id}`)}
                          className="flex-1"
                        >
                          Shortlist
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Dialog open={!!detailsCandidate} onOpenChange={(open) => (!open ? setDetailsCandidate(null) : null)}>
          <DialogContent className="max-w-3xl">
            {(() => {
              const m = detailsCandidate;
              if (!m) return null;

              const safeName = String(m.full_name || '').replace(/[^\x20-\x7E]/g, '').trim() || 'Unnamed';
              const expPct = Math.max(0, (Number(m.experience_score) || 0) * 100);
              const skillsPct = Math.max(0, (Number(m.skills_score) || 0) * 100);
              const finalPct = Math.max(0, (Number(m.final_score) || 0) * 100);
              const safeEmail = String(m.email || '').trim();
              const safePhone = String(m.phone || '').trim();
              const safeDesignation = String(m.current_designation || '').trim();
              const expYears = Number(m.total_experience_years) || 0;
              const skills = Array.isArray(m.skills) ? m.skills.filter(Boolean).map(String) : [];
              const rawExperience = String((m as any).experience_summary || '').trim();
              const parsedExperience = tryParseJson(rawExperience);

              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center justify-between gap-3">
                      <span className="truncate">{safeName}</span>
                      <span className="inline-flex items-center gap-2">
                        <Badge className="bg-gray-100 text-gray-800">Exp {expPct.toFixed(1)}%</Badge>
                        <Badge className="bg-gray-100 text-gray-800">Skills {skillsPct.toFixed(1)}%</Badge>
                        <Badge className="bg-green-100 text-green-800">Final {finalPct.toFixed(1)}%</Badge>
                      </span>
                    </DialogTitle>
                    <DialogDescription>
                      Candidate details and match breakdown
                    </DialogDescription>
                  </DialogHeader>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1">
                      <div className="rounded-lg border bg-card p-4">
                        <div className="text-xs text-muted-foreground mb-2">Profile</div>
                        <div className="text-sm font-medium text-foreground break-words">{safeDesignation || '-'}</div>
                        <div className="mt-2 space-y-1 text-xs text-gray-700">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Experience</span>
                            <span className="font-medium">{expYears ? `${expYears} yrs` : '-'}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Email</span>
                            <span className="font-medium truncate max-w-[160px]" title={safeEmail}>{safeEmail || '-'}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Phone</span>
                            <span className="font-medium">{safePhone || '-'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-2 space-y-4">
                      <div className="rounded-lg border bg-card p-4">
                        <div className="text-xs text-muted-foreground mb-2">Skills</div>
                        {skills.length ? (
                          <div className="flex flex-wrap gap-2">
                            {skills.slice(0, 24).map((s, i) => (
                              <span
                                key={`${s}-${i}`}
                                className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800 border border-blue-100"
                                title={s}
                              >
                                {s}
                              </span>
                            ))}
                            {skills.length > 24 ? (
                              <span className="text-xs text-muted-foreground self-center">+{skills.length - 24} more</span>
                            ) : null}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">No skills available</div>
                        )}
                      </div>

                      <div className="rounded-lg border bg-card p-4">
                        <div className="text-xs text-muted-foreground mb-2">Experience</div>
                        {rawExperience ? (
                          <div className="max-h-64 overflow-auto rounded-md bg-background border p-3">
                            {parsedExperience ? (
                              <pre className="text-xs text-gray-800 whitespace-pre-wrap">{pretty(parsedExperience)}</pre>
                            ) : (
                              <div className="text-sm text-gray-800 whitespace-pre-wrap">{rawExperience}</div>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">Experience information not available</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDetailsCandidate(null)}>
                      Close
                    </Button>
                    <Button onClick={() => navigate(`/candidate/${m.candidate_id}`)}>
                      Open Candidate
                    </Button>
                  </DialogFooter>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

interface Job {
  job_id: number;
  title: string;
  company: string;
  description: string;
  requirements: string[];
  skills: string[];
  location: string;
  employment_type: string;
  experience_level: string;
  salary_min?: number;
  salary_max?: number;
  benefits: string[];
  remote_option: boolean;
  status: string;
  posted_date: string;
  posted_by_name: string;
  application_count: number;
}

interface Applicant {
  application_id: number;
  applicant_name: string;
  applicant_email: string;
  application_type: string;
  status: string;
  applied_date: string;
  candidate_name?: string;
  candidate_skills?: string[];
  gender?: string;
}

const getConsistentAvatar = (name: string, gender?: string) => {
  const g = (gender || '').toLowerCase();
  if (g === 'female' || g === 'f') return '/avatars/avatar-5.png';
  if (g === 'male' || g === 'm') return '/avatars/avatar-1.png';

  const avatars = [
    '/avatars/avatar-1.png',
    '/avatars/avatar-2.png',
    '/avatars/avatar-3.png',
    '/avatars/avatar-4.png',
    '/avatars/avatar-5.png',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % avatars.length;
  return avatars[index];
};

export default function JobDetails() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const fetchJobDetails = async () => {
      if (!id) return;

      try {
        setLoading(true);

        // Fetch job details
        const jobResponse = await authenticatedFetch(`/api/jobs/${id}`);
        if (!jobResponse.ok) {
          throw new Error('Failed to fetch job details');
        }
        const jobData = await jobResponse.json();
        setJob(jobData.data);

        // Fetch job applications
        const applicationsResponse = await authenticatedFetch(`/api/applications/jobs/${id}`);
        if (applicationsResponse.ok) {
          const applicationsData = await applicationsResponse.json();
          setApplicants(applicationsData.data || []);
        }

      } catch (err) {
        console.error('Error fetching job details:', err);
        setError(err instanceof Error ? err.message : 'Failed to load job details');
      } finally {
        setLoading(false);
      }
    };

    fetchJobDetails();
  }, [id]);

  const handleShareJob = () => {
    const url = `${window.location.origin}/jobs/${id}`;
    setShareUrl(url);
    setShowShareModal(true);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Job URL copied to clipboard!');
      setShowShareModal(false);
    } catch (err) {
      toast.error('Failed to copy URL');
    }
  };

  const handleEditJob = () => {
    navigate(`/jobs/${id}/edit`);
  };

  const handleCloseJob = async () => {
    try {
      const response = await authenticatedFetch(`/api/jobs/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'closed' })
      });

      if (response.ok) {
        toast.success('Job closed successfully');
        setJob(prev => prev ? { ...prev, status: 'closed' } : null);
      } else {
        toast.error('Failed to close job');
      }
    } catch (err) {
      toast.error('Failed to close job');
    }
  };

  const handleDeleteJob = async () => {
    try {
      const response = await authenticatedFetch(`/api/jobs/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('Job deleted successfully');
        navigate('/dashboard');
      } else {
        toast.error('Failed to delete job');
      }
    } catch (err) {
      toast.error('Failed to delete job');
    }
    setShowDeleteConfirm(false);
  };

  const handleDuplicateJob = () => {
    navigate(`/jobs/create?duplicate=${id}`);
  };

  const handleViewAllApplicants = () => {
    navigate(`/jobs/${id}/applicants`);
  };

  const getStageColor = (stage: string) => {
    const s = (stage || '').toLowerCase();
    const colors: Record<string, string> = {
      'profile_share': 'bg-blue-100 text-blue-800',
      'screen_selected': 'bg-indigo-100 text-indigo-800',
      'interview_l1': 'bg-purple-100 text-purple-800',
      'interview_l2': 'bg-purple-100 text-purple-800',
      'interview_l3': 'bg-purple-100 text-purple-800',
      'offered': 'bg-emerald-100 text-emerald-800',
      'rejected': 'bg-red-100 text-red-800',
      'backout': 'bg-orange-100 text-orange-800',
      'bg_status': 'bg-cyan-100 text-cyan-800',
      'joined': 'bg-green-100 text-green-800',
      // old ones for backward compatibility
      'applied': 'bg-blue-100 text-blue-800',
      'screening': 'bg-yellow-100 text-yellow-800',
      'review': 'bg-purple-100 text-purple-800',
      'interview': 'bg-orange-100 text-orange-800',
      'offer': 'bg-green-100 text-green-800',
    };
    return colors[s] || colors[stage] || 'bg-gray-100 text-gray-800';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'active': 'bg-green-100 text-green-800',
      'closed': 'bg-gray-100 text-gray-800',
      'draft': 'bg-yellow-100 text-yellow-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Job not found'}</p>
          <Button onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  const formatSalary = () => {
    if (job.salary_min && job.salary_max) {
      return `$${job.salary_min.toLocaleString()} - $${job.salary_max.toLocaleString()}`;
    }
    return 'Salary not specified';
  };

  const parseArrayField = (field: string[] | string | null): string[] => {
    if (!field) return [];
    if (Array.isArray(field)) return field;
    if (typeof field === 'string') {
      try {
        const parsed = JSON.parse(field);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return field.split(',').map(item => item.trim()).filter(Boolean);
      }
    }
    return [];
  };

  const safeArray = (v: any): string[] => (Array.isArray(v) ? v : []);

  const jobSkillsForMatching = parseArrayField(job.skills);
  const jobSkillsFallbackForMatching = [
    ...safeArray(parseArrayField(job.skills)),
    ...safeArray(parseArrayField(job.requirements)),
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <h1 className="text-xl font-bold text-foreground">Job Details</h1>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={() => navigate(`/admin/jobs/${job.job_id}/recommendations`)}>
                <Users className="h-4 w-4 mr-2" />
                Recommendations
              </Button>
              <Button variant="outline" size="sm" onClick={handleShareJob}>
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
              <Button variant="outline" size="sm" onClick={handleEditJob}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleCloseJob} disabled={job.status === 'closed'}>
                    {job.status === 'closed' ? 'Job Closed' : 'Close Job'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDuplicateJob}>
                    Duplicate Job
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-red-600"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    Delete Job
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Job Header */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <CardTitle className="text-2xl">{job.title}</CardTitle>
                    <Badge className={getStatusColor(job.status)}>
                      {job.status}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-3">
                    <span className="flex items-center">
                      <Building2 className="h-4 w-4 mr-1" />
                      {job.company}
                    </span>
                    <span className="flex items-center">
                      <MapPin className="h-4 w-4 mr-1" />
                      {job.location}
                    </span>
                    <span className="flex items-center">
                      <Clock className="h-4 w-4 mr-1" />
                      {job.employment_type}
                    </span>
                    <span className="flex items-center">
                      <DollarSign className="h-4 w-4 mr-1" />
                      {formatSalary()}
                    </span>
                    <span className="flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      Posted {new Date(job.posted_date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Job Details Tabs */}
          <Card>
            <Tabs defaultValue="description" className="w-full">
              <CardHeader>
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="description">Description</TabsTrigger>
                  <TabsTrigger value="applicants">
                    Applicants ({applicants.length})
                  </TabsTrigger>
                </TabsList>
              </CardHeader>
              <CardContent>
                <TabsContent value="description" className="space-y-6 mt-0">
                  <div>
                    <h3 className="text-lg font-semibold mb-3">About the Role</h3>
                    <p className="text-muted-foreground leading-relaxed">{job.description}</p>
                  </div>

                  {parseArrayField(job.requirements).length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3">Requirements</h3>
                      <ul className="space-y-2">
                        {parseArrayField(job.requirements).map((item, index) => (
                          <li key={index} className="flex items-start">
                            <CheckCircle2 className="h-5 w-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
                            <span className="text-muted-foreground">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {parseArrayField(job.skills).length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3">Required Skills</h3>
                      <div className="flex flex-wrap gap-2">
                        {parseArrayField(job.skills).map((skill, index) => (
                          <Badge key={index} variant="outline" className="bg-blue-50 text-blue-700">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {parseArrayField(job.benefits).length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3">Benefits</h3>
                      <ul className="space-y-2">
                        {parseArrayField(job.benefits).map((item, index) => (
                          <li key={index} className="flex items-start">
                            <CheckCircle2 className="h-5 w-5 text-purple-600 mr-2 mt-0.5 flex-shrink-0" />
                            <span className="text-muted-foreground">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="applicants" className="mt-0">
                  <div className="space-y-3">
                    {applicants.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                        <p>No applications yet</p>
                      </div>
                    ) : (
                      applicants.map((applicant) => (
                        <div
                          key={applicant.application_id}
                          className="border border-border rounded-lg p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 flex-1">
                              <Avatar className="w-12 h-12 border border-border">
                                <AvatarImage
                                  src={getConsistentAvatar(applicant.applicant_name || applicant.candidate_name || 'U', applicant.gender)}
                                  className="object-cover"
                                />
                                <AvatarFallback className="bg-slate-100 text-muted-foreground font-semibold text-sm">
                                  {(applicant.applicant_name || applicant.candidate_name || 'U').split(' ').map(n => n[0]).join('')}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1">
                                <h3 className="font-semibold text-foreground">
                                  {applicant.applicant_name || applicant.candidate_name || 'Unknown'}
                                </h3>
                                <p className="text-sm text-muted-foreground">{applicant.applicant_email}</p>
                                <div className="flex items-center gap-3 mt-1">
                                  <Badge className={getStageColor(applicant.status)} variant="secondary">
                                    {applicant.status}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    Applied {new Date(applicant.applied_date).toLocaleDateString()}
                                  </span>
                                  <Badge variant="outline" className="text-xs">
                                    {applicant.application_type}
                                  </Badge>
                                </div>
                                {applicant.candidate_skills && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {parseArrayField(applicant.candidate_skills).slice(0, 3).map((skill, index) => (
                                      <Badge key={index} variant="outline" className="text-xs bg-background">
                                        {skill}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>

          <CandidateMatchesCard jobId={Number(job.job_id)} />
        </div>
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">Share Job Posting</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Job URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={shareUrl}
                    readOnly
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-background"
                  />
                  <Button onClick={copyToClipboard}>
                    Copy
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowShareModal(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4 text-red-600">Delete Job</h3>
            <p className="text-muted-foreground mb-6">
              Are you sure you want to delete this job posting? This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteJob}>
                Delete Job
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
