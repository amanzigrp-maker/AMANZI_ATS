import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { 
  CheckCircle, 
  ShieldCheck, 
  User, 
  FileText, 
  Calendar, 
  Award, 
  BarChart3, 
  Zap, 
  Target,
  Clock,
  ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';

interface CertificateVerification {
  valid: boolean;
  certificate: {
    certificate_id: string;
    candidate_name: string;
    candidate_email: string;
    candidate_photo: string;
    test_name: string;
    score: number;
    issued_at: string;
  };
  analytics: {
    totalQuestions: number;
    correctAnswers: number;
    durationMinutes: number;
    authenticityScore: number;
    breakdown: Record<string, { total: number; correct: number }>;
  };
}

const VerifyCertificate: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<CertificateVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const verify = async () => {
      try {
        const response = await axios.get(`/api/certificates/verify/${id}`);
        setData(response.data);
      } catch (err) {
        setError('Invalid Certificate ID or verification failed.');
      } finally {
        setLoading(false);
      }
    };
    verify();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !data || !data.valid) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-red-100">
          <div className="bg-red-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldCheck className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Verification Failed</h1>
          <p className="text-slate-500 mb-8">{error || 'This certificate could not be verified.'}</p>
          <a href="/" className="inline-flex items-center text-indigo-600 font-semibold hover:text-indigo-700">
            Return to Portal
          </a>
        </div>
      </div>
    );
  }

  const { certificate, analytics } = data;

  return (
    <div className="min-h-screen bg-[#f8fafc] py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-5xl mx-auto">
        {/* Header Branding */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-12 gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-3 rounded-xl shadow-lg shadow-indigo-200">
              <Award className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                Amanzi <span className="text-indigo-600">Verified</span>
              </h1>
              <p className="text-slate-500 font-medium">Professional Credential Verification System</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-full border border-emerald-100">
            <CheckCircle className="w-5 h-5 text-emerald-500" />
            <span className="text-emerald-700 font-bold uppercase tracking-wider text-sm">Authentic Credential</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Candidate & Certificate Core */}
          <div className="lg:col-span-1 space-y-8">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="h-32 bg-gradient-to-r from-indigo-600 to-blue-500"></div>
              <div className="px-6 pb-8 -mt-16 text-center">
                <div className="relative inline-block">
                  <img 
                    src={certificate.candidate_photo || 'https://via.placeholder.com/150'} 
                    alt={certificate.candidate_name}
                    className="w-32 h-32 rounded-3xl object-cover border-4 border-white shadow-xl mx-auto bg-slate-100"
                  />
                  <div className="absolute -bottom-2 -right-2 bg-white p-1.5 rounded-full shadow-lg border border-slate-100">
                    <ShieldCheck className="w-5 h-5 text-indigo-600" />
                  </div>
                </div>
                <h2 className="mt-6 text-2xl font-bold text-slate-900 uppercase">{certificate.candidate_name}</h2>
                <p className="text-slate-500 text-sm font-medium">{certificate.candidate_email}</p>
                
                <div className="mt-8 pt-8 border-t border-slate-100 space-y-4 text-left">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Credential ID</p>
                      <p className="text-sm font-mono font-bold text-slate-700">{certificate.certificate_id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Issue Date</p>
                      <p className="text-sm font-bold text-slate-700">{format(new Date(certificate.issued_at), 'MMMM dd, yyyy')}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-indigo-900 rounded-3xl p-8 text-white shadow-xl shadow-indigo-100">
              <div className="flex items-center gap-3 mb-6">
                <Target className="w-6 h-6 text-indigo-300" />
                <h3 className="text-lg font-bold">Assessment Metadata</h3>
              </div>
              <div className="space-y-6">
                <div>
                  <p className="text-indigo-300 text-[10px] uppercase tracking-widest font-bold mb-1">Authenticated Score</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-extrabold">{certificate.score.toFixed(2)}</span>
                    <span className="text-indigo-300 text-lg font-bold">%</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/10 p-4 rounded-2xl">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-3 h-3 text-indigo-300" />
                      <p className="text-[9px] uppercase font-bold text-indigo-200">Duration</p>
                    </div>
                    <p className="font-bold text-sm">{analytics.durationMinutes} min</p>
                  </div>
                  <div className="bg-white/10 p-4 rounded-2xl">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-3 h-3 text-indigo-300" />
                      <p className="text-[9px] uppercase font-bold text-indigo-200">Accuracy</p>
                    </div>
                    <p className="font-bold text-sm">{Math.round((analytics.correctAnswers/analytics.totalQuestions)*100)}%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Concept Analysis & Analytics */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-6 h-6 text-indigo-600" />
                  <h3 className="text-xl font-bold text-slate-900 tracking-tight">Domain Proficiency Analysis</h3>
                </div>
                <div className="bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Authenticated Data</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Object.entries(analytics.breakdown || {}).map(([level, stats]) => {
                  const pct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
                  return (
                    <div key={level} className="bg-slate-50 rounded-2xl p-6 border border-slate-100 hover:border-indigo-200 transition-colors">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">{level}</p>
                      <div className="flex items-end justify-between mb-3">
                        <span className="text-3xl font-black text-slate-900">{pct}%</span>
                        <span className="text-[10px] text-slate-400 font-bold">{stats.correct}/{stats.total} Correct</span>
                      </div>
                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-indigo-600 h-full rounded-full" 
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-12 bg-indigo-50/50 rounded-2xl p-6 border border-indigo-100 flex items-start gap-4">
                <ShieldCheck className="w-6 h-6 text-indigo-600 mt-1 shrink-0" />
                <div>
                  <h4 className="text-indigo-900 font-bold mb-1">Authenticity Verification</h4>
                  <p className="text-indigo-800/70 text-sm leading-relaxed">
                    This credential was issued by Amanzi's AI-Proctored Adaptive Engine. The candidate was verified via biometric facial recognition and the session was monitored for non-human activity. Authenticity Confidence: <span className="font-bold text-indigo-900">{(analytics.authenticityScore * 100).toFixed(0)}%</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
              <h3 className="text-xl font-bold text-slate-900 mb-8 tracking-tight">Professional Endorsement</h3>
              <div className="space-y-6">
                <p className="text-slate-600 italic text-lg leading-relaxed">
                  "The candidate has demonstrated exceptional proficiency in <span className="font-bold text-slate-900">{certificate.test_name}</span>. This certification validates their ability to handle complex technical scenarios within the assessed domain."
                </p>
                <div className="flex items-center gap-4 pt-6 border-t border-slate-100">
                  <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center">
                    <span className="text-white font-black text-xl">A</span>
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">Amanzi Certification Board</p>
                    <p className="text-xs text-slate-400 uppercase font-bold tracking-widest">Autonomous Authority</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-slate-400">
          <p className="text-xs font-medium uppercase tracking-[0.2em]">Secure Blockchain Verification Ledger v2.0</p>
        </div>
      </div>
    </div>
  );
};

export default VerifyCertificate;
