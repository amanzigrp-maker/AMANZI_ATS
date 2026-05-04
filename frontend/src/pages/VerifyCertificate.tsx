import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, Calendar, User, Award, CheckCircle2, XCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface CertificateData {
  candidateName: string;
  testName: string;
  score: string;
  date: string;
  candidatePhoto: string | null;
}

export default function VerifyCertificate() {
  const { certificateId } = useParams<{ certificateId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CertificateData | null>(null);

  useEffect(() => {
    const verify = async () => {
      try {
        const response = await fetch(`/api/certificates/verify/${certificateId}`);
        const result = await response.json();
        
        if (response.ok) {
          setData(result.data);
        } else {
          setError(result.error || 'Invalid certificate');
        }
      } catch (err) {
        setError('Verification service unavailable');
      } finally {
        setLoading(false);
      }
    };

    if (certificateId) verify();
  }, [certificateId]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans">
      <Link to="/" className="absolute top-8 left-8 flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors group">
        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
        <span className="font-semibold text-sm">Back to Amanzi</span>
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl"
      >
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-200">
            <ShieldCheck className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Certificate Verification</h1>
          <p className="text-slate-500 mt-2">Official verification portal for Amanzi ATS certifications</p>
        </div>

        <Card className="bg-white border border-slate-200 shadow-2xl shadow-slate-200/50 rounded-[2rem] overflow-hidden">
          {loading ? (
            <div className="p-20 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
              <p className="text-slate-500 font-medium">Verifying Credentials...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <XCircle className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Invalid Certificate</h2>
              <p className="text-slate-500 mb-8">{error}</p>
              <Button asChild className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-12 px-8">
                <Link to="/">Contact Support</Link>
              </Button>
            </div>
          ) : data ? (
            <div className="flex flex-col">
              {/* Verification Header */}
              <div className="bg-emerald-50 border-b border-emerald-100 p-6 flex items-center justify-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                <span className="text-emerald-700 font-bold tracking-tight uppercase text-sm">Verified Certificate</span>
              </div>

              <div className="p-8 md:p-12">
                <div className="flex flex-col md:flex-row items-center gap-8 mb-10">
                  {data.candidatePhoto ? (
                    <div className="w-32 h-32 rounded-3xl overflow-hidden border-4 border-slate-50 shadow-lg">
                      <img src={data.candidatePhoto} alt="Candidate" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-32 h-32 rounded-3xl bg-slate-100 flex items-center justify-center text-slate-400">
                      <User className="w-12 h-12" />
                    </div>
                  )}
                  
                  <div className="text-center md:text-left">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Candidate Name</p>
                    <h2 className="text-3xl font-bold text-slate-900">{data.candidateName}</h2>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-slate-400 mb-2">
                      <Award className="w-4 h-4" />
                      <span className="text-[11px] font-bold uppercase tracking-widest">Assessment</span>
                    </div>
                    <p className="text-lg font-bold text-slate-900">{data.testName}</p>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-slate-400 mb-2">
                      <Calendar className="w-4 h-4" />
                      <span className="text-[11px] font-bold uppercase tracking-widest">Completion Date</span>
                    </div>
                    <p className="text-lg font-bold text-slate-900">{new Date(data.date).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}</p>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Performance Score</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-black text-indigo-600">{data.score}</span>
                      <span className="text-indigo-600/50 font-bold">%</span>
                    </div>
                  </div>
                  <div className="h-12 w-[1px] bg-slate-200 hidden sm:block" />
                  <div className="text-right hidden sm:block">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Status</p>
                    <span className="px-3 py-1 bg-indigo-600 text-white text-[10px] font-black rounded-full uppercase">Authenticated</span>
                  </div>
                </div>
              </div>

              <div className="p-8 border-t border-slate-100 bg-slate-50/50 text-center">
                <p className="text-[10px] text-slate-400 font-medium mb-4">
                  CERTIFICATE ID: <span className="text-slate-600 font-bold font-mono">{certificateId}</span>
                </p>
                <div className="flex gap-4 justify-center">
                   <Button asChild variant="outline" className="rounded-xl border-slate-200 h-10 px-6">
                     <Link to={`/api/certificates/download/${certificateId}`} target="_blank">Download PDF</Link>
                   </Button>
                </div>
              </div>
            </div>
          ) : null}
        </Card>
      </motion.div>

      <div className="mt-12 text-center text-slate-400 text-sm">
        <p>&copy; {new Date().getFullYear()} Amanzi ATS Systems. All rights reserved.</p>
        <div className="flex gap-4 justify-center mt-2 font-semibold">
           <Link to="/privacy" className="hover:text-indigo-600 transition-colors">Privacy Policy</Link>
           <Link to="/terms" className="hover:text-indigo-600 transition-colors">Terms of Service</Link>
        </div>
      </div>
    </div>
  );
}
