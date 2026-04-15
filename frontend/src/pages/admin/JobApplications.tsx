import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { User, Building, Calendar, FileText, MessageSquare, ArrowLeft } from 'lucide-react';
import { Input } from '../../components/ui/input';

interface JobApplication {
  application_id: number;
  job_id: number;
  application_type: 'vendor' | 'candidate';
  status: string;
  cover_letter?: string;
  proposed_candidates?: any[];
  applied_date: string;
  notes?: string;
  applicant_email: string;
  applicant_name: string;
  candidate_name?: string;
  current_title?: string;
  candidate_skills?: string[];
  uploader_email?: string;
  uploader_full_name?: string;
}

interface Job {
  job_id: number;
  title: string;
  company: string;
  location: string;
  employment_type: string;
  posted_date: string;
}

const JobApplications: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApplication, setSelectedApplication] = useState<JobApplication | null>(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [applicationDetails, setApplicationDetails] = useState<any | null>(null);
  const [detailsEditMode, setDetailsEditMode] = useState(false);
  const [detailsEditDraft, setDetailsEditDraft] = useState<any | null>(null);
  const [detailsEditSaving, setDetailsEditSaving] = useState(false);

  useEffect(() => {
    if (jobId) {
      fetchJobDetails();
      fetchApplications();
    }
  }, [jobId]);

  const fetchJobDetails = async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setJob(data.data);
      }
    } catch (error) {
      console.error('Error fetching job details:', error);
    }
  };

  const startEditFromDetails = (details: any) => {
    const candidate = details?.candidate || {};
    const resume = details?.resume || {};
    const parsed = resume?.parsed_json || {};

    setDetailsEditDraft({
      candidate_id: details?.candidate_id ?? candidate?.candidate_id ?? null,
      full_name: candidate.full_name ?? parsed.full_name ?? '',
      email: candidate.email ?? parsed.email ?? '',
      phone: candidate.phone ?? parsed.phone ?? '',
      location: candidate.location ?? parsed.location ?? '',
      gender: candidate.gender ?? parsed.gender ?? '',
      designation: candidate.designation ?? parsed.designation ?? '',
      total_experience: candidate.total_experience ?? parsed.total_experience ?? null,
      deployment_type: candidate.deployment_type ?? parsed.deployment_type ?? '',
      availability: candidate.availability ?? parsed.availability ?? '',
      country: candidate.country ?? parsed.country ?? '',
      city: candidate.city ?? parsed.city ?? '',
      primary_skills: candidate.primary_skills ?? parsed.primary_skills ?? candidate.skills ?? [],
      secondary_skills: candidate.secondary_skills ?? parsed.secondary_skills ?? [],
      experience: parsed.experience ?? candidate.experience ?? [],
      projects: parsed.projects ?? candidate.projects ?? [],
      education: parsed.education ?? candidate.education ?? [],
    });
  };

  const saveDetailsEdit = async () => {
    if (!detailsEditDraft?.candidate_id) {
      alert('Candidate ID missing');
      return;
    }

    setDetailsEditSaving(true);
    try {
      const response = await fetch(`/api/candidates/${detailsEditDraft.candidate_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          full_name: detailsEditDraft.full_name,
          email: detailsEditDraft.email,
          phone: detailsEditDraft.phone,
          location: detailsEditDraft.location,
          gender: detailsEditDraft.gender,
          designation: detailsEditDraft.designation,
          total_experience: detailsEditDraft.total_experience,
          deployment_type: detailsEditDraft.deployment_type,
          availability: detailsEditDraft.availability,
          country: detailsEditDraft.country,
          city: detailsEditDraft.city,
          primary_skills: detailsEditDraft.primary_skills,
          secondary_skills: detailsEditDraft.secondary_skills,
          parsed_json: {
            experience: detailsEditDraft.experience,
            projects: detailsEditDraft.projects,
            education: detailsEditDraft.education,
          },
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(data.error || 'Failed to update candidate');
        return;
      }

      // Refresh modal with latest details
      if (applicationDetails?.application_id) {
        const refreshed = await fetch(`/api/applications/${applicationDetails.application_id}/details`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          },
        });
        const refreshedData = await refreshed.json();
        if (refreshed.ok) {
          setApplicationDetails(refreshedData.data || refreshedData);
        }
      }

      setDetailsEditMode(false);
      setDetailsEditDraft(null);
      alert('Updated successfully');
    } catch (e) {
      console.error('Failed to save admin candidate edits', e);
      alert('Failed to update candidate');
    } finally {
      setDetailsEditSaving(false);
    }
  };

  const handleDownloadResume = async (resumeId: string) => {
    const token = localStorage.getItem('accessToken');

    if (!token) {
      alert('Session expired. Please login again.');
      return;
    }

    // Use browser-native download so Content-Disposition filename is respected
    window.location.href = `/api/resumes/${resumeId}/download?token=${token}`;
  };

  const handleViewMore = async (application: JobApplication) => {
    setDetailsOpen(true);
    setDetailsLoading(true);
    setApplicationDetails(null);
    setDetailsEditMode(false);
    setDetailsEditDraft(null);
    try {
      const response = await fetch(`/api/applications/${application.application_id}/details`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        alert(data.error || 'Failed to load applicant details');
        setDetailsOpen(false);
        return;
      }
      setApplicationDetails(data.data || data);
    } catch (error) {
      console.error('Error loading application details:', error);
      alert('Failed to load applicant details');
      setDetailsOpen(false);
    } finally {
      setDetailsLoading(false);
    }
  };

  const fetchApplications = async () => {
    try {
      console.log('🔍 Admin fetching applications for job:', jobId);
      const response = await fetch(`/api/applications/jobs/${jobId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      console.log('📡 Applications API response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Applications data received:', data);
        setApplications(data.data || []);
      } else {
        const errorData = await response.json();
        console.log('❌ Applications API error:', errorData);
        alert(`Error fetching applications: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('💥 Error fetching applications:', error);
      alert('Failed to fetch applications. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = (application: JobApplication) => {
    setSelectedApplication(application);
    setNewStatus(application.status);
    setAdminNotes(application.notes || '');
    setIsStatusModalOpen(true);
  };

  const submitStatusUpdate = async () => {
    if (!selectedApplication) return;

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/applications/${selectedApplication.application_id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          status: newStatus,
          notes: adminNotes,
        }),
      });

      if (response.ok) {
        alert('Application status updated successfully!');
        setIsStatusModalOpen(false);
        fetchApplications();
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.error || 'Failed to update status'}`);
      }
    } catch (error) {
      console.error('Error updating application status:', error);
      alert('Failed to update status. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'vendor_applied':
        return 'bg-blue-100 text-blue-800';
      case 'vendor_reviewing':
        return 'bg-yellow-100 text-yellow-800';
      case 'vendor_shortlisted':
        return 'bg-green-100 text-green-800';
      case 'vendor_rejected':
        return 'bg-red-100 text-red-800';
      case 'profile_share':
        return 'bg-blue-100 text-blue-800';
      case 'screen_selected':
        return 'bg-indigo-100 text-indigo-800';
      case 'interview_l1':
      case 'interview_l2':
      case 'interview_l3':
        return 'bg-purple-100 text-purple-800';
      case 'offered':
        return 'bg-emerald-100 text-emerald-800';
      case 'joined':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'backout':
        return 'bg-orange-100 text-orange-800';
      case 'bg_status':
        return 'bg-cyan-100 text-cyan-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'vendor_applied':
        return 'Vendor Applied';
      case 'vendor_reviewing':
        return 'Under Review';
      case 'vendor_shortlisted':
        return 'Shortlisted';
      case 'vendor_rejected':
        return 'Rejected';
      case 'profile_share':
        return 'Profile Share';
      case 'screen_selected':
        return 'Screen Selected';
      case 'interview_l1':
        return 'Interview L1';
      case 'interview_l2':
        return 'Interview L2';
      case 'interview_l3':
        return 'L3 Interview';
      case 'offered':
        return 'Offered';
      case 'rejected':
        return 'Rejected';
      case 'backout':
        return 'Backout';
      case 'bg_status':
        return 'BG Status';
      case 'joined':
        return 'Joined';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
    }
  };

  const getApplicationTypeIcon = (type: string) =>
    type === 'vendor' ? <Building className="h-4 w-4" /> : <User className="h-4 w-4" />;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading applications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-4">
        <Button variant="ghost" onClick={() => navigate('/admin/dashboard')} className="text-muted-foreground -ml-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {(() => { try { const t = localStorage.getItem('accessToken'); if (t) { const d = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (d.role === 'lead') return 'Back to Lead Panel'; } } catch (e) { } return 'Back to Admin Dashboard'; })()}
        </Button>
      </div>
      {/* Job Header */}
      {job && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-2xl">{job.title}</CardTitle>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{job.company}</span>
              <span>•</span>
              <span>{job.location}</span>
              <span>•</span>
              <span>{job.employment_type}</span>
              <span>•</span>
              <span>Posted: {new Date(job.posted_date).toLocaleDateString()}</span>
            </div>
          </CardHeader>
        </Card>
      )}

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground mb-2">Job Applications</h1>
        <p className="text-muted-foreground">{applications.length} application(s) received for this position</p>
      </div>

      {/* Applications List */}
      {applications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-muted-foreground text-lg">No applications received yet</p>
            <p className="text-gray-400">
              Applications will appear here when vendors or candidates apply for this job.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {applications.map((application) => (
            <Card key={application.application_id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      {getApplicationTypeIcon(application.application_type)}
                      <span className="font-semibold">
                        {application.application_type === 'vendor'
                          ? 'Vendor Application'
                          : 'Candidate Application'}
                      </span>
                      <Badge className={getStatusColor(application.status)}>
                        {getStatusText(application.status)}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">
                        {application.applicant_name || application.applicant_email}
                      </p>
                      <p className="text-sm text-muted-foreground">{application.applicant_email}</p>
                      {application.uploader_email && (
                        <p className="text-xs text-muted-foreground">
                          {application.application_type === 'vendor'
                            ? `Shared by ${application.uploader_email.split('@')[0]}`
                            : `Uploaded by ${application.uploader_email.split('@')[0]}`}
                        </p>
                      )}
                      {application.current_title && (
                        <p className="text-sm text-muted-foreground">{application.current_title}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleStatusUpdate(application)}>
                      <MessageSquare className="h-4 w-4 mr-1" />
                      Update Status
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleViewMore(application)}>
                      View More
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {application.cover_letter && (
                    <div>
                      <Label className="text-sm font-medium">Cover Letter</Label>
                      <p className="text-sm text-gray-700 mt-1 line-clamp-3">{application.cover_letter}</p>
                    </div>
                  )}

                  {application.proposed_candidates && application.proposed_candidates.length > 0 && (
                    <div>
                      <Label className="text-sm font-medium">Proposed Candidates</Label>
                      <div className="mt-1">
                        <p className="text-sm text-muted-foreground">
                          {application.proposed_candidates.length} candidate(s) proposed
                        </p>
                        <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                          {application.proposed_candidates.slice(0, 3).map((candidate, index) => (
                            <li key={index}>
                              • {typeof candidate === 'string'
                                ? candidate
                                : candidate.name || 'Unnamed candidate'}
                            </li>
                          ))}
                          {application.proposed_candidates.length > 3 && (
                            <li className="text-muted-foreground">
                              ... and {application.proposed_candidates.length - 3} more
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>
                  )}

                  {application.candidate_skills && application.candidate_skills.length > 0 && (
                    <div>
                      <Label className="text-sm font-medium">Skills</Label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {application.candidate_skills.slice(0, 5).map((skill, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                        {application.candidate_skills.length > 5 && (
                          <Badge variant="outline" className="text-xs">
                            +{application.candidate_skills.length - 5} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {application.notes && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                      <Label className="text-sm font-medium text-yellow-800">Admin Notes</Label>
                      <p className="text-sm text-yellow-700 mt-1">{application.notes}</p>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-xs text-muted-foreground pt-2 border-t">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>Applied: {new Date(application.applied_date).toLocaleDateString()}</span>
                    </div>
                    <span>ID: {application.application_id}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Status Update Modal */}
      <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Application Status</DialogTitle>
          </DialogHeader>

          {selectedApplication && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Applicant</Label>
                <p className="text-sm text-muted-foreground">
                  {selectedApplication.applicant_name || selectedApplication.applicant_email}
                </p>
              </div>

              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedApplication.application_type === 'vendor' ? (
                      <>
                        <SelectItem value="vendor_applied">Applied</SelectItem>
                        <SelectItem value="vendor_reviewing">Under Review</SelectItem>
                        <SelectItem value="vendor_shortlisted">Shortlisted</SelectItem>
                        <SelectItem value="vendor_rejected">Rejected</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="profile_share">Profile Share</SelectItem>
                        <SelectItem value="screen_selected">Screen Selected</SelectItem>
                        <SelectItem value="interview_l1">Interview L1</SelectItem>
                        <SelectItem value="interview_l2">Interview L2</SelectItem>
                        <SelectItem value="interview_l3">L3 Interview</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="offered">Offered</SelectItem>
                        <SelectItem value="backout">Backout</SelectItem>
                        <SelectItem value="bg_status">BG Status</SelectItem>
                        <SelectItem value="joined">Joined</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="notes">Admin Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Add notes about this application..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <Button variant="outline" onClick={() => setIsStatusModalOpen(false)} disabled={isUpdating}>
                  Cancel
                </Button>
                <Button onClick={submitStatusUpdate} disabled={isUpdating}>
                  {isUpdating ? 'Updating...' : 'Update Status'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Application Details Modal */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Application Details</DialogTitle>
          </DialogHeader>

          {detailsLoading && (
            <div className="py-8 text-center text-muted-foreground">Loading details...</div>
          )}

          {!detailsLoading && applicationDetails && (() => {
            const candidate = applicationDetails.candidate || {};
            const resume = applicationDetails.resume || {};
            const parsed = resume.parsed_json || {};

            const fullName = parsed.full_name ?? candidate.full_name ?? candidate.email;
            const email = parsed.email ?? candidate.email ?? '';
            const phone = parsed.phone ?? candidate.phone ?? '';
            const location = parsed.location ?? candidate.location ?? '';

            const profileData = {
              gender: parsed.gender ?? candidate.gender ?? 'N/A',
              designation: parsed.designation ?? candidate.designation ?? 'N/A',
              total_experience:
                parsed.total_experience ?? candidate.total_experience ?? candidate.total_experience_years ?? 'N/A',
              deployment_type: parsed.deployment_type ?? candidate.deployment_type ?? 'N/A',
              availability: parsed.availability ?? candidate.availability ?? 'N/A',
              country: parsed.country ?? candidate.country ?? 'N/A',
              city: parsed.city ?? candidate.city ?? 'N/A',
            };

            const primarySkills = parsed.primary_skills ?? candidate.primary_skills ?? candidate.skills ?? [];
            const secondarySkills = parsed.secondary_skills ?? candidate.secondary_skills ?? [];
            const experience = parsed.experience ?? candidate.experience ?? [];
            const education = parsed.education ?? candidate.education ?? [];
            const projects = parsed.projects ?? candidate.projects ?? [];

            if (detailsEditMode && !detailsEditDraft) {
              startEditFromDetails(applicationDetails);
            }

            return (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    {detailsEditMode ? (
                      <div className="space-y-2">
                        <Input
                          value={detailsEditDraft?.full_name ?? ''}
                          onChange={(e) => setDetailsEditDraft({ ...detailsEditDraft, full_name: e.target.value })}
                          placeholder="Full Name"
                        />
                        <Input
                          value={detailsEditDraft?.email ?? ''}
                          onChange={(e) => setDetailsEditDraft({ ...detailsEditDraft, email: e.target.value })}
                          placeholder="Email"
                        />
                        <Input
                          value={detailsEditDraft?.phone ?? ''}
                          onChange={(e) => setDetailsEditDraft({ ...detailsEditDraft, phone: e.target.value })}
                          placeholder="Phone"
                        />
                      </div>
                    ) : (
                      <>
                        <h2 className="text-xl font-semibold">{fullName}</h2>
                        {email && <p className="text-sm text-muted-foreground">{email}</p>}
                        {phone && <p className="text-sm text-muted-foreground">{phone}</p>}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {resume?.resume_id && (
                      <Button
                        variant="outline"
                        onClick={() => handleDownloadResume(resume.resume_id)}
                      >
                        Download Resume
                      </Button>
                    )}
                    <Button
                      variant={detailsEditMode ? 'default' : 'outline'}
                      onClick={() => {
                        if (detailsEditMode) {
                          setDetailsEditMode(false);
                          setDetailsEditDraft(null);
                        } else {
                          setDetailsEditMode(true);
                          startEditFromDetails(applicationDetails);
                        }
                      }}
                    >
                      {detailsEditMode ? 'Cancel Edit' : 'Edit'}
                    </Button>
                    {detailsEditMode && (
                      <Button onClick={saveDetailsEdit} disabled={detailsEditSaving}>
                        {detailsEditSaving ? 'Saving…' : 'Save'}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Profile</h3>
                    {detailsEditMode ? (
                      <div className="space-y-2">
                        <Input value={detailsEditDraft?.location ?? ''} onChange={(e) => setDetailsEditDraft({ ...detailsEditDraft, location: e.target.value })} placeholder="Location" />
                        <Input value={detailsEditDraft?.gender ?? ''} onChange={(e) => setDetailsEditDraft({ ...detailsEditDraft, gender: e.target.value })} placeholder="Gender" />
                        <Input value={detailsEditDraft?.designation ?? ''} onChange={(e) => setDetailsEditDraft({ ...detailsEditDraft, designation: e.target.value })} placeholder="Designation" />
                        <Input
                          type="number"
                          step="0.1"
                          value={
                            detailsEditDraft?.total_experience === null ||
                              detailsEditDraft?.total_experience === undefined ||
                              String(detailsEditDraft?.total_experience) === '0'
                              ? ''
                              : String(detailsEditDraft?.total_experience)
                          }
                          onChange={(e) =>
                            setDetailsEditDraft({
                              ...detailsEditDraft,
                              total_experience: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                          placeholder="Total Experience"
                        />
                        <Input value={detailsEditDraft?.deployment_type ?? ''} onChange={(e) => setDetailsEditDraft({ ...detailsEditDraft, deployment_type: e.target.value })} placeholder="Deployment Type" />
                        <Input value={detailsEditDraft?.availability ?? ''} onChange={(e) => setDetailsEditDraft({ ...detailsEditDraft, availability: e.target.value })} placeholder="Availability" />
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-gray-700">Location: {location || 'N/A'}</p>
                        <p className="text-sm text-gray-700">Gender: {profileData.gender}</p>
                        <p className="text-sm text-gray-700">Designation: {profileData.designation}</p>
                        <p className="text-sm text-gray-700">Total Experience: {profileData.total_experience}</p>
                        <p className="text-sm text-gray-700">Deployment Type: {profileData.deployment_type}</p>
                        <p className="text-sm text-gray-700">Availability: {profileData.availability}</p>
                      </>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Location & Preferences</h3>
                    {detailsEditMode ? (
                      <div className="space-y-2">
                        <Input value={detailsEditDraft?.country ?? ''} onChange={(e) => setDetailsEditDraft({ ...detailsEditDraft, country: e.target.value })} placeholder="Country" />
                        <Input value={detailsEditDraft?.city ?? ''} onChange={(e) => setDetailsEditDraft({ ...detailsEditDraft, city: e.target.value })} placeholder="City" />
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-gray-700">Country: {profileData.country}</p>
                        <p className="text-sm text-gray-700">City: {profileData.city}</p>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Primary Skills</h3>
                  {detailsEditMode ? (
                    <Input
                      value={Array.isArray(detailsEditDraft?.primary_skills) ? detailsEditDraft.primary_skills.join(', ') : ''}
                      onChange={(e) =>
                        setDetailsEditDraft({
                          ...detailsEditDraft,
                          primary_skills: e.target.value
                            .split(',')
                            .map((x) => x.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="Enter skills separated by comma"
                    />
                  ) : Array.isArray(primarySkills) && primarySkills.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {primarySkills.map((s: string, idx: number) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">N/A</p>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Secondary Skills</h3>
                  {detailsEditMode ? (
                    <Input
                      value={Array.isArray(detailsEditDraft?.secondary_skills) ? detailsEditDraft.secondary_skills.join(', ') : ''}
                      onChange={(e) =>
                        setDetailsEditDraft({
                          ...detailsEditDraft,
                          secondary_skills: e.target.value
                            .split(',')
                            .map((x) => x.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="Enter skills separated by comma"
                    />
                  ) : Array.isArray(secondarySkills) && secondarySkills.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {secondarySkills.map((s: string, idx: number) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">N/A</p>
                  )}
                </div>

                {Array.isArray(experience) && experience.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Experience</h3>
                    <ul className="space-y-2 text-sm text-gray-700">
                      {experience.map((exp: any, idx: number) => (
                        <li key={idx} className="border rounded-md p-2">
                          <p className="font-medium">{exp.company || 'Company N/A'}</p>
                          <p>{exp.role || exp.title || 'Role N/A'}</p>
                          {(exp.start_year || exp.end_year) && (
                            <p className="text-xs text-muted-foreground">
                              {exp.start_year || '?'} - {exp.end_year || 'Present'}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {Array.isArray(education) && education.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Education</h3>
                    <ul className="space-y-2 text-sm text-gray-700">
                      {education.map((edu: any, idx: number) => (
                        <li key={idx} className="border rounded-md p-2">
                          <p className="font-medium">{edu.degree || 'Degree N/A'}</p>
                          <p>{edu.institute || edu.institution_name || 'Institute N/A'}</p>
                          {edu.passing_year && (
                            <p className="text-xs text-muted-foreground">Year: {edu.passing_year}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {Array.isArray(projects) && projects.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Projects</h3>
                    <ul className="space-y-2 text-sm text-gray-700">
                      {projects.map((proj: any, idx: number) => (
                        <li key={idx} className="border rounded-md p-2">
                          <p className="font-medium">{proj.project_title || 'Project'}</p>
                          {proj.description && <p>{proj.description}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default JobApplications;
