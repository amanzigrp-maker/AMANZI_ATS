import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authenticatedFetch } from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

interface LoginAttempt {
  auditid: number;
  userid: number;
  email: string;
  logintime: string;
  ipaddress: string;
  deviceinfo: string;
  loginstatus: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function RecentLogins() {
  const navigate = useNavigate();
  const [logins, setLogins] = useState<LoginAttempt[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchLogins = async (page = 1) => {
    try {
      const response = await authenticatedFetch(`/api/admin/logins/recent?page=${page}&limit=15`);
      if (!response.ok) {
        throw new Error('Failed to fetch recent logins');
      }
      const data = await response.json();
      setLogins(data.data);
      setPagination(data.pagination);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      }
    }
  };

  useEffect(() => {
    fetchLogins();
  }, []);

  return (
    <div className="p-8">
      <Button 
        onClick={() => navigate('/admin/dashboard')} 
        variant="outline" 
        className="mb-6"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        {(() => { try { const t = localStorage.getItem('accessToken'); if (t) { const d = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (d.role === 'lead') return 'Back to Lead Panel'; } } catch(e) {} return 'Back to Admin Dashboard'; })()}
      </Button>
      <h1 className="text-3xl font-bold mb-6">Recent Login Activity</h1>
      {error && <p className="text-red-500 bg-red-100 p-4 rounded-md">{error}</p>}
      <div className="bg-card rounded-lg shadow-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>IP Address</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logins.map((login) => (
              <TableRow key={login.auditid}>
                <TableCell>{login.email || 'N/A'}</TableCell>
                <TableCell>{new Date(login.logintime).toLocaleString()}</TableCell>
                <TableCell>{login.ipaddress}</TableCell>
                <TableCell>
                  <Badge variant={login.loginstatus === 'success' ? 'default' : 'destructive'}>
                    {login.loginstatus}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {pagination && (
        <div className="flex justify-between items-center mt-4">
          <span className="text-sm text-muted-foreground">Page {pagination.page} of {pagination.totalPages}</span>
          <div>
            <Button onClick={() => fetchLogins(pagination.page - 1)} disabled={pagination.page <= 1} variant="outline">Previous</Button>
            <Button onClick={() => fetchLogins(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} variant="outline" className="ml-2">Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
