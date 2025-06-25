
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { LogOut, AlertTriangle, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AccountActionsProps {
  currentUser: any;
  onLogout: () => void;
}

const AccountActions = ({ currentUser, onLogout }: AccountActionsProps) => {
  const [deletingAccount, setDeletingAccount] = useState(false);
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      onLogout();
      toast({
        title: "Logged out",
        description: "See you again soon!",
      });
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    
    try {
      const { error } = await supabase.rpc('delete_user_and_data', {
        user_id_to_delete: currentUser.id
      });

      if (error) throw error;

      toast({
        title: "Account deleted",
        description: "Your account and all associated data have been permanently deleted.",
      });

      await supabase.auth.signOut();
      onLogout();
    } catch (error: any) {
      console.error('Error deleting account:', error);
      toast({
        title: "Error",
        description: "Failed to delete account. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Support Email */}
        <div className="bg-gray-50 p-4 rounded-lg border">
          <div className="flex items-center space-x-2 mb-2">
            <Mail className="w-4 h-4 text-pink-600" />
            <span className="font-medium text-gray-700">Need Help?</span>
          </div>
          <p className="text-sm text-gray-600 mb-2">
            Contact our support team for any questions or assistance:
          </p>
          <a 
            href="mailto:support@afrovibe.com" 
            className="text-pink-600 hover:text-pink-700 font-medium hover:underline"
          >
            support@afrovibe.com
          </a>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <Button 
            onClick={handleLogout}
            variant="outline"
            className="flex items-center justify-center space-x-2 border-gray-300 text-gray-700 hover:bg-gray-50 w-full sm:w-auto"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="destructive"
                className="flex items-center justify-center space-x-2 w-full sm:w-auto"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>Delete Account</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="sm:max-w-lg">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Account</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to permanently delete your account? This action will:
                  <ul className="list-disc ml-6 mt-2 space-y-1">
                    <li>Delete your profile and all personal information</li>
                    <li>Remove all your photos</li>
                    <li>Delete all your matches and conversations</li>
                    <li>Remove all likes given and received</li>
                  </ul>
                  <br />
                  <strong>This action cannot be undone.</strong>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  disabled={deletingAccount}
                  onClick={handleDeleteAccount}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {deletingAccount ? 'Deleting...' : 'Delete Account Permanently'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
};

export default AccountActions;
