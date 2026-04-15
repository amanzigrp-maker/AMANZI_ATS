import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Mail, Phone, MapPin, Linkedin, Github, Globe, Download, Star, MessageSquare, Calendar, Briefcase, GraduationCap, Award, FileText, ThumbsUp, ThumbsDown, Clock } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import api from '@/utils/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const getConsistentAvatar = (name: string, gender?: string) => {
  const g = (gender || '').toLowerCase();
  if (g === 'female' || g === 'f') return '/avatars/avatar-5.png';
  if (g === 'male' || g === 'm') return '/avatars/avatar-1.png';

  const avatars = [
    '/avatars/avatar-1.png',
    '/avatars/avatar-2.png',
    '/avatars/avatar-3.png',
    '/avatars/avatar-4.png',
    '/avatars/avatar-5.png',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % avatars.length;
  return avatars[index];
};

export default function CandidateProfile() {
  const navigate = useNavigate();
  const { id } = useParams();
  const modifiedCvInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingModifiedCv, setUploadingModifiedCv] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<any | null>(null);

  const [newNote, setNewNote] = useState('');
  const [notes, setNotes] = useState<any[]>([]);
  const [currentStage, setCurrentStage] = useState('Applied');
  const [showStatusTimeline, setShowStatusTimeline] = useState(false);

  type TimelineStatus = 'pending' | 'screening' | 'interviewed' | 'offered' | 'rejected' | 'accepted';

  const mapStageToStatus = (stage: string): TimelineStatus => {
    const s = (stage || '').toLowerCase();
    switch (s) {
      case 'profile_share':
      case 'applied':
        return 'pending';
      case 'screening':
      case 'review':
      case 'screen_selected':
        return 'screening';
      case 'interview':
      case 'interview_l1':
      case 'interview_l2':
      case 'interview_l3':
        return 'interviewed';
      case 'offer':
      case 'offered':
        return 'offered';
      case 'rejected':
        return 'rejected';
      case 'accepted':
      case 'joined':
        return 'accepted';
      default:
        return 'pending';
    }
  };

  const currentStatus: TimelineStatus = mapStageToStatus(currentStage);

  const getTimelineStepIndex = () => {
    if (currentStatus === 'pending') return 0;
    if (currentStatus === 'screening') return 1;
    if (currentStatus === 'interviewed') return 2;
    if (currentStatus === 'rejected' || currentStatus === 'accepted') return 2;
    if (currentStatus === 'offered') return 3;
    return 0;
  };

  const currentStepIndex = getTimelineStepIndex();

  const getDecisionStepClasses = () => {
    if (currentStatus === 'rejected') {
      return 'border-red-500 bg-red-50 text-red-700';
    }
    if (currentStatus === 'accepted') {
      return 'border-green-500 bg-green-50 text-green-700';
    }
    if (currentStepIndex >= 2) {
      return 'border-blue-500 bg-blue-50 text-blue-700';
    }
    return 'border-border bg-card text-gray-700';
  };

  const getStepClasses = (index: number) => {
    if (index < currentStepIndex) {
      return 'border-blue-500 bg-blue-50 text-blue-700';
    }
    if (index === currentStepIndex) {
      return 'border-blue-500 bg-blue-50 text-blue-700';
    }
    return 'border-border bg-card text-gray-700';
  };

  const getConnectorClasses = (index: number) => {
    return index < currentStepIndex ? 'bg-blue-500' : 'bg-gray-200';
  };

  const handleAddNote = () => {
    if (newNote.trim()) {
      const note: any = {
        id: notes.length + 1,
        author: 'Current User',
        content: newNote,
        timestamp: new Date().toLocaleString()
      };
      setNotes([...notes, note]);
      setNewNote('');
    }
  };

  const getStageColor = (stage: string) => {
    const s = (stage || '').toLowerCase();
    const colors: Record<string, string> = {
      'profile_share': 'bg-blue-100 text-blue-800',
      'screen_selected': 'bg-indigo-100 text-indigo-800',
      'interview_l1': 'bg-purple-100 text-purple-800',
      'interview_l2': 'bg-purple-100 text-purple-800',
      'interview_l3': 'bg-purple-100 text-purple-800',
      'offered': 'bg-emerald-100 text-emerald-800',
      'rejected': 'bg-red-100 text-red-800',
      'backout': 'bg-orange-100 text-orange-800',
      'bg_status': 'bg-cyan-100 text-cyan-800',
      'joined': 'bg-green-100 text-green-800',
      // backward compatibility
      'applied': 'bg-blue-100 text-blue-800',
      'screening': 'bg-yellow-100 text-yellow-800',
      'review': 'bg-purple-100 text-purple-800',
      'interview': 'bg-orange-100 text-orange-800',
      'offer': 'bg-green-100 text-green-800',
    };
    return colors[s] || colors[stage] || 'bg-gray-100 text-gray-800';
  };

  useEffect(() => {
    const fetchCandidate = async () => {
      if (!id) return;
      try {
        setLoading(true);
        setError(null);
        const res = await api.get(`/api/candidates/${id}`);
        const data = (res as any).data ?? res;
        if (!data?.data) {
          setError('Candidate not found');
          return;
        }
        const cand = data.data;
        setCandidate(cand);

        // Default stage if we have any applications later; for now keep simple
        setCurrentStage('Applied');
      } catch (e: any) {
        console.error('Failed to load candidate profile', e);
        setError(e?.message || 'Failed to load candidate');
      } finally {
        setLoading(false);
      }
    };

    fetchCandidate();
  }, [id]);

  const handleUploadModifiedCv = async (file: File) => {
    if (!id) return;
    const role = String(localStorage.getItem('userRole') || '').toLowerCase();
    if (role && role !== 'admin' && role !== 'recruiter') return;

    const jobId = Number(candidate?.job_matches?.[0]?.job_id);
    if (!Number.isInteger(jobId)) {
      alert('No job context found for this candidate.');
      return;
    }

    setUploadingModifiedCv(true);
    try {
      const token = localStorage.getItem('accessToken');
      const form = new FormData();
      form.append('resume', file);
      form.append('job_id', String(jobId));
      form.append('candidate_id', String(id));

      const res = await fetch('/api/resumes/upload-modified', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(payload?.error || payload?.message || 'Upload failed');
        return;
      }

      const refreshed = await api.get(`/api/candidates/${id}`);
      const refreshedData = (refreshed as any).data ?? refreshed;
      if (refreshedData?.data) setCandidate(refreshedData.data);

      alert('Modified CV uploaded');
    } catch (e: any) {
      alert(e?.message || 'Upload failed');
    } finally {
      setUploadingModifiedCv(false);
      if (modifiedCvInputRef.current) modifiedCvInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-muted-foreground flex items-center gap-2">
          <Clock className="h-4 w-4 animate-spin" />
          <span>Loading candidate profile...</span>
        </div>
      </div>
    );
  }

  if (error || !candidate) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <p className="text-gray-700 mb-4">{error || 'Candidate not found'}</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

  const latestResume = Array.isArray(candidate.resumes) && candidate.resumes.length > 0
    ? candidate.resumes[0]
    : null;

  const parsed = latestResume?.parsed_json || {};

  const fullName = parsed.full_name ?? candidate.full_name ?? 'Unknown Candidate';
  const email = parsed.email ?? candidate.email ?? '';
  const phone = parsed.phone ?? candidate.phone ?? '';
  const location = parsed.location ?? candidate.location ?? '';

  const profileSummary = parsed.summary ?? parsed.profile_summary ?? '';
  const primarySkills: string[] = parsed.primary_skills ?? candidate.primary_skills ?? candidate.skills ?? [];
  const education = parsed.education ?? [];
  const experience = parsed.experience ?? [];

  const appliedDate = candidate.created_at || candidate.applied_at || candidate.appliedDate || new Date().toISOString();

  return (

    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 animate-fade-in">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <h1 className="text-xl font-bold text-foreground">Candidate Profile</h1>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Download Resume
              </Button>
              <input
                ref={modifiedCvInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.bmp,.tiff"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUploadModifiedCv(f);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={uploadingModifiedCv}
                onClick={() => modifiedCvInputRef.current?.click()}
              >
                <FileText className="h-4 w-4 mr-2" />
                {uploadingModifiedCv ? 'Uploading…' : 'Upload Modified CV'}
              </Button>
              <Button variant="outline" size="sm" className="text-green-600 hover:text-green-700">
                <ThumbsUp className="h-4 w-4 mr-2" />
                Accept
              </Button>
              <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                <ThumbsDown className="h-4 w-4 mr-2" />
                Reject
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Candidate Header */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-6">
                  <Avatar className="w-24 h-24 border-2 border-slate-100 shadow-sm">
                    <AvatarImage
                      src={getConsistentAvatar(fullName, candidate.gender)}
                      className="object-cover"
                    />
                    <AvatarFallback className="bg-slate-100 text-muted-foreground font-semibold text-3xl">
                      {(candidate.name || 'U').split(' ').map((n: string) => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h2 className="text-2xl font-bold text-foreground">{fullName}</h2>
                        <p className="text-lg text-muted-foreground">{parsed.designation || candidate.current_designation || 'N/A'}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-5 w-5 ${'text-gray-300'}`}
                          />
                        ))}
                        <span className="ml-2 text-sm text-muted-foreground">Profile Score</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        <a href={`mailto:${email}`} className="hover:text-blue-600">
                          {email}
                        </a>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        <span>{phone}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        <span>{location}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <span>Created {new Date(appliedDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex gap-3 mt-4">
                      {candidate.linkedin && (
                        <a
                          href={`https://${candidate.linkedin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Linkedin className="h-5 w-5" />
                        </a>
                      )}
                      {candidate.github && (
                        <a
                          href={`https://${candidate.github}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-700 hover:text-foreground"
                        >
                          <Github className="h-5 w-5" />
                        </a>
                      )}
                      {candidate.website && (
                        <a
                          href={`https://${candidate.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-700 hover:text-foreground"
                        >
                          <Globe className="h-5 w-5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Show Status Button + Timeline (hidden until clicked) */}
            <div className="flex justify-start">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowStatusTimeline((prev) => !prev)}
              >
                {showStatusTimeline ? 'Hide Status' : 'Show Status'}
              </Button>
            </div>

            {showStatusTimeline && (
              <Card className="animate-scale-in">
                <CardHeader>
                  <CardTitle className="text-lg">Application Status Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between gap-4">
                    {/* Step 1: Pending */}
                    <div className="flex-1 flex flex-col items-center">
                      <div className={`w-full max-w-[160px] border rounded-lg px-3 py-2 text-center text-sm font-medium ${getStepClasses(0)}`}>
                        Pending
                      </div>
                    </div>

                    <div className={`h-0.5 flex-1 ${getConnectorClasses(0)}`}></div>

                    {/* Step 2: Screening */}
                    <div className="flex-1 flex flex-col items-center">
                      <div className={`w-full max-w-[160px] border rounded-lg px-3 py-2 text-center text-sm font-medium ${getStepClasses(1)}`}>
                        Screening
                      </div>
                    </div>

                    <div className={`h-0.5 flex-1 ${getConnectorClasses(1)}`}></div>

                    {/* Step 3: Interviewed / Accepted / Rejected */}
                    <div className="flex-1 flex flex-col items-center">
                      <div
                        className={`w-full max-w-[180px] border rounded-lg px-3 py-2 text-center text-sm font-medium ${getDecisionStepClasses()}`}
                      >
                        {currentStatus === 'rejected'
                          ? 'Rejected'
                          : currentStatus === 'accepted'
                            ? 'Accepted'
                            : 'Interviewed'}
                      </div>
                    </div>

                    <div className={`h-0.5 flex-1 ${getConnectorClasses(2)}`}></div>

                    {/* Step 4: Offered */}
                    <div className="flex-1 flex flex-col items-center">
                      <div className={`w-full max-w-[160px] border rounded-lg px-3 py-2 text-center text-sm font-medium ${getStepClasses(3)}`}>
                        Offered
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Details Tabs */}
            <Card>
              <Tabs defaultValue="overview" className="w-full">
                <CardHeader>
                  <TabsList className="w-full justify-start">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="experience">Experience</TabsTrigger>
                    <TabsTrigger value="education">Education</TabsTrigger>
                    <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
                  </TabsList>
                </CardHeader>
                <CardContent>
                  <TabsContent value="overview" className="space-y-6 mt-0">
                    <div>
                      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Professional Summary
                      </h3>
                      <p className="text-muted-foreground leading-relaxed">{profileSummary || 'No profile summary extracted'}</p>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold mb-3">Skills</h3>
                      <div className="flex flex-wrap gap-2">
                        {primarySkills.map((skill, index) => (
                          <Badge key={index} variant="secondary" className="bg-blue-50 text-blue-700">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {Array.isArray(candidate.certifications) && candidate.certifications.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                          <Award className="h-5 w-5" />
                          Certifications
                        </h3>
                        <ul className="space-y-2">
                          {candidate.certifications.map((cert, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <Award className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
                              <span className="text-muted-foreground">{cert}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="experience" className="space-y-4 mt-0">
                    {Array.isArray(experience) && experience.length > 0 ? (
                      experience.map((exp: any, index: number) => (
                        <div key={index} className="border-l-2 border-blue-600 pl-4 pb-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h3 className="font-semibold text-foreground">{exp.role || exp.title || 'Role not specified'}</h3>
                              <p className="text-sm text-muted-foreground">{exp.company || 'Company not specified'}</p>
                            </div>
                            <Badge variant="outline" className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {exp.duration || `${exp.start_year || ''} - ${exp.end_year || ''}`}
                            </Badge>
                          </div>
                          {exp.description && (
                            <p className="text-muted-foreground text-sm leading-relaxed">{exp.description}</p>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No experience data available</p>
                    )}
                  </TabsContent>

                  <TabsContent value="education" className="space-y-4 mt-0">
                    {Array.isArray(education) && education.length > 0 ? (
                      education.map((edu: any, index: number) => (
                        <div key={index} className="border-l-2 border-purple-600 pl-4">
                          <div className="flex items-start gap-3">
                            <div>
                              <h3 className="font-semibold text-foreground">{edu.degree}</h3>
                              <p className="text-sm text-muted-foreground">{edu.institute || edu.school}</p>
                            </div>
                            {edu.passing_year && (
                              <span className="text-sm text-muted-foreground">{edu.passing_year}</span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No education data available</p>
                    )}
                  </TabsContent>

                  <TabsContent value="notes" className="space-y-4 mt-0">
                    <div className="space-y-3">
                      {notes.map((note) => (
                        <div key={note.id} className="bg-background rounded-lg p-4 border border-border">
                          <div className="flex items-start justify-between mb-2">
                            <span className="font-medium text-foreground">{note.author}</span>
                            <span className="text-xs text-muted-foreground">{note.timestamp}</span>
                          </div>
                          <p className="text-muted-foreground text-sm">{note.content}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Add a note about this candidate..."
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        rows={3}
                      />
                      <Button onClick={handleAddNote} className="w-full">
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Add Note
                      </Button>
                    </div>
                  </TabsContent>
                </CardContent>
              </Tabs>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button className="w-full" variant="outline">
                  <Calendar className="h-4 w-4 mr-2" />
                  Schedule Interview
                </Button>
                <Button className="w-full" variant="outline">
                  <Mail className="h-4 w-4 mr-2" />
                  Send Email
                </Button>
                <Button className="w-full" variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Download Resume
                </Button>
                <Button className="w-full" variant="outline">
                  <FileText className="h-4 w-4 mr-2" />
                  View Application
                </Button>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-600 mt-2"></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Application Submitted</p>
                      <p className="text-xs text-muted-foreground">{new Date(candidate.appliedDate).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-yellow-600 mt-2"></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Resume Reviewed</p>
                      <p className="text-xs text-muted-foreground">2 days ago</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-600 mt-2"></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Moved to Interview</p>
                      <p className="text-xs text-muted-foreground">1 day ago</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
