import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Calendar, FileText, CheckCircle, XCircle } from "lucide-react";

interface VendorApplication {
  application_id: number;
  job_id: number;
  job_title: string;
  company_name: string;
  job_code: string;   // 🔥 ADDED
  status: string;
  submitted_at: string;
  notes?: string;
}

const VendorApplications: React.FC = () => {
  const [applications, setApplications] = useState<VendorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApplication, setSelectedApplication] = useState<VendorApplication | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      const response = await fetch("/api/vendor/applications", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setApplications(data.data || []);
      } else {
        console.error("Failed to fetch vendor applications");
      }
    } catch (error) {
      console.error("Error fetching vendor applications:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "submitted":
        return "bg-blue-100 text-blue-800";
      case "under_review":
        return "bg-yellow-100 text-yellow-800";
      case "shortlisted":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "submitted":
        return "Submitted";
      case "under_review":
        return "Under Review";
      case "shortlisted":
        return "Shortlisted";
      case "rejected":
        return "Rejected";
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading your applications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">My Applications</h1>

      {applications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-muted-foreground text-lg">No applications found</p>
            <p className="text-gray-400">
              Once you apply to jobs, your applications will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {applications.map((application) => (
            <Card
              key={application.application_id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => {
                setSelectedApplication(application);
                setIsModalOpen(true);
              }}
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{application.job_title}</CardTitle>
                    <p className="text-sm text-muted-foreground">{application.company_name}</p>

                    {/* 🔥 SHOW JOB CODE */}
                    <p className="text-xs text-muted-foreground mt-1">
                      Job Code: <span className="font-semibold">{application.job_code}</span>
                    </p>
                  </div>

                  <Badge className={getStatusColor(application.status)}>
                    {getStatusText(application.status)}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>
                      Applied: {new Date(application.submitted_at).toLocaleDateString()}
                    </span>
                  </div>
                  <span>ID: {application.application_id}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Application Details</DialogTitle>
          </DialogHeader>

          {selectedApplication && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Job Title</Label>
                <p className="text-sm text-gray-700 mt-1">{selectedApplication.job_title}</p>
              </div>

              <div>
                <Label className="text-sm font-medium">Company</Label>
                <p className="text-sm text-gray-700 mt-1">{selectedApplication.company_name}</p>
              </div>

              {/* 🔥 JOB CODE INSIDE MODAL */}
              <div>
                <Label className="text-sm font-medium">Job Code</Label>
                <p className="text-sm text-gray-700 mt-1">{selectedApplication.job_code}</p>
              </div>

              <div>
                <Label className="text-sm font-medium">Status</Label>
                <div className="flex items-center gap-2 mt-1">
                  {selectedApplication.status === "shortlisted" && (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  )}
                  {selectedApplication.status === "rejected" && (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <Badge className={getStatusColor(selectedApplication.status)}>
                    {getStatusText(selectedApplication.status)}
                  </Badge>
                </div>
              </div>

              {selectedApplication.notes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                  <Label className="text-sm font-medium text-yellow-800">Notes</Label>
                  <p className="text-sm text-yellow-700 mt-1">{selectedApplication.notes}</p>
                </div>
              )}

              <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>
                    Submitted: {new Date(selectedApplication.submitted_at).toLocaleDateString()}
                  </span>
                </div>
                <span>ID: {selectedApplication.application_id}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VendorApplications;
