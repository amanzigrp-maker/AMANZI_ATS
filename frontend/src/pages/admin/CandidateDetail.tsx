import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Linkedin,
  Github,
  Briefcase,
  GraduationCap,
  Calendar,
  Edit2,
  Save,
  X,
  FileText,
  Download,
  Loader2
} from 'lucide-react';

interface CandidateData {
  candidate_id: number;
  full_name: string;
  email: string;
  phone: string;
  location: string;
  linkedin_url: string;
  github_url: string;
  portfolio_url: string;
  current_title: string;
  current_company: string;
  years_of_experience: number;
  highest_education: string;
  skills: string[];
  created_at: string;
  updated_at: string;
}

interface WorkExperience {
  experience_id: number;
  job_title: string;
  company_name: string;
  location: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  description: string;
}

interface Education {
  education_id: number;
  institution_name: string;
  degree: string;
  field_of_study: string;
  start_date: string;
  end_date: string;
  grade: string;
  description: string;
}

interface Resume {
  resume_id: number;
  original_filename: string;
  file_size_bytes: number;
  file_type: string;
  uploaded_at: string;
  processing_status: string;
  raw_text: string;
  parsed_json: any;
}

export default function CandidateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState<CandidateData | null>(null);
  const [workExperience, setWorkExperience] = useState<WorkExperience[]>([]);
  const [education, setEducation] = useState<Education[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editedData, setEditedData] = useState<Partial<CandidateData>>({});
  const [jobs, setJobs] = useState<any[]>([]);
  const [assignJobId, setAssignJobId] = useState<string>('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    fetchCandidateDetails();
  }, [id]);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/jobs', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setJobs(data.data || []);
      }
    } catch (e) {
      console.error('Error fetching jobs:', e);
    }
  };

  const handleAssignToJob = async () => {
    if (!id || !assignJobId) return;
    setAssigning(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/applications/jobs/${assignJobId}/link-candidate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ candidateId: Number(id) })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Failed to assign candidate');
        return;
      }
      alert(data.message || 'Candidate assigned successfully');
    } catch (e) {
      console.error('Error assigning candidate:', e);
      alert('Failed to assign candidate');
    } finally {
      setAssigning(false);
    }
  };

  const fetchCandidateDetails = async () => {
    try {
      const token = localStorage.getItem('accessToken');

      // Fetch candidate basic info
      const candidateRes = await fetch(`/api/candidates/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!candidateRes.ok) {
        console.error('Failed to fetch candidate:', candidateRes.status, candidateRes.statusText);
        setLoading(false);
        return;
      }

      const candidateData = await candidateRes.json();
      console.log('Candidate data:', candidateData);
      console.log('Candidate details:', candidateData.data);
      console.log('Resumes:', candidateData.data?.resumes);

      if (candidateData.success) {
        setCandidate(candidateData.data);
        setEditedData(candidateData.data);

        // Extract work experience and education from resumes
        if (candidateData.data.resumes && candidateData.data.resumes.length > 0) {
          setResumes(candidateData.data.resumes);

          // Get parsed data from latest resume
          const latestResume = candidateData.data.resumes[0];
          console.log('Latest resume:', latestResume);
          console.log('Parsed JSON:', latestResume.parsed_json);

          if (latestResume.parsed_json) {
            const parsed = latestResume.parsed_json;
            console.log('Parsed data structure:', Object.keys(parsed));
            console.log('Experience field:', parsed.experience || parsed.work_experience || parsed.experiences);
            console.log('Education field:', parsed.education);

            // Set work experience - try multiple field names
            const experienceData = parsed.experience || parsed.work_experience || parsed.experiences || [];
            if (Array.isArray(experienceData) && experienceData.length > 0) {
              console.log('Setting work experience:', experienceData);
              setWorkExperience(experienceData.map((exp: any, idx: number) => ({
                experience_id: idx,
                job_title: exp.title || exp.job_title || exp.position || '',
                company_name: exp.company || exp.company_name || exp.organization || '',
                location: exp.location || '',
                start_date: exp.start_date || exp.from || '',
                end_date: exp.end_date || exp.to || exp.end || '',
                is_current: exp.is_current || false,
                description: exp.description || exp.responsibilities || ''
              })));
            } else {
              console.log('No work experience found');
            }

            // Set education - try multiple field names
            const educationData = parsed.education || parsed.educations || [];
            if (Array.isArray(educationData) && educationData.length > 0) {
              console.log('Setting education:', educationData);
              setEducation(educationData.map((edu: any, idx: number) => ({
                education_id: idx,
                institution_name: edu.institution || edu.institution_name || edu.school || edu.university || '',
                degree: edu.degree || edu.qualification || '',
                field_of_study: edu.field_of_study || edu.field || edu.major || '',
                start_date: edu.start_date || edu.from || '',
                end_date: edu.end_date || edu.to || edu.year || '',
                grade: edu.grade || edu.gpa || '',
                description: edu.description || ''
              })));
            } else {
              console.log('No education found');
            }
          } else {
            console.log('No parsed_json found in resume');
          }
        } else {
          console.log('No resumes found for candidate');
        }
      }
    } catch (error) {
      console.error('Error fetching candidate:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/candidates/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editedData)
      });

      if (response.ok) {
        setCandidate(editedData as CandidateData);
        setEditing(false);
      }
    } catch (error) {
      console.error('Error updating candidate:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="p-6">
        <p>Candidate not found</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate('/admin/candidates')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Candidates
        </Button>

        <div className="flex gap-2">
          <select
            value={assignJobId}
            onChange={(e) => setAssignJobId(e.target.value)}
            className="h-9 px-3 border rounded-md text-sm"
          >
            <option value="">Assign to Job...</option>
            {jobs.map((j: any) => (
              <option key={j.job_id ?? j.id} value={String(j.job_id ?? j.id)}>
                {(j.title || 'Job')} {(j.job_code ? `(${j.job_code})` : '')}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAssignToJob}
            disabled={!assignJobId || assigning}
          >
            {assigning ? 'Assigning...' : 'Assign'}
          </Button>

          {editing ? (
            <>
              <Button onClick={handleSave} size="sm">
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
              <Button variant="outline" onClick={() => {
                setEditing(false);
                setEditedData(candidate);
              }} size="sm">
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </>
          ) : (
            <Button onClick={() => setEditing(true)} size="sm">
              <Edit2 className="h-4 w-4 mr-2" />
              Edit Profile
            </Button>
          )}
        </div>
      </div>

      {/* Main Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            {editing ? (
              <Input
                value={editedData.full_name || ''}
                onChange={(e) => setEditedData({ ...editedData, full_name: e.target.value })}
                className="text-2xl font-bold"
              />
            ) : (
              candidate.full_name
            )}
          </CardTitle>
          {candidate.current_title && (
            <p className="text-lg text-muted-foreground">
              {candidate.current_title} {candidate.current_company && `at ${candidate.current_company}`}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Contact Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Email</Label>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-400" />
                {editing ? (
                  <Input
                    type="email"
                    value={editedData.email || ''}
                    onChange={(e) => setEditedData({ ...editedData, email: e.target.value })}
                  />
                ) : (
                  <span>{candidate.email || 'Not provided'}</span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Phone</Label>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-400" />
                {editing ? (
                  <Input
                    type="tel"
                    value={editedData.phone || ''}
                    onChange={(e) => setEditedData({ ...editedData, phone: e.target.value })}
                  />
                ) : (
                  <span>{candidate.phone || 'Not provided'}</span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Location</Label>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gray-400" />
                {editing ? (
                  <Input
                    value={editedData.location || ''}
                    onChange={(e) => setEditedData({ ...editedData, location: e.target.value })}
                  />
                ) : (
                  <span>{candidate.location || 'Not provided'}</span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Experience</Label>
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-gray-400" />
                <span>{candidate.years_of_experience || 0} years</span>
              </div>
            </div>

            {candidate.linkedin_url && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">LinkedIn</Label>
                <div className="flex items-center gap-2">
                  <Linkedin className="h-4 w-4 text-gray-400" />
                  <a href={candidate.linkedin_url} target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:underline truncate">
                    {candidate.linkedin_url}
                  </a>
                </div>
              </div>
            )}

            {candidate.github_url && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-gray-700">GitHub</Label>
                <div className="flex items-center gap-2">
                  <Github className="h-4 w-4 text-gray-400" />
                  <a href={candidate.github_url} target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:underline truncate">
                    {candidate.github_url}
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Skills */}
          {candidate.skills && candidate.skills.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Skills</Label>
              <div className="flex flex-wrap gap-2">
                {candidate.skills.map((skill, idx) => (
                  <Badge key={idx} variant="secondary">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Work Experience */}
      {workExperience.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Work Experience
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {workExperience.map((exp) => (
              <div key={exp.experience_id} className="border-l-2 border-blue-500 pl-4 py-2">
                {exp.job_title && (
                  <h3 className="font-semibold text-lg">{exp.job_title}</h3>
                )}
                {exp.company_name && (
                  <p className="text-muted-foreground">{exp.company_name}</p>
                )}
                {(exp.start_date || exp.end_date) && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <Calendar className="h-3 w-3" />
                    {exp.start_date} - {exp.end_date || 'Present'}
                  </p>
                )}
                {exp.description && (
                  <p className="text-sm text-gray-700 mt-2 whitespace-pre-line">
                    {exp.description}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Education */}
      {education.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Education
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {education.map((edu) => (
              <div key={edu.education_id} className="border-l-2 border-green-500 pl-4 py-2">
                {edu.degree && (
                  <h3 className="font-semibold text-lg">{edu.degree}</h3>
                )}
                {edu.institution_name && (
                  <p className="text-muted-foreground">{edu.institution_name}</p>
                )}
                {edu.end_date && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <Calendar className="h-3 w-3" />
                    {edu.end_date}
                  </p>
                )}
                {edu.description && (
                  <p className="text-sm text-gray-700 mt-2 whitespace-pre-line">
                    {edu.description}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Uploaded Resumes */}
      {resumes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Uploaded Resumes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {resumes.map((resume) => (
              <div key={resume.resume_id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="font-medium">{resume.original_filename}</p>
                    <p className="text-sm text-muted-foreground">
                      Uploaded {new Date(resume.uploaded_at).toLocaleDateString()} •
                      {(resume.file_size_bytes / 1024).toFixed(1)} KB •
                      Status: <Badge variant={resume.processing_status === 'completed' ? 'default' : 'secondary'}>
                        {resume.processing_status}
                      </Badge>
                    </p>
                    {resume.processing_status === 'failed' && (resume as any).error_message && (
                      <p className="text-sm text-red-600 mt-1">
                        {(resume as any).error_message}
                      </p>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
