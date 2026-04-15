import React from "react";
import { motion } from "framer-motion";

interface MacbookFrameProps {
  children: React.ReactNode;
}

export function MacbookFrame({ children }: MacbookFrameProps) {
  return (
    <div className="relative w-full max-w-5xl mx-auto px-4 perspective-2000">
      <motion.div
        initial={{ rotateX: 15, y: 50, opacity: 0 }}
        animate={{ rotateX: 0, y: 0, opacity: 1 }}
        transition={{ 
          duration: 1.2, 
          ease: [0.23, 1, 0.32, 1],
          delay: 0.4 
        }}
        className="relative preserve-3d"
      >
        {/* The Outer Shell */}
        <div className="relative bg-[#0f172a] rounded-[2.5rem] p-[10px] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.7),0_30px_60px_-30px_rgba(0,0,0,0.8)] border border-white/10 ring-1 ring-white/5 backdrop-blur-3xl">
          
          {/* Bezel */}
          <div className="relative bg-[#020617] rounded-[1.8rem] overflow-hidden border border-white/5 aspect-[16/10] shadow-inner">
            
            {/* Notch Area */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-7 bg-[#020617] rounded-b-2xl z-30 flex items-center justify-center border-x border-b border-white/5">
              <div className="flex gap-2 items-center">
                <div className="w-1.5 h-1.5 bg-[#1e293b] rounded-full" />
                <div className="w-2 h-2 bg-blue-500/20 rounded-full flex items-center justify-center">
                  <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
                </div>
              </div>
            </div>

            {/* Reflection/Gloss Effect */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] via-transparent to-white/[0.05] pointer-events-none z-20" />
            
            {/* Inner Content */}
            <div className="relative z-10 w-full h-full overflow-hidden">
               {children}
            </div>

            {/* Screen Edge Highlight */}
            <div className="absolute inset-0 border border-white/5 rounded-[1.8rem] pointer-events-none z-30" />
          </div>

          {/* Bottom Lip/Base Shadow */}
          <div className="absolute -bottom-1 inset-x-16 h-1.5 bg-black/60 blur-md rounded-full" />
          
          {/* Premium Metallic Shine */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.05] to-transparent pointer-events-none rounded-[2.5rem]" />
        </div>
        
        {/* Keyboard Deck Suggestion (Shadow) */}
        <div className="absolute -bottom-10 inset-x-12 h-20 bg-black/20 blur-3xl rounded-[2.5rem] -z-10" />
      </motion.div>

      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-blue-500/5 blur-[120px] rounded-full -z-20 pointer-events-none" />
    </div>
  );
}
