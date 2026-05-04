import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import AppLayout from "./components/AppLayout";
import { ThemeProvider } from "./components/theme-provider";


// General Pages
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import JobDetails from "./pages/JobDetails";
import JobEdit from "./pages/JobEdit";
import JobApplicants from "./pages/JobApplicants";
import JobsList from "./pages/JobsList";
import JobMatches from "./pages/JobMatches";
import CandidateProfile from "./pages/CandidateProfile";
import Candidates from "./pages/Candidates";
import TotalApplicantsList from "./pages/TotalApplicantsList";
import Interviews from "./pages/Interviews";
import Assessments from "./pages/Assessments";
import InterviewScheduledList from "./pages/InterviewScheduledList";
import Reports from "./pages/Reports";
import PasswordReset from "./pages/PasswordReset";
import InterviewPage from "./pages/InterviewPage";
import InterviewLogin from "./pages/InterviewLogin";
import InterviewSession from "./pages/InterviewSession";
import NotFound from "./pages/NotFound";
import VerifyCertificate from "./pages/VerifyCertificate";


// Admin Components & Pages
import AdminRoute from "./components/AdminRoute";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminDashboard from "./pages/admin/AdminDashboard";
import RecentLogins from "./pages/admin/RecentLogins";
import FailedLogins from "./pages/admin/FailedLogins";
import ActiveSessions from "./pages/admin/ActiveSessions";
import CreateUser from "./pages/admin/CreateUser";
import ManageUsers from "./pages/admin/ManageUsers";
import Clients from "./pages/admin/Clients";
import Jobs from "./pages/admin/Jobs";
import Resumes from "./pages/admin/Resumes";
import ResumeUploadForm from "./pages/admin/ResumeUploadForm";
import BulkUpload from "./pages/admin/BulkUpload";
import CandidateDetail from "./pages/admin/CandidateDetail";
import JobApplications from "./pages/admin/JobApplications";
import Analytics from "./pages/admin/Analytics";
import AdminNotifications from "./pages/admin/AdminNotifications";
import JobRecommendations from "./pages/admin/JobRecommendations";
import AdminProctoringPage from "./pages/admin/AdminProctoringPage";

// Vendor Pages
import VendorJobs from "./pages/vendor/VendorJobs";
import VendorApplications from "./pages/vendor/VendorApplications";

const queryClient = new QueryClient();

const SmoothScroll: React.FC<React.PropsWithChildren> = ({ children }) => {
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <ThemeProvider forcedTheme="light" defaultTheme="light" storageKey="amanzi-theme" attribute="class">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />

          <SmoothScroll>
            <BrowserRouter>
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<PasswordReset />} />
                <Route path="/interview" element={<InterviewPage />} />
                <Route path="/interview-login" element={<InterviewLogin />} />
                <Route path="/interview-session" element={<InterviewSession />} />

                {/* User Routes (Protected + Persistent Sidebar Layout) */}
                <Route
                  element={
                    <ProtectedRoute>
                      <AppLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/jobs" element={<JobsList />} />
                  <Route path="/jobs/:id" element={<JobDetails />} />
                  <Route path="/candidates" element={<Candidates />} />
                  <Route path="/assessments" element={<Assessments />} />
                  <Route path="/applicants/total" element={<TotalApplicantsList />} />
                  <Route path="/interviews" element={<Interviews />} />
                  <Route path="/interviews/scheduled" element={<InterviewScheduledList />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/settings" element={<Settings />} />

                  <Route path="/jobs/:id/edit" element={<JobEdit />} />
                  <Route path="/jobs/create" element={<JobEdit />} />
                  <Route path="/jobs/:id/applicants" element={<JobApplicants />} />
                  <Route path="/job/:jobId/matches" element={<JobMatches />} />
                  <Route path="/candidate/:id" element={<CandidateProfile />} />
                </Route>

                {/* Admin Routes (Protected) */}
                <Route path="/admin" element={<AdminRoute />}>
                  <Route path="dashboard" element={<AdminDashboard />} />
                  <Route path="logins/recent" element={<RecentLogins />} />
                  <Route path="logins/failed" element={<FailedLogins />} />
                  <Route path="sessions/active" element={<ActiveSessions />} />
                  <Route path="users/create" element={<CreateUser />} />
                  <Route path="users/manage" element={<ManageUsers />} />
                  <Route path="clients" element={<Clients />} />
                  <Route path="jobs" element={<Jobs />} />
                  <Route path="resumes" element={<Resumes />} />
                  <Route path="resumes/upload" element={<ResumeUploadForm />} />
                  <Route path="resumes/bulk-upload" element={<BulkUpload />} />
                  <Route path="candidates" element={<Candidates />} />
                  <Route path="candidates/:id" element={<CandidateDetail />} />
                  <Route path="jobs/:jobId/applications" element={<JobApplications />} />
                  <Route path="jobs/:jobId/recommendations" element={<JobRecommendations />} />
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="notifications" element={<AdminNotifications />} />
                  <Route path="proctoring/:interviewId" element={<AdminProctoringPage />} />
                </Route>

                {/* Vendor Routes */}
                <Route
                  path="/vendor/jobs"
                  element={
                    <ProtectedRoute>
                      <VendorJobs />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/vendor/applications"
                  element={
                    <ProtectedRoute>
                      <VendorApplications />
                    </ProtectedRoute>
                  }
                />

                {/* Catch-All (404) */}
                <Route path="/verify/:certificateId" element={<VerifyCertificate />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </SmoothScroll>

        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
