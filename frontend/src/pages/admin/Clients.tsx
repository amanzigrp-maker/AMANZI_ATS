import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';

interface ClientFormData {
  client_name: string;
  gstin: string;
  pan: string;
  state: string;
  pincode: string;
}

interface Client {
  client_id: number;
  name?: string;
  client_name?: string;
  code?: string | null;
}

const Clients = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState<ClientFormData>({
    client_name: '',
    gstin: '',
    pan: '',
    state: '',
    pincode: '',
  });
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    // Enforce hard limits on specific fields
    let next = value;
    if (name === 'gstin') {
      next = value.slice(0, 15);
    } else if (name === 'pan') {
      next = value.slice(0, 10);
    } else if (name === 'pincode') {
      // numbers only, max 6 digits
      next = value.replace(/[^0-9]/g, '').slice(0, 6);
    }

    setFormData(prev => ({ ...prev, [name]: next }));
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setFormData({
      client_name: client.name ?? client.client_name ?? '',
      gstin: (client as any).gstin ?? '',
      pan: (client as any).pan ?? '',
      state: (client as any).state ?? '',
      pincode: (client as any).pincode ?? '',
    });
    setEditModalOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingClient) return;
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    try {
      // Reuse same validation rules
      if (formData.gstin && formData.gstin.length !== 15) {
        throw new Error('GSTIN must be exactly 15 characters.');
      }
      if (formData.pan && formData.pan.length !== 10) {
        throw new Error('PAN must be exactly 10 characters.');
      }
      if (formData.pincode && !/^\d{6}$/.test(formData.pincode)) {
        throw new Error('Pincode must be exactly 6 digits.');
      }

      const res = await fetch(`/api/admin/clients/${editingClient.client_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to update client');
      }

      toast({ title: 'Updated', description: 'Client updated successfully' });
      setEditModalOpen(false);
      setEditingClient(null);
      await fetchClients();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to update client',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteClient = async (client: Client) => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const confirmed = window.confirm(`Delete client "${client.name ?? client.client_name ?? client.client_id}"?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/admin/clients/${client.client_id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to delete client');
      }

      toast({ title: 'Deleted', description: 'Client deleted successfully' });
      await fetchClients();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to delete client',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Basic frontend validation
      if (formData.gstin && formData.gstin.length !== 15) {
        throw new Error('GSTIN must be exactly 15 characters.');
      }
      if (formData.pan && formData.pan.length !== 10) {
        throw new Error('PAN must be exactly 10 characters.');
      }
      if (formData.pincode && !/^\d{6}$/.test(formData.pincode)) {
        throw new Error('Pincode must be exactly 6 digits.');
      }

      const token = localStorage.getItem('accessToken');
      if (!token) {
        toast({
          title: 'Authentication Error',
          description: 'Please log in to continue.',
          variant: 'destructive',
        });
        navigate('/login');
        return;
      }

      const response = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create client');
      }

      toast({
        title: 'Success',
        description: 'Client created successfully!',
      });

      // Reset form
      setFormData({
        client_name: '',
        gstin: '',
        pan: '',
        state: '',
        pincode: '',
      });

      // Refresh client list
      await fetchClients();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create client',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchClients = async () => {
    try {
      setLoadingClients(true);
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      const res = await fetch('/api/admin/clients', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to load clients');
      }

      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setClients(list);
    } catch (err) {
      console.error('Failed to fetch clients', err);
    } finally {
      setLoadingClients(false);
    }
  };

  useEffect(() => {
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/admin/dashboard')}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Create New Client</CardTitle>
            <CardDescription>Add a new client company to the system</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="client_name">Client Name *</Label>
                  <Input
                    id="client_name"
                    name="client_name"
                    value={formData.client_name}
                    onChange={handleInputChange}
                    required
                    placeholder="Enter client name"
                    className="text-lg"
                  />
                  <p className="text-sm text-muted-foreground">
                    Enter the name of the client company or organization
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="gstin">GSTIN</Label>
                    <Input
                      id="gstin"
                      name="gstin"
                      value={formData.gstin}
                      onChange={handleInputChange}
                      placeholder="Enter GSTIN"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pan">PAN</Label>
                    <Input
                      id="pan"
                      name="pan"
                      value={formData.pan}
                      onChange={handleInputChange}
                      placeholder="Enter PAN"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      name="state"
                      value={formData.state}
                      onChange={handleInputChange}
                      placeholder="Enter state"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pincode">Pincode

                    </Label>
                    <Input
                      id="pincode"
                      name="pincode"
                      value={formData.pincode}
                      onChange={handleInputChange}
                      placeholder="Enter pincode"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/admin/dashboard')}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create Client'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Client List</CardTitle>
            <CardDescription>Existing clients in the system</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingClients ? (
              <p className="text-sm text-muted-foreground">Loading clients...</p>
            ) : clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No clients found.</p>
            ) : (
              <div className="border rounded-md overflow-hidden">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-xs text-muted-foreground">ID</th>
                      <th className="px-3 py-2 text-left font-medium text-xs text-muted-foreground">Name</th>
                      <th className="px-3 py-2 text-left font-medium text-xs text-muted-foreground">Code</th>
                      <th className="px-3 py-2 text-right font-medium text-xs text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((client) => (
                      <tr key={client.client_id} className="border-t">
                        <td className="px-3 py-2 text-xs text-foreground">{client.client_id}</td>
                        <td className="px-3 py-2 text-xs text-foreground">{client.name ?? client.client_name ?? '-'}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{client.code ?? '-'}</td>
                        <td className="px-3 py-2 text-xs text-right space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-3 text-[11px]"
                            onClick={() => openEditModal(client)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-3 text-[11px] text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => handleDeleteClient(client)}
                          >
                            Delete
                          </Button>
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
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold">Edit Client</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit_client_name">Client Name *</Label>
                <Input
                  id="edit_client_name"
                  name="client_name"
                  value={formData.client_name}
                  onChange={handleInputChange}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_gstin">GSTIN (15 characters)</Label>
                  <Input
                    id="edit_gstin"
                    name="gstin"
                    value={formData.gstin}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_pan">PAN (10 characters)</Label>
                  <Input
                    id="edit_pan"
                    name="pan"
                    value={formData.pan}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_state">State</Label>
                  <Input
                    id="edit_state"
                    name="state"
                    value={formData.state}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_pincode">Pincode (6 digits)</Label>
                  <Input
                    id="edit_pincode"
                    name="pincode"
                    value={formData.pincode}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditModalOpen(false);
                  setEditingClient(null);
                }}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleEditSave}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Clients;
