import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { authenticatedFetch } from '@/lib/api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Plus, X, Users } from 'lucide-react';

interface Job {
  job_id?: number;
  title: string;
  company: string;
  description: string;
  requirements: string[];
  skills: string[];
  location: string;
  employment_type: string;
  experience_level: string;
  salary_min?: number;
  salary_max?: number;
  benefits: string[];
  remote_option: boolean;
  status: string;
  assignment_type: 'all' | 'vendor' | 'recruiter' | 'specific';
  assigned_to?: number[];
}

interface User {
  userid: number;
  name: string;
  email: string;
  role: string;
}

export default function JobEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const duplicateId = searchParams.get('duplicate');
  
  const [job, setJob] = useState<Job>({
    title: '',
    company: '',
    description: '',
    requirements: [],
    skills: [],
    location: '',
    employment_type: 'full-time',
    experience_level: 'mid-level',
    salary_min: undefined,
    salary_max: undefined,
    benefits: [],
    remote_option: false,
    status: 'active',
    assignment_type: 'specific',
    assigned_to: []
  });
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newRequirement, setNewRequirement] = useState('');
  const [newSkill, setNewSkill] = useState('');
  const [newBenefit, setNewBenefit] = useState('');
  const [availableVendors, setAvailableVendors] = useState<User[]>([]);

  const isEditing = Boolean(id);
  const isDuplicating = Boolean(duplicateId);

  useEffect(() => {
    if (id || duplicateId) {
      fetchJobDetails(id || duplicateId!);
    }
    fetchAvailableVendors();
  }, [id, duplicateId]);

  const fetchAvailableVendors = async () => {
    try {
      // Fetch both vendors and recruiters for job assignment
      const [vendorsResponse, recruitersResponse] = await Promise.all([
        authenticatedFetch('/api/users?role=vendor&status=active'),
        authenticatedFetch('/api/users?role=recruiter&status=active')
      ]);
      
      const vendors = vendorsResponse.ok ? (await vendorsResponse.json()).users || [] : [];
      const recruiters = recruitersResponse.ok ? (await recruitersResponse.json()).users || [] : [];
      
      // Combine both lists (roles are already set from database)
      const allAssignees = [
        ...vendors,
        ...recruiters
      ].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
      
      setAvailableVendors(allAssignees);
    } catch (error) {
      console.error('Failed to fetch assignees:', error);
    }
  };

  const fetchJobDetails = async (jobId: string) => {
    try {
      setLoading(true);
      const response = await authenticatedFetch(`/api/jobs/${jobId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch job details');
      }
      const data = await response.json();
      const jobData = data.data;
      
      // Parse array fields if they're strings
      const parseArrayField = (field: string[] | string | null): string[] => {
        if (!field) return [];
        if (Array.isArray(field)) return field;
        if (typeof field === 'string') {
          try {
            return JSON.parse(field);
          } catch {
            return field.split(',').map(item => item.trim()).filter(Boolean);
          }
        }
        return [];
      };

      setJob({
        ...jobData,
        requirements: parseArrayField(jobData.requirements),
        skills: parseArrayField(jobData.skills),
        benefits: parseArrayField(jobData.benefits),
        assignment_type: 'specific',
        assigned_to: jobData.assigned_to || [],
        // If duplicating, remove the ID and set status to draft
        ...(isDuplicating && { 
          job_id: undefined, 
          status: 'draft',
          title: `Copy of ${jobData.title}`
        })
      });
    } catch (err) {
      console.error('Error fetching job details:', err);
      toast.error('Failed to load job details');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof Job, value: any) => {
    setJob(prev => ({ ...prev, [field]: value }));
  };

  const addArrayItem = (field: 'requirements' | 'skills' | 'benefits', value: string) => {
    if (!value.trim()) return;
    
    setJob(prev => ({
      ...prev,
      [field]: [...prev[field], value.trim()]
    }));
    
    // Clear the input
    if (field === 'requirements') setNewRequirement('');
    if (field === 'skills') setNewSkill('');
    if (field === 'benefits') setNewBenefit('');
  };

  const removeArrayItem = (field: 'requirements' | 'skills' | 'benefits', index: number) => {
    setJob(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index)
    }));
  };

  const handleVendorAssignment = (vendorId: number, isChecked: boolean) => {
    setJob(prev => {
      const currentAssigned = prev.assigned_to || [];
      if (isChecked) {
        return {
          ...prev,
          assigned_to: [...currentAssigned, vendorId]
        };
      } else {
        return {
          ...prev,
          assigned_to: currentAssigned.filter(id => id !== vendorId)
        };
      }
    });
  };

  // Assignment type is now always 'specific'; we only allow choosing explicit assignees.

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!job.title || !job.company || !job.description || !job.location) {
      toast.error('Please fill in all required fields (Title, Company, Location, Description)');
      return;
    }

    if (job.requirements.length === 0) {
      toast.error('Please add at least one job requirement');
      return;
    }

    if (job.skills.length === 0) {
      toast.error('Please add at least one required skill');
      return;
    }

    try {
      setSaving(true);
      
      const method = isEditing && !isDuplicating ? 'PUT' : 'POST';
      const url = isEditing && !isDuplicating ? `/api/jobs/${id}` : '/api/jobs';
      
      const selectedVendors: number[] = [];
      const selectedRecruiters: number[] = [];

      if (job.assigned_to) {
        job.assigned_to.forEach((userId) => {
          const user = availableVendors.find((u) => u.userid === userId);
          if (!user) return;
          if (user.role === 'vendor') {
            selectedVendors.push(userId);
          } else if (user.role === 'recruiter') {
            selectedRecruiters.push(userId);
          }
        });
      }

      const payload = {
        ...job,
        assigned_vendors: selectedVendors,
        assigned_recruiters: selectedRecruiters,
      };

      const response = await authenticatedFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Failed to save job');
      }

      const data = await response.json();
      toast.success(isEditing && !isDuplicating ? 'Job updated successfully' : 'Job created successfully');
      
      // Navigate to the applicants page for this job
      const jobId = data.data?.job_id || id;
      navigate(`/jobs/${jobId}/applicants`);
      
    } catch (err) {
      console.error('Error saving job:', err);
      toast.error('Failed to save job');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading job details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <h1 className="text-xl font-bold text-foreground">
                {isDuplicating ? 'Duplicate Job' : isEditing ? 'Edit Job' : 'Create Job'}
              </h1>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? 'Saving...' : 'Save Job'}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="title">Job Title *</Label>
                  <Input
                    id="title"
                    value={job.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder="e.g. Senior Software Engineer"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="company">Company *</Label>
                  <Input
                    id="company"
                    value={job.company}
                    onChange={(e) => handleInputChange('company', e.target.value)}
                    placeholder="e.g. Tech Corp"
                    required
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="description">Job Description *</Label>
                <Textarea
                  id="description"
                  value={job.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Describe the role, responsibilities, and what you're looking for..."
                  rows={6}
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Job Details */}
          <Card>
            <CardHeader>
              <CardTitle>Job Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="location">Location *</Label>
                  <Input
                    id="location"
                    value={job.location}
                    onChange={(e) => handleInputChange('location', e.target.value)}
                    placeholder="e.g. New York, NY"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="employment_type">Employment Type</Label>
                  <Select value={job.employment_type} onValueChange={(value) => handleInputChange('employment_type', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full-time">Full-time</SelectItem>
                      <SelectItem value="part-time">Part-time</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="freelance">Freelance</SelectItem>
                      <SelectItem value="internship">Internship</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="experience_level">Experience Level</Label>
                  <Select value={job.experience_level} onValueChange={(value) => handleInputChange('experience_level', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entry-level">Entry Level</SelectItem>
                      <SelectItem value="mid-level">Mid Level</SelectItem>
                      <SelectItem value="senior-level">Senior Level</SelectItem>
                      <SelectItem value="executive">Executive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="salary_min">Minimum Salary</Label>
                  <Input
                    id="salary_min"
                    type="number"
                    value={job.salary_min || ''}
                    onChange={(e) => handleInputChange('salary_min', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="e.g. 80000"
                  />
                </div>
                <div>
                  <Label htmlFor="salary_max">Maximum Salary</Label>
                  <Input
                    id="salary_max"
                    type="number"
                    value={job.salary_max || ''}
                    onChange={(e) => handleInputChange('salary_max', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="e.g. 120000"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="remote_option"
                  checked={job.remote_option}
                  onChange={(e) => handleInputChange('remote_option', e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="remote_option">Remote work available</Label>
              </div>

              <div>
                <Label htmlFor="status">Job Status</Label>
                <Select value={job.status} onValueChange={(value) => handleInputChange('status', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Requirements */}
          <Card>
            <CardHeader>
              <CardTitle>Requirements *</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={newRequirement}
                  onChange={(e) => setNewRequirement(e.target.value)}
                  placeholder="Add a requirement..."
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addArrayItem('requirements', newRequirement))}
                />
                <Button type="button" onClick={() => addArrayItem('requirements', newRequirement)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {job.requirements.map((req, index) => (
                  <Badge key={index} variant="outline" className="flex items-center gap-1">
                    {req}
                    <X 
                      className="h-3 w-3 cursor-pointer" 
                      onClick={() => removeArrayItem('requirements', index)}
                    />
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Skills */}
          <Card>
            <CardHeader>
              <CardTitle>Required Skills *</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  placeholder="Add a skill..."
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addArrayItem('skills', newSkill))}
                />
                <Button type="button" onClick={() => addArrayItem('skills', newSkill)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {job.skills.map((skill, index) => (
                  <Badge key={index} variant="outline" className="flex items-center gap-1">
                    {skill}
                    <X 
                      className="h-3 w-3 cursor-pointer" 
                      onClick={() => removeArrayItem('skills', index)}
                    />
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Benefits */}
          <Card>
            <CardHeader>
              <CardTitle>Benefits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={newBenefit}
                  onChange={(e) => setNewBenefit(e.target.value)}
                  placeholder="Add a benefit..."
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addArrayItem('benefits', newBenefit))}
                />
                <Button type="button" onClick={() => addArrayItem('benefits', newBenefit)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {job.benefits.map((benefit, index) => (
                  <Badge key={index} variant="outline" className="flex items-center gap-1">
                    {benefit}
                    <X 
                      className="h-3 w-3 cursor-pointer" 
                      onClick={() => removeArrayItem('benefits', index)}
                    />
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Job Assignment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Job Assignment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Assignment Visibility</Label>
                <Select value={job.assignment_type} onValueChange={() => {}}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="specific">Specific Vendors/Recruiters</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Select Assignees (Vendors & Recruiters)</Label>
                <div className="mt-2 space-y-2 max-h-60 overflow-y-auto border rounded-md p-3">
                  {availableVendors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No assignees available</p>
                  ) : (
                    availableVendors.map((assignee) => (
                      <div key={assignee.userid} className="flex items-center space-x-2">
                        <Checkbox
                          id={`assignee-${assignee.userid}`}
                          checked={job.assigned_to?.includes(assignee.userid) || false}
                          onCheckedChange={(checked) => 
                            handleVendorAssignment(assignee.userid, checked as boolean)
                          }
                        />
                        <Label 
                          htmlFor={`assignee-${assignee.userid}`}
                          className="flex-1 cursor-pointer"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{assignee.name}</p>
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                assignee.role === 'vendor' 
                                  ? 'bg-blue-100 text-blue-800' 
                                  : 'bg-green-100 text-green-800'
                              }`}>
                                {assignee.role === 'vendor' ? 'Vendor' : 'Recruiter'}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">{assignee.email}</p>
                          </div>
                        </Label>
                      </div>
                    ))
                  )}
                </div>
                {job.assigned_to && job.assigned_to.length > 0 && (
                  <p className="text-sm text-blue-600 mt-2">
                    {job.assigned_to.length} assignee(s) selected
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}
