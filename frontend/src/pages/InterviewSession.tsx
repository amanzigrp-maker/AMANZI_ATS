import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
  Loader2,
  Lock
} from "lucide-react";
import { toast } from "sonner";
import Proctoring from "@/components/proctoring/Proctoring";
import QuestionContent from "@/components/QuestionContent";

interface Question {
  question_id: number;
  question_text: string;
  options: string[];
}

export default function InterviewSession() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);

  // State
  const [status, setStatus] = useState<"loading" | "setup" | "interviewing" | "completed" | "error">("loading");
  const [errorHeader, setErrorHeader] = useState("Session Expired");
  const [errorMessage, setErrorMessage] = useState("Your interview session has expired or is invalid.");
  
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<{ [key: number]: string }>({});
  const [timeLeft, setTimeLeft] = useState(3600); // 1 hour default
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Initialize from LocalStorage
  useEffect(() => {
    const storedToken = localStorage.getItem("interviewToken");
    const storedUser = localStorage.getItem("interviewUser");

    if (!storedToken || !storedUser || storedUser === "undefined") {
      navigate("/interview-login");
      return;
    }

    try {
      setToken(storedToken);
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);

      // Set time left and status
      const durationSeconds = (parsedUser.duration || 60) * 60;
      setTimeLeft(durationSeconds);
      setStatus("setup");
    } catch (err) {
      console.error("Local storage parse error:", err);
      navigate("/interview-login");
    }
  }, [navigate]);

  // Helper for authenticated fetch
  const authFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const headers = {
      ...options.headers,
      "Authorization": `Bearer ${localStorage.getItem("interviewToken")}`,
      "Content-Type": "application/json"
    };
    return fetch(url, { ...options, headers });
  }, []);

  // Timer Effect
  const handleFinish = useCallback(async () => {
    if (isSubmitting || !sessionId) return;
    setIsSubmitting(true);
    
    try {
      const res = await authFetch("/api/interview/session/finish", {
        method: "POST",
        body: JSON.stringify({ sessionId })
      });
      const data = await res.json();

      if (data.success) {
        setStatus("completed");
        localStorage.removeItem("interviewToken");
        localStorage.removeItem("interviewUser");
      }
    } catch (err) {
      console.error("Finish error:", err);
      toast.error("Connection error while finishing interview");
    } finally {
      setIsSubmitting(false);
    }
  }, [sessionId, authFetch, isSubmitting]);

  useEffect(() => {
    if (status !== "interviewing" || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleFinish();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status, timeLeft, handleFinish]);

  const handleStartInterview = async () => {
    setStatus("loading");
    try {
      // 1. Start Adaptive IRT Session
      const sessionRes = await authFetch("/api/interview/adaptive/start", {
        method: "POST",
        body: JSON.stringify({
          email: user?.email,
          skill: user?.role || "General",
          experienceYears: 0 // Can be expanded to use actual user experience
        })
      });
      const sessionData = await sessionRes.json();

      if (sessionData.success) {
        setSessionId(sessionData.sessionId);
        
        // 2. Adaptive engine returns the first question immediately
        if (sessionData.question) {
          setQuestions([sessionData.question]);
          setCurrentQuestionIndex(0);
          setStatus("interviewing");
        } else {
          toast.error("Low question bank: No matching questions found for your level.");
          setStatus("setup");
        }
      } else {
        toast.error(sessionData.error || "Failed to start adaptive session");
        setStatus("setup");
      }
    } catch (err) {
      console.error("Start interview error:", err);
      setStatus("setup");
      toast.error("Connection error");
    }
  };

  const handleAnswerChange = async (questionId: number, answer: string) => {
    setAnswers({ ...answers, [questionId]: answer });
    
    // Save response and get next adaptive question
    try {
      const res = await authFetch("/api/interview/adaptive/submit", {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          questionId,
          selectedAnswer: answer
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        if (data.isFinished) {
          setStatus("completed");
          localStorage.removeItem("interviewToken");
          localStorage.removeItem("interviewUser");
        } else if (data.question) {
          // Add the next question to our list and move to it
          setQuestions(prev => [...prev, data.question]);
          setCurrentQuestionIndex(prev => prev + 1);
        }
      }
    } catch (err) {
      console.error("Adaptive submit error:", err);
      toast.error("Failed to save response");
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (status === "loading") {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#020617] text-white">
        <BrainCircuit className="w-12 h-12 text-blue-500 animate-pulse" />
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
            <Button onClick={() => navigate("/interview-login")} className="w-full bg-blue-600 text-white hover:bg-blue-500">
              Back to Login
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (status === "setup") {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#020617] p-6">
        <Card className="max-w-2xl w-full bg-slate-900/40 border-white/10 backdrop-blur-3xl shadow-2xl p-8 rounded-2xl">
          <CardHeader className="text-center pb-8">
            <BrainCircuit className="w-12 h-12 text-blue-500 mx-auto mb-4" />
            <CardTitle className="text-white text-3xl font-bold">Secure Interview Portal</CardTitle>
            <CardDescription className="text-slate-400">
              Welcome, {user?.email}. Your secure session is ready.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                Interview Guidelines
              </h3>
              <ul className="space-y-3 text-slate-400 text-sm">
                <li className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 shrink-0" />
                  Ensure you have a stable internet connection.
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 shrink-0" />
                  The test is proctored. Do not switch tabs or leave the browser.
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 shrink-0" />
                  Answers are saved automatically as you progress.
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 shrink-0" />
                  Your access will expire in <span className="text-white font-bold">{formatTime(timeLeft)}</span>.
                </li>
              </ul>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button onClick={handleStartInterview} className="w-full h-14 bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg rounded-xl shadow-[0_0_30px_rgba(37,99,235,0.2)]">
              Start Technical Interview
            </Button>
            <div className="flex items-center gap-2 justify-center text-slate-500 text-xs">
              <Lock className="w-3 h-3 text-emerald-500" />
              <span>IP Locked & Encrypted</span>
            </div>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (status === "interviewing") {
    const currentQ = questions[currentQuestionIndex];
    const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

    return (
      <div className="min-h-screen w-full bg-[#020617] flex flex-col items-center p-4 md:p-8">
        <Proctoring 
          interviewId={user?.interviewId || "session"} 
          candidateId={user?.email || "candidate"} 
          onTerminate={() => handleFinish()} 
        />
        
        <div className="w-full max-w-4xl flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <BrainCircuit className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-white font-bold">Amanzi Technical Assessment</h2>
              <p className="text-xs text-slate-500">Secure Session active</p>
            </div>
          </div>

          <div className={`flex items-center gap-3 px-4 py-2 rounded-full border border-white/10 ${timeLeft < 300 ? 'bg-red-500/10 border-red-500/20' : 'bg-slate-900/50'}`}>
            <Timer className={`w-4 h-4 ${timeLeft < 300 ? 'text-red-500 animate-pulse' : 'text-slate-400'}`} />
            <span className={`font-mono font-bold ${timeLeft < 300 ? 'text-red-500' : 'text-white'}`}>
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
              className="pt-8"
            >
              {currentQ ? (
                <Card className="bg-slate-900/40 border-white/5 backdrop-blur-xl rounded-[2rem] p-8 md:p-12 overflow-hidden relative">
                  <div className="absolute top-0 right-0 p-8 opacity-5">
                    <BrainCircuit className="w-32 h-32 text-white" />
                  </div>
                  
                  <span className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-4 block">
                    Question {currentQuestionIndex + 1} of {questions.length}
                  </span>
                  <div className="mb-10 relative z-10">
                    <QuestionContent
                      content={currentQ.question_text}
                      className="text-2xl md:text-3xl font-bold text-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 relative z-10">
                    {Object.entries(currentQ.options || {}).map(([key, value], idx) => {
                      const isSelected = answers[currentQ.question_id] === key;
                      return (
                        <button
                          key={idx}
                          onClick={() => handleAnswerChange(currentQ.question_id, key)}
                          className={`group relative text-left p-6 rounded-2xl border transition-all duration-300 ${
                            isSelected 
                            ? 'bg-blue-600/10 border-blue-500/50 text-white' 
                            : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/[0.08] hover:border-white/10 hover:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                                                    <div className="text-lg font-medium">
                                                      <QuestionContent content={`${key}: ${String(value || "")}`} compact />
                                                    </div>
                                                    <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${
                                                        isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-700'
                                                    }`}>
                              {isSelected && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <CardFooter className="px-0 pt-12 flex justify-between">
                    <Button 
                      variant="ghost" 
                      className="text-slate-500 hover:text-white"
                      disabled={currentQuestionIndex === 0}
                      onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                    >
                      Previous
                    </Button>
                    
                    {currentQuestionIndex === questions.length - 1 ? (
                      <Button 
                        onClick={handleFinish} 
                        disabled={isSubmitting || !answers[currentQ.id]}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-8 h-12 rounded-xl font-bold flex gap-2"
                      >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        Submit Assessment
                      </Button>
                    ) : (
                      <Button 
                        disabled={!answers[currentQ.id]}
                        onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                        className="bg-white hover:bg-slate-200 text-black px-8 h-12 rounded-xl font-bold flex gap-2"
                      >
                        Next Question
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              ) : (
                <div className="text-center p-12">
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto" />
                </div>
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
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <Card className="max-w-md w-full bg-slate-900/40 border-white/10 backdrop-blur-3xl p-10 text-center rounded-[2.5rem]">
            <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_50px_rgba(16,185,129,0.1)]">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            </div>
            <CardTitle className="text-white text-3xl font-bold mb-4">Interview Submitted!</CardTitle>
            <p className="text-slate-400 mb-10 leading-relaxed">
              Thank you for completing the technical assessment. Your account has been disabled for security purposes. Our recruitment team will review your responses and contact you soon.
            </p>
            
            <Button onClick={() => navigate("/")} className="w-full h-14 bg-white/5 hover:bg-white text-white hover:text-black font-bold uppercase tracking-widest rounded-xl transition-all border border-white/10">
              Return to Website
            </Button>
          </Card>
        </motion.div>
      </div>
    );
  }

  return null;
}
