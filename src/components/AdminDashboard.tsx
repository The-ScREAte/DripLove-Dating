
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Users, Heart, MessageCircle, Shield, UserX, Plus, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface AdminDashboardProps {
  currentUser: any;
}

const AdminDashboard = ({ currentUser }: AdminDashboardProps) => {
  const [stats, setStats] = useState<any>({});
  const [users, setUsers] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser1, setSelectedUser1] = useState('');
  const [selectedUser2, setSelectedUser2] = useState('');
  const [isCreateMatchOpen, setIsCreateMatchOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchStats();
    fetchUsers();
    fetchBlocks();
  }, []);

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase.rpc('get_app_stats');
      if (error) throw error;
      setStats(data || {});
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchBlocks = async () => {
    try {
      const { data, error } = await supabase
        .from('blocks')
        .select(`
          *,
          blocker:profiles!blocks_blocker_id_fkey(first_name, last_name),
          blocked:profiles!blocks_blocked_id_fkey(first_name, last_name)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setBlocks(data || []);
    } catch (error) {
      console.error('Error fetching blocks:', error);
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      const { error } = await supabase.rpc('delete_user_and_data', {
        user_id_to_delete: userId
      });
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "User deleted successfully",
      });
      
      fetchUsers();
      fetchStats();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: "Error",
        description: "Failed to delete user",
        variant: "destructive",
      });
    }
  };

  const createManualMatch = async () => {
    if (!selectedUser1 || !selectedUser2 || selectedUser1 === selectedUser2) {
      toast({
        title: "Error",
        description: "Please select two different users",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('matches')
        .insert({
          user1_id: selectedUser1 < selectedUser2 ? selectedUser1 : selectedUser2,
          user2_id: selectedUser1 < selectedUser2 ? selectedUser2 : selectedUser1,
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Match created successfully",
      });

      setSelectedUser1('');
      setSelectedUser2('');
      setIsCreateMatchOpen(false);
      fetchStats();
    } catch (error) {
      console.error('Error creating match:', error);
      toast({
        title: "Error",
        description: "Failed to create match",
        variant: "destructive",
      });
    }
  };

  const filteredUsers = users.filter(user => 
    user.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
          Admin Dashboard
        </h1>
        <Dialog open={isCreateMatchOpen} onOpenChange={setIsCreateMatchOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-pink-500 to-purple-600">
              <Plus className="w-4 h-4 mr-2" />
              Create Match
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Manual Match</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Select First User</Label>
                <select 
                  value={selectedUser1} 
                  onChange={(e) => setSelectedUser1(e.target.value)}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Choose user...</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.first_name} {user.last_name} - {user.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Select Second User</Label>
                <select 
                  value={selectedUser2} 
                  onChange={(e) => setSelectedUser2(e.target.value)}
                  className="w-full p-2 border rounded"
                >
                  <option value="">Choose user...</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.first_name} {user.last_name} - {user.email}
                    </option>
                  ))}
                </select>
              </div>
              <Button onClick={createManualMatch} className="w-full">
                Create Match
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_users || 0}</div>
            <p className="text-xs text-muted-foreground">
              +{stats.new_users_this_week || 0} this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Matches</CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_matches || 0}</div>
            <p className="text-xs text-muted-foreground">
              +{stats.matches_this_week || 0} this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_messages || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats.active_users_today || 0} active today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Blocked Users</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_blocks || 0}</div>
            <p className="text-xs text-muted-foreground">
              Total blocks
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Users Management */}
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <div className="flex items-center space-x-2">
            <Search className="w-4 h-4" />
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Join Date</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.first_name} {user.last_name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.city}, {user.country}</TableCell>
                  <TableCell>
                    {new Date(user.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {user.is_admin && <Badge variant="secondary">Admin</Badge>}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteUser(user.id)}
                    >
                      <UserX className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Blocked Users */}
      <Card>
        <CardHeader>
          <CardTitle>Blocked Users Report</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Blocker</TableHead>
                <TableHead>Blocked User</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {blocks.map((block) => (
                <TableRow key={block.id}>
                  <TableCell>
                    {block.blocker?.first_name} {block.blocker?.last_name}
                  </TableCell>
                  <TableCell>
                    {block.blocked?.first_name} {block.blocked?.last_name}
                  </TableCell>
                  <TableCell>{block.reason || 'No reason provided'}</TableCell>
                  <TableCell>
                    {new Date(block.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;
