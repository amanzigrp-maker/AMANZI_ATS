import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription,
  CardFooter
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Timer, 
  AlertCircle, 
  CheckCircle2, 
  ChevronRight, 
  BrainCircuit, 
  ShieldCheck,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import Proctoring from "@/components/proctoring/Proctoring";
import QuestionContent from "@/components/QuestionContent";

interface Question {
  id: number;
  question: string;
  options: string[];
  difficulty?: string;
  selection_mode?: string;
  semantic_similarity?: number;
  semantic_topic?: string;
}

export default function InterviewPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  // State
  const [status, setStatus] = useState<"login" | "loading" | "setup" | "interviewing" | "completed" | "error">(token ? "loading" : "login");
  const [errorHeader, setErrorHeader] = useState("Invalid Link");
  const [errorMessage, setErrorMessage] = useState("This interview link is invalid or has expired.");
  
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [interviewToken, setInterviewToken] = useState<string | null>(token);
  const [candidateInfo, setCandidateInfo] = useState<{ name: string; email: string } | null>(null);
  const [setupData, setSetupData] = useState({ experience: 0, role: "" });
  const [sessionId, setSessionId] = useState<string | number | null>(null);
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<{ [key: number]: string }>({});
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
  const [score, setScore] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [totalQuestions, setTotalQuestions] = useState(10); // Dynamic total from Admin
  const [theta, setTheta] = useState<number | null>(null);

  // 1. Validate Token on Mount (Fallback for old flow)
  useEffect(() => {
    if (!token) return;
    const validate = async () => {
      try {
        const res = await fetch(`/api/interview/validate?token=${token}`);
        const data = await res.json();
        if (res.ok && data.success) {
          handleAuthSuccess(data.data);
          if (data.data.total_questions) {
            setTotalQuestions(data.data.total_questions);
          }
        } else {
          setErrorHeader(data.error || "Access Denied");
          setErrorMessage(data.message || data.error || "Please contact your recruiter for a new link.");
          setStatus("error");
        }
      } catch (err) {
        setErrorHeader("Connection Error");
        setErrorMessage("Could not connect to the assessment server.");
        setStatus("error");
      }
    };
    validate();
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/interview/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setInterviewToken(data.data.token);
        handleAuthSuccess(data.data);
      } else {
        setStatus("login");
        toast.error(data.error || "Invalid credentials");
      }
    } catch (err) {
      setStatus("login");
      toast.error("Connection error");
    }
  };

  const handleAuthSuccess = async (data: any) => {
    setCandidateInfo({ name: data.name, email: data.email });
    if (data.jwt) setJwtToken(data.jwt);
    if (data.duration) setTimeLeft(data.duration * 60);
    if (data.total_questions) setTotalQuestions(data.total_questions);

    if (data.session_id) {
      setSessionId(data.session_id);
      await fetchQuestions(data.session_id, data.jwt);
      setStatus("interviewing");
    } else {
      if (data.role) setSetupData(prev => ({ ...prev, role: data.role }));
      setStatus("setup");
    }
  };

  // Timer Effect
  const handleAnswerSubmit = useCallback(async (selectedAnswer: string) => {
    if (isSubmitting || !sessionId) return;
    setIsSubmitting(true);
    
    try {
      const currentQ = questions[currentQuestionIndex];
      const res = await fetch("/api/interview/answer", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          session_id: sessionId,
          question_id: currentQ.id,
          selected_answer: selectedAnswer
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        toast.error(data.error || "Failed to save answer");
        return;
      }

      if (typeof data.theta === "number") {
        setTheta(data.theta);
      }

      if (data.isFinished) {
        setScore(typeof data.score === "number" ? data.score : null);
        setStatus("completed");
        return;
      }

      if (data.question) {
        setQuestions(prev => [...prev, data.question]);
        setCurrentQuestionIndex(prev => prev + 1);
      }
    } catch (err) {
      console.error("Answer submission error:", err);
      toast.error("Failed to submit answer");
    } finally {
      setIsSubmitting(false);
    }
  }, [sessionId, questions, currentQuestionIndex, isSubmitting, jwtToken]);

  // Handle stuck loading
  useEffect(() => {
    if (status === "loading") {
      const timer = setTimeout(() => {
        if (status === "loading") {
          setErrorHeader("Connection Timeout");
          setErrorMessage("The secure session is taking too long to initialize. Please check your internet or refresh the page.");
          setStatus("error");
        }
      }, 120000); // 120 seconds timeout — AI question generation can take a while
      return () => clearTimeout(timer);
    }
  }, [status]);

  useEffect(() => {
    if (status !== "interviewing" || timeLeft <= 0) return;
    const currentQuestion = questions[currentQuestionIndex];

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // When time runs out, try to submit current answer if selected, or just finish
          if (currentQuestion) {
            handleAnswerSubmit(answers[currentQuestion.id] || "");
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
<<<<<<< Updated upstream
  }, [status, timeLeft, questions, currentQuestionIndex, answers, handleAnswerSubmit]);
=======
  }, [status, timeLeft, handleAnswerSubmit, answers, currentQuestionIndex, questions]);
>>>>>>> Stashed changes

  const fetchQuestions = async (sId: string | number, jwt: string | null = jwtToken) => {
    const res = await fetch(`/api/interview/questions?session_id=${sId}`, {
      headers: {
        "Authorization": `Bearer ${jwt}`
      }
    });
    const data = await res.json();
    if (data.success) {
      setQuestions(data.data);
    }
  };

  const handleStartInterview = async () => {
    if (!setupData.role) {
      toast.error("Please specify the skill/role you are applying for.");
      return;
    }

    const activeToken = interviewToken || token;
    if (!activeToken) {
      toast.error("Interview token is missing. Please log in again.");
      setStatus("login");
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch("/api/interview/generate", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          token: activeToken,
          role: setupData.role,
          experience: setupData.experience
        })
      });
      const data = await res.json();

      if (data.success) {
        setSessionId(data.session_id);
        if (data.question) {
          setQuestions([data.question]);
          if (typeof data.theta === "number") setTheta(data.theta);
        }
        if (data.target_questions) {
          setTotalQuestions(Number(data.target_questions) || totalQuestions);
        }
        setCurrentQuestionIndex(0);
        setStatus("interviewing");
        toast.success("Assessment started. Good luck.");
      } else {
        toast.error("Failed to start session. Please try again.");
        setStatus("setup");
      }
    } catch (err) {
      setStatus("setup");
      toast.error("Connection error");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // --- Render Functions ---

  if (status === "login") {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#020617] p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <Card className="bg-slate-900/50 border-white/10 backdrop-blur-3xl shadow-2xl overflow-hidden rounded-[2rem]">
            <CardHeader className="text-center pb-8 border-b border-white/5">
              <div className="mx-auto w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(59,130,246,0.15)]">
                <BrainCircuit className="w-8 h-8 text-blue-500" />
              </div>
              <CardTitle className="text-white text-3xl font-bold mb-2 tracking-tight">Candidate Portal</CardTitle>
              <CardDescription className="text-slate-400">
                Log in with the credentials provided by your recruiter.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8">
              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email Address</label>
                  <input
                    type="email"
                    required
                    value={loginForm.email}
                    onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                    className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-sans placeholder:text-slate-600"
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Temporary Password</label>
                  <input
                    type="password"
                    required
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-sans placeholder:text-slate-600"
                    placeholder="Enter password from email"
                  />
                </div>
                <Button type="submit" className="w-full h-12 mt-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all">
                  Sign In to Assessment
                </Button>
              </form>
            </CardContent>
            <CardFooter className="bg-slate-950/50 py-4 flex justify-center border-t border-white/5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500 opacity-60" />
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Secure Access</span>
              </div>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#020617] text-white">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <BrainCircuit className="w-12 h-12 text-blue-500" />
        </motion.div>
        <p className="mt-4 text-slate-400 font-medium animate-pulse">Initializing Secure Session...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#020617] p-6">
        <Card className="max-w-md w-full bg-slate-900/50 border-white/10 backdrop-blur-xl">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6 text-red-500" />
            </div>
            <CardTitle className="text-white text-2xl">{errorHeader}</CardTitle>
            <CardDescription className="text-slate-400 mt-2">{errorMessage}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => navigate("/")} className="w-full bg-white/5 hover:bg-white text-white hover:text-black">
              Return Home
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (status === "setup") {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#020617] p-6 text-left">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row gap-8 max-w-5xl w-full">
          {/* Left: Setup Card */}
          <Card className="flex-1 bg-slate-900/40 border-white/10 backdrop-blur-3xl shadow-2xl">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <BrainCircuit className="text-blue-500 w-6 h-6" />
                <span className="text-xs font-bold text-blue-500 uppercase tracking-widest">
                  {setupData.role ? `${setupData.role} Assessment` : 'Amanzi Assessment'}
                </span>
              </div>
              <CardTitle className="text-white text-3xl font-bold">Welcome, {candidateInfo?.name}</CardTitle>
              <CardDescription className="text-slate-400">
                Please confirm your details to start your {setupData.role || 'assigned'} assessment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Applied Role</label>
                <input 
                  type="text"
                  placeholder="e.g. Senior Frontend Developer"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-sans"
                  value={setupData.role}
                  onChange={(e) => setSetupData({...setupData, role: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Years of Experience</label>
                <input 
                  type="number"
                  min="0"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-sans"
                  value={setupData.experience}
                  onChange={(e) => setSetupData({...setupData, experience: parseInt(e.target.value) || 0})}
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button onClick={handleStartInterview} className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(37,99,235,0.3)]">
                Generate Interview Questions
              </Button>
              <div className="flex items-center gap-2 justify-center">
                <ShieldCheck className="w-4 h-4 text-emerald-500 opacity-60" />
                <span className="text-[10px] text-slate-500 uppercase font-bold">Encrypted & Device Locked</span>
              </div>
            </CardFooter>
          </Card>

          {/* Right: Camera Check */}
          <Card className="w-full md:w-80 bg-slate-900/40 border-white/10 backdrop-blur-3xl shadow-2xl overflow-hidden relative">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                System Check
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="aspect-video bg-black rounded-xl overflow-hidden border border-white/10 relative">
                <Proctoring 
                   interviewId="preview" 
                   candidateId="preview" 
                   onTerminate={() => {}} 
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                   <p className="text-[10px] text-white/50 uppercase tracking-widest font-bold bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">Camera Preview</p>
                </div>
              </div>
              <ul className="text-[11px] space-y-2 text-slate-400 list-disc pl-4">
                <li>Ensure you are in a well-lit room.</li>
                <li>Stay within the camera frame at all times.</li>
                <li>Tabs switching and exiting fullscreen will result in test termination.</li>
              </ul>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (status === "interviewing") {
    const currentQ = questions[currentQuestionIndex];
    const progress = ((currentQuestionIndex + 1) / totalQuestions) * 100;

    return (
        <div className="min-h-screen w-full bg-[#020617] flex flex-col items-center p-4 md:p-8 text-left">
            <Proctoring 
              interviewId={sessionId?.toString() || ""} 
              candidateId={token || ""} 
              onTerminate={() => setStatus("error")} 
            />
            <div className="w-full max-w-4xl flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-blue-500/10 rounded-lg">
                        <BrainCircuit className="w-5 h-5 text-blue-500" />
                   </div>
                   <div>
                      <h2 className="text-white font-bold leading-tight">
                        {setupData.role ? `${setupData.role} Assessment` : 'Interview Assessment'}
                      </h2>
                       <p className="text-xs text-slate-500 font-mono">ID: {sessionId}</p>
                   </div>
                </div>

                <div className={`flex items-center gap-3 px-4 py-2 rounded-full border border-white/10 ${timeLeft < 60 ? 'bg-red-500/10 border-red-500/20' : 'bg-slate-900/50'}`}>
                    <Timer className={`w-4 h-4 ${timeLeft < 60 ? 'text-red-500 animate-pulse' : 'text-slate-400'}`} />
                    <span className={`font-mono font-bold ${timeLeft < 60 ? 'text-red-500' : 'text-white'}`}>
                        {formatTime(timeLeft)}
                    </span>
                </div>
            </div>

            <div className="w-full max-w-4xl relative">
                <div className="absolute top-0 inset-x-0 h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                    />
                </div>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentQuestionIndex}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        className="pt-8"
                    >
                        {currentQ ? (
                            <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-[2rem] p-8 md:p-12">
                                <span className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-4 block">
                                    Question {currentQuestionIndex + 1} of {totalQuestions}
                                </span>
                                <div className="mb-4 flex flex-wrap gap-2">
                                    {currentQ.selection_mode && (
                                        <span className="inline-flex items-center rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-300">
                                            {currentQ.selection_mode}
                                        </span>
                                    )}
                                    {typeof currentQ.semantic_similarity === "number" && (
                                        <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                                            Cosine {currentQ.semantic_similarity.toFixed(3)}
                                        </span>
                                    )}
                                    {currentQ.semantic_topic && (
                                        <span className="inline-flex items-center rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-violet-300">
                                            Topic {currentQ.semantic_topic}
                                        </span>
                                    )}
                                </div>
                                <div className="mb-10">
                                    <QuestionContent
                                        content={currentQ.question}
                                        className="text-2xl md:text-3xl font-bold text-white"
                                    />
                                </div>

                                <div className="grid grid-cols-1 gap-4">
                                    {currentQ.options.map((option, idx) => {
                                        const isSelected = answers[currentQ.id] === option;
                                        return (
                                            <button
                                                key={idx}
                                                onClick={() => setAnswers({...answers, [currentQ.id]: option})}
                                                className={`group relative text-left p-6 rounded-2xl border transition-all duration-300 ${
                                                    isSelected 
                                                    ? 'bg-blue-600/10 border-blue-500/50 text-white' 
                                                    : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/[0.08] hover:border-white/10 hover:text-slate-200'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="text-lg font-medium">
                                                        <QuestionContent content={String(option || "")} compact />
                                                    </div>
                                                    <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${
                                                        isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-700'
                                                    }`}>
                                                        {isSelected && <div className="w-2.5 h-2.5 bg-white rounded-full shadow-lg" />}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                <CardFooter className="px-0 pt-12 flex justify-between">
                                    <div className="text-xs text-slate-500 font-mono">
                                      {theta !== null
                                        ? `theta ${theta.toFixed(2)}${typeof currentQ.semantic_similarity === "number" ? ` | cosine ${currentQ.semantic_similarity.toFixed(3)}` : ''}`
                                        : 'adaptive mode'}
                                    </div>
                                    
                                    <Button 
                                        disabled={!answers[currentQ.id] || isSubmitting}
                                        onClick={() => handleAnswerSubmit(answers[currentQ.id])}
                                        className="bg-white hover:bg-slate-200 text-black px-8 h-12 rounded-xl font-bold flex gap-2"
                                    >
                                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : null}
                                        Confirm & Next
                                        <ChevronRight className="w-4 h-4" />
                                    </Button>
                                </CardFooter>
                            </Card>
                        ) : (
                             <Card className="bg-slate-900 border-white/5 p-12 text-center">
                                <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-4" />
                                <p className="text-slate-400">Loading question...</p>
                             </Card>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
  }

  if (status === "completed") {

    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#020617] p-6 text-center">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-lg">
          <Card className="bg-slate-900/40 border-white/10 backdrop-blur-3xl p-8 text-center rounded-[2.5rem] shadow-2xl">
            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>
            <CardTitle className="text-white text-3xl font-bold mb-4">Assessment Completed</CardTitle>
            
            <p className="text-slate-200 text-lg mb-4 font-medium">
              Thank you for taking the assessment!
            </p>
            
            <div className="bg-white/5 rounded-2xl p-6 border border-white/10 mb-6 text-left">
               <p className="text-slate-300 text-sm leading-relaxed">
                Your responses have been securely submitted. 
                <strong className="text-blue-400 block mt-2">Results will be shared on your registered email shortly.</strong>
                <span className="block mt-2 text-xs text-slate-400 italic">If selected, you will receive a follow-up mail regarding the next steps of the process.</span>
               </p>
            </div>
            
             <div className="mt-8">
                <Button 
                  onClick={() => navigate("/")}
                  className="w-full h-12 bg-white hover:bg-slate-200 text-black font-bold rounded-xl transition-all"
                >
                  Close & Exit
                </Button>
             </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  return null;
}
