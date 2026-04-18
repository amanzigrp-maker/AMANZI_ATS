import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
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
  AlertCircle 
} from "lucide-react";
import { toast } from "sonner";

export default function InterviewLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/interview/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (data.success) {
        // Store JWT in local storage for session handling
        localStorage.setItem("interviewToken", data.token);
        localStorage.setItem("interviewUser", JSON.stringify(data.user));
        
        toast.success("Login successful! Welcome to your interview.");
        navigate("/interview-session");
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
                    id="password"
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

        <p className="text-center text-slate-600 text-[11px] mt-8 uppercase tracking-[0.2em] font-medium">
          Protected by Amanzi Security Engine
        </p>
      </motion.div>
    </div>
  );
}
