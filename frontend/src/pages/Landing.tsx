import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import Autoplay from "embla-carousel-autoplay";
import { useState, useEffect, useRef } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { AnimatePresence } from "framer-motion";
import {
  Brain,
  Calendar,
  BarChart3,
  Users,
  ArrowRight,
  CheckCircle2,
  Star,
  Zap,
  Globe,
  UserCheck,
  Filter,
  Mail
} from "lucide-react";

// Animation variants
const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const activities = [
  { text: "> Initializing AI Resume Parser...", color: "text-blue-400" },
  { text: "> Scanning candidate: Marcus Chen [Senior Dev]", color: "text-slate-300" },
  { text: "> AI Matching Score: 94% [Top Tier]", color: "text-green-400" },
  { text: "> Moving Marcus Chen to 'Shortlisted'", color: "text-indigo-400" },
  { text: "> Scanning candidate: Elena Rodriguez [Product Designer]", color: "text-slate-300" },
  { text: "> Extracting Portfolio: 12 Projects found", color: "text-slate-500" },
  { text: "> AI Matching Score: 89% [Excellent]", color: "text-blue-400" },
  { text: "> Moving Elena Rodriguez to 'Portfolio Review'", color: "text-indigo-400" },
  { text: "> Scanning candidate: David Park [Fullstack Lead]", color: "text-slate-300" },
  { text: "> Extracting skills: React, Node.js, AWS", color: "text-slate-500" },
  { text: "> AI Matching Score: 96% [Top Tier]", color: "text-green-400" },
  { text: "> Moving David Park to 'Hired'", color: "text-green-500" },
  { text: "> Scanning candidate: Alex Thompson [QA Engineer]", color: "text-slate-300" },
  { text: "> AI Matching Score: 82% [Strong]", color: "text-yellow-400" },
  { text: "> Moving Alex Thompson to 'Technical Round'", color: "text-indigo-400" },
  { text: "> Analyzing candidate: Sarah Miller [Marketing]", color: "text-slate-300" },
  { text: "> AI Matching Score: 88% [Strong]", color: "text-yellow-400" },
  { text: "> System ready. Processing incoming...", color: "text-green-500" },
];

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
          stroke="url(#pulse-grad)"
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
          <linearGradient id="pulse-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="50%" stopColor="rgb(59, 130, 246)" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function GridBeamBackground() {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-60">
      {/* Grid Lines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#334155_1px,transparent_1px),linear-gradient(to_bottom,#334155_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_50%,#000_70%,transparent_100%)] opacity-30" />

      {/* Horizontal Beams */}
      <div className="absolute inset-0 flex flex-col justify-around">
        {[...Array(12)].map((_, i) => (
          <div key={`h-beam-${i}`} className="relative h-[1.5px] w-full" style={{ top: `${(i + 1) * 8}%` }}>
            <motion.div
              className="absolute top-0 h-full w-[600px] bg-gradient-to-r from-transparent via-blue-400/60 to-transparent"
              initial={{ left: "-600px" }}
              animate={{ left: "100%" }}
              transition={{
                duration: 5 + Math.random() * 8,
                repeat: Infinity,
                ease: "linear",
                delay: Math.random() * 8
              }}
            />
          </div>
        ))}
      </div>

      {/* Vertical Beams */}
      <div className="absolute inset-0 flex justify-around">
        {[...Array(15)].map((_, i) => (
          <div key={`v-beam-${i}`} className="relative w-[1.5px] h-full" style={{ left: `${(i + 1) * 6}%` }}>
            <motion.div
              className="absolute left-0 w-full h-[450px] bg-gradient-to-b from-transparent via-indigo-400/50 to-transparent"
              initial={{ top: "-500px" }}
              animate={{ top: "100%" }}
              transition={{
                duration: 7 + Math.random() * 10,
                repeat: Infinity,
                ease: "linear",
                delay: Math.random() * 8
              }}
            />
          </div>
        ))}
      </div>

      {/* Corner Accents / Glows */}
      <div className="absolute top-0 left-0 w-64 h-64 bg-blue-500/15 rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-600/15 rounded-full blur-[120px] translate-x-1/3 translate-y-1/3" />
    </div>
  );
}

function LiveActivityLog({ visibleLogs }: { visibleLogs: typeof activities }) {
  return (
    <div className="space-y-1">
      {visibleLogs.map((log, i) => (
        <motion.div
          key={`${log.text}-${i}`}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className={log.color}
        >
          {log.text}
        </motion.div>
      ))}
    </div>
  );
}

function LiveCandidateList({ candidates }: { candidates: { name: string; role: string; status: string; id: number; avatar: string }[] }) {
  return (
    <div className="space-y-3">
      {candidates.map((candidate, i) => (
        <motion.div
          key={candidate.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1 }}
          className="flex items-center justify-between p-4 bg-white/[0.04] backdrop-blur-xl rounded-xl border border-white/10 hover:bg-white/[0.08] transition-all group shadow-lg"
        >
          <div className="flex items-center gap-4">
            <div className="relative">
              <img
                src={candidate.avatar}
                className="w-10 h-10 rounded-full object-cover border-2 border-white/10 group-hover:border-blue-500/50 transition-colors"
                alt={candidate.name}
              />
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-[#020617]" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">{candidate.name}</p>
              <p className="text-[11px] text-slate-400 font-medium">{candidate.role}</p>
            </div>
          </div>
          <span className={`text-[10px] font-bold px-3 py-1 rounded-full border ${candidate.status.includes("Hired") || candidate.status.includes("Review")
            ? "bg-green-500/10 text-green-400 border-green-500/20"
            : "bg-blue-500/10 text-blue-400 border-blue-500/20"
            } transition-all`}>
            {candidate.status}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

export default function Landing() {
  const { scrollY } = useScroll();
  const heroRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start end", "end start"]
  });

  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.8, 1.1, 0.8]);
  const opacityImage = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0]);
  const rotateX = useTransform(scrollYProgress, [0, 0.5, 1], [15, 0, -15]);

  const y1 = useTransform(scrollY, [0, 500], [0, 100]);
  const y2 = useTransform(scrollY, [0, 500], [0, -50]);

  // Synced Activity & Candidate State
  const [activityIndex, setActivityIndex] = useState(0);
  const [visibleCandidates, setVisibleCandidates] = useState<any[]>([]);
  const visibleLogs = activities.slice(Math.max(0, activityIndex - 4), activityIndex + 1);

  useEffect(() => {
    const interval = setInterval(() => {
      setActivityIndex((prev) => (prev + 1) % activities.length);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const currentActivity = activities[activityIndex];
    const isScan = currentActivity.text.includes("Scanning candidate") || currentActivity.text.includes("Analyzing candidate");
    const isMove = currentActivity.text.includes("Moving");

    if (isScan || isMove) {
      const match = currentActivity.text.match(/(?:candidate: |Moving )(.*?) (?:\[|to)/);
      const name = match ? match[1].trim() : null;

      if (name) {
        setVisibleCandidates(prev => {
          const exists = prev.find(c => c.name === name);
          const statusText = isMove
            ? currentActivity.text.split("'")[1] || "Shortlisted"
            : "Scanning...";

          if (exists) {
            return prev.map(c => c.name === name ? { ...c, status: statusText } : c);
          }

          const newCandidate = {
            name,
            role: currentActivity.text.includes("[") ? currentActivity.text.split("[")[1].split("]")[0] : "Candidate",
            status: statusText,
            avatar: `/avatars/avatar-${(prev.length % 5) + 1}.png`,
            id: Date.now()
          };
          return [newCandidate, ...prev].slice(0, 5);
        });
      }
    }
  }, [activityIndex]);

  return (
    <div className="min-h-screen bg-[#020617] font-sans selection:bg-blue-500/30">
      <Navbar />

      <div className="relative bg-[#020617]">
        {/* Global Page Glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none z-0 overflow-hidden">
          <div className="absolute top-[10%] left-[-10%] w-[60%] h-[40%] bg-blue-500/5 rounded-full blur-[140px]" />
          <div className="absolute top-[30%] right-[-10%] w-[50%] h-[30%] bg-purple-500/5 rounded-full blur-[120px]" />
          <div className="absolute top-[50%] left-1/2 -translate-x-1/2 w-[80%] h-[40%] bg-blue-600/5 rounded-full blur-[160px]" />
        </div>

        {/* Hero Section */}
        <section
          ref={heroRef}
          className="relative pt-32 pb-10 items-center flex flex-col justify-center min-h-screen text-white selection:bg-blue-500/30 overflow-hidden"
        >
          {/* === Grid Beam Background === */}
          <GridBeamBackground />
          <HeartbeatPulse />

          {/* Transition mask to smooth background */}
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#020617] to-transparent z-[1]" />

          <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
            <motion.div
              className="flex flex-col items-center max-w-5xl mx-auto"
              initial="initial"
              animate="animate"
              variants={staggerContainer}
            >
              {/* Badge - With Dots matching reference */}
              <motion.div
                className="flex items-center gap-6 mb-12"
                variants={fadeInUp}
              >
                <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-white/40" />
                <div className="h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_8px_white]" />
                <div className="px-6 py-2 rounded-full bg-slate-900/40 backdrop-blur-md border border-white/10 text-slate-200 text-sm font-medium tracking-wide">
                  Simplify your workflow
                </div>
                <div className="h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_8px_white]" />
                <div className="h-[1px] w-8 bg-gradient-to-l from-transparent to-white/40" />
              </motion.div>

              {/* Headline - Precise weights and gradient */}
              <motion.h1
                className="text-5xl sm:text-6xl md:text-7xl lg:text-[76px] font-bold font-heading tracking-[-0.02em] text-white mb-6 sm:mb-8 leading-[1.03] relative"
                variants={fadeInUp}
              >
                <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/60">
                  Enhance your hiring
                </span>
                <br />
                <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/60">
                  control with Amanzi
                </span>
              </motion.h1>

              {/* Subtitle - More compact and cleaner */}
              <motion.p
                className="text-[15px] sm:text-base md:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed mb-10 sm:mb-12 font-normal"
                variants={fadeInUp}
              >
                Streamline your entire business's recruitment workflow with our intuitive,
                scalable SaaS platform. Designed for modern teams, our solutions simplify complex processes.
              </motion.p>

              <motion.div
                className="flex flex-col sm:flex-row items-center gap-5 mb-24"
                variants={fadeInUp}
              >
                <Link to="/login">
                  <Button size="lg" className="rounded-full h-14 px-10 text-[16px] bg-white text-black hover:bg-slate-200 transition-all font-semibold shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                    Get started
                  </Button>
                </Link>
              </motion.div>

              {/* Live Dashboard Mockup Shell with Scroll Scale Effect */}
              <motion.div
                className="relative w-full max-w-6xl mx-auto [perspective:2000px]"
                style={{
                  scale,
                  opacity: opacityImage,
                  rotateX,
                  y: y1
                }}
              >
                {/* Glowing Border Shine Wrapper with Pulse */}
                <motion.div
                  className="relative p-[1.5px] rounded-2xl bg-gradient-to-b from-white/30 via-white/5 to-white/30 shadow-[0_0_50px_rgba(56,189,248,0.15)]"
                  animate={{ boxShadow: ["0 0 50px rgba(56,189,248,0.1)", "0 0 70px rgba(56,189,248,0.2)", "0 0 50px rgba(56,189,248,0.1)"] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <div className="relative rounded-2xl overflow-hidden bg-[#020617] transform-gpu">
                    {/* Real UI Mockup Construction */}
                    <div className="flex h-[540px] w-full">
                      {/* Left Sidebar */}
                      <div className="w-16 border-r border-white/5 bg-[#0B1221]/50 flex flex-col items-center py-6 gap-8">
                        <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center text-blue-400">
                          <BarChart3 className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col gap-6">
                          {[Users, CheckCircle2, BarChart3, Users].map((Icon, i) => (
                            <Icon key={i} className="w-5 h-5 text-white/20 hover:text-white/40 transition-colors cursor-pointer" />
                          ))}
                        </div>
                      </div>

                      {/* Main App Content */}
                      <div className="flex-1 flex flex-col">
                        {/* Header */}
                        <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0B1221]/30">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-blue-500/40" />
                              <div className="h-4 w-32 rounded-full bg-white/[0.12] backdrop-blur-md border border-white/10 shadow-sm" />
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500/40 to-purple-500/40 border border-white/30 backdrop-blur-xl shadow-xl" />
                            <div className="h-3 w-20 rounded-full bg-white/[0.12] backdrop-blur-md border border-white/10 shadow-sm" />
                          </div>
                        </div>

                        {/* Content Area */}
                        <div className="p-10 flex gap-8 h-full overflow-hidden">
                          {/* Left: Dynamic Candidate List */}
                          <div className="flex-1 space-y-4 text-left">
                            <div className="flex items-center justify-between mb-8">
                              <h3 className="text-2xl font-bold text-white font-heading tracking-tight">Recent Applicants</h3>
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 rounded-full border border-blue-500/20">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                                <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Auto Processing</span>
                              </div>
                            </div>

                            <LiveCandidateList candidates={visibleCandidates} />
                          </div>

                          {/* Right: AI Analysis Panel */}
                          <div className="w-[340px] flex flex-col gap-4">
                            <div className="flex-1 bg-[#020617]/80 rounded-2xl border border-white/10 overflow-hidden flex flex-col shadow-2xl relative">
                              {/* Glowing Scan Line Effect */}
                              <motion.div
                                className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-blue-400 to-transparent z-10"
                                animate={{ top: ["0%", "100%", "0%"] }}
                                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                              />

                              <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/5 group">
                                <span className="text-[10px] text-blue-400 font-mono font-bold tracking-widest uppercase">AI Logic Node</span>
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
                                  <span className="text-[9px] text-blue-400/60 font-mono tracking-tighter">SECURE</span>
                                </div>
                              </div>
                              <div className="p-6 font-mono text-[11px] flex-1 flex flex-col justify-end bg-black/40 text-left">
                                <LiveActivityLog visibleLogs={visibleLogs} />
                                <div className="flex items-center gap-1 mt-3">
                                  <span className="text-white/20 font-bold">{">"}</span>
                                  <motion.div
                                    className="w-1.5 h-3.5 bg-blue-500/80"
                                    animate={{ opacity: [1, 1, 0, 0] }}
                                    transition={{
                                      duration: 0.8,
                                      repeat: Infinity,
                                      times: [0, 0.5, 0.5, 1],
                                      ease: "linear"
                                    }}
                                  />
                                  <span className="text-blue-500/40 text-[10px]">waiting...</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Inner Glow Rim */}
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-20" />

                    {/* Global Screen Reflection */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none" />
                  </div>
                </motion.div>
              </motion.div>

              {/* Logo Ticker - Integrated into flow */}
              <motion.div
                className="mt-24 w-full max-w-5xl mx-auto"
                variants={fadeInUp}
              >
                <div className="flex flex-wrap justify-center gap-16 opacity-30">
                  {['Aurion', 'Logoipsum', 'Logoipsum', 'Logoipsum', 'Logoipsum'].map((logo, i) => (
                    <div key={i} className="flex items-center gap-3 px-2 py-1 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-500 cursor-pointer group">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500/50 group-hover:bg-blue-400 group-hover:scale-125 transition-all" />
                      <span className="text-[10px] font-black tracking-[0.2em] text-slate-500 group-hover:text-white transition-colors uppercase">{logo}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Features Section - Infinite Marquee */}
        <section id="features" className="py-24 relative z-10 overflow-hidden">
          {/* Transition Glow behind Features Title */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-96 bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

          <div className="container mx-auto px-4 sm:px-6 lg:px-8 mb-20 text-center relative">
            {/* THUNDER LIGHT EFFECT */}
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-blue-600/20 rounded-full blur-[140px] pointer-events-none z-0"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[200px] bg-indigo-500/20 rounded-full blur-[100px] pointer-events-none z-0"
              animate={{
                scale: [1.2, 1, 1.2],
                opacity: [0.4, 0.7, 0.4],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />


            <motion.div
              className="max-w-4xl mx-auto relative z-10"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 1, ease: "easeOut" }}
            >
              <h2 className="text-4xl md:text-7xl font-bold mb-10 tracking-tighter text-white font-heading">
                Built for modern hiring teams
              </h2>
              <p className="text-xl md:text-2xl text-slate-400 font-light leading-relaxed max-w-3xl mx-auto">
                Everything you need to find, evaluate, and hire the best talent in a single, unified interface.
              </p>
            </motion.div>
          </div>

          {/* Marquee Container */}
          <div className="flex flex-col gap-8 w-full group">
            {/* Row 1: Left Moving */}
            <div className="flex w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]">
              <motion.div
                className="flex gap-5 pr-5 py-2"
                animate={{ x: [0, -1040] }}
                transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                style={{ willChange: "transform" }}
              >
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex gap-5">
                    {[
                      { title: "AI Matching", desc: "Automated ranking based on semantic relevance." },
                      { title: "Smart Scheduling", desc: "Syncs instantly with your team's calendar." },
                      { title: "Deep Analytics", desc: "Visualize your entire hiring funnel in real-time." },
                      { title: "Team Collab", desc: "Hire together with shared ratings and collaborative reviews." }
                    ].map((feature, idx) => (
                      <Card key={idx} className="w-[240px] p-5 bg-white/[0.03] backdrop-blur-xl border border-white/10 hover:border-blue-500/50 transition-all duration-500 cursor-pointer shrink-0 shadow-xl group/fcard">
                        <h3 className="text-base font-bold text-white mb-2 font-heading tracking-tight">{feature.title}</h3>
                        <p className="text-slate-400 text-[11px] leading-relaxed line-clamp-2">{feature.desc}</p>
                      </Card>
                    ))}
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Row 2: Left Moving (Offset) */}
            <div className="flex w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]">
              <motion.div
                className="flex gap-5 pr-5 py-2"
                initial={{ x: -520 }}
                animate={{ x: [-520, -1560] }}
                transition={{ duration: 35, repeat: Infinity, ease: "linear" }}
                style={{ willChange: "transform" }}
              >
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex gap-5">
                    {[
                      { title: "Multi-Channel", desc: "Post to 200+ job boards with a single click." },
                      { title: "Candidate Portal", desc: "A premium, branded experience for every applicant." },
                      { title: "Smart Filters", desc: "Instantly surface top-tier talent with AI Logic." },
                      { title: "Auto-Email", desc: "Trigger follow-ups based on pipeline movements." }
                    ].map((feature, idx) => (
                      <Card key={idx} className="w-[240px] p-5 bg-white/[0.03] backdrop-blur-xl border border-white/10 hover:border-indigo-500/50 transition-all duration-500 cursor-pointer shrink-0 shadow-xl group/fcard">
                        <h3 className="text-base font-bold text-white mb-2 font-heading tracking-tight">{feature.title}</h3>
                        <p className="text-slate-400 text-[11px] leading-relaxed line-clamp-2">{feature.desc}</p>
                      </Card>
                    ))}
                  </div>
                ))}
              </motion.div>
            </div>
          </div>

          {/* Bottom Blend Mask */}
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#020617] to-transparent z-[1]" />
        </section>


        <Footer />
      </div>
    </div>
  );
}
