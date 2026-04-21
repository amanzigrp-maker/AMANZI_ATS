import React, { useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardList, FileUp, Loader2, Sparkles } from "lucide-react";

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

  useEffect(() => {
    fetchAssessments();
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
      setMessage("Please choose a CSV or PDF file first.");
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

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm">
                <ClipboardList className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Assessment Question Bank</h1>
                <p className="text-sm text-slate-500">AI generation and CSV upload both save into PostgreSQL.</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="px-4 py-3">
                <p className="text-xs font-medium uppercase text-slate-500">Assessments</p>
                <p className="text-xl font-bold text-slate-900">{assessments.length}</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="px-4 py-3">
                <p className="text-xs font-medium uppercase text-slate-500">Questions</p>
                <p className="text-xl font-bold text-slate-900">{totalQuestions}</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {message && (
          <div className="rounded-lg border border-violet-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
            {message}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Create Assessment</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="ai">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="ai" className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    AI
                  </TabsTrigger>
                  <TabsTrigger value="csv" className="gap-2">
                    <FileUp className="h-4 w-4" />
                    Upload
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="ai" className="mt-5">
                  <form onSubmit={submitAi} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Title</Label>
                        <Input value={aiForm.title} onChange={(e) => setAiForm({ ...aiForm, title: e.target.value })} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Input value={aiForm.role} onChange={(e) => setAiForm({ ...aiForm, role: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Topic</Label>
                        <Input value={aiForm.topic} onChange={(e) => setAiForm({ ...aiForm, topic: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Questions</Label>
                        <Input type="number" min="1" max="25" value={aiForm.count} onChange={(e) => setAiForm({ ...aiForm, count: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Duration</Label>
                        <Input type="number" min="5" value={aiForm.duration_minutes} onChange={(e) => setAiForm({ ...aiForm, duration_minutes: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Recruiter Prompt</Label>
                      <Textarea rows={5} value={aiForm.prompt} onChange={(e) => setAiForm({ ...aiForm, prompt: e.target.value })} />
                    </div>
                    <Button type="submit" disabled={saving} className="w-full">
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      Generate and Save
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="csv" className="mt-5">
                  <form onSubmit={submitCsv} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Title</Label>
                        <Input value={csvForm.title} onChange={(e) => setCsvForm({ ...csvForm, title: e.target.value })} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Input value={csvForm.role} onChange={(e) => setCsvForm({ ...csvForm, role: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>File Name</Label>
                        <Input value={uploadFile?.name || csvForm.source_file} onChange={(e) => setCsvForm({ ...csvForm, source_file: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Upload CSV or PDF</Label>
                      <Input
                        type="file"
                        accept=".csv,.pdf,text/csv,application/pdf"
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null;
                          setUploadFile(file);
                          if (file) {
                            setCsvForm((prev) => ({
                              ...prev,
                              title: prev.title || file.name.replace(/\.[^.]+$/, ""),
                              source_file: file.name,
                            }));
                          }
                        }}
                      />
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                        PDF format should use numbered questions with A/B/C/D options and an answer line, for example:
                        <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-slate-700">
{`1. Which hook memoizes an expensive value?
A) useMemo
B) useEffect
C) useRef
D) useReducer
Answer: A`}
                        </pre>
                      </div>
                    </div>
                    <Button type="submit" disabled={saving} className="w-full">
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                      Upload, Parse, and Save
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Saved Assessments</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex h-64 items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-violet-600" />
                </div>
              ) : assessments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                  No assessments yet. Generate AI questions or import CSV to create your first bank.
                </div>
              ) : (
                <div className="space-y-3">
                  {assessments.map((assessment) => (
                    <div key={assessment.assessment_id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h2 className="font-semibold text-slate-900">{assessment.title}</h2>
                          <p className="mt-1 text-sm text-slate-500">
                            {assessment.role || "General"} · {assessment.duration_minutes || 30} minutes
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">{assessment.source_type || "upload"}</Badge>
                          <Badge className="bg-emerald-600">{assessment.question_count} questions</Badge>
                        </div>
                      </div>
                      {assessment.description && (
                        <p className="mt-3 line-clamp-2 text-sm text-slate-600">{assessment.description}</p>
                      )}
                      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-slate-400">
                          Created {new Date(assessment.created_at).toLocaleString()}
                        </p>
                        <Button type="button" size="sm" variant="outline" onClick={() => loadAssessmentQuestions(assessment)}>
                          View Questions
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {questions.length > 0 && (
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">{selectedAssessmentTitle} Questions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {questions.map((question, index) => (
                <div key={question.question_id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <h3 className="font-medium text-slate-900">
                      {index + 1}. {question.question_text}
                    </h3>
                    <Badge className="w-fit bg-violet-600">Answer {question.correct_option}</Badge>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {["A", "B", "C", "D"].map((key) => (
                      <div
                        key={key}
                        className={`rounded-md border px-3 py-2 text-sm ${
                          question.correct_option === key
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                        }`}
                      >
                        <span className="font-semibold">{key}.</span> {question.options?.[key]}
                      </div>
                    ))}
                  </div>
                  {(question.topic || question.difficulty || question.explanation) && (
                    <p className="mt-3 text-xs text-slate-500">
                      {[question.topic, question.difficulty, question.explanation].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
