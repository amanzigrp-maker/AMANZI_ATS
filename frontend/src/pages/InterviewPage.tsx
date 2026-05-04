import React, { useState, useEffect, useCallback, useRef } from "react";
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
  Loader2,
  Camera,
  BadgeCheck,
  FileImage
} from "lucide-react";
import { toast } from "sonner";
import Proctoring from "@/components/proctoring/Proctoring";
import QuestionContent from "@/components/QuestionContent";
import { WebcamCapture } from "@/components/WebcamCapture";


interface Question {
  id: number;
  question: string;
  options: string[];
  question_type?: "single" | "multiple";
}

const INSTRUCTION_SECONDS = 30;
const INTERVIEW_SECONDS = 60;

export default function InterviewPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const candidateIdFromLink = searchParams.get("candidateId");
  const navigate = useNavigate();

  // State
  const [status, setStatus] = useState<"login" | "loading" | "verification" | "instructions" | "interviewing" | "completed" | "error">(token ? "loading" : "login");
  const [errorHeader, setErrorHeader] = useState("Invalid Link");
  const [errorMessage, setErrorMessage] = useState("This interview link is invalid or has expired.");
  
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [interviewToken, setInterviewToken] = useState<string | null>(token);
  const [candidateInfo, setCandidateInfo] = useState<{ name: string; email: string } | null>(null);
  const [setupData, setSetupData] = useState({ experience: 0, role: "" });
  const [sessionId, setSessionId] = useState<string | number | null>(null);
  const [jwtToken, setJwtToken] = useState<string | null>(null);
  const [verificationImages, setVerificationImages] = useState({ selfie: "", idCard: "" });
  const [isSavingVerification, setIsSavingVerification] = useState(false);
  const [instructionTimeLeft, setInstructionTimeLeft] = useState(INSTRUCTION_SECONDS);
  const [isPreparingQuestions, setIsPreparingQuestions] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [preparedSession, setPreparedSession] = useState<{
    sessionId: string | number;
    question?: Question;
    theta?: number | null;
    totalQuestions?: number;
  } | null>(null);
  
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<{ [key: number]: string | string[] }>({});
  const [timeLeft, setTimeLeft] = useState(INTERVIEW_SECONDS);
  const [score, setScore] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [totalQuestions, setTotalQuestions] = useState(10); // Dynamic total from Admin
  const [theta, setTheta] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [isFeedbackSubmitting, setIsFeedbackSubmitting] = useState(false);
  const preparePromiseRef = useRef<Promise<void> | null>(null);
  const [candidatePhoto, setCandidatePhoto] = useState<string | null>(null);
  const [certId, setCertId] = useState<string | null>(null);
  const [isGeneratingCert, setIsGeneratingCert] = useState(false);


  // 1. Validate Token on Mount (Fallback for old flow)
  useEffect(() => {
    if (!token) return;
    const validate = async () => {
      try {
        const params = new URLSearchParams({ token });
        if (candidateIdFromLink) params.set("candidateId", candidateIdFromLink);
        const res = await fetch(`/api/interview/validate?${params.toString()}`);
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
  }, [token, candidateIdFromLink]);

  useEffect(() => {
    if (token) return;

    const storedToken = localStorage.getItem("interviewToken");
    const storedUser = localStorage.getItem("interviewUser");
    if (!storedToken || !storedUser || storedUser === "undefined") return;

    try {
      const parsedUser = JSON.parse(storedUser);
      setInterviewToken(parsedUser.token || null);
      handleAuthSuccess({ ...parsedUser, jwt: storedToken });
    } catch (error) {
      console.error("Stored interview session parse error:", error);
    }
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/interview/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...loginForm,
          candidateId: candidateIdFromLink ? Number(candidateIdFromLink) : undefined
        })
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
    setTimeLeft(INTERVIEW_SECONDS);
    if (data.total_questions) setTotalQuestions(data.total_questions);
    if (typeof data.experience_years === "number") {
      setSetupData((prev) => ({ ...prev, experience: data.experience_years }));
    }
    if (data.role) {
      setSetupData((prev) => ({ ...prev, role: data.role }));
    }
    if (data.session_id) {
      setSessionId(data.session_id);
      await fetchQuestions(data.session_id, data.jwt);
      setStatus("interviewing");
    } else {
      setStatus("verification");
    }
  };

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.readAsDataURL(file);
    });

  const handleVerificationFileChange = async (
    kind: "selfie" | "idCard",
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await fileToDataUrl(file);
      setVerificationImages((prev) => ({ ...prev, [kind]: dataUrl }));
    } catch (error) {
      toast.error("Could not read the selected image");
    }
  };

  const prepareInterviewQuestions = useCallback(async () => {
    if (preparePromiseRef.current || preparedSession || !jwtToken) {
      return preparePromiseRef.current || Promise.resolve();
    }

    const activeToken = interviewToken || token;
    if (!activeToken) {
      setPrepareError("Interview token is missing. Please log in again.");
      return Promise.resolve();
    }

    const prepPromise = (async () => {
      setIsPreparingQuestions(true);
      setPrepareError(null);
      try {
        const res = await fetch("/api/interview/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${jwtToken}`
          },
          body: JSON.stringify({
            token: activeToken,
            role: setupData.role
          })
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to prepare AI questions");
        }

        setPreparedSession({
          sessionId: data.session_id,
          question: data.question,
          theta: typeof data.theta === "number" ? data.theta : null,
          totalQuestions: Number(data.target_questions || data.total_questions || totalQuestions) || totalQuestions,
        });
      } catch (error: any) {
        console.error("Interview preparation error:", error);
        setPrepareError(error?.message || "Failed to prepare interview questions");
      } finally {
        setIsPreparingQuestions(false);
        preparePromiseRef.current = null;
      }
    })();

    preparePromiseRef.current = prepPromise;
    return prepPromise;
  }, [preparedSession, jwtToken, interviewToken, token, setupData.role, totalQuestions]);

  const handleVerificationSubmit = async () => {
    if (!verificationImages.selfie) {
      toast.error("Please capture your live photo before continuing.");
      return;
    }

    if (!jwtToken) {
      toast.error("Secure session is missing. Please reopen the interview link.");
      return;
    }

    setIsSavingVerification(true);
    try {
      const res = await fetch("/api/interview/verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          selfieImage: verificationImages.selfie,
          idCardImage: verificationImages.selfie // Use selfie as fallback if backend requires both
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save verification images");
      }

      setInstructionTimeLeft(INSTRUCTION_SECONDS);
      setStatus("instructions");
      void prepareInterviewQuestions();
    } catch (error: any) {
      toast.error(error?.message || "Failed to save verification images");
    } finally {
      setIsSavingVerification(false);
    }
  };

  const requestFullscreen = async () => {
    if (document.fullscreenElement) return true;

    try {
      await document.documentElement.requestFullscreen();
      return true;
    } catch (error) {
      console.warn("Fullscreen request was not completed:", error);
      return false;
    }
  };

  const activatePreparedInterview = useCallback(async () => {
    if (!preparedSession || !jwtToken) return;

    await requestFullscreen();
    setStatus("loading");
    try {
      const res = await fetch("/api/interview/start-confirmed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ session_id: preparedSession.sessionId })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to start interview");
      }

      setSessionId(preparedSession.sessionId);
      setCurrentQuestionIndex(0);
      setQuestions(preparedSession.question ? [preparedSession.question] : []);
      setTheta(preparedSession.theta ?? null);
      setTotalQuestions(preparedSession.totalQuestions || totalQuestions);
      setTimeLeft(INTERVIEW_SECONDS);
      setStatus("interviewing");
      toast.success("Assessment started. Good luck.");
    } catch (error: any) {
      setStatus("instructions");
      toast.error(error?.message || "Failed to start interview");
    }
  }, [preparedSession, jwtToken, totalQuestions]);

  // Timer Effect
  const handleAnswerSubmit = useCallback(async (selectedAnswer: string | string[]) => {
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
        const finalScore = typeof data.score === "number" ? data.score : 0;
        setScore(finalScore);
        if (typeof data.total === "number") {
          setTotalQuestions(data.total);
        }
        localStorage.removeItem("interviewToken");
        localStorage.removeItem("interviewUser");
        setStatus("completed");
        
        // Auto-trigger certificate generation
        handleGenerateCertificate(finalScore);
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
  }, [status, timeLeft, questions, currentQuestionIndex, answers, handleAnswerSubmit]);

  useEffect(() => {
    if (status !== "instructions") return;

    const timer = setInterval(() => {
      setInstructionTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [status]);

  const handleGenerateCertificate = async (finalScore: number) => {
    if (!sessionId || !candidateInfo) return;
    setIsGeneratingCert(true);
    try {
      const res = await fetch("/api/certificates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          score: finalScore,
          testName: setupData.role || "Technical Assessment",
          candidateName: candidateInfo.name,
          candidateEmail: candidateInfo.email,
          candidatePhoto: candidatePhoto || verificationImages.selfie
        })
      });
      const data = await res.json();
      if (data.certificateId) {
        setCertId(data.certificateId);
        toast.success("Certificate generated and sent to your email!");
      } else {
        throw new Error(data.error || "Generation failed without error message");
      }
    } catch (error: any) {
      console.error("Certificate generation error:", error);
      toast.error("Could not generate certificate: " + (error?.message || "Server error"));
    } finally {
      setIsGeneratingCert(false);
    }
  };

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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const toggleMultiAnswer = (questionId: number, option: string) => {
    const current = Array.isArray(answers[questionId]) ? answers[questionId] as string[] : [];
    const next = current.includes(option)
      ? current.filter((item) => item !== option)
      : [...current, option];
    setAnswers({ ...answers, [questionId]: next });
  };

  const canStartInterview = instructionTimeLeft <= 0 && !!preparedSession && !isPreparingQuestions;

  const handleFeedbackComplete = async (submit: boolean) => {
    if (!sessionId || !jwtToken) {
      setFeedbackDone(true);
      return;
    }

    if (!submit) {
      setFeedbackDone(true);
      return;
    }

    setIsFeedbackSubmitting(true);
    try {
      const res = await fetch("/api/interview/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          session_id: sessionId,
          feedback: feedbackText
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save feedback");
      }
      setFeedbackDone(true);
      toast.success("Feedback submitted");
    } catch (error: any) {
      toast.error(error?.message || "Failed to save feedback");
    } finally {
      setIsFeedbackSubmitting(false);
    }
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

  if (status === "verification") {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#020617] p-6 text-left">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row gap-8 max-w-5xl w-full">
          <Card className="flex-1 bg-slate-900/40 border-white/10 backdrop-blur-3xl shadow-2xl">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <BadgeCheck className="text-blue-500 w-6 h-6" />
                <span className="text-xs font-bold text-blue-500 uppercase tracking-widest">
                  Identity Verification
                </span>
              </div>
              <CardTitle className="text-white text-3xl font-bold">Welcome, {candidateInfo?.name}</CardTitle>
              <CardDescription className="text-slate-400">
                Before the interview begins, please capture a clear live photo for your official certificate.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Applied Role</label>
                <div className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white">
                  {setupData.role || "Assigned interview"}
                </div>
              </div>
              <div className="flex flex-col items-center justify-center">
                <div className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 flex flex-col items-center">
                  <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400 self-start">
                    <Camera className="h-4 w-4 text-blue-400" />
                    Live Photo Capture
                  </span>
                  
                  <WebcamCapture onCapture={(image) => {
                    setCandidatePhoto(image);
                    setVerificationImages(prev => ({ ...prev, selfie: image }));
                  }} />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button
                onClick={handleVerificationSubmit}
                disabled={isSavingVerification}
                className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(37,99,235,0.3)]"
              >
                {isSavingVerification ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Continue to Instructions
              </Button>
              <div className="flex items-center gap-2 justify-center">
                <ShieldCheck className="w-4 h-4 text-emerald-500 opacity-60" />
                <span className="text-[10px] text-slate-500 uppercase font-bold">Your captured photo stays tied to your secure interview token</span>
              </div>
            </CardFooter>
          </Card>

          <Card className="w-full md:w-80 bg-slate-900/40 border-white/10 backdrop-blur-3xl shadow-2xl overflow-hidden relative">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-blue-500" />
                Before You Continue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="text-[11px] space-y-2 text-slate-400 list-disc pl-4">
                <li>Use a well-lit environment for a clear photo.</li>
                <li>Make sure your face is clearly visible in the frame.</li>
                <li>The next page will explain the full exam structure before the timer starts.</li>
              </ul>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (status === "instructions") {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#020617] p-6 text-left">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row gap-8 max-w-5xl w-full">
          <Card className="flex-1 bg-slate-900/40 border-white/10 backdrop-blur-3xl shadow-2xl">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <BrainCircuit className="text-blue-500 w-6 h-6" />
                <span className="text-xs font-bold text-blue-500 uppercase tracking-widest">
                  Candidate Instructions
                </span>
              </div>
              <CardTitle className="text-white text-3xl font-bold">Review the exam structure</CardTitle>
              <CardDescription className="text-slate-400">
                While you read this page, we are preparing a personalized interview based on your stored profile and experience level.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-bold text-white">Warm-up timer</span>
                  <span className="font-mono text-lg font-bold text-blue-300">{formatTime(instructionTimeLeft)}</span>
                </div>
                <Progress value={((INSTRUCTION_SECONDS - instructionTimeLeft) / INSTRUCTION_SECONDS) * 100} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-widest text-slate-400">Exam Structure</h3>
                  <ul className="space-y-2 text-sm text-slate-300">
                    <li>{totalQuestions} questions in total</li>
                    <li>Difficulty increases smoothly from easy to medium to hard</li>
                    <li>Questions stay aligned to your role and experience level</li>
                    <li>Technical profiles may receive a balanced mix of direct MCQs and code-based questions</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-widest text-slate-400">Rules</h3>
                  <ul className="space-y-2 text-sm text-slate-300">
                    <li>Remain in fullscreen once the interview begins</li>
                    <li>Do not switch tabs during the test</li>
                    <li>Each answer is saved as you proceed</li>
                    <li>Your webcam monitoring starts when the test starts</li>
                  </ul>
                </div>
              </div>

              {prepareError ? (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                  <p className="font-semibold">Question preparation failed.</p>
                  <p>{prepareError}</p>
                </div>
              ) : null}
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button
                onClick={activatePreparedInterview}
                disabled={!canStartInterview}
                className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(37,99,235,0.3)]"
              >
                {isPreparingQuestions ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {instructionTimeLeft > 0 ? `Start Interview (${formatTime(instructionTimeLeft)})` : "Start Interview"}
              </Button>
              {prepareError ? (
                <Button
                  variant="outline"
                  onClick={() => void prepareInterviewQuestions()}
                  className="w-full border-white/10 bg-white/5 text-white hover:bg-white/10"
                >
                  Retry Question Preparation
                </Button>
              ) : null}
            </CardFooter>
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
              candidateId={candidateIdFromLink || candidateInfo?.email || token || ""} 
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

                <div className={`flex items-center gap-3 px-4 py-2 rounded-full border border-white/10 ${timeLeft < 15 ? 'bg-red-500/10 border-red-500/20' : 'bg-slate-900/50'}`}>
                    <Timer className={`w-4 h-4 ${timeLeft < 15 ? 'text-red-500 animate-pulse' : 'text-slate-400'}`} />
                    <span className={`font-mono font-bold ${timeLeft < 15 ? 'text-red-500' : 'text-white'}`}>
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
                                {currentQ.question_type === "multiple" ? (
                                    <div className="mb-4 text-xs font-bold uppercase tracking-widest text-amber-300">
                                        Select all that apply
                                    </div>
                                ) : null}
                                <div className="mb-10">
                                    <QuestionContent
                                        content={currentQ.question}
                                        className="text-2xl md:text-3xl font-bold text-white"
                                    />
                                </div>

                                <div className="grid grid-cols-1 gap-4">
                                    {currentQ.options.map((option, idx) => {
                                        const currentAnswer = answers[currentQ.id];
                                        const isSelected = currentQ.question_type === "multiple"
                                            ? Array.isArray(currentAnswer) && currentAnswer.includes(option)
                                            : currentAnswer === option;
                                        return (
                                            <button
                                                key={idx}
                                                onClick={() => currentQ.question_type === "multiple"
                                                    ? toggleMultiAnswer(currentQ.id, option)
                                                    : setAnswers({...answers, [currentQ.id]: option})}
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
                                                    <div className={`flex items-center justify-center transition-colors ${
                                                        currentQ.question_type === "multiple"
                                                            ? `h-6 w-6 rounded-md border ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-700'}`
                                                            : `h-6 w-6 rounded-full border ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-700'}`
                                                    }`}>
                                                        {isSelected && <div className="w-2.5 h-2.5 bg-white rounded-full shadow-lg" />}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                <CardFooter className="px-0 pt-12 flex justify-between">
                                    <div className="text-xs text-slate-500 font-mono">Choose the best answer and continue.</div>
                                    
                                    <Button 
                                        disabled={
                                            isSubmitting ||
                                            (currentQ.question_type === "multiple"
                                                ? !Array.isArray(answers[currentQ.id]) || (answers[currentQ.id] as string[]).length === 0
                                                : !answers[currentQ.id])
                                        }
                                        onClick={() => handleAnswerSubmit(answers[currentQ.id] as string | string[])}
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

            {!feedbackDone ? (
              <div className="space-y-4 text-left">
                <label className="block text-xs font-bold uppercase tracking-[0.25em] text-slate-400">
                  Optional Feedback
                </label>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Tell us about your interview experience..."
                  className="min-h-28 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Button
                    onClick={() => void handleFeedbackComplete(true)}
                    disabled={isFeedbackSubmitting}
                    className="h-12 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl"
                  >
                    {isFeedbackSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Submit Feedback
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void handleFeedbackComplete(false)}
                    className="h-12 border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-xl"
                  >
                    Skip
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
                <p className="text-sm font-medium text-emerald-200">
                  You may now close the window.
                </p>
              </div>
            )}

            <div className="mt-8 space-y-4">
              {certId && (
                <Button 
                  asChild
                  className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(37,99,235,0.2)] transition-all flex items-center justify-center gap-2"
                >
                  <a href={`/api/certificates/download/${certId}`} target="_blank" rel="noopener noreferrer">
                    Download Certificate
                  </a>
                </Button>
              )}
              {isGeneratingCert && (
                <div className="flex items-center justify-center gap-2 text-blue-400 text-sm font-bold animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Preparing Your Certificate...
                </div>
              )}
              <Button 
                onClick={() => navigate("/")}
                variant="outline"
                className="w-full h-12 border-white/10 hover:bg-white/5 text-white font-bold rounded-xl transition-all"
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
