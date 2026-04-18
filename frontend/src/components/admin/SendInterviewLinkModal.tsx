import { useState } from 'react';
import { Search, Mail, Send, CheckCircle2, Loader2, X, User, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authenticatedFetch } from '@/lib/api';
import { toast } from 'sonner';

interface CandidateInfo {
  candidate_id: number;
  full_name: string;
  email: string;
  applied_jobs?: { id: number; title: string }[];
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
    setSending(true);
    try {
      const response = await authenticatedFetch('/api/interview/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: candidate.email,
          jobRole: selectedRole,
          validityMins: validity,
          questionCount: questionCount
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
    setSending(true);
    try {
      const response = await authenticatedFetch('/api/interview/invite-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: candidate.email,
          name: candidate.full_name,
          jobRole: selectedRole,
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
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-card rounded-2xl shadow-2xl border border-border animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold text-slate-900 font-outfit">Send Interview Invitation</h2>
            <p className="text-sm text-slate-500">Search candidate and send secure access</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {!isSuccess ? (
            <>
              <div className="flex gap-2 relative">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search by name or email..."
                    value={email}
                    onChange={handleInputChange}
                    className="pl-10"
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    onFocus={() => email.length >= 2 && setShowSuggestions(true)}
                  />

                  {/* Suggestions Dropdown */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-2xl z-[100] max-h-60 overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-top-2 duration-200">
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
                <Button onClick={handleSearch} disabled={loading} className="font-semibold px-6 shadow-lg shadow-blue-100">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                  Search
                </Button>
              </div>

              {candidate && (
                <div className="p-5 bg-blue-50/50 rounded-xl border border-blue-100 animate-in slide-in-from-top-2 duration-300">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-white rounded-full border border-blue-200 shadow-sm">
                      <User className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-800 text-lg mb-0.5">{candidate.full_name}</h4>
                      <p className="text-blue-600 font-medium text-sm mb-4">{candidate.email}</p>
                      
                      <div className="space-y-4 mb-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Interview Role (Question Domain)</label>
                          <select 
                            value={selectedRole}
                            onChange={(e) => setSelectedRole(e.target.value)}
                            className="w-full bg-white border border-blue-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          >
                            <option value="">-- Select or type role --</option>
                            {candidate.applied_jobs?.map(job => (
                              <option key={job.id} value={job.title}>{job.title}</option>
                            ))}
                            <option value="Custom">Other (Type Below)</option>
                          </select>
                          {(!candidate.applied_jobs || candidate.applied_jobs.length === 0 || selectedRole === 'Custom') && (
                            <Input 
                              placeholder="Type role manually..."
                              value={selectedRole === 'Custom' ? '' : selectedRole}
                              onChange={(e) => setSelectedRole(e.target.value)}
                              className="mt-2"
                            />
                          )}
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Test Duration (Minutes)</label>
                          <div className="flex items-center gap-4">
                            <input 
                              type="range" 
                              min="5" 
                              max="60" 
                              step="5"
                              value={validity}
                              onChange={(e) => setValidity(parseInt(e.target.value))}
                              className="flex-1 h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            />
                            <span className="text-sm font-bold text-blue-700 w-12">{validity}m</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Number of Questions</label>
                          <div className="flex items-center gap-4">
                            <input 
                              type="range" 
                              min="1" 
                              max="50" 
                              step="1"
                              value={questionCount}
                              onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                              className="flex-1 h-2 bg-purple-100 rounded-lg appearance-none cursor-pointer accent-purple-600"
                            />
                            <span className="text-sm font-bold text-purple-700 w-12">{questionCount}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3 mb-5">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                          {validity} min validity
                        </span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                          {questionCount} Questions
                        </span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                          Device Locked
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <Button 
                          onClick={handleSendLink} 
                          disabled={sending}
                          variant="outline"
                          className="border-blue-200 text-blue-700 hover:bg-blue-50 font-bold py-6 rounded-xl transition-all"
                        >
                          {sending ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <>
                              <Send className="w-4 h-4 mr-2" />
                              Send Link
                            </>
                          )}
                        </Button>
                        <Button 
                          onClick={handleSendCredentials} 
                          disabled={sending}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-6 rounded-xl shadow-lg shadow-blue-100 transition-all active:scale-[0.98]"
                        >
                          {sending ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <>
                              <Lock className="w-4 h-4 mr-2" />
                              Send Credentials
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-8 flex flex-col items-center text-center animate-in zoom-in-95 duration-500">
              <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6 border-4 border-white shadow-xl">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2 font-outfit">Invitation Sent!</h3>
              <p className="text-slate-500 max-w-sm">The secure interview access for <b>{selectedRole}</b> has been sent successfully.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
