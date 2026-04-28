import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Brain, ArrowRight, CheckCircle2, Award, Target, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import QuestionContent from '@/components/QuestionContent';

interface Question {
  question_id: number;
  question_text: string;
  options: any; // Depending on schema, might be JSON with A, B, C, D
  skill_tag: string;
}

interface ReportItem {
  skill: string;
  theta: number;
  percentile: number;
  lastUpdated: string;
}

const AdaptiveInterview: React.FC = () => {
  const [step, setStep] = useState<'intro' | 'testing' | 'results'>('intro');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 15 });
  const [report, setReport] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(false);

  const candidateEmail = "candidate@example.com"; // In real app, get from Auth

  const startTest = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/interview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: candidateEmail, 
          skill: 'Frontend', 
          experienceYears: 2 
        })
      });
      const data = await res.json();
      if (data.success) {
        setSessionId(data.sessionId);
        setCurrentQuestion(data.question);
        setProgress(data.progress);
        setStep('testing');
      }
    } catch (error) {
      toast.error("Failed to start session");
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = async () => {
    if (!selectedOption || !sessionId) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/interview/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          questionId: currentQuestion.question_id,
          selectedAnswer: selectedOption
        })
      });
      const data = await res.json();
      
      if (data.isFinished) {
        setStep('results');
        fetchReport();
      } else {
        setCurrentQuestion(data.question);
        setProgress(data.progress);
        setSelectedOption(null);
      }
    } catch (error) {
      toast.error("Error submitting answer");
    } finally {
      setLoading(false);
    }
  };

  const fetchReport = async () => {
    try {
      const res = await fetch(`/api/interview/report?email=${candidateEmail}`);
      const data = await res.json();
      if (data.success) setReport(data.report);
    } catch (error) {
      console.error("Report fetch error");
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-8 flex items-center justify-center">
      <div className="max-w-4xl w-full space-y-8">
        
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <Brain className="w-8 h-8 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-outfit">HireNexus AI</h1>
              <p className="text-neutral-400 text-sm">Adaptive IRT Assessment</p>
            </div>
          </div>
          {step === 'testing' && (
            <Badge variant="outline" className="bg-indigo-500/10 border-indigo-500/30 text-indigo-400 py-1.5 px-4 rounded-full">
              Live Evaluation Active
            </Badge>
          )}
        </div>

        {/* Intro Step */}
        {step === 'intro' && (
          <Card className="bg-neutral-900 border-neutral-800 overflow-hidden">
            <div className="h-2 bg-indigo-600 w-full" />
            <CardHeader className="pt-8 text-center">
              <CardTitle className="text-3xl font-bold">Intelligent Skill Assessment</CardTitle>
              <CardDescription className="text-lg">
                This interview adapts to your level in real-time using Item Response Theory.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 px-12">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { icon: Target, label: "Adaptive", detail: "Question difficulty resets every step" },
                  { icon: TrendingUp, label: "Precise", detail: "Measures proficiency, not just score" },
                  { icon: Brain, label: "Comprehensive", detail: "Covers deep conceptual knowledge" }
                ].map((item, i) => (
                  <div key={i} className="p-4 bg-neutral-800/50 rounded-2xl border border-neutral-700 text-center space-y-2">
                    <item.icon className="w-6 h-6 mx-auto text-indigo-400" />
                    <h3 className="font-semibold text-sm">{item.label}</h3>
                    <p className="text-xs text-neutral-500">{item.detail}</p>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter className="justify-center pb-12">
              <Button 
                onClick={startTest} 
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-12 py-6 rounded-2xl text-lg group"
              >
                Start Assessment
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Testing Step */}
        {step === 'testing' && currentQuestion && (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-neutral-400 px-1">
                <span>Progress: {progress.current} of {progress.total} questions</span>
                <span>Estimated Skill Level: Calculating...</span>
              </div>
              <Progress value={(progress.current / progress.total) * 100} className="h-2 bg-neutral-800" />
            </div>

            <Card className="bg-neutral-900 border-neutral-800 shadow-2xl">
              <CardHeader className="pt-8">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-indigo-500/10 text-indigo-400 border-none px-3">
                    {currentQuestion.skill_tag}
                  </Badge>
                </div>
                <CardTitle className="text-2xl leading-relaxed">
                  <QuestionContent content={currentQuestion.question_text} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {/* Dynamically handle options from JSON or manual fields */}
                {Object.entries(currentQuestion.options || {}).map(([key, value]) => (
                  <button
                    key={key}
                    onClick={() => setSelectedOption(key)}
                    className={`w-full text-left p-5 rounded-2xl border transition-all flex items-center justify-between group
                      ${selectedOption === key 
                        ? 'bg-indigo-600/20 border-indigo-500 ring-1 ring-indigo-500' 
                        : 'bg-neutral-800/50 border-neutral-700 hover:border-neutral-500'}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm
                        ${selectedOption === key ? 'bg-indigo-500 text-white' : 'bg-neutral-700 text-neutral-400'}`}>
                        {key}
                      </div>
                      <div className="text-neutral-200">
                        <QuestionContent content={String(value || "")} compact />
                      </div>
                    </div>
                    {selectedOption === key && <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_#6366f1]" />}
                  </button>
                ))}
              </CardContent>
              <CardFooter className="justify-end p-8 pt-4">
                <Button 
                  onClick={submitAnswer} 
                  disabled={!selectedOption || loading}
                  className="bg-white text-black hover:bg-neutral-200 px-10 py-6 rounded-2xl font-bold flex items-center gap-2"
                >
                  Continue
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}

        {/* Results Step */}
        {step === 'results' && (
          <Card className="bg-neutral-900 border-neutral-800 overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-500">
            <div className="h-2 bg-emerald-500 w-full" />
            <CardHeader className="text-center pt-10">
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <CardTitle className="text-3xl font-bold">Assessment Complete</CardTitle>
              <CardDescription className="text-lg">
                Our IRT engine has mapped your proficiency across technical nodes.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-12 py-8 grid grid-cols-2 gap-8">
              <div className="space-y-6">
                <h3 className="text-xl font-semibold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-400" />
                  Technical Proficiency
                </h3>
                {report.map((item, i) => (
                  <div key={i} className="space-y-3">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-sm text-neutral-400 mb-1">{item.skill}</p>
                        <p className="text-2xl font-bold">{item.percentile}% Proficiency</p>
                      </div>
                      <Badge className="bg-indigo-500/20 text-indigo-400 border-none">
                        θ: {item.theta.toFixed(2)}
                      </Badge>
                    </div>
                    <div className="h-3 bg-neutral-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full" 
                        style={{ width: `${item.percentile}%` }} 
                      />
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="bg-neutral-800/30 rounded-3xl p-6 flex items-center justify-center border border-neutral-800">
                 {/* Visual Skill Map (Simplified Radar Chart) */}
                 <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={report}>
                        <PolarGrid stroke="#333" />
                        <PolarAngleAxis dataKey="skill" tick={{ fill: '#888', fontSize: 12 }} />
                        <Radar
                          name="Proficiency"
                          dataKey="percentile"
                          stroke="#6366f1"
                          fill="#6366f1"
                          fillOpacity={0.6}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                 </div>
              </div>
            </CardContent>
            <CardFooter className="bg-neutral-800/50 p-8 flex justify-center border-t border-neutral-800">
               <Button variant="ghost" className="text-neutral-400 hover:text-white" onClick={() => window.location.reload()}>
                 Back to Dashboard
               </Button>
            </CardFooter>
          </Card>
        )}

      </div>
    </div>
  );
};

export default AdaptiveInterview;
