import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardContent, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, ShieldAlert, Download, ArrowRight, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function RequiresSecureBrowser({ children }: { children: React.ReactNode }) {
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchFailed, setLaunchFailed] = useState(false);

  const [currentStep, setCurrentStep] = useState<number>(() => {
    const stored = localStorage.getItem('secureBrowserStep');
    return stored ? parseInt(stored, 10) : 1;
  });

  const updateStep = (step: number) => {
    setCurrentStep(step);
    localStorage.setItem('secureBrowserStep', step.toString());
  };

  const isElectron = useMemo(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    return userAgent.indexOf('electron') > -1 || userAgent.indexOf('amanzi-secure-browser') > -1;
  }, []);

  const secureProtocolUrl = useMemo(() => {
    return `amanzi-secure-browser://launch?url=${encodeURIComponent(window.location.href)}`;
  }, []);

  useEffect(() => {
    if (!isElectron) {
      // Auto-attempt launch on mount
      const timer = setTimeout(() => {
        window.location.href = secureProtocolUrl;
        updateStep(3); // If already installed, advance the stepper to Step 3 automatically
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isElectron, secureProtocolUrl]);

  const handleLaunch = () => {
    setIsLaunching(true);
    setLaunchFailed(false);
    updateStep(3); // Advance the stepper to Step 3 when launching

    // Attempt to open the custom protocol
    window.location.href = secureProtocolUrl;

    let hasBlurred = false;
    const onBlur = () => {
      hasBlurred = true;
      setIsLaunching(false);
    };

    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', onBlur);

    // After 3 seconds, check if window lost focus
    setTimeout(() => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', onBlur);
      if (!hasBlurred) {
        setIsLaunching(false);
        setLaunchFailed(true);
      }
    }, 3000);
  };

  const [searchParams] = useSearchParams();
  const securityHold = searchParams.get('securityHold');
  const threat = searchParams.get('threat');
  const blocked = securityHold === 'process';

  if (isElectron) {
    if (blocked) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#020617] p-6">
          <Card className="bg-red-950/40 border-red-500/20 backdrop-blur-3xl shadow-[0_0_50px_rgba(239,68,68,0.15)] rounded-2xl max-w-md w-full overflow-hidden text-center relative z-10">
            <CardHeader>
              <div className="mx-auto w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mb-4 border border-red-500/30">
                <ShieldAlert className="w-8 h-8 text-red-500" />
              </div>
              <CardTitle className="text-white text-2xl">
                {threat ? `Security Violation - ${threat}` : 'Security Violation'}
              </CardTitle>
              <CardDescription className="text-red-300/80 mt-2 text-base">
                {threat
                  ? `${threat} detected on your system`
                  : 'Prohibited software detected'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-300">
                Your assessment has been paused because a blacklisted background process was detected.
              </p>
              <div className="mt-6 p-4 bg-black/40 rounded-xl border border-red-500/20 text-left space-y-2">
                <p className="text-xs text-red-400 font-bold uppercase tracking-wider">Please Close:</p>
                <ul className="text-sm text-slate-300 list-disc pl-5">
                  <li>Screen Recording (Snipping Tool, OBS, etc.)</li>
                  <li>Remote Desktop (AnyDesk, TeamViewer)</li>
                  <li>AI Assistants (ChatGPT Desktop)</li>
                </ul>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                onClick={() => {
                  searchParams.delete('securityHold');
                  window.location.href = "/login";
                  window.location.search = searchParams.toString();
                }}
                className="w-full h-12 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl"
              >
                I have closed the applications
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#020617] p-6 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/10 blur-[130px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[130px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-2xl w-full relative z-10"
      >
        <Card className="bg-slate-900/40 border-white/10 backdrop-blur-3xl shadow-2xl rounded-3xl overflow-hidden border">
          <CardHeader className="text-center pt-8 pb-4">
            <div className="mx-auto w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-4 border border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.15)]">
              <ShieldCheck className="w-8 h-8 text-blue-500" />
            </div>
            <CardTitle className="text-white text-3xl font-extrabold tracking-tight font-outfit">
              Secure Browser Required
            </CardTitle>
            <CardDescription className="text-slate-400 mt-2 text-base max-w-md mx-auto">
              To proceed with your assessment, you must install and launch the **Amanzi Secure Browser** application.
            </CardDescription>
          </CardHeader>

          {/* Launch Status / Alert Messages */}
          {(isLaunching || launchFailed) && (
            <div className="px-8 pb-2">
              {isLaunching && (
                <div className="p-4 bg-blue-950/40 border border-blue-500/30 rounded-2xl text-left flex items-center gap-3 text-blue-300 animate-pulse">
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold">Attempting to launch Amanzi Secure Browser...</p>
                    <p className="text-slate-400 mt-0.5">Please click &quot;Open&quot; if prompted by your system.</p>
                  </div>
                </div>
              )}
              {launchFailed && (
                <div className="p-4 bg-amber-950/40 border border-amber-500/30 rounded-2xl text-left flex items-start gap-3 text-amber-300">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
                  <div className="text-xs">
                    <p className="font-bold">Browser didn&apos;t open?</p>
                    <p className="text-slate-400 mt-0.5">
                      If the app is already installed, click <strong className="text-white">Launch</strong> again. Otherwise, please download and run the installer below.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <CardContent className="px-8 py-6 space-y-6">
            {/* Visual Stepper Progress Bar */}
            <div className="relative flex items-center justify-between w-full max-w-md mx-auto mb-8 mt-2 px-6">
              {/* Background track line connecting step dots */}
              <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-[2px] bg-slate-800 rounded-full z-0" />
              
              {/* Active animated progress track line */}
              <div 
                className="absolute left-6 top-1/2 -translate-y-1/2 h-[2px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full transition-all duration-500 z-0" 
                style={{ 
                  width: currentStep === 1 ? '0%' : currentStep === 2 ? '50%' : 'calc(100% - 48px)'
                }} 
              />

              {/* Step 1 Node */}
              <div className="relative z-10 flex flex-col items-center cursor-pointer" onClick={() => updateStep(1)}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                  currentStep >= 1 
                    ? 'bg-blue-600 border-blue-400 text-white font-bold shadow-[0_0_12px_rgba(37,99,235,0.4)]' 
                    : 'bg-slate-950 border-slate-800 text-slate-500 font-medium'
                }`}>
                  {currentStep > 1 ? '✓' : '1'}
                </div>
                <span className={`text-[10px] uppercase font-bold tracking-wider mt-2 transition-all duration-300 ${currentStep >= 1 ? 'text-white' : 'text-slate-500'}`}>
                  Download
                </span>
              </div>

              {/* Step 2 Node */}
              <div className="relative z-10 flex flex-col items-center cursor-pointer" onClick={() => updateStep(2)}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                  currentStep >= 2 
                    ? 'bg-indigo-600 border-indigo-400 text-white font-bold shadow-[0_0_12px_rgba(99,102,241,0.4)]' 
                    : 'bg-slate-950 border-slate-800 text-slate-500 font-medium'
                }`}>
                  {currentStep > 2 ? '✓' : '2'}
                </div>
                <span className={`text-[10px] uppercase font-bold tracking-wider mt-2 transition-all duration-300 ${currentStep >= 2 ? 'text-white' : 'text-slate-500'}`}>
                  Install
                </span>
              </div>

              {/* Step 3 Node */}
              <div className="relative z-10 flex flex-col items-center cursor-pointer" onClick={() => updateStep(3)}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                  currentStep >= 3 
                    ? 'bg-purple-600 border-purple-400 text-white font-bold shadow-[0_0_12px_rgba(168,85,247,0.4)]' 
                    : 'bg-slate-950 border-slate-800 text-slate-500 font-medium'
                }`}>
                  {currentStep > 3 ? '✓' : '3'}
                </div>
                <span className={`text-[10px] uppercase font-bold tracking-wider mt-2 transition-all duration-300 ${currentStep >= 3 ? 'text-white' : 'text-slate-500'}`}>
                  Launch
                </span>
              </div>
            </div>

            {/* Step-by-step Setup Guide */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* Step 1 */}
              <div className={`flex flex-col items-center text-center p-5 rounded-2xl border transition-all duration-500 ${
                currentStep === 1 
                  ? 'bg-blue-950/20 border-blue-500/30 shadow-[0_0_25px_rgba(59,130,246,0.15)] ring-1 ring-blue-500/20' 
                  : 'bg-white/5 border-white/5 opacity-50'
              }`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold mb-3 border transition-all duration-300 ${
                  currentStep >= 1 
                    ? 'bg-blue-500/20 border-blue-500 text-blue-400' 
                    : 'bg-white/5 border-white/5 text-slate-500'
                }`}>
                  1
                </div>
                <h3 className="text-white font-semibold text-sm mb-1">Download App</h3>
                <p className="text-xs text-slate-400 mb-4 flex-grow">
                  Download the secure browser setup client for your computer.
                </p>
                <Button
                  asChild
                  onClick={() => updateStep(2)}
                  className={`w-full text-xs font-semibold py-2 px-3 rounded-lg shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    currentStep === 1 
                      ? 'bg-blue-600 hover:bg-blue-500 text-white' 
                      : 'bg-slate-800 text-slate-500 border border-slate-700 hover:bg-slate-800 cursor-not-allowed opacity-50'
                  }`}
                >
                  <a 
                    href="https://amanzi-downloads.s3.ap-south-1.amazonaws.com/Amanzi%20Secure%20Browser%20Setup%200.2.0.exe" 
                    download
                    onClick={(e) => {
                      if (currentStep !== 1) e.preventDefault();
                    }}
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download App
                  </a>
                </Button>
              </div>

              {/* Step 2 */}
              <div className={`flex flex-col items-center text-center p-5 rounded-2xl border transition-all duration-500 ${
                currentStep === 2 
                  ? 'bg-indigo-950/20 border-indigo-500/30 shadow-[0_0_25px_rgba(99,102,241,0.15)] ring-1 ring-indigo-500/20' 
                  : 'bg-white/5 border-white/5 opacity-50'
              }`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold mb-3 border transition-all duration-300 ${
                  currentStep >= 2 
                    ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400' 
                    : 'bg-white/5 border-white/5 text-slate-500'
                }`}>
                  2
                </div>
                <h3 className="text-white font-semibold text-sm mb-1">Install Installer</h3>
                <p className="text-xs text-slate-400 flex-grow">
                  Run the downloaded installer to set up the app on your computer.
                </p>
                {currentStep === 2 ? (
                  <Button
                    onClick={() => updateStep(3)}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2 px-3 rounded-lg shadow-lg active:scale-[0.98] transition-all mt-4 cursor-pointer animate-pulse"
                  >
                    I installed the App
                  </Button>
                ) : (
                  <div className="mt-4 text-[10px] text-slate-500 uppercase tracking-widest font-bold bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
                    Setup Process
                  </div>
                )}
              </div>

              {/* Step 3 */}
              <div className={`flex flex-col items-center text-center p-5 rounded-2xl border transition-all duration-500 ${
                currentStep === 3 
                  ? 'bg-purple-950/20 border-purple-500/30 shadow-[0_0_25px_rgba(168,85,247,0.15)] ring-1 ring-purple-500/20' 
                  : 'bg-white/5 border-white/5 opacity-50'
              }`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold mb-3 border transition-all duration-300 ${
                  currentStep >= 3 
                    ? 'bg-purple-500/20 border-purple-500 text-purple-400' 
                    : 'bg-white/5 border-white/5 text-slate-500'
                }`}>
                  3
                </div>
                <h3 className="text-white font-semibold text-sm mb-1">Launch Interview</h3>
                <p className="text-xs text-slate-400 mb-4 flex-grow">
                  Launch the app using the button below or direct link.
                </p>
                <Button
                  onClick={handleLaunch}
                  disabled={currentStep < 3}
                  className={`w-full text-xs font-semibold py-2 px-3 rounded-lg active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    currentStep === 3 
                      ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-500/25 border-none' 
                      : 'border-slate-700 bg-slate-800/40 text-slate-500 cursor-not-allowed opacity-50'
                  }`}
                >
                  Launch App
                </Button>
              </div>

            </div>

            {/* Why Secure Browser Card */}
            <div className="p-4 bg-slate-800/30 rounded-2xl border border-white/5 text-left flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">Exam Environment Security</p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  The Secure Browser restricts virtual machines, unauthorized screen recording or casting software, and external browser extensions to verify candidate identity and ensure a balanced, verified exam environment.
                </p>
              </div>
            </div>
          </CardContent>

          <CardFooter className="bg-slate-900/60 px-8 py-5 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-col items-start gap-0.5 text-left">
              <span className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">
                Already installed?
              </span>
              <span className="text-[10px] text-slate-500">
                Skip downloading and start the exam directly
              </span>
            </div>
            <Button
              onClick={handleLaunch}
              disabled={isLaunching}
              className="w-full md:w-auto h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold px-6 rounded-xl shadow-[0_0_20px_rgba(37,99,235,0.25)] transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
            >
              {isLaunching ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Launching...
                </>
              ) : (
                <>
                  Launch Amanzi Secure Browser
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}

