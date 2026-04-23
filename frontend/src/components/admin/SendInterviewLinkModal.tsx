import { useEffect, useState } from 'react';
import { Search, Mail, Send, CheckCircle2, Loader2, X, User, Lock, Phone, MapPin, Building2, Award, Star, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authenticatedFetch } from '@/lib/api';
import { toast } from 'sonner';

interface CandidateInfo {
  candidate_id: number;
  full_name: string;
  email: string;
  phone?: string;
  location?: string;
  current_company?: string;
  current_designation?: string;
  experience?: number | string;
  skills?: string[];
  created_at?: string;
  uploaded_by?: string;
  applied_jobs?: { id: number; title: string }[];
}

interface AssessmentOption {
  assessment_id: number;
  title: string;
  role?: string;
  question_count: number;
  source_type?: string;
}

export default function SendInterviewLinkModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [candidate, setCandidate] = useState<CandidateInfo | null>(null);
  const [suggestions, setSuggestions] = useState<CandidateInfo[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const [selectedRole, setSelectedRole] = useState('');
  const [validity, setValidity] = useState(15); // Default 15 mins
  const [questionCount, setQuestionCount] = useState(10); // Default 10 questions
  const [questionSource, setQuestionSource] = useState<'ai' | 'bank' | 'hybrid'>('ai');
  const [assessmentId, setAssessmentId] = useState('');
  const [assessments, setAssessments] = useState<AssessmentOption[]>([]);
  const [loadingAssessments, setLoadingAssessments] = useState(false);

  useEffect(() => {
    if (!candidate || !selectedRole.trim()) {
      setAssessments([]);
      setAssessmentId('');
      return;
    }

    const fetchAssessments = async () => {
      setLoadingAssessments(true);
      try {
        const response = await authenticatedFetch(`/api/assessments?role=${encodeURIComponent(selectedRole.trim())}`);
        const data = await response.json().catch(() => ({}));
        const list = Array.isArray(data.data) ? data.data : [];
        setAssessments(list);
    if ((questionSource === 'bank' || questionSource === 'hybrid') && list.length === 0) {
          setAssessmentId('');
        }
      } catch {
        setAssessments([]);
      } finally {
        setLoadingAssessments(false);
      }
    };

    fetchAssessments();
  }, [candidate, selectedRole, questionSource]);

  const fetchSuggestions = async (val: string) => {
    if (val.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const response = await authenticatedFetch(`/api/interview/candidates?query=${encodeURIComponent(val)}`);
      const data = await response.json();
      if (data.success && Array.isArray(data.data)) {
        setSuggestions(data.data);
        setShowSuggestions(data.data.length > 0);
      }
    } catch (err) {
      console.error('Failed to fetch suggestions');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEmail(val);
    if (!candidate) {
      fetchSuggestions(val);
    } else if (candidate.email !== val) {
      setCandidate(null);
      fetchSuggestions(val);
    }
  };

  const handleSelectCandidate = (c: CandidateInfo) => {
    setCandidate(c);
    setEmail(c.email);
    setSuggestions([]);
    setShowSuggestions(false);
    
    // Auto-select first job if available
    if (c.applied_jobs && c.applied_jobs.length > 0) {
      setSelectedRole(c.applied_jobs[0].title);
    } else {
      setSelectedRole('');
    }
  };

  const handleSearch = async () => {
    if (!email) return;
    setLoading(true);
    setShowSuggestions(false);
    try {
      const response = await authenticatedFetch(`/api/interview/candidates?query=${encodeURIComponent(email)}`);
      const data = await response.json();
      if (data.success && data.data && data.data.length > 0) {
        setCandidate(data.data[0]);
        setEmail(data.data[0].email);
      } else {
        toast.error('No matching candidate found');
      }
    } catch (err) {
      toast.error('Failed to search candidate');
    } finally {
      setLoading(false);
    }
  };

  const handleSendLink = async () => {
    if (!candidate) return;
    if ((questionSource === 'bank' || questionSource === 'hybrid') && !assessmentId) {
      toast.error('Choose an uploaded question bank before sending');
      return;
    }

    const ok = window.confirm(
      questionSource === 'bank'
        ? `Send document-only test for ${selectedRole.trim()}?`
        : questionSource === 'hybrid'
          ? `Send mixed test from uploaded bank plus candidate skills for ${selectedRole.trim()}?`
          : `Generate AI questions for ${selectedRole.trim()} and send this test?`
    );
    if (!ok) return;

    setSending(true);
    try {
      const response = await authenticatedFetch('/api/interview/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: candidate.email,
          jobRole: selectedRole.trim(),
          validityMins: validity,
          questionCount: questionCount,
          questionSource,
          assessmentId: questionSource === 'bank' || questionSource === 'hybrid' ? Number(assessmentId) : null
        })
      });
      const data = await response.json();
      if (data.success) {
        setIsSuccess(true);
        toast.success('Secure interview link sent successfully');
        setTimeout(() => {
          onClose();
          resetState();
        }, 3000);
      } else {
        toast.error(data.error || 'Failed to send interview link');
      }
    } catch (err) {
      toast.error('Failed to send interview link');
    } finally {
      setSending(false);
    }
  };

  const handleSendCredentials = async () => {
    if (!candidate) return;
    if ((questionSource === 'bank' || questionSource === 'hybrid') && !assessmentId) {
      toast.error('Choose an uploaded question bank before sending');
      return;
    }

    const ok = window.confirm(
      questionSource === 'bank'
        ? `Send credentials with document-only test for ${selectedRole.trim()}?`
        : questionSource === 'hybrid'
          ? `Send credentials with uploaded bank plus candidate skills for ${selectedRole.trim()}?`
          : `Send credentials and generate AI questions for ${selectedRole.trim()}?`
    );
    if (!ok) return;

    setSending(true);
    try {
      const response = await authenticatedFetch('/api/interview/invite-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: candidate.email,
          name: candidate.full_name,
          jobRole: selectedRole.trim(),
          validityMins: validity,
          questionCount,
          questionSource,
          assessmentId: questionSource === 'bank' || questionSource === 'hybrid' ? Number(assessmentId) : null,
          interviewId: `INT-${Math.floor(Math.random() * 10000)}`
        })
      });
      const data = await response.json();
      if (data.success) {
        setIsSuccess(true);
        toast.success('Temporary interview credentials sent successfully');
        setTimeout(() => {
          onClose();
          resetState();
        }, 3000);
      } else {
        toast.error(data.error || 'Failed to send credentials');
      }
    } catch (err) {
      toast.error('Failed to send credentials');
    } finally {
      setSending(false);
    }
  };

  const resetState = () => {
    setEmail('');
    setCandidate(null);
    setIsSuccess(false);
    setQuestionSource('ai');
    setAssessmentId('');
    setAssessments([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl bg-card rounded-2xl shadow-2xl border border-border animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-slate-900 font-outfit">Send Interview Invitation</h2>
            <p className="text-sm text-slate-500">Search candidate and send secure access</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 pb-4 border-b border-slate-100 bg-white sticky top-0 z-20">
          {!isSuccess && (
            <div className="flex gap-2 relative">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by name or email..."
                  value={email}
                  onChange={handleInputChange}
                  className="pl-10 h-11 transition-all focus:ring-2 focus:ring-blue-500/20"
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  onFocus={() => email.length >= 2 && setShowSuggestions(true)}
                />

                {/* Suggestions Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-white rounded-xl border border-slate-200 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] z-[100] max-h-60 overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-top-2 duration-200">
                    {suggestions.map((s) => (
                      <button
                        key={s.candidate_id}
                        onClick={() => handleSelectCandidate(s)}
                        className="w-full flex flex-col items-start px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                      >
                        <span className="font-bold text-slate-800 text-sm">{s.full_name}</span>
                        <span className="text-slate-400 text-xs">{s.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button onClick={handleSearch} disabled={loading} className="h-11 font-semibold px-6 shadow-lg shadow-blue-200 flex-shrink-0 bg-blue-600 hover:bg-blue-700">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                Search
              </Button>
            </div>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
          <div className="p-6">
            {!isSuccess ? (
              <>
                {candidate && (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-top-2 duration-300">
                    <div className="p-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white relative">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/30 shadow-inner">
                          <User className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h4 className="text-xl font-bold font-outfit uppercase tracking-tight">{candidate.full_name}</h4>
                        </div>
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-5 mb-6">
                        <DetailItem icon={<Mail className="w-3.5 h-3.5" />} label="Email" value={candidate.email} />
                        <DetailItem icon={<Phone className="w-3.5 h-3.5" />} label="Phone" value={candidate.phone || '—'} />
                        <DetailItem icon={<Star className="w-3.5 h-3.5" />} label="Experience" value={candidate.experience ? `${candidate.experience} years` : '—'} />
                        <DetailItem icon={<Building2 className="w-3.5 h-3.5" />} label="Applied For" value={candidate.applied_jobs && candidate.applied_jobs.length > 0 ? candidate.applied_jobs[0].title : 'General Entry'} />
                      </div>

                      {candidate.skills && candidate.skills.length > 0 && (
                        <div className="mb-6 border-t border-slate-100 pt-5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">Skills & Keywords</label>
                          <div className="flex flex-wrap gap-2">
                            {candidate.skills.slice(0, 10).map((skill, index) => (
                              <span key={index} className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-[11px] font-semibold lowercase border border-blue-100/50 hover:bg-blue-100 transition-colors">
                                {skill}
                              </span>
                            ))}
                            {candidate.skills.length > 10 && (
                              <span className="px-2.5 py-1 bg-slate-50 text-slate-500 rounded-lg text-[11px] font-semibold">+{candidate.skills.length - 10} more</span>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="space-y-4 mb-6 border-t border-slate-100 pt-5">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Interview Role (Question Domain)</label>
                          <Input
                            placeholder="Type role, for example Software Engineer"
                            value={selectedRole}
                            onChange={(e) => setSelectedRole(e.target.value)}
                            className="text-sm"
                          />
                          {candidate.applied_jobs && candidate.applied_jobs.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {candidate.applied_jobs.map((job) => (
                                <button
                                  key={job.id}
                                  type="button"
                                  onClick={() => setSelectedRole(job.title)}
                                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                                >
                                  {job.title}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Question Source</label>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setQuestionSource('ai');
                                setAssessmentId('');
                              }}
                              className={`rounded-xl border px-3 py-2 text-sm font-bold transition-all ${
                                questionSource === 'ai'
                                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              Generate with AI
                            </button>
                            <button
                              type="button"
                              onClick={() => setQuestionSource('bank')}
                              className={`rounded-xl border px-3 py-2 text-sm font-bold transition-all ${
                                questionSource === 'bank'
                                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              Doc Only
                            </button>
                            <button
                              type="button"
                              onClick={() => setQuestionSource('hybrid')}
                              className={`rounded-xl border px-3 py-2 text-sm font-bold transition-all ${
                                questionSource === 'hybrid'
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              Bank + Skills
                            </button>
                          </div>
                        </div>

                        {(questionSource === 'bank' || questionSource === 'hybrid') && (
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Select Uploaded Question Bank</label>
                            <select
                              value={assessmentId}
                              onChange={(e) => {
                                const nextId = e.target.value;
                                setAssessmentId(nextId);
                                const selected = assessments.find((item) => String(item.assessment_id) === nextId);
                                if (selected?.question_count) {
                                  setQuestionCount(selected.question_count);
                                }
                              }}
                              className="w-full bg-white border border-purple-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                            >
                              <option value="">
                                {loadingAssessments ? 'Loading banks...' : '-- Choose a named bank --'}
                              </option>
                              {assessments.map((assessment) => (
                                <option key={assessment.assessment_id} value={assessment.assessment_id}>
                                  {assessment.title} ({assessment.question_count} questions)
                                </option>
                              ))}
                            </select>
                            {!loadingAssessments && assessments.length === 0 && (
                              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                No uploaded banks found for this role. Create one in Assessments first.
                              </p>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex justify-between">
                              Test Duration <span>{validity}m</span>
                            </label>
                            <input
                              type="range"
                              min="5"
                              max="60"
                              step="5"
                              value={validity}
                              onChange={(e) => setValidity(parseInt(e.target.value))}
                              className="w-full h-1.5 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex justify-between">
                              Questions <span>{questionCount}</span>
                            </label>
                            <input
                              type="range"
                              min="1"
                              max="50"
                              step="1"
                              value={questionCount}
                              onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                              className="w-full h-1.5 bg-purple-100 rounded-lg appearance-none cursor-pointer accent-purple-600"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-6">
                        <span className="inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100">
                          {validity} min validity
                        </span>
                        <span className="inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-100">
                          {questionCount} Questions
                        </span>
                        <span className="inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-bold bg-purple-50 text-purple-600 border border-purple-100">
                          Device Locked
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <Button
                          onClick={handleSendLink}
                          disabled={sending}
                          variant="outline"
                          className="border-slate-200 text-slate-600 hover:bg-slate-50 font-bold py-5 rounded-xl text-sm transition-colors"
                        >
                          {sending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5 mr-2" />
                              Send Link
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={handleSendCredentials}
                          disabled={sending}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-5 rounded-xl shadow-lg shadow-blue-200/50 text-sm active:scale-[0.98] transition-all"
                        >
                          {sending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5 mr-2" />
                              Send Credentials
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="py-20 flex flex-col items-center text-center animate-in zoom-in-95 duration-500">
                <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6 border-4 border-white shadow-xl">
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-2 font-outfit">Invitation Sent!</h3>
                <p className="text-slate-500 max-w-sm text-sm">The secure interview access for <b>{selectedRole}</b> has been sent successfully.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailItem({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</label>
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 text-blue-500 bg-blue-50 p-1.5 rounded-lg border border-blue-100">
          {icon}
        </div>
        <span className="text-sm font-bold text-slate-700 break-all leading-tight">{value}</span>
      </div>
    </div>
  );
}
