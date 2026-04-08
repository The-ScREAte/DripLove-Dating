import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Eye, Trash2, CheckCircle, XCircle, Clock, AlertTriangle, User } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import ImageViewer from '@/components/ImageViewer';
import { optimizeImageUrl } from '@/utils/imageOptimizer';

interface PendingImage {
  id: string;
  image_url: string;
  is_approved: boolean;
  moderation_status: string;
  moderation_notes?: string;
  created_at: string;
  user_id: string;
  profile?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface ReportedImage {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  image_url: string;
  reason: string;
  status: string;
  reported_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  admin_notes?: string;
  reporter_profile?: {
    first_name: string;
    last_name: string;
    email: string;
  };
  reported_user_profile?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface ImageModerationPanelProps {
  onViewProfile?: (userId: string) => void;
}

const ImageModerationPanel = ({ onViewProfile }: ImageModerationPanelProps) => {
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [reportedImages, setReportedImages] = useState<ReportedImage[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingReported, setLoadingReported] = useState(false);
  const [approvingImages, setApprovingImages] = useState<Record<string, boolean>>({});
  const [rejectingImages, setRejectingImages] = useState<Record<string, boolean>>({});
  const [processingReports, setProcessingReports] = useState<Record<string, boolean>>({});
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);
  const { toast } = useToast();
  
  // Get current admin user for push notifications
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);
  const { sendAdminNotification } = usePushNotifications(currentAdminId || undefined);

  useEffect(() => {
    const getCurrentAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentAdminId(user.id);
      }
    };
    getCurrentAdmin();
  }, []);

  const fetchPendingImages = useCallback(async () => {
    try {
      setLoadingPending(true);
      const { data, error } = await supabase
        .from('user_images')
        .select(`
          id,
          image_url,
          is_approved,
          moderation_status,
          moderation_notes,
          created_at,
          user_id
        `)
        .or('is_approved.eq.false,moderation_status.eq.pending')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch user profiles for these images
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(img => img.user_id))];
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', userIds);

        if (profilesError) throw profilesError;

        const imagesWithProfiles = data.map(img => ({
          ...img,
          profile: profiles?.find(p => p.id === img.user_id)
        }));

        setPendingImages(imagesWithProfiles);
      } else {
        setPendingImages([]);
      }
    } catch (error) {
      console.error('Error fetching pending images:', error);
      toast({
        title: 'Error',
        description: 'Failed to load pending images',
        variant: 'destructive'
      });
    } finally {
      setLoadingPending(false);
    }
  }, [toast]);

  const fetchReportedImages = useCallback(async () => {
    try {
      setLoadingReported(true);
      const { data, error } = await supabase
        .from('reported_images')
        .select('*')
        .eq('status', 'pending') // Only show pending reports, not resolved ones
        .order('reported_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch profiles for reporters and reported users
      if (data && data.length > 0) {
        const reporterIds = [...new Set(data.map(img => img.reporter_id))];
        const reportedUserIds = [...new Set(data.map(img => img.reported_user_id))];
        const allUserIds = [...new Set([...reporterIds, ...reportedUserIds])];

        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', allUserIds);

        if (profilesError) throw profilesError;

        const reportsWithProfiles = data.map(report => ({
          ...report,
          reporter_profile: profiles?.find(p => p.id === report.reporter_id),
          reported_user_profile: profiles?.find(p => p.id === report.reported_user_id)
        }));

        setReportedImages(reportsWithProfiles);
      } else {
        setReportedImages([]);
      }
    } catch (error) {
      console.error('Error fetching reported images:', error);
      toast({
        title: 'Error',
        description: 'Failed to load reported images',
        variant: 'destructive'
      });
    } finally {
      setLoadingReported(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPendingImages();
    fetchReportedImages();
  }, [fetchPendingImages, fetchReportedImages]);

  const handleApproveImage = async (imageId: string) => {
    try {
      setApprovingImages(prev => ({ ...prev, [imageId]: true }));

      // Get image details before approving
      const imageToApprove = pendingImages.find(img => img.id === imageId);
      
      const { error } = await supabase.rpc('approve_image', {
        image_id: imageId,
        admin_notes: 'Approved by admin'
      });

      if (error) throw error;

      // Send push notification to user
      if (imageToApprove?.user_id) {
        try {
          await sendAdminNotification(
            '✅ Photos Approved',
            'Your images have been approved! Keep swiping and have fun finding someone made just for you.',
            imageToApprove.user_id
          );
          void 0;
        } catch (notifError) {
          console.error('📤 Failed to send approval notification:', notifError);
          // Don't fail the approval if notification fails
        }
      }

      toast({
        title: 'Success',
        description: 'Image approved successfully'
      });

      // Remove the approved image from state immediately
      setPendingImages(prev => prev.filter(img => img.id !== imageId));
    } catch (error) {
      console.error('Error approving image:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve image',
        variant: 'destructive'
      });
    } finally {
      setApprovingImages(prev => ({ ...prev, [imageId]: false }));
    }
  };

  const handleRejectImage = async (imageId: string) => {
    try {
      setRejectingImages(prev => ({ ...prev, [imageId]: true }));

      // Get image details before rejecting
      const imageToReject = pendingImages.find(img => img.id === imageId);

      // First get the image URL before deleting from database
      const { data: imageData } = await supabase
        .from('user_images')
        .select('image_url')
        .eq('id', imageId)
        .single();

      // Delete from database using RPC function
      const { error } = await supabase.rpc('reject_image', {
        image_id: imageId,
        admin_notes: 'Rejected by admin - inappropriate content'
      });

      if (error) throw error;

      // Send push notification to user
      if (imageToReject?.user_id) {
        try {
          await sendAdminNotification(
            '⚠️ Photo Rejected',
            'Your image has been rejected because it\'s either inappropriate or not a real representation of yourself. This violates our terms and conditions and if it continues will result in deletion of your account.',
            imageToReject.user_id
          );
          void 0;
        } catch (notifError) {
          console.error('📤 Failed to send rejection notification:', notifError);
          // Don't fail the rejection if notification fails
        }
      }

      // Delete from storage if we have the image URL
      if (imageData?.image_url) {
        try {
          const fileName = imageData.image_url.split('/').pop();
          if (fileName) {
            const { error: storageError } = await supabase.storage
              .from('user-photos')
              .remove([fileName]);
            
            if (storageError) {
              console.error('Storage deletion error:', storageError);
              // Continue even if storage deletion fails
            }
          }
        } catch (storageError) {
          console.error('Storage deletion exception:', storageError);
          // Continue even if storage deletion fails
        }
      }

      toast({
        title: 'Success',
        description: 'Image rejected and permanently removed from database and storage'
      });

      // Remove the rejected image from state immediately
      setPendingImages(prev => prev.filter(img => img.id !== imageId));
    } catch (error) {
      console.error('Error rejecting image:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject image',
        variant: 'destructive'
      });
    } finally {
      setRejectingImages(prev => ({ ...prev, [imageId]: false }));
    }
  };

  const handleIgnoreReport = async (reportId: string) => {
    try {
      setProcessingReports(prev => ({ ...prev, [reportId]: true }));

      const { error } = await supabase
        .from('reported_images')
        .update({
          status: 'ignored',
          reviewed_by: (await supabase.auth.getUser()).data.user?.id,
          reviewed_at: new Date().toISOString(),
          admin_notes: 'Report reviewed and ignored by admin'
        })
        .eq('id', reportId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Report ignored successfully'
      });

      fetchReportedImages();
    } catch (error) {
      console.error('Error ignoring report:', error);
      toast({
        title: 'Error',
        description: 'Failed to ignore report',
        variant: 'destructive'
      });
    } finally {
      setProcessingReports(prev => ({ ...prev, [reportId]: false }));
    }
  };

  const handleDeleteReportedImage = async (reportId: string, imageUrl: string, reportedUserId: string) => {
    try {
      setProcessingReports(prev => ({ ...prev, [reportId]: true }));

      // Delete from database - try specific user/image combination first
      const { error: deleteError } = await supabase
        .from('user_images')
        .delete()
        .eq('image_url', imageUrl)
        .eq('user_id', reportedUserId);

      if (deleteError) {
        console.error('Delete specific image error:', deleteError);
        
        // Try deleting by URL only as fallback
        const { error: deleteByUrlError } = await supabase
          .from('user_images')
          .delete()
          .eq('image_url', imageUrl);

        if (deleteByUrlError) {
          console.error('Delete by URL error:', deleteByUrlError);
          throw deleteByUrlError;
        }
      }

      // Send push notification to user about image deletion
      try {
        await sendAdminNotification(
          '⚠️ Photo Rejected',
          'Your image has been rejected because it\'s either inappropriate or not a real representation of yourself. This violates our terms and conditions and if it continues will result in deletion of your account.',
          reportedUserId
        );
        void 0;
      } catch (notifError) {
        console.error('📤 Failed to send deletion notification:', notifError);
        // Don't fail the deletion if notification fails
      }

      // Delete from storage
      try {
        const fileName = imageUrl.split('/').pop();
        if (fileName) {
          const { error: storageError } = await supabase.storage
            .from('user-photos')
            .remove([fileName]);
          
          if (storageError) {
            console.error('Storage deletion error:', storageError);
            // Continue even if storage deletion fails
          }
        }
      } catch (storageError) {
        console.error('Storage deletion exception:', storageError);
        // Continue even if storage deletion fails
      }

      // Update the report status
      const { error: updateReportError } = await supabase
        .from('reported_images')
        .update({
          status: 'resolved',
          reviewed_by: (await supabase.auth.getUser()).data.user?.id,
          reviewed_at: new Date().toISOString(),
          admin_notes: 'Image permanently deleted by admin due to inappropriate content'
        })
        .eq('id', reportId);

      if (updateReportError) {
        console.error('Update report error:', updateReportError);
        throw updateReportError;
      }

      toast({
        title: 'Success',
        description: 'Inappropriate image permanently deleted from database and storage'
      });

      // Refresh both lists
      fetchReportedImages();
      fetchPendingImages();
    } catch (error) {
      console.error('Error deleting reported image:', error);
      toast({
        title: 'Error',
        description: 'Failed to permanently delete reported image',
        variant: 'destructive'
      });
    } finally {
      setProcessingReports(prev => ({ ...prev, [reportId]: false }));
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'resolved':
        return <Badge variant="secondary" className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Resolved</Badge>;
      case 'ignored':
        return <Badge variant="secondary" className="bg-gray-100 text-gray-800"><XCircle className="w-3 h-3 mr-1" />Ignored</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleImageClick = (imageUrl: string) => {
    setViewerImages([imageUrl]);
    setViewerInitialIndex(0);
    setViewerOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4 text-blue-600" />
        <h2 className="text-base font-semibold">Image Moderation</h2>
      </div>

      <ImageViewer
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        images={viewerImages}
        initialIndex={viewerInitialIndex}
      />

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-9">
          <TabsTrigger value="pending" className="flex items-center gap-2 text-xs">
            <Clock className="w-3 h-3" />
            Pending Approval ({pendingImages.length})
          </TabsTrigger>
          <TabsTrigger value="reported" className="flex items-center gap-2 text-xs">
            <AlertTriangle className="w-3 h-3" />
            Reported Images ({reportedImages.filter(r => r.status === 'pending').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4" />
                Images Pending Approval
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingPending ? (
                <div className="text-center py-6 text-sm">Loading pending images...</div>
              ) : pendingImages.length === 0 ? (
                <div className="text-center py-6 text-gray-500 text-sm">No images pending approval</div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {pendingImages.map((image) => (
                    <Card key={image.id} className="border-yellow-200">
                      <CardContent className="p-2">
                        <div className="relative mb-2">
                          <img
                            loading="lazy"
                            decoding="async"
                            src={optimizeImageUrl(image.image_url, { width: 300, quality: 50 })}
                            alt="Pending approval"
                            className="w-full h-32 object-cover rounded-md cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => handleImageClick(image.image_url)}
                          />
                          <Badge className="absolute top-1 right-1 bg-yellow-500 text-[10px] h-4">
                            Pending
                          </Badge>
                        </div>
                        
                        <div className="space-y-1 mb-2">
                          <div className="flex items-center gap-1 text-[10px]">
                            <User className="w-2.5 h-2.5" />
                            <span className="font-medium truncate">
                              {image.profile ? 
                                `${image.profile.first_name} ${image.profile.last_name}` : 
                                'Unknown User'
                              }
                            </span>
                          </div>
                          <div className="text-[9px] text-gray-500">
                            {new Date(image.created_at).toLocaleDateString()}
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          {onViewProfile && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-blue-600 hover:text-blue-700 text-[10px] h-6"
                              onClick={() => onViewProfile(image.user_id)}
                            >
                              <Eye className="w-2.5 h-2.5 mr-1" />
                              View User
                            </Button>
                          )}
                          <Button
                            size="sm"
                            className="w-full bg-green-600 hover:bg-green-700 text-[10px] h-6"
                            onClick={() => handleApproveImage(image.id)}
                            disabled={approvingImages[image.id]}
                          >
                            <CheckCircle className="w-2.5 h-2.5 mr-1" />
                            {approvingImages[image.id] ? 'Approving...' : 'Approve'}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="w-full text-[10px] h-6"
                            onClick={() => handleRejectImage(image.id)}
                            disabled={rejectingImages[image.id]}
                          >
                            <Trash2 className="w-2.5 h-2.5 mr-1" />
                            {rejectingImages[image.id] ? 'Rejecting...' : 'Reject'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reported" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4" />
                Reported Images
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingReported ? (
                <div className="text-center py-6 text-sm">Loading reported images...</div>
              ) : reportedImages.length === 0 ? (
                <div className="text-center py-6 text-gray-500 text-sm">No reported images</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {reportedImages.map((report) => (
                    <Card key={report.id} className="border-red-200">
                      <CardContent className="p-3">
                        <div className="relative mb-2">
                          <img
                            loading="lazy"
                            decoding="async"
                            src={optimizeImageUrl(report.image_url, { width: 300, quality: 50 })}
                            alt="Reported content"
                            className="w-full h-40 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => handleImageClick(report.image_url)}
                          />
                          {getStatusBadge(report.status)}
                        </div>
                        
                        <div className="space-y-1 mb-2">
                          <div className="text-xs">
                            <div className="font-medium text-red-600">Reported by:</div>
                            <div className="text-[11px]">
                              {report.reporter_profile ? 
                                `${report.reporter_profile.first_name} ${report.reporter_profile.last_name}` : 
                                'Unknown User'
                              }
                            </div>
                          </div>
                          
                          <div className="text-xs">
                            <div className="font-medium text-gray-700">Image owner:</div>
                            <div className="text-[11px]">
                              {report.reported_user_profile ? 
                                `${report.reported_user_profile.first_name} ${report.reported_user_profile.last_name}` : 
                                'Unknown User'
                              }
                            </div>
                          </div>
                          
                          <div className="text-xs">
                            <div className="font-medium">Reason:</div>
                            <div className="text-[11px]">{report.reason || 'No reason provided'}</div>
                          </div>
                          
                          <div className="text-[11px] text-gray-500">
                            Reported: {new Date(report.reported_at).toLocaleDateString()}
                          </div>

                          {report.reviewed_at && (
                            <div className="text-[11px] text-gray-500">
                              Reviewed: {new Date(report.reviewed_at).toLocaleDateString()}
                            </div>
                          )}
                        </div>

                        {report.status === 'pending' && (
                          <div className="flex flex-col gap-2">
                            {onViewProfile && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full text-blue-600 hover:text-blue-700 text-xs h-7"
                                onClick={() => onViewProfile(report.reported_user_id)}
                              >
                                <Eye className="w-3 h-3 mr-1" />
                                View User
                              </Button>
                            )}
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 text-xs h-8"
                                onClick={() => handleIgnoreReport(report.id)}
                                disabled={processingReports[report.id]}
                              >
                                <XCircle className="w-3 h-3 mr-1" />
                                {processingReports[report.id] ? 'Ignoring...' : 'Ignore'}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="flex-1 text-xs h-8"
                                onClick={() => handleDeleteReportedImage(report.id, report.image_url, report.reported_user_id)}
                                disabled={processingReports[report.id]}
                              >
                                <Trash2 className="w-3 h-3 mr-1" />
                                {processingReports[report.id] ? 'Deleting...' : 'Delete'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ImageModerationPanel;