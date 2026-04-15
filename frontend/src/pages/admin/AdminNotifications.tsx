import React, { useEffect, useState } from 'react';
import { authenticatedFetch } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Label } from '../../components/ui/label';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface UserOption {
  userid: number;
  name: string;
}

interface HistoryItem {
  notification_id: number;
  user_id: number;
  title: string;
  message: string;
  recipient_role: string | null;
  priority: string;
  created_at: string;
}

const AdminNotifications: React.FC = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [recipientType, setRecipientType] = useState('all_vendors');
  const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>('normal');
  const [vendorId, setVendorId] = useState<string>('');
  const [recruiterId, setRecruiterId] = useState<string>('');
  const [vendors, setVendors] = useState<UserOption[]>([]);
  const [recruiters, setRecruiters] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const fetchUsers = async () => {
    try {
      const [vendorRes, recruiterRes] = await Promise.all([
        authenticatedFetch('/api/admin/users/all?role=vendor'),
        authenticatedFetch('/api/admin/users/all?role=recruiter'),
      ]);

      const vjson: any = await vendorRes.json();
      const rjson: any = await recruiterRes.json();

      const vdata: any = vjson?.data ?? vjson ?? [];
      const rdata: any = rjson?.data ?? rjson ?? [];

      setVendors(
        (Array.isArray(vdata) ? vdata : [])
          .filter((u: any) => u.role === 'vendor')
          .map((u: any) => ({
            userid: u.userid,
            name: u.full_name || u.name || u.email || `Vendor #${u.userid}`,
          }))
      );

      setRecruiters(
        (Array.isArray(rdata) ? rdata : [])
          .filter((u: any) => u.role === 'recruiter')
          .map((u: any) => ({
            userid: u.userid,
            name: u.full_name || u.name || u.email || `Recruiter #${u.userid}`,
          }))
      );
    } catch (e) {
      console.error('Failed to fetch vendors/recruiters', e);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await authenticatedFetch('/api/notifications/admin/history');
      const json: any = await res.json();
      const data: any = json?.data ?? json ?? [];
      setHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch admin notification history', e);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchHistory();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!title.trim() || !message.trim()) {
      setError('Title and message are required');
      return;
    }

    const payload: any = {
      title: title.trim(),
      message: message.trim(),
      recipientType,
      priority,
    };

    if (recipientType === 'specific_vendor') {
      payload.vendorId = vendorId ? Number(vendorId) : undefined;
    }
    if (recipientType === 'specific_recruiter') {
      payload.recruiterId = recruiterId ? Number(recruiterId) : undefined;
    }

    setLoading(true);
    try {
      const res = await authenticatedFetch('/api/notifications/admin', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data: any = await res.json();
      setSuccess(`Notification sent to ${data.count ?? 0} recipient(s)`);
      setTitle('');
      setMessage('');
      setVendorId('');
      setRecruiterId('');
      fetchHistory();
    } catch (e: any) {
      console.error('Failed to send notification', e);
      const msg = e?.response?.data?.error || e?.message || 'Failed to send notification';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const showVendorSelect = recipientType === 'specific_vendor';
  const showRecruiterSelect = recipientType === 'specific_recruiter';

  return (
    <div className="space-y-6 p-4">
      <div className="mb-4">
        <Button variant="ghost" className="text-muted-foreground -ml-4" onClick={() => navigate('/admin/dashboard')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {(() => { try { const t = localStorage.getItem('accessToken'); if (t) { const d = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (d.role === 'lead') return 'Back to Lead Panel'; } } catch(e) {} return 'Back to Admin Dashboard'; })()}
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Admin Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter notification title"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Enter notification message"
                rows={4}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Recipient Type</Label>
                <Select value={recipientType} onValueChange={setRecipientType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select recipient type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_vendors">All Vendors</SelectItem>
                    <SelectItem value="all_recruiters">All Recruiters</SelectItem>
                    <SelectItem value="both">Vendors &amp; Recruiters</SelectItem>
                    <SelectItem value="specific_vendor">Specific Vendor</SelectItem>
                    <SelectItem value="specific_recruiter">Specific Recruiter</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {showVendorSelect && (
                <div className="space-y-2">
                  <Label>Vendor</Label>
                  <Select value={vendorId} onValueChange={setVendorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((v) => (
                        <SelectItem key={v.userid} value={String(v.userid)}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {showRecruiterSelect && (
                <div className="space-y-2">
                  <Label>Recruiter</Label>
                  <Select value={recruiterId} onValueChange={setRecruiterId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select recruiter" />
                    </SelectTrigger>
                    <SelectContent>
                      {recruiters.map((r) => (
                        <SelectItem key={r.userid} value={String(r.userid)}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}

            <Button type="submit" disabled={loading}>
              {loading ? 'Sending...' : 'Send Notification'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notification History (last 100)</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notifications sent yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                    <th className="py-2 pr-4">Title</th>
                    <th className="py-2 pr-4">Recipient Role</th>
                    <th className="py-2 pr-4">Priority</th>
                    <th className="py-2 pr-4">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.notification_id} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <div className="font-medium text-foreground">{item.title}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2">{item.message}</div>
                      </td>
                      <td className="py-2 pr-4 capitalize">{item.recipient_role || '-'}</td>
                      <td className="py-2 pr-4 capitalize">{item.priority}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {new Date(item.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminNotifications;
