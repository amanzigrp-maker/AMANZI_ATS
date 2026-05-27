import React, { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription,
  CardFooter
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  BrainCircuit, 
  Lock, 
  Mail, 
  Loader2, 
  AlertCircle,
  ShieldAlert,
  Download,
  ArrowRight,
  ShieldCheck
} from "lucide-react";
import { toast } from "sonner";

export default function InterviewLogin() {
  const [searchParams] = useSearchParams();
  const presetEmail = useMemo(() => {
    if (searchParams.get("email")) return searchParams.get("email") || "";
    const storedUserStr = localStorage.getItem("interviewUser");
    if (storedUserStr) {
      try {
        const storedUser = JSON.parse(storedUserStr);
        if (storedUser.email) return storedUser.email;
        if (storedUser.candidate?.email) return storedUser.candidate.email;
      } catch (e) {}
    }
    return localStorage.getItem("interviewCandidateEmail") || "";
  }, [searchParams]);

  const presetPassword = useMemo(() => searchParams.get("token") || searchParams.get("password") || searchParams.get("pass") || "", [searchParams]);
  const candidateId = searchParams.get("candidateId") || "";
  const [email, setEmail] = useState(presetEmail);
  const [password, setPassword] = useState(presetPassword);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const passwordRef = useRef<HTMLInputElement>(null);
  const hasAttemptedAutoLoginRef = useRef(false);

  // Focus directly on the password input if email is automatically pre-filled/detected
  useEffect(() => {
    if (email && passwordRef.current) {
      passwordRef.current.focus();
    }
  }, [email]);

  // Sync email state if presetEmail resolves after mount
  useEffect(() => {
    if (presetEmail) {
      setEmail(presetEmail);
    }
  }, [presetEmail]);

  // Detect if we are inside the Electron Secure Browser
  const isElectron = useMemo(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    return (
      userAgent.indexOf('electron') > -1 ||
      userAgent.indexOf('amanzi-secure-browser') > -1 ||
      typeof (window as any).amanziSecureBrowser !== 'undefined'
    );
  }, []);

  const secureProtocolUrl = useMemo(() => {
    return `amanzi-secure-browser://launch?url=${encodeURIComponent(window.location.href)}`;
  }, []);


  // Auto-login inside Electron if both email and password are provided in the URL
  useEffect(() => {
    if (isElectron && presetEmail && presetPassword && !loading && !hasAttemptedAutoLoginRef.current) {
      hasAttemptedAutoLoginRef.current = true;
      const timer = setTimeout(() => {
        void handleLogin();
      }, 800); // 800ms delay for visual feedback, allowing the candidate to see the auto-filling first
      return () => clearTimeout(timer);
    }
  }, [isElectron, presetEmail, presetPassword]);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/interview/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, candidateId: candidateId ? Number(candidateId) : undefined })
      });

      const data = await res.json();

      if (data.success) {
        // Store JWT and User info from the nested 'data' property
        localStorage.setItem("interviewToken", data.data.jwt);
        localStorage.setItem("interviewUser", JSON.stringify(data.data));
        localStorage.setItem("interviewCandidateEmail", email);
        
        toast.success("Login successful! Welcome to your interview.");
        if ((window as any).addStartupLog) {
          (window as any).addStartupLog("Login success");
        }
        const nextParams = new URLSearchParams();
        if (candidateId) nextParams.set("candidateId", candidateId);
        navigate(`/interview${nextParams.toString() ? `?${nextParams.toString()}` : ""}`);
      } else {
        setError(data.error || "Invalid credentials. Please try again.");
        toast.error(data.error || "Login failed");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Failed to connect to the server. Please try again later.");
      toast.error("Connection error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#020617] p-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="p-4 bg-blue-600/10 rounded-2xl mb-4 border border-blue-500/20 shadow-[0_0_20px_rgba(37,99,235,0.1)]">
            <BrainCircuit className="w-10 h-10 text-blue-500" />
          </div>
          <h1 className="text-3xl font-bold text-white font-outfit">Amanzi ATS</h1>
          <p className="text-slate-400 mt-2">Secure Interview Portal</p>
        </div>

        {!isElectron ? (
          <Card className="bg-slate-900/40 border-white/10 backdrop-blur-3xl shadow-2xl rounded-3xl overflow-hidden border">
            <CardHeader className="text-center pt-8 pb-4">
              <div className="mx-auto w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-4 border border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.15)]">
                <ShieldCheck className="w-8 h-8 text-blue-500" />
              </div>
              <CardTitle className="text-white text-2xl font-extrabold tracking-tight font-outfit">
                Secure Browser Required
              </CardTitle>
              <CardDescription className="text-slate-400 mt-2 text-sm max-w-sm mx-auto">
                To proceed with your assessment, you must install and launch the **Amanzi Secure Browser** application.
              </CardDescription>
            </CardHeader>

            <CardContent className="px-6 py-4 space-y-4">
              {/* Step-by-step Setup Guide */}
              <div className="space-y-4">
                {/* Step 1 */}
                <div className="flex items-start gap-3 p-3 bg-white/5 border border-white/5 rounded-xl">
                  <div className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400 text-xs font-bold shrink-0 mt-0.5">
                    1
                  </div>
                  <div className="flex-grow">
                    <h4 className="text-white font-semibold text-xs">Download & Install App</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Download the installer for your computer to set up the secure assessment client.
                    </p>
                    <Button 
                      asChild
                      size="sm"
                      className="mt-2 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold py-1.5 px-3 rounded-lg shadow-lg active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer w-fit"
                    >
                      <a href="/api/interview/download-app" download>
                        <Download className="w-3 h-3 text-white" />
                        Download Installer
                      </a>
                    </Button>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex items-start gap-3 p-3 bg-white/5 border border-white/5 rounded-xl">
                  <div className="w-6 h-6 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 text-xs font-bold shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <h4 className="text-white font-semibold text-xs">Launch the Interview</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Once installed, click the launch button below or use the protocol link to open the portal inside the Secure Browser.
                    </p>
                  </div>
                </div>
              </div>

              {/* Security Banner */}
              <div className="p-3 bg-slate-800/30 rounded-xl border border-white/5 text-left flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  The secure browser locks virtual environments and recording tools to ensure compliance.
                </p>
              </div>
            </CardContent>

            <CardFooter className="bg-slate-900/60 px-6 py-4 border-t border-white/5 flex flex-col gap-3">
              <Button 
                asChild
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-[0_0_15px_rgba(37,99,235,0.2)] transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 text-sm"
              >
                <a href={secureProtocolUrl}>
                  Launch Secure Browser
                  <ArrowRight className="w-4.5 h-4.5" />
                </a>
              </Button>
              <div className="flex items-center gap-2 justify-center mt-1">
                <Lock className="w-3 h-3 text-emerald-500 opacity-60" />
                <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Encrypted Connection</span>
              </div>
            </CardFooter>
          </Card>
        ) : (
          <Card className="bg-slate-900/40 border-white/10 backdrop-blur-3xl shadow-2xl rounded-2xl overflow-hidden">
            <CardHeader>
            <CardTitle className="text-white text-xl">Candidate Login</CardTitle>
            <CardDescription className="text-slate-500">
              Enter the temporary credentials sent to your email.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm animate-in fade-in zoom-in-95 duration-300">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-400 text-xs uppercase font-bold tracking-widest">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input 
                    id="email"
                    name="email"
                    autoComplete="email"
                    type="email"
                    placeholder="name@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-400 text-xs uppercase font-bold tracking-widest">Temporary Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input 
                    ref={passwordRef}
                    id="password"
                    name="password"
                    autoComplete="current-password"
                    type="password"
                    placeholder="••••••••"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:ring-blue-500/50"
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button 
                type="submit" 
                disabled={loading}
                className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(37,99,235,0.2)] transition-all active:scale-[0.98]"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Access Interview"
                )}
              </Button>
              <div className="flex items-center gap-2 justify-center">
                <Lock className="w-3 h-3 text-emerald-500 opacity-60" />
                <span className="text-[10px] text-slate-500 uppercase font-bold">Encrypted Session</span>
              </div>
            </CardFooter>
          </form>
        </Card>
        )}

        <p className="text-center text-slate-600 text-[11px] mt-8 uppercase tracking-[0.2em] font-medium">
          Protected by Amanzi Security Engine
        </p>
      </motion.div>
    </div>
  );
}
