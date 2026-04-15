import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Eye, EyeOff, Sparkles, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AILogicScreen } from "@/components/AILogicScreen";

function HeartbeatPulse() {
  return (
    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-0 h-48 opacity-20 pointer-events-none overflow-hidden">
      <svg
        viewBox="0 0 1000 100"
        className="w-full h-full"
        preserveAspectRatio="none"
      >
        <path
          d="M0 50 L200 50 L210 40 L220 60 L230 10 L240 90 L250 50 L300 50 L500 50 L700 50 L710 40 L720 60 L730 10 L740 90 L750 50 L1000 50"
          fill="none"
          stroke="rgba(59, 130, 246, 0.3)"
          strokeWidth="0.5"
        />
        <motion.path
          d="M0 50 L200 50 L210 40 L220 60 L230 10 L240 90 L250 50 L300 50 L500 50 L700 50 L710 40 L720 60 L730 10 L740 90 L750 50 L1000 50"
          fill="none"
          stroke="url(#login-pulse-grad)"
          strokeWidth="2"
          strokeDasharray="1000"
          initial={{ strokeDashoffset: 1000 }}
          animate={{ strokeDashoffset: -1000 }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "linear",
          }}
        />
        <defs>
          <linearGradient id="login-pulse-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="50%" stopColor="rgb(59, 130, 246)" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function DigitalBeamGrid() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
      {/* Vertical Scanning Beams */}
      <div className="absolute inset-0 flex justify-around px-10 lg:px-40">
        {[...Array(12)].map((_, i) => (
          <div key={`v-track-${i}`} className="w-[1px] h-full relative">
            <div className="absolute inset-0 bg-blue-500/[0.03]" />
            <motion.div
              className="absolute top-0 left-[-1px] w-[3px] bg-gradient-to-b from-transparent via-blue-400/40 to-transparent h-[30vh] blur-[1px]"
              animate={{
                top: ["-30%", "130%"],
              }}
              transition={{
                duration: 8 + i % 5,
                repeat: Infinity,
                ease: "linear",
                delay: i * 0.7,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function SpiderWebBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let particles: { x: number; y: number; vx: number; vy: number }[] = [];
    const particleCount = 50;
    const connectionRadius = 150;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const createParticles = () => {
      particles = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
        });
      }
    };

    let animationFrameId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(59, 130, 246, 0.4)";
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < connectionRadius) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(59, 130, 246, ${0.2 * (1 - dist / connectionRadius)})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      });
      animationFrameId = requestAnimationFrame(animate);
    };

    window.addEventListener("resize", resize);
    resize();
    createParticles();
    animate();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0 pointer-events-none opacity-80"
    />
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to log in');
      }

      localStorage.setItem('accessToken', result.accessToken);
      localStorage.setItem('refreshToken', result.refreshToken);

      toast({
        title: "✅ Welcome back!",
        description: "You've successfully logged in.",
        duration: 2000,
      });

      setTimeout(() => navigate("/dashboard"), 500);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
      toast({
        variant: "destructive",
        title: "❌ Login failed",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  return (
    <div className="h-screen w-screen bg-[#020617] flex relative overflow-hidden font-sans">
      {/* Background Web Effect - Global */}
      <SpiderWebBackground />
      <HeartbeatPulse />
      <DigitalBeamGrid />

      <div className="relative z-10 w-full h-full flex flex-col p-4 md:p-8 overflow-y-auto lg:overflow-hidden lg:pb-32">
        {/* Navigation Header */}
        <div className="w-full flex items-center justify-between mb-10 lg:mb-0 lg:fixed lg:top-10 lg:inset-x-0 lg:px-12 z-[100] pointer-events-none">
          <div className="pointer-events-auto filter drop-shadow-sm">
            <img src="/assets/logo.png" alt="Amanzi Logo" className="h-8 md:h-10 w-auto" />
          </div>

          <div className="pointer-events-auto">
            <Link to="/" className="inline-block group">
              <div className="flex items-center gap-2 md:gap-3 bg-[#020617]/40 backdrop-blur-md rounded-full px-4 py-2 border border-white/5 group-hover:border-white/20 transition-all duration-300">
                <span className="hidden sm:inline text-xs font-bold text-slate-400 group-hover:text-white transition-colors tracking-widest uppercase">Back to Home</span>
                <div className="p-1 rounded-full text-slate-400 group-hover:text-white transition-colors">
                  <ArrowLeft className="w-4 h-4 rotate-180" />
                </div>
              </div>
            </Link>
          </div>
        </div>

        <div className="w-full min-h-[calc(100vh-120px)] flex flex-col lg:flex-row items-center justify-center max-w-[1700px] mx-auto px-2 md:px-10 lg:px-12 py-6 lg:pt-32 lg:pb-12 gap-12 md:gap-16 lg:gap-24 relative z-10">

          {/* Left: Login Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="w-full sm:max-w-[420px] flex flex-col order-2 lg:order-1"
          >
            <div className="flex flex-col items-start mb-6 md:mb-10">
              <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2 md:mb-3">Welcome back</h1>
              <p className="text-slate-400 text-xs md:text-sm font-medium">Please enter your details to sign in.</p>
            </div>

            <div className="relative group/card">
              <div className="absolute -inset-[1px] bg-gradient-to-r from-blue-500/30 to-purple-500/20 rounded-[2rem] blur-2xl opacity-40 group-hover:opacity-60 transition-opacity duration-500" />
              <Card className="p-8 shadow-[0_0_100px_rgba(0,0,0,0.4)] border border-white/10 bg-card/[0.02] backdrop-blur-[80px] rounded-[2rem] relative overflow-hidden ring-1 ring-white/5">
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-white/[0.01] pointer-events-none" />

                <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
                  <div className="space-y-2.5">
                    <Label htmlFor="email" className="text-[11px] font-bold text-blue-300/60 ml-1 tracking-widest uppercase">Work Email</Label>
                    <div className="relative group/input">
                      <div className="absolute -inset-[1px] bg-gradient-to-r from-blue-500/20 to-transparent rounded-2xl blur-sm opacity-0 group-focus-within/input:opacity-100 transition-opacity duration-500" />
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="name@company.com"
                        value={formData.email}
                        onChange={handleChange}
                        className="h-14 bg-white/[0.01] backdrop-blur-2xl border border-white/10 text-white placeholder:text-slate-600 focus:bg-white/[0.04] focus:border-blue-400/50 rounded-2xl transition-all duration-300 px-5 text-sm relative z-10 shadow-none ring-1 ring-white/5"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between ml-1">
                      <Label htmlFor="password" className="text-[11px] font-bold text-blue-300/60 tracking-widest uppercase">Password</Label>
                      <Link
                        to="/forgot-password"
                        className="text-[10px] font-bold text-blue-400/60 hover:text-white transition-colors uppercase tracking-widest"
                      >
                        Forgot Access?
                      </Link>
                    </div>
                    <div className="relative group/pass">
                      <div className="absolute -inset-[1px] bg-gradient-to-r from-blue-500/20 to-transparent rounded-2xl blur-sm opacity-0 group-focus-within/pass:opacity-100 transition-opacity duration-500" />
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••••••"
                        value={formData.password}
                        onChange={handleChange}
                        className="h-14 bg-white/[0.01] backdrop-blur-2xl border border-white/10 text-white placeholder:text-slate-600 focus:bg-white/[0.04] focus:border-blue-400/50 rounded-2xl transition-all duration-300 pl-5 pr-12 text-sm relative z-10 shadow-none ring-1 ring-white/5"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400/40 hover:text-white transition-colors p-1 z-20"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-15 bg-blue-500/10 backdrop-blur-3xl hover:bg-blue-500/20 text-blue-400 hover:text-white font-bold text-sm rounded-2xl shadow-[0_10px_25px_rgba(37,99,235,0.1)] transition-all transform active:scale-[0.98] disabled:opacity-50 border border-blue-500/30"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Verifying Access...</span>
                      </div>
                    ) : "Sign into Account"}
                  </Button>

                  <div className="flex items-center justify-center gap-2 pt-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500/60" />
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                      Encrypted Connection
                    </span>
                  </div>
                </form>
              </Card>
            </div>
          </motion.div>

          {/* Right: AI Hiring Visual */}
          <div className="flex-1 flex items-center justify-center order-1 lg:order-2 w-full">
            <AILogicScreen />
          </div>

        </div>
      </div>
    </div>
  );
}
