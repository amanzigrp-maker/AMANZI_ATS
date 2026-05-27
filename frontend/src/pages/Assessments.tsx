import React, { useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AnimatedIcon, IconMap } from "@/components/AnimatedIconsax";
import QuestionContent from "@/components/QuestionContent";
import QuestionPaperLibrary from "@/components/QuestionPaperLibrary";

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
    title: "MCQ Assessment Generator",
    topic: "General Knowledge",
    count: "5",
    experience_years: "3",
    duration_minutes: "30",
    prompt: "Create practical MCQs for recruiter screening. Keep questions fair and unambiguous.",
  });
  const [csvForm, setCsvForm] = useState({
    title: "Uploaded MCQ Assessment",
    role: "",
    duration_minutes: "30",
    source_file: "questions.csv",
    csv: sampleCsv,
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [invitingAssessment, setInvitingAssessment] = useState<Assessment | null>(null);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateResults, setCandidateResults] = useState<any[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<any[]>([]);
  const [searchingCandidates, setSearchingCandidates] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [recentInvites, setRecentInvites] = useState<any[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);

  const handleToggleCandidate = (candidate: any) => {
    setSelectedCandidates((prev) => {
      const email = (candidate.email || "").trim().toLowerCase();
      const exists = prev.some((x) => (x.email || "").trim().toLowerCase() === email);
      if (exists) {
        return prev.filter((x) => (x.email || "").trim().toLowerCase() !== email);
      } else {
        return [
          ...prev,
          {
            candidate_id: candidate.candidate_id,
            full_name: candidate.full_name || candidate.name || candidate.candidate_name,
            email: candidate.email || candidate.candidate_email,
            phone: candidate.phone || candidate.candidate_phone,
          },
        ];
      }
    });
  };

  // Question Shelves States
  const [shelves, setShelves] = useState<any[]>([]);
  const [selectedShelf, setSelectedShelf] = useState<string | null>(null);
  const [shelfQuestions, setShelfQuestions] = useState<any[]>([]);
  const [loadingShelves, setLoadingShelves] = useState(false);
  const [loadingShelfDetail, setLoadingShelfDetail] = useState(false);
  const [shelfSearch, setShelfSearch] = useState("");

  const totalQuestions = useMemo(
    () => assessments.reduce((sum, assessment) => sum + Number(assessment.question_count || 0), 0),
    [assessments]
  );

  const fetchShelves = async () => {
    setLoadingShelves(true);
    try {
      const response = await authenticatedFetch("/api/assessments/shelves");
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setShelves(Array.isArray(data.data) ? data.data : []);
      }
    } catch (error) {
      console.error("Failed to load shelves", error);
    } finally {
      setLoadingShelves(false);
    }
  };

  const loadShelfQuestions = async (category: string) => {
    setSelectedShelf(category);
    setLoadingShelfDetail(true);
    try {
      const response = await authenticatedFetch(`/api/assessments/shelves/${encodeURIComponent(category)}`);
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setShelfQuestions(Array.isArray(data.data) ? data.data : []);
      }
    } catch (error) {
      console.error("Failed to load shelf questions", error);
    } finally {
      setLoadingShelfDetail(false);
    }
  };

  const handleDeleteShelfQuestion = async (category: string, hash: string) => {
    if (!window.confirm("Are you sure you want to delete this question from the shelf? This will remove it from filesystem storage and database.")) return;
    try {
      const response = await authenticatedFetch(`/api/assessments/shelves/${encodeURIComponent(category)}/questions?hash=${encodeURIComponent(hash)}`, {
        method: "DELETE"
      });
      if (response.ok) {
        loadShelfQuestions(category);
        fetchShelves();
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.error || "Failed to delete question");
      }
    } catch (error) {
      console.error("Failed to delete question", error);
    }
  };

  const handleDeleteShelf = async (category: string) => {
    if (!window.confirm(`Are you sure you want to delete the entire shelf "${category}" and all its questions? This action cannot be undone.`)) return;
    try {
      const response = await authenticatedFetch(`/api/assessments/shelves/${encodeURIComponent(category)}`, {
        method: "DELETE"
      });
      if (response.ok) {
        if (selectedShelf === category) {
          setSelectedShelf(null);
          setShelfQuestions([]);
        }
        fetchShelves();
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.error || "Failed to delete shelf");
      }
    } catch (error) {
      console.error("Failed to delete shelf", error);
    }
  };

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
    fetchShelves();
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
          experience_years: Number(aiForm.experience_years),
          duration_minutes: Number(aiForm.duration_minutes),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "AI generation failed");
      setMessage(`Created "${data.data.title}" with ${data.question_count} questions. (Question Shelf: ${data.shelf_added_count ?? 0} added, ${data.shelf_skipped_count ?? 0} duplicates skipped)`);
      await fetchAssessments();
      await fetchShelves();
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
        `Imported "${data.data.title}" with ${data.question_count} questions (Accuracy: ${data.parse_accuracy}%). (Question Shelf: ${data.shelf_added_count ?? 0} added, ${data.shelf_skipped_count ?? 0} duplicates skipped)`
      );
      await fetchAssessments();
      await fetchShelves();
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

    let candidatesToInvite = [...selectedCandidates];

    if (candidatesToInvite.length === 0) {
      alert("Please select or add at least one candidate recipient.");
      return;
    }

    setInviting(true);
    try {
      if (candidatesToInvite.length === 1) {
        // Dispatch single invite
        const c = candidatesToInvite[0];
        const response = await authenticatedFetch("/api/interview/send-link", {
          method: "POST",
          body: JSON.stringify({
            email: c.email,
            name: c.full_name,
            phone: c.phone,
            jobRole: invitingAssessment.role || invitingAssessment.title,
            assessmentId: invitingAssessment.assessment_id,
            questionSource: "bank",
            questionCount: invitingAssessment.question_count,
            validityMins: 1440,
          }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to send invitation link.");
        setMessage(`Invitation link dispatched successfully to ${c.full_name}.`);
      } else {
        // Dispatch bulk invite job
        const response = await authenticatedFetch("/api/bulk-invites", {
          method: "POST",
          body: JSON.stringify({
            name: `Recruiter Dispatch - ${new Date().toLocaleDateString()}`,
            assessment_id: invitingAssessment.assessment_id,
            candidates: candidatesToInvite.map(c => ({
              name: c.full_name,
              email: c.email,
              phone: c.phone,
              job_role: invitingAssessment.role || invitingAssessment.title
            }))
          })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to launch bulk invite dispatch.");
        setMessage(`Successfully queued bulk invite run for ${candidatesToInvite.length} candidates. Track progress in the Bulk Invite dashboard.`);
      }

      setInviteModalOpen(false);
      setSelectedCandidates([]);
      setCandidateSearch("");
      setCandidateResults([]);
      fetchRecentInvites();
    } catch (error: any) {
      alert(error.message || "Failed to process invitation dispatch.");
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
                <TabsList className="grid w-full grid-cols-5 bg-slate-100/50 p-1">
                  <TabsTrigger value="ai" className="gap-2 data-[state=active]:bg-white data-[state=active]:text-blue-600">
                    <AnimatedIcon icon={IconMap.Sparkles} size={16} />
                    AI Gen
                  </TabsTrigger>
                  <TabsTrigger value="csv" className="gap-2 data-[state=active]:bg-white data-[state=active]:text-blue-600">
                    <AnimatedIcon icon={IconMap.FileUp} size={16} />
                    Upload
                  </TabsTrigger>
                  <TabsTrigger value="invite" className="gap-2 data-[state=active]:bg-white data-[state=active]:text-blue-600">
                    <AnimatedIcon icon={IconMap.Send} className="h-4 w-4" />
                    Invite
                  </TabsTrigger>
                  <TabsTrigger value="library" className="gap-2 data-[state=active]:bg-white data-[state=active]:text-blue-600">
                    <AnimatedIcon icon="FileText" size={16} />
                    Library
                  </TabsTrigger>
                  <TabsTrigger value="shelves" className="gap-2 data-[state=active]:bg-white data-[state=active]:text-blue-600" onClick={fetchShelves}>
                    <AnimatedIcon icon="Folder" size={16} />
                    Shelves
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
                        <Label className="text-xs font-bold text-slate-500 uppercase">Topic</Label>
                        <Input placeholder="e.g. React Hooks" value={aiForm.topic} onChange={(e) => setAiForm({ ...aiForm, topic: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-500 uppercase">Count</Label>
                        <Input type="number" min="1" value={aiForm.count} onChange={(e) => setAiForm({ ...aiForm, count: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold text-slate-500 uppercase">Experience (Years)</Label>
                        <Input type="number" min="0" max="50" value={aiForm.experience_years} onChange={(e) => setAiForm({ ...aiForm, experience_years: e.target.value })} />
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
                      {saving ? (
                        <AnimatedIcon icon={IconMap.Loader2} size={16} className="mr-2 animate-spin" />
                      ) : (
                        <AnimatedIcon icon={IconMap.Sparkles} size={16} className="mr-2" />
                      )}
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
                            if (file) setCsvForm(p => ({ ...p, title: p.title || file.name.split('.')[0] }));
                          }}
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <Button type="submit" disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 shadow-sm">
                      {saving ? (
                        <AnimatedIcon icon={IconMap.Loader2} size={16} className="mr-2 animate-spin" />
                      ) : (
                        <AnimatedIcon icon={IconMap.FileUp} size={16} className="mr-2" />
                      )}
                      Process and Save
                    </Button>
                  </form>
                </TabsContent>

                {/* Direct Invite Tab */}
                <TabsContent value="invite" className="mt-5 space-y-5">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-slate-500 uppercase">Recipient Details</Label>
                    </div>

                    <div className="space-y-4">
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                          <AnimatedIcon icon={IconMap.Search} size={16} />
                        </div>
                        <Input
                          placeholder="Find candidates by name..."
                          className="pl-10 h-10"
                          value={candidateSearch}
                          onChange={(e) => searchCandidates(e.target.value)}
                        />
                        {candidateSearch.length > 0 && (
                          <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl divide-y z-50 absolute w-full mt-1 left-0 right-0">
                            {candidateResults.length > 0 ? (
                              candidateResults.map(c => {
                                const isSelected = selectedCandidates.some(x => (x.email || "").trim().toLowerCase() === (c.email || "").trim().toLowerCase());
                                return (
                                  <div key={c.candidate_id} className="p-3 hover:bg-blue-50 cursor-pointer flex items-center justify-between group" onClick={() => handleToggleCandidate(c)}>
                                    <div className="flex items-center gap-3">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => {}}
                                        className="h-4 w-4 text-blue-600 border-slate-350 rounded focus:ring-blue-500"
                                      />
                                      <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                                        {(c.full_name || "").charAt(0)}
                                      </div>
                                      <div>
                                        <p className="text-sm font-medium">{c.full_name}</p>
                                        <p className="text-[10px] text-slate-400">{c.email}</p>
                                      </div>
                                    </div>
                                    <AnimatedIcon icon={IconMap.CheckCircle2} size={16} className={`text-emerald-500 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'} transition-opacity`} />
                                  </div>
                                );
                              })
                            ) : !searchingCandidates ? (
                              <div className="p-4 text-center text-xs text-slate-400 italic">No candidates found.</div>
                            ) : null}
                            {searchingCandidates && (
                              <div className="p-4 flex items-center justify-center gap-2 text-xs text-slate-400">
                                <AnimatedIcon icon={IconMap.Loader2} size={14} className="animate-spin" /> Searching...
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {candidateSearch.length === 0 && recentInvites.length > 0 && (
                        <div className="rounded-xl border border-slate-150 bg-slate-50/30 overflow-hidden">
                          <div className="px-3 py-2 bg-slate-100/60 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                            Recent Recipients
                          </div>
                          <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 bg-white">
                            {recentInvites.slice(0, 5).map((invite, idx) => {
                              const isSelected = selectedCandidates.some(x => (x.candidate_email || x.email || "").trim().toLowerCase() === (invite.candidate_email || "").trim().toLowerCase());
                              return (
                                <div
                                  key={invite.token || idx}
                                  className="p-2.5 hover:bg-blue-50/40 cursor-pointer flex items-center justify-between group transition-colors"
                                  onClick={() => handleToggleCandidate(invite)}
                                >
                                  <div className="flex items-center gap-3">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => {}}
                                      className="h-4 w-4 text-blue-600 border-slate-350 rounded focus:ring-blue-500"
                                    />
                                    <div className="h-7 w-7 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-[10px] font-bold">
                                      {(invite.candidate_name || "").charAt(0)}
                                    </div>
                                    <div>
                                      <p className="text-xs font-bold text-slate-800">{invite.candidate_name}</p>
                                      <p className="text-[10px] text-slate-400 font-mono">{invite.candidate_email}</p>
                                    </div>
                                  </div>
                                  <AnimatedIcon icon={IconMap.Send} size={12} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {selectedCandidates.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          <span>Selected Recipients ({selectedCandidates.length})</span>
                          <Button variant="link" size="sm" className="h-auto p-0 text-[10px] text-red-500 hover:text-red-600" onClick={() => setSelectedCandidates([])}>Clear List</Button>
                        </div>
                        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200">
                          {selectedCandidates.map((c, index) => (
                            <Badge key={c.email || index} variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 py-1 pl-2 pr-1.5 text-xs flex items-center gap-1.5">
                              <span className="max-w-[120px] truncate">{c.full_name}</span>
                              <button
                                type="button"
                                className="text-blue-400 hover:text-blue-600 font-bold text-[13px] leading-none shrink-0"
                                onClick={() => setSelectedCandidates(prev => prev.filter((_, idx) => idx !== index))}
                              >
                                &times;
                              </button>
                            </Badge>
                          ))}
                        </div>
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
                      disabled={selectedCandidates.length === 0 || !invitingAssessment || inviting}
                      onClick={handleSendInvite}
                    >
                      {inviting ? (
                        <AnimatedIcon icon={IconMap.Loader2} size={18} className="mr-2 animate-spin" />
                      ) : (
                        <AnimatedIcon icon={IconMap.Send} size={18} className="mr-2" />
                      )}
                      Dispatch Credentials
                    </Button>
                  </div>
                </TabsContent>

                {/* Question Shelves Tab Content */}
                <TabsContent value="shelves" className="mt-5 space-y-6">
                  {loadingShelves ? (
                    <div className="flex h-32 items-center justify-center">
                      <AnimatedIcon icon={IconMap.Loader2} size={24} className="animate-spin text-blue-500" />
                    </div>
                  ) : shelves.length === 0 ? (
                    <div className="py-12 text-center text-sm text-slate-400 italic">
                      No question shelves created yet. Generate or upload an assessment to auto-create them.
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {shelves.map((shelf) => {
                        const isSelected = selectedShelf === shelf.category;
                        return (
                          <div
                            key={shelf.category}
                            onClick={() => loadShelfQuestions(shelf.category)}
                            className={`group cursor-pointer relative rounded-2xl border p-5 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${
                              isSelected
                                ? "border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50/50 shadow-md"
                                : "border-slate-200 bg-white/70 backdrop-blur-md hover:border-blue-300"
                            }`}
                          >
                            <div className="absolute -right-4 -top-4 w-16 h-16 rounded-full bg-blue-400/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-4 flex-1 min-w-0">
                                <div className={`p-3 rounded-xl transition-all duration-300 shrink-0 ${
                                  isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-500"
                                }`}>
                                  <AnimatedIcon icon="Folder" size={24} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                                    {shelf.category}
                                  </h3>
                                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    {shelf.count} questions
                                  </p>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-slate-400 hover:bg-red-50 hover:text-red-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteShelf(shelf.category);
                                }}
                                title="Delete Entire Shelf Folder"
                              >
                                <AnimatedIcon icon="Trash" size={16} />
                              </Button>
                            </div>
                            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                              <span>Last active</span>
                              <span className="font-medium tabular-nums">
                                {new Date(shelf.lastUpdated).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit"
                                })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Shelf Detail View Panel */}
                  {selectedShelf && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-5 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/80 pb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                              <AnimatedIcon icon="Folder" size={16} />
                            </span>
                            <h2 className="text-xl font-bold text-slate-900">{selectedShelf} Category Shelf</h2>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Browse, search, and manage unique questions automatically archived in this library.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="Search shelf..."
                            className="w-full sm:w-64 bg-white h-9 text-xs"
                            value={shelfSearch}
                            onChange={(e) => setShelfSearch(e.target.value)}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                            onClick={() => handleDeleteShelf(selectedShelf)}
                          >
                            Delete Shelf
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 text-xs"
                            onClick={() => { setSelectedShelf(null); setShelfQuestions([]); }}
                          >
                            Close
                          </Button>
                        </div>
                      </div>

                      {loadingShelfDetail ? (
                        <div className="flex h-32 items-center justify-center">
                          <AnimatedIcon icon={IconMap.Loader2} size={24} className="animate-spin text-blue-500" />
                        </div>
                      ) : (
                        <div className="space-y-4 mt-6">
                          {(() => {
                            const filtered = shelfQuestions.filter(q =>
                              (q.question || "").toLowerCase().includes(shelfSearch.toLowerCase())
                            );

                            if (filtered.length === 0) {
                              return (
                                <div className="py-8 text-center text-xs text-slate-400 italic">
                                  No questions found matching your search.
                                </div>
                              );
                            }

                            return filtered.map((q, idx) => (
                              <div
                                key={q.id || idx}
                                className="group relative bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-md transition-all duration-300"
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex items-start gap-3 flex-1">
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">
                                      {idx + 1}
                                    </span>
                                    <div className="space-y-3 flex-1">
                                      <p className="text-sm font-semibold text-slate-800 leading-relaxed">
                                        {q.question}
                                      </p>

                                      <div className="grid gap-2.5 sm:grid-cols-2">
                                        {Array.isArray(q.options) &&
                                          q.options.map((opt: any) => {
                                            const isCorrect = String(opt.key).toUpperCase() === String(q.correctAnswer).toUpperCase();
                                            return (
                                              <div
                                                key={opt.key}
                                                className={`rounded-lg border px-3 py-2 text-xs transition-all flex items-center justify-between ${
                                                  isCorrect
                                                    ? "border-emerald-200 bg-emerald-50/50 text-emerald-950 font-semibold"
                                                    : "border-slate-100 bg-slate-50/50 text-slate-600"
                                                }`}
                                              >
                                                <span className="truncate">
                                                  <span className="mr-2 font-bold opacity-60">{opt.key}.</span>
                                                  {opt.text}
                                                </span>
                                                {isCorrect && (
                                                  <span className="text-emerald-600 font-bold shrink-0 ml-2">✓</span>
                                                )}
                                              </div>
                                            );
                                          })}
                                      </div>

                                      <div className="flex flex-wrap gap-2 pt-1.5 items-center">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                                          q.difficulty === "basic" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                          q.difficulty === "medium" ? "bg-blue-50 text-blue-700 border-blue-100" :
                                          q.difficulty === "advanced" ? "bg-orange-50 text-orange-700 border-orange-100" :
                                          "bg-red-50 text-red-700 border-red-100"
                                        }`}>
                                          {q.difficulty}
                                        </span>
                                        {Array.isArray(q.tags) && q.tags.map((tag: string) => (
                                          <span key={tag} className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full font-medium">
                                            #{tag}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>

                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 text-slate-400 hover:bg-red-50 hover:text-red-600 shrink-0 self-start"
                                    onClick={() => handleDeleteShelfQuestion(selectedShelf, q.hash)}
                                    title="Delete from Shelf"
                                  >
                                    <AnimatedIcon icon={IconMap.Trash2} size={14} />
                                  </Button>
                                </div>
                              </div>
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="library" className="mt-5 space-y-4">
                  <QuestionPaperLibrary onAssessmentCreated={fetchAssessments} />
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
                  <div className="flex h-64 items-center justify-center">
                    <AnimatedIcon icon={IconMap.Loader2} size={28} className="animate-spin text-blue-500" />
                  </div>
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
                              <span className="flex items-center gap-1">
                                <AnimatedIcon icon={IconMap.Sparkles} size={12} />
                                {a.question_count} Questions
                              </span>
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
                              <AnimatedIcon icon={IconMap.Send} className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              onClick={() => handleDelete(a)}
                              title="Delete"
                            >
                              <AnimatedIcon icon={IconMap.Trash2} className="h-4 w-4" />
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
              <AnimatedIcon icon={IconMap.ClipboardList} size={16} />
              Recent Dispatch Log
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingInvites ? (
              <div className="flex justify-center py-12">
                <AnimatedIcon icon={IconMap.Loader2} size={24} className="animate-spin text-blue-500" />
              </div>
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
                  <AnimatedIcon icon={IconMap.Trash2} size={16} className="rotate-45" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSendInvite} className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold uppercase text-slate-400">Recipient</Label>
                  </div>

                  <div className="relative space-y-2">
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <AnimatedIcon icon={IconMap.Search} size={16} />
                      </div>
                      <Input
                        placeholder="Search candidates by name..."
                        className="pl-10"
                        value={candidateSearch}
                        onChange={(e) => searchCandidates(e.target.value)}
                      />
                    </div>
                    {candidateSearch.length > 0 && candidateResults.length > 0 && (
                      <div className="absolute left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto rounded-lg border bg-white shadow-xl divide-y">
                        {candidateResults.map(c => {
                          const isSelected = selectedCandidates.some(x => (x.email || "").trim().toLowerCase() === (c.email || "").trim().toLowerCase());
                          return (
                            <div key={c.candidate_id} className="p-3 hover:bg-blue-50 cursor-pointer flex items-center justify-between" onClick={() => handleToggleCandidate(c)}>
                              <div className="flex items-center gap-2.5">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="h-3.5 w-3.5 text-blue-600 border-slate-300 rounded"
                                />
                                <div>
                                  <p className="text-xs font-medium text-slate-900">{c.full_name}</p>
                                  <p className="text-[10px] text-slate-400">{c.email}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {selectedCandidates.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                        <span>Selected Recipients ({selectedCandidates.length})</span>
                        <Button variant="link" size="sm" className="h-auto p-0 text-[10px] text-red-500" onClick={() => setSelectedCandidates([])}>Clear</Button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200">
                        {selectedCandidates.map((c, index) => (
                          <Badge key={c.email || index} variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 py-0.5 pl-1.5 pr-1 text-[11px] flex items-center gap-1">
                            <span className="max-w-[100px] truncate">{c.full_name}</span>
                            <button
                              type="button"
                              className="text-blue-400 hover:text-blue-600 font-bold"
                              onClick={() => setSelectedCandidates(prev => prev.filter((_, idx) => idx !== index))}
                            >
                              &times;
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 h-11 font-bold"
                  disabled={selectedCandidates.length === 0 || inviting}
                >
                  {inviting ? (
                    <AnimatedIcon icon={IconMap.Loader2} size={18} className="mr-2 animate-spin" />
                  ) : (
                    <AnimatedIcon icon={IconMap.Send} size={18} className="mr-2" />
                  )}
                  Confirm and Dispatch Links
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
