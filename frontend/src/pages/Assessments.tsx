import React, { useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, ClipboardList, FileUp, Loader2, Mail, Search, Send, Sparkles, Trash2 } from "lucide-react";
import QuestionContent from "@/components/QuestionContent";

type Assessment = {
  assessment_id: number;
  title: string;
  description?: string;
  role?: string;
  duration_minutes?: number;
  status: string;
  source_type?: string;
  question_count: number;
  created_at: string;
};

type AssessmentQuestion = {
  question_id: number;
  question_text: string;
  difficulty?: string;
  topic?: string;
  explanation?: string;
  correct_option: "A" | "B" | "C" | "D";
  options: Record<string, string>;
};

const sampleCsv = `question_text,option_a,option_b,option_c,option_d,correct_option,difficulty,topic,explanation
Which React hook is best for memoizing an expensive computed value?,useMemo,useEffect,useRef,useReducer,A,medium,React,useMemo memoizes computed values between renders.
What should an API return for an unauthenticated request?,200,401,404,500,B,basic,Backend,401 clearly signals missing or invalid authentication.`;

export default function Assessments() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedAssessmentTitle, setSelectedAssessmentTitle] = useState("");
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [aiForm, setAiForm] = useState({
    title: "Frontend Developer Screening",
    role: "Frontend Developer",
    topic: "React, TypeScript, API integration",
    count: "5",
    duration_minutes: "30",
    prompt: "Create practical MCQs for recruiter screening. Keep questions fair and unambiguous.",
  });
  const [csvForm, setCsvForm] = useState({
    title: "Uploaded MCQ Assessment",
    role: "Software Engineer",
    duration_minutes: "30",
    source_file: "questions.csv",
    csv: sampleCsv,
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [invitingAssessment, setInvitingAssessment] = useState<Assessment | null>(null);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateResults, setCandidateResults] = useState<any[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
  const [searchingCandidates, setSearchingCandidates] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [recentInvites, setRecentInvites] = useState<any[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualForm, setManualForm] = useState({ name: "", email: "", phone: "" });

  const totalQuestions = useMemo(
    () => assessments.reduce((sum, assessment) => sum + Number(assessment.question_count || 0), 0),
    [assessments]
  );

  const fetchAssessments = async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch("/api/assessments");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to load assessments");
      setAssessments(Array.isArray(data.data) ? data.data : []);
    } catch (error: any) {
      setMessage(error.message || "Failed to load assessments");
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentInvites = async () => {
    setLoadingInvites(true);
    try {
      const response = await authenticatedFetch("/api/interview/invites");
      const data = await response.json().catch(() => ({}));
      if (response.ok) setRecentInvites(data.data || []);
    } catch (error) {
      console.error("Failed to load recent invites", error);
    } finally {
      setLoadingInvites(false);
    }
  };

  useEffect(() => {
    fetchAssessments();
    fetchRecentInvites();
  }, []);

  const submitAi = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await authenticatedFetch("/api/assessments/ai", {
        method: "POST",
        body: JSON.stringify({
          ...aiForm,
          count: Number(aiForm.count),
          duration_minutes: Number(aiForm.duration_minutes),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "AI generation failed");
      setMessage(`Created "${data.data.title}" with ${data.question_count} locked-answer questions.`);
      await fetchAssessments();
    } catch (error: any) {
      setMessage(error.message || "AI generation failed");
    } finally {
      setSaving(false);
    }
  };

  const loadAssessmentQuestions = async (assessment: Assessment) => {
    setMessage("");
    try {
      const response = await authenticatedFetch(`/api/assessments/${assessment.assessment_id}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to load questions");
      setSelectedAssessmentTitle(assessment.title);
      setQuestions(Array.isArray(data.data?.questions) ? data.data.questions : []);
    } catch (error: any) {
      setMessage(error.message || "Failed to load questions");
    }
  };

  const submitCsv = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!uploadFile) {
      setMessage("Please choose a CSV, PDF, DOCX, DOC, or TXT file first.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("title", csvForm.title);
      formData.append("role", csvForm.role);
      formData.append("duration_minutes", csvForm.duration_minutes);
      formData.append("source_file", uploadFile.name);

      const response = await authenticatedFetch("/api/assessments/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "File import failed");
      setMessage(
        `Imported "${data.data.title}" with ${data.question_count} locked-answer questions. Parse accuracy: ${data.parse_accuracy}%.`
      );
      await fetchAssessments();
    } catch (error: any) {
      setMessage(error.message || "File import failed");
    } finally {
      setSaving(false);
    }
  };

  const searchCandidates = async (term: string) => {
    setCandidateSearch(term);
    if (term.length < 2) {
      setCandidateResults([]);
      return;
    }
    setSearchingCandidates(true);
    try {
      const res = await authenticatedFetch(`/api/interview/candidates?search=${encodeURIComponent(term)}`);
      const data = await res.json();
      setCandidateResults(Array.isArray(data.data) ? data.data : []);
    } catch (error) {
      console.error("Search failed", error);
    } finally {
      setSearchingCandidates(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitingAssessment) return;
    
    const inviteData = manualMode 
      ? { email: manualForm.email, name: manualForm.name, phone: manualForm.phone }
      : selectedCandidate 
        ? { email: selectedCandidate.email, name: selectedCandidate.full_name, phone: selectedCandidate.phone }
        : null;

    if (!inviteData || !inviteData.email || !inviteData.name) {
      alert("Please provide name and email");
      return;
    }

    setInviting(true);
    try {
      const response = await authenticatedFetch("/api/interview/send-link", {
        method: "POST",
        body: JSON.stringify({
          ...inviteData,
          jobRole: invitingAssessment.role || invitingAssessment.title,
          assessmentId: invitingAssessment.assessment_id,
          questionSource: "bank",
          questionCount: invitingAssessment.question_count,
          validityMins: 30,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to send invite");

      setMessage(`Invitation sent successfully to ${inviteData.name}`);
      setInviteModalOpen(false);
      setSelectedCandidate(null);
      setCandidateSearch("");
      setCandidateResults([]);
      setManualMode(false);
      setManualForm({ name: "", email: "", phone: "" });
      fetchRecentInvites();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setInviting(false);
    }
  };

  const handleDelete = async (assessment: Assessment) => {
    if (!window.confirm(`Are you sure you want to delete "${assessment.title}"? This will also delete all associated questions and candidate attempts. This cannot be undone.`)) return;

    try {
      const response = await authenticatedFetch(`/api/assessments/${assessment.assessment_id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Delete failed");
      
      setMessage(`Deleted "${assessment.title}"`);
      
      // Update local state immediately for better UX
      setAssessments(prev => prev.filter(a => a.assessment_id !== assessment.assessment_id));
      
      // If we are currently viewing this assessment, clear the questions
      if (selectedAssessmentTitle === assessment.title) {
        setQuestions([]);
        setSelectedAssessmentTitle("");
      }
    } catch (error: any) {
      setMessage(error.message || "Delete failed");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 pb-12 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Assessment Management</h1>
            <p className="mt-1 text-slate-500">Create, manage, and dispatch interview invitations</p>
          </div>
          <div className="flex gap-3">
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="px-4 py-3">
                <p className="text-xs font-medium uppercase text-slate-500">Total Bank</p>
                <p className="text-xl font-bold text-slate-900">{totalQuestions}</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="px-4 py-3">
                <p className="text-xs font-medium uppercase text-slate-500">Links Sent</p>
                <p className="text-xl font-bold text-slate-900">{recentInvites.length}</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {message && (
          <div className="mb-6 rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            {message}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
          {/* Main Action Hub */}
          <Card className="border-slate-200 shadow-sm h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Assessment Hub</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="ai" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-slate-100/50 p-1">
                  <TabsTrigger value="ai" className="gap-2 data-[state=active]:bg-white data-[state=active]:text-blue-600">
                    <Sparkles className="h-4 w-4" />
                    AI Gen
                  </TabsTrigger>
                  <TabsTrigger value="csv" className="gap-2 data-[state=active]:bg-white data-[state=active]:text-blue-600">
                    <FileUp className="h-4 w-4" />
                    Upload
                  </TabsTrigger>
                  <TabsTrigger value="invite" className="gap-2 data-[state=active]:bg-white data-[state=active]:text-blue-600">
                    <Send className="h-4 w-4" />
                    Invite
                  </TabsTrigger>
                </TabsList>

                {/* AI Tab */}
                <TabsContent value="ai" className="mt-5 space-y-4">
                  <form onSubmit={submitAi} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label className="text-xs font-bold text-slate-500 uppercase">Assessment Title</Label>
                        <Input placeholder="e.g. Senior Frontend Test" value={aiForm.title} onChange={(e) => setAiForm({ ...aiForm, title: e.target.value })} required />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-500 uppercase">Job Role</Label>
                        <Input placeholder="e.g. React Developer" value={aiForm.role} onChange={(e) => setAiForm({ ...aiForm, role: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-500 uppercase">Topic</Label>
                        <Input placeholder="e.g. React Hooks" value={aiForm.topic} onChange={(e) => setAiForm({ ...aiForm, topic: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-500 uppercase">Count</Label>
                        <Input type="number" min="1" max="25" value={aiForm.count} onChange={(e) => setAiForm({ ...aiForm, count: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-500 uppercase">Minutes</Label>
                        <Input type="number" min="5" value={aiForm.duration_minutes} onChange={(e) => setAiForm({ ...aiForm, duration_minutes: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Custom Instructions</Label>
                      <Textarea placeholder="Focus on performance and architectural patterns..." rows={3} value={aiForm.prompt} onChange={(e) => setAiForm({ ...aiForm, prompt: e.target.value })} />
                    </div>
                    <Button type="submit" disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 shadow-sm">
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      Generate Assessment
                    </Button>
                  </form>
                </TabsContent>

                {/* CSV Tab */}
                <TabsContent value="csv" className="mt-5 space-y-4">
                  <form onSubmit={submitCsv} className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Title</Label>
                      <Input placeholder="Upload Name" value={csvForm.title} onChange={(e) => setCsvForm({ ...csvForm, title: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Select File</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="file"
                          accept=".csv,.pdf,.docx,.txt"
                          onChange={(event) => {
                            const file = event.target.files?.[0] || null;
                            setUploadFile(file);
                            if (file) setCsvForm(p => ({...p, title: p.title || file.name.split('.')[0]}));
                          }}
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <Button type="submit" disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 shadow-sm">
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                      Process and Save
                    </Button>
                  </form>
                </TabsContent>

                {/* Direct Invite Tab */}
                <TabsContent value="invite" className="mt-5 space-y-5">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Recipient Details</Label>
                      <Button variant="ghost" size="sm" className="text-[11px] h-7 text-blue-600" onClick={() => { setManualMode(!manualMode); setSelectedCandidate(null); }}>
                        {manualMode ? "Switch to Search" : "Enter Manually"}
                      </Button>
                    </div>

                    {!manualMode ? (
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <Input 
                            placeholder="Find candidate by name..." 
                            className="pl-10 h-10" 
                            value={candidateSearch} 
                            onChange={(e) => searchCandidates(e.target.value)} 
                          />
                        </div>
                        {!selectedCandidate && candidateResults.length > 0 && (
                          <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-100 bg-white shadow-sm divide-y">
                            {candidateResults.map(c => (
                              <div key={c.candidate_id} className="p-3 hover:bg-slate-50 cursor-pointer flex items-center justify-between" onClick={() => setSelectedCandidate(c)}>
                                <div>
                                  <p className="text-sm font-medium">{c.full_name}</p>
                                  <p className="text-[10px] text-slate-400">{c.email}</p>
                                </div>
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 opacity-0 group-hover:opacity-100" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        <Input placeholder="Full Name" className="h-10" value={manualForm.name} onChange={(e) => setManualForm({...manualForm, name: e.target.value})} />
                        <Input placeholder="Email Address" type="email" className="h-10" value={manualForm.email} onChange={(e) => setManualForm({...manualForm, email: e.target.value})} />
                      </div>
                    )}

                    {selectedCandidate && (
                      <div className="p-3 rounded-lg border border-blue-50 bg-blue-50/30 flex items-center justify-between animate-in zoom-in-95">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">{selectedCandidate.full_name.charAt(0)}</div>
                          <div>
                            <p className="text-sm font-semibold">{selectedCandidate.full_name}</p>
                            <p className="text-[10px] text-slate-500">{selectedCandidate.email}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 text-[10px] text-slate-400" onClick={() => setSelectedCandidate(null)}>Change</Button>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Target Assessment</Label>
                      <select 
                        className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        onChange={(e) => setInvitingAssessment(assessments.find(a => a.assessment_id === Number(e.target.value)) || null)}
                        value={invitingAssessment?.assessment_id || ""}
                      >
                        <option value="">-- Choose from Bank --</option>
                        {assessments.map(a => <option key={a.assessment_id} value={a.assessment_id}>{a.title}</option>)}
                      </select>
                    </div>

                    <Button 
                      className="w-full h-11 bg-blue-600 hover:bg-blue-700 shadow-sm font-semibold"
                      disabled={(!selectedCandidate && (!manualForm.name || !manualForm.email)) || !invitingAssessment || inviting}
                      onClick={handleSendInvite}
                    >
                      {inviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      Dispatch Credentials
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Saved Assessments List */}
          <div className="space-y-6">
            <Card className="border-slate-200 shadow-sm h-fit">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-lg">Saved Assessments</CardTitle>
                <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-none">{assessments.length}</Badge>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-blue-500" /></div>
                ) : assessments.length === 0 ? (
                  <div className="py-12 text-center text-sm text-slate-400 italic">No assessments available yet.</div>
                ) : (
                  <div className="grid gap-3">
                    {assessments.map((a) => (
                      <div key={a.assessment_id} className="group relative rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-blue-200 hover:shadow-md">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{a.title}</h3>
                            <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
                              <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> {a.role || 'General'}</span>
                              <span className="h-1 w-1 rounded-full bg-slate-300" />
                              <span className="flex items-center gap-1"><ClipboardList className="h-3 w-3" /> {a.question_count} Questions</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50" 
                              onClick={() => { setInvitingAssessment(a); setInviteModalOpen(true); }}
                              title="Send Invite"
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-8 w-8 p-0 text-slate-400 hover:bg-red-50 hover:text-red-600" 
                              onClick={() => handleDelete(a)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between border-t border-slate-50 pt-3">
                          <Button 
                            variant="link" 
                            className="h-auto p-0 text-[11px] font-semibold text-blue-600"
                            onClick={() => loadAssessmentQuestions(a)}
                          >
                            View Content
                          </Button>
                          <span className="text-[10px] text-slate-300">ID: {a.assessment_id}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Questions Viewer (Dynamic) */}
            {questions.length > 0 && (
              <Card className="border-slate-200 shadow-sm animate-in slide-in-from-right-4 duration-300">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between">
                  <CardTitle className="text-md">Questions: {selectedAssessmentTitle}</CardTitle>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setQuestions([])}>Close</Button>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  {questions.map((q, idx) => (
                    <div key={q.question_id} className="space-y-3">
                      <div className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">{idx + 1}</span>
                        <p className="text-sm font-medium text-slate-800 leading-relaxed">{q.question_text}</p>
                      </div>
                      <div className="grid gap-2 pl-7 sm:grid-cols-2">
                        {['A', 'B', 'C', 'D'].map(k => (
                          <div key={k} className={`rounded-lg border p-2.5 text-xs transition-colors ${q.correct_option === k ? 'border-emerald-200 bg-emerald-50/50 text-emerald-900 font-semibold' : 'border-slate-100 bg-slate-50/30 text-slate-600'}`}>
                            <span className="mr-2 font-bold opacity-50">{k}.</span> {q.options?.[k]}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Activity Summary Footer */}
        <Card className="mt-8 border-slate-200 shadow-sm overflow-hidden h-fit">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-3 px-6">
            <CardTitle className="text-sm font-bold text-slate-600 flex items-center gap-2 uppercase tracking-wider">
              <ClipboardList className="h-4 w-4" />
              Recent Dispatch Log
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingInvites ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
            ) : recentInvites.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400 italic">No invitations dispatched recently.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-slate-400 font-bold border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-3 font-bold">Recipient</th>
                      <th className="px-6 py-3 font-bold">Assessment Title</th>
                      <th className="px-6 py-3 font-bold text-center">Status</th>
                      <th className="px-6 py-3 text-right font-bold">Time Sent</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentInvites.slice(0, 10).map((i, idx) => (
                      <tr key={i.token || idx} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-900">{i.candidate_name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{i.candidate_email}</div>
                        </td>
                        <td className="px-6 py-4 text-slate-600 font-medium">{i.assessment_title || 'AI Selection'}</td>
                        <td className="px-6 py-4 text-center">
                          {i.is_used ? (
                            <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-emerald-100 text-[10px] px-2 py-0">Completed</Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-400 border-slate-200 text-[10px] px-2 py-0 font-normal">Pending</Badge>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right text-slate-400 tabular-nums">
                          {new Date(i.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Invite Modal (Triggered from List) */}
      {inviteModalOpen && invitingAssessment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="w-full max-w-md border-slate-200 shadow-2xl animate-in zoom-in-95 duration-300">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-bold">Send Assessment</CardTitle>
                  <p className="text-xs text-slate-500 mt-1">To: <span className="font-bold text-blue-600">{invitingAssessment.title}</span></p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setInviteModalOpen(false)}>
                  <Trash2 className="h-4 w-4 rotate-45" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSendInvite} className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold uppercase text-slate-400">Recipient</Label>
                    <Button type="button" variant="link" className="h-auto p-0 text-[11px] text-blue-600" onClick={() => setManualMode(!manualMode)}>
                      {manualMode ? "Find in Database" : "Enter Details Manually"}
                    </Button>
                  </div>
                  
                  {!manualMode ? (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input 
                        placeholder="Search by name..." 
                        className="pl-10" 
                        value={selectedCandidate ? selectedCandidate.full_name : candidateSearch} 
                        onChange={(e) => { setSelectedCandidate(null); searchCandidates(e.target.value); }}
                        readOnly={!!selectedCandidate}
                      />
                      {selectedCandidate && (
                        <Button type="button" variant="ghost" size="sm" className="absolute right-2 top-1/2 -translate-y-1/2 h-7" onClick={() => { setSelectedCandidate(null); setCandidateSearch(""); }}>Clear</Button>
                      )}
                      {!selectedCandidate && candidateResults.length > 0 && (
                        <div className="absolute top-full left-0 right-0 z-10 mt-2 max-h-40 overflow-y-auto rounded-lg border bg-white shadow-xl">
                          {candidateResults.map(c => (
                            <div key={c.candidate_id} className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-0" onClick={() => setSelectedCandidate(c)}>
                              <p className="text-sm font-medium">{c.full_name}</p>
                              <p className="text-xs text-slate-400">{c.email}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Input placeholder="Full Name" value={manualForm.name} onChange={(e) => setManualForm({...manualForm, name: e.target.value})} />
                      <Input placeholder="Email Address" type="email" value={manualForm.email} onChange={(e) => setManualForm({...manualForm, email: e.target.value})} />
                    </div>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-blue-600 hover:bg-blue-700 h-11 font-bold"
                  disabled={(manualMode ? (!manualForm.name || !manualForm.email) : !selectedCandidate) || inviting}
                >
                  {inviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Confirm and Dispatch Link
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
