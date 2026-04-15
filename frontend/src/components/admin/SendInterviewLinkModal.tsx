import { useState } from 'react';
import { Search, Mail, Send, CheckCircle2, Loader2, X, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authenticatedFetch } from '@/lib/api';
import { toast } from 'sonner';

interface CandidateInfo {
  candidate_id: number;
  full_name: string;
  email: string;
}

export default function SendInterviewLinkModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [candidate, setCandidate] = useState<CandidateInfo | null>(null);
  const [suggestions, setSuggestions] = useState<CandidateInfo[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

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
        body: JSON.stringify({ email: candidate.email })
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
            <h2 className="text-xl font-bold text-slate-900 font-outfit">Send Interview Link</h2>
            <p className="text-sm text-slate-500">Search candidate and send secure 5-min link</p>
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
                      
                      <div className="flex flex-wrap gap-3 mb-5">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                          5 min validity
                        </span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                          Single Device
                        </span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
                          One-time use
                        </span>
                      </div>

                      <Button 
                        onClick={handleSendLink} 
                        disabled={sending}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-6 rounded-xl shadow-lg shadow-blue-100 transition-all active:scale-[0.98]"
                      >
                        {sending ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <>
                            <Send className="w-5 h-5 mr-3" />
                            Send Secure Interview Link
                          </>
                        )}
                      </Button>
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
              <h3 className="text-2xl font-bold text-slate-900 mb-2 font-outfit">Link Sent!</h3>
              <p className="text-slate-500 max-w-sm">The interview link has been sent to candidate's email and will expire in 5 minutes.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
