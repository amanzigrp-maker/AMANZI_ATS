import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { MapPin, Building, Clock, DollarSign } from 'lucide-react';

// Normalize skills into a string[]
const normalizeSkills = (skills: unknown): string[] => {
  if (Array.isArray(skills)) return skills;
  if (typeof skills === 'string') {
    return skills.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
  }
  return [];
};

interface Job {
  job_id: number;
  title: string;
  company: string;
  description: string;
  requirements: string;
  skills: unknown;
  location: string;
  employment_type: string;
  experience_level: string;
  salary_min?: number;
  salary_max?: number;
  benefits?: string;
  remote_option: boolean;
  posted_date: string;
}

interface VendorJobApplicationModalProps {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (applicationData: { cover_letter: string; proposed_candidates: any[] }) => Promise<void>;
  isSubmitting?: boolean;
}

export const VendorJobApplicationModal: React.FC<VendorJobApplicationModalProps> = ({
  job,
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false
}) => {
  const [coverLetter, setCoverLetter] = useState('');
  const [proposedCandidates, setProposedCandidates] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!coverLetter.trim()) {
      alert('Please provide a cover letter');
      return;
    }

    const candidatesArray = proposedCandidates
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(candidate => ({ name: candidate }));

    await onSubmit({
      cover_letter: coverLetter,
      proposed_candidates: candidatesArray
    });

    // Reset form
    setCoverLetter('');
    setProposedCandidates('');
  };

  const handleClose = () => {
    setCoverLetter('');
    setProposedCandidates('');
    onClose();
  };

  if (!job) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Apply for Job</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Job Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{job.title}</span>
                <Badge variant="secondary">{job.employment_type}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <span>{job.company}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{job.location}</span>
                  {job.remote_option && <Badge variant="outline">Remote</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{job.experience_level}</span>
                </div>
                {(job.salary_min || job.salary_max) && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {job.salary_min && job.salary_max
                        ? `$${job.salary_min.toLocaleString()} - $${job.salary_max.toLocaleString()}`
                        : job.salary_min
                        ? `From $${job.salary_min.toLocaleString()}`
                        : `Up to $${job.salary_max?.toLocaleString()}`}
                    </span>
                  </div>
                )}
              </div>

              {normalizeSkills(job?.skills).length > 0 && (
                <div>
                  <Label className="text-sm font-medium">Required Skills</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {normalizeSkills(job?.skills).map((skill, index) => (
                      <Badge key={index} variant="outline">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Label className="text-sm font-medium">Job Description</Label>
                <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                  {job.description}
                </p>
              </div>

              {job.requirements && (
                <div>
                  <Label className="text-sm font-medium">Requirements</Label>
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                    {job.requirements}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Application Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="coverLetter">Cover Letter *</Label>
              <Textarea
                id="coverLetter"
                placeholder="Explain why you're interested in this position and how you can help fill it..."
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                rows={6}
                className="mt-1"
                required
              />
            </div>

            <div>
              <Label htmlFor="proposedCandidates">
                Proposed Candidates (Optional)
              </Label>
              <Textarea
                id="proposedCandidates"
                placeholder="List any candidates you'd like to propose for this role (one per line)&#10;Example:&#10;John Doe - Senior Developer&#10;Jane Smith - Full Stack Engineer"
                value={proposedCandidates}
                onChange={(e) => setProposedCandidates(e.target.value)}
                rows={4}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                You can add candidate details later through your dashboard
              </p>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !coverLetter.trim()}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Application'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};
