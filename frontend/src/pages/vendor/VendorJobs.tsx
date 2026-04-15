import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { VendorJobApplicationModal } from "../../components/VendorJobApplicationModal";
import { MapPin, Building, Clock, DollarSign, Search, Filter } from "lucide-react";

interface Job {
  job_id: number;
  job_code?: string;   // ✅ ADDED
  title: string;
  company: string;
  description: string;
  requirements: string;
  skills: string[];
  location: string;
  employment_type: string;
  experience_level: string;
  salary_min?: number;
  salary_max?: number;
  benefits?: string;
  remote_option: boolean;
  posted_date: string;
  posted_by_name: string;
}


interface ApplicationEligibility {
  canApply: boolean;
  reason?: string;
  applicationStatus?: string;
}

const VendorJobs: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState("");
  const [experienceLevelFilter, setExperienceLevelFilter] = useState("");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isApplicationModalOpen, setIsApplicationModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [applicationEligibility, setApplicationEligibility] = useState<
    Record<number, ApplicationEligibility>
  >({});

  useEffect(() => {
    fetchJobs();
  }, [searchTerm, employmentTypeFilter, experienceLevelFilter]);

  const fetchJobs = async () => {
    try {
      const params = new URLSearchParams({
        status: "active",
        limit: "50",
      });

      if (searchTerm) {
  params.append("search", searchTerm);
  params.append("job_code", searchTerm); // ⭐ Add job_code search
}
if (searchTerm) params.append("search", searchTerm);
      if (employmentTypeFilter) params.append("employment_type", employmentTypeFilter);
      if (experienceLevelFilter) params.append("experience_level", experienceLevelFilter);

      console.log("Fetching jobs with token:", localStorage.getItem("accessToken"));
      const response = await fetch(`/api/jobs?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });

      console.log("Jobs response status:", response.status);
      if (response.ok) {
        const data = await response.json();
        console.log("Jobs data:", data);
        setJobs(data.data || []);
        checkApplicationEligibility(data.data || []);
        // ⭐ Frontend filtering for job_code
if (searchTerm) {
  const term = searchTerm.toLowerCase();
  const filtered = (data.data || []).filter((job: Job) =>
    job.job_code?.toLowerCase().includes(term) ||
    job.title.toLowerCase().includes(term) ||
    job.company.toLowerCase().includes(term)
  );

  setJobs(filtered);
  checkApplicationEligibility(filtered);
} else {
  setJobs(data.data || []);
  checkApplicationEligibility(data.data || []);
}

      } else {
        console.error("Failed to fetch jobs:", response.status, response.statusText);
      }
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  const checkApplicationEligibility = async (jobList: Job[]) => {
    const eligibilityMap: Record<number, ApplicationEligibility> = {};

    console.log("Checking eligibility for", jobList.length, "jobs");
    for (const job of jobList) {
      try {
        const response = await fetch(`/api/applications/jobs/${job.job_id}/can-apply`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
          },
        });

        console.log(`Eligibility check for job ${job.job_id}:`, response.status);
        if (response.ok) {
          const data = await response.json();
          console.log(`Job ${job.job_id} eligibility data:`, data);
          eligibilityMap[job.job_id] = data;
        } else {
          console.error(`Failed eligibility check for job ${job.job_id}:`, response.status);
          // Default to allowing application if API fails
          eligibilityMap[job.job_id] = { canApply: true, reason: "Default" };
        }
      } catch (error) {
        console.error(`Error checking eligibility for job ${job.job_id}:`, error);
        // Default to allowing application if API fails
        eligibilityMap[job.job_id] = { canApply: true, reason: "Default" };
      }
    }

    console.log("Final eligibility map:", eligibilityMap);
    setApplicationEligibility(eligibilityMap);
  };

  const handleApplyClick = (job: Job) => {
    setSelectedJob(job);
    setIsApplicationModalOpen(true);
  };

  const handleApplicationSubmit = async (applicationData: {
    cover_letter: string;
    proposed_candidates: any[];
  }) => {
    if (!selectedJob) return;

    console.log('🚀 VendorJobs: Submitting application for job:', selectedJob.job_id);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/applications/jobs/${selectedJob.job_id}/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: JSON.stringify(applicationData),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ VendorJobs: Application submitted successfully:', result);
        alert("Application submitted successfully!");
        setIsApplicationModalOpen(false);
        
        console.log('🔄 VendorJobs: Refreshing eligibility for job:', selectedJob.job_id);
        await checkApplicationEligibility([selectedJob]);
      } else {
        const errorData = await response.json();
        console.log('❌ VendorJobs: Application submission failed:', errorData);
        alert(`Error: ${errorData.error || "Failed to submit application"}`);
      }
    } catch (error) {
      console.error("Error submitting application:", error);
      alert("Failed to submit application. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getApplicationButtonText = (jobId: number) => {
    const eligibility = applicationEligibility[jobId];
    if (!eligibility) return "Apply";

    if (!eligibility.canApply) {
      if (eligibility.reason === "Already applied") {
        return `Applied (${eligibility.applicationStatus})`;
      }
      return "Cannot Apply";
    }

    return "Apply";
  };

  const isApplicationButtonDisabled = (jobId: number) => {
    const eligibility = applicationEligibility[jobId];
    console.log(`Job ${jobId} eligibility:`, eligibility);
    return !eligibility || !eligibility.canApply;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading available jobs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Available Jobs</h1>
        <p className="text-muted-foreground">Browse and apply for jobs posted by administrators</p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search jobs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={employmentTypeFilter} onValueChange={setEmploymentTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Employment Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Types</SelectItem>
                <SelectItem value="full-time">Full-time</SelectItem>
                <SelectItem value="part-time">Part-time</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="freelance">Freelance</SelectItem>
              </SelectContent>
            </Select>

            <Select value={experienceLevelFilter} onValueChange={setExperienceLevelFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Experience Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Levels</SelectItem>
                <SelectItem value="entry">Entry Level</SelectItem>
                <SelectItem value="mid">Mid Level</SelectItem>
                <SelectItem value="senior">Senior Level</SelectItem>
                <SelectItem value="lead">Lead/Principal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Job List */}
      {jobs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground text-lg">No jobs found matching your criteria.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {jobs.map((job) => (
            <Card key={job.job_id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    {/* Job Code */}
                    {job.job_code && (
                      <Badge className="mb-2 bg-blue-100 text-blue-800">
                        {job.job_code.toUpperCase()}
                      </Badge>
                    )}

                                      <div className="flex items-center gap-2 mb-2">
                    <CardTitle className="text-xl">{job.title}</CardTitle>
                    
                    {job.job_code && (
                      <span className="text-sm text-muted-foreground font-medium">
                        ({job.job_code.toUpperCase()})
                      </span>
                    )}
                  </div>


                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Building className="h-4 w-4" />
                        <span>{job.company}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        <span>{job.location}</span>
                        {job.remote_option && <Badge variant="outline">Remote</Badge>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span>{job.experience_level}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{job.employment_type}</Badge>
                    <Button
                      onClick={() => handleApplyClick(job)}
                      disabled={isApplicationButtonDisabled(job.job_id)}
                      variant={applicationEligibility[job.job_id]?.canApply ? "default" : "outline"}
                    >
                      {getApplicationButtonText(job.job_id)}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(job.salary_min || job.salary_max) && (
                    <div className="flex items-center gap-2 text-sm">
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

                  <p className="text-gray-700 line-clamp-3">{job.description}</p>

                  {job.skills && job.skills.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-foreground mb-2">Required Skills:</p>
                      <div className="flex flex-wrap gap-2">
                        {job.skills.slice(0, 6).map((skill, index) => (
                          <Badge key={index} variant="outline">
                            {skill}
                          </Badge>
                        ))}
                        {job.skills.length > 6 && (
                          <Badge variant="outline">+{job.skills.length - 6} more</Badge>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-xs text-muted-foreground pt-2 border-t">
                    <span>Posted by: {job.posted_by_name}</span>
                    <span>Posted: {new Date(job.posted_date).toLocaleDateString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Application Modal */}
      <VendorJobApplicationModal
        job={selectedJob}
        isOpen={isApplicationModalOpen}
        onClose={() => setIsApplicationModalOpen(false)}
        onSubmit={handleApplicationSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};

export default VendorJobs;
