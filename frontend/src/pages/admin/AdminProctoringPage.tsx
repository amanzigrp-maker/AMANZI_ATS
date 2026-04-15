import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import AdminProctoringView from '@/components/proctoring/AdminProctoringView';

const AdminProctoringPage: React.FC = () => {
    const { interviewId } = useParams<{ interviewId: string }>();
    const [searchParams] = useSearchParams();
    const candidateName = searchParams.get('name') || 'Candidate';
    const candidateId = searchParams.get('cid') || 'Unknown';

    if (!interviewId) return <div>Invalid Interview ID</div>;

    return (
        <AdminProctoringView 
            interviewId={interviewId}
            candidateId={candidateId}
            candidateName={candidateName}
        />
    );
};

export default AdminProctoringPage;
