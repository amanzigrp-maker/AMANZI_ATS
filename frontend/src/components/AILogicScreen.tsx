import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, Search, CheckCircle, Cpu, ShieldCheck } from "lucide-react";
import { MacbookFrame } from "./ui/macbook-frame";

interface LogEntry {
  id: number;
  text: string;
  type: "info" | "success" | "warning" | "error";
}

const APPLICANTS = [
  { id: 1, name: "Marcus Chen", role: "Senior Dev", image: "/assets/candidates/marcus.png", status: "Queued" },
  { id: 2, name: "Sarah Miller", role: "UX Designer", image: "/assets/candidates/sarah.png", status: "Scanning..." },
  { id: 3, name: "David Kim", role: "Product Manager", image: "/assets/candidates/david.png", status: "Queued" },
];

export function AILogicScreen() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logIndex, setLogIndex] = useState(0);

  const fullLogs: LogEntry[] = [
    { id: 1, text: "AI Matching Score: 94% [Top Tier]", type: "success" },
    { id: 2, text: "Syncing matching results...", type: "info" },
    { id: 3, text: "Fetching next in queue...", type: "info" },
    { id: 4, text: "Scanning candidate: Sarah Miller [UX Designer]", type: "info" },
    { id: 5, text: "AI Matching Score: 87% [Highly Qualified]", type: "success" },
    { id: 6, text: "Finalizing skill assessment...", type: "info" },
  ];

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLogs((prev) => {
        const nextLog = fullLogs[logIndex];
        if (!nextLog) return prev;
        return [...prev, nextLog].slice(-6);
      });
      setLogIndex((prev) => (prev + 1) % fullLogs.length);
      if (logIndex === fullLogs.length - 1) setLogs([]);
    }, 2000);
    return () => clearTimeout(timeout);
  }, [logIndex]);

  return (
    <MacbookFrame>
      <div className="w-full h-full p-8 md:p-10 flex flex-col bg-[#0b111e] text-left">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
           <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
                 <Cpu className="w-6 h-6 text-blue-400" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Recent Applicants</h2>
           </div>
           <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/10 rounded-full border border-blue-500/20">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Auto Processing</span>
           </div>
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* Applicants List */}
          <div className="space-y-4">
            {APPLICANTS.map((applicant) => (
              <div
                key={applicant.id}
                className={`p-4 rounded-xl border transition-all ${
                  applicant.status === "Scanning..." 
                  ? "bg-white/[0.04] border-blue-500/30 shadow-lg" 
                  : "bg-transparent border-transparent opacity-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <img src={applicant.image} alt={applicant.name} className="w-12 h-12 rounded-full border border-white/10" />
                    <div>
                      <h3 className="text-base font-bold text-white m-0">{applicant.name}</h3>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">{applicant.role}</p>
                    </div>
                  </div>
                  <span className={`text-[9px] font-bold px-3 py-1 rounded-full ${
                    applicant.status === "Scanning..." ? "text-blue-400 bg-blue-500/10" : "text-slate-500 bg-white/5"
                  }`}>
                    {applicant.status}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Terminal */}
          <div className="flex flex-col bg-black/40 rounded-2xl border border-white/5 h-full overflow-hidden">
             <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                   <Terminal className="w-4 h-4 text-slate-400" />
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">AI Logic Node</span>
                </div>
                <ShieldCheck className="w-4 h-4 text-emerald-500/50" />
             </div>
             <div className="p-6 font-mono text-xs space-y-4 overflow-y-auto max-h-[150px] no-scrollbar">
                <AnimatePresence mode="popLayout" initial={false}>
                  {logs.map((log) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={log.type === "success" ? "text-emerald-400 font-bold" : "text-slate-400"}
                    >
                      {"> "} {log.text}
                    </motion.div>
                  ))}
                </AnimatePresence>
             </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto pt-6 border-t border-white/5 flex items-center justify-between grayscale opacity-50">
           <div className="flex items-center gap-8 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <div className="flex items-center gap-2"><Search className="w-4 h-4" /> Resume Analysis</div>
              <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Skill Matching</div>
           </div>
           <span className="text-[10px] font-mono text-slate-500">v4.0.2</span>
        </div>
      </div>
    </MacbookFrame>
  );
}
