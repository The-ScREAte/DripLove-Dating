import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Upload } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { compressImage } from '@/utils/imageCompression';

interface Ad {
  id: string;
  image_url: string;
  name: string;
  about: string;
  link: string | null;
  link_as: string | null;
  created_at: string;
}

const AdsManagement = () => {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    about: '',
    image_url: '',
    link: '',
    link_as: 'Click here'
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchAds();
  }, []);

  const fetchAds = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAds(data || []);
    } catch (error) {
      console.error('Error fetching ads:', error);
      toast({
        title: 'Error',
        description: 'Failed to load ads',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const compressedFile = await compressImage(file);

      const mimeToExt: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif'
      };
      const fileExt = mimeToExt[compressedFile.type] || 'jpg';
      const fileName = `${Math.random().toString(36).slice(2)}.${fileExt}`;
      const filePath = `ads/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('user-photos')
        .upload(filePath, compressedFile, {
          contentType: compressedFile.type,
          cacheControl: '3600'
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('user-photos')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, image_url: publicUrl }));
      toast({
        title: 'Success',
        description: 'Image uploaded successfully'
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: 'Error',
        description: 'Failed to upload image',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.about || !formData.image_url) {
      toast({
        title: 'Error',
        description: 'Please fill all fields and upload an image',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('ads')
        .insert({
          name: formData.name,
          about: formData.about,
          image_url: formData.image_url,
          link: formData.link || null,
          link_as: formData.link_as || 'Click here'
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Ad created successfully'
      });

      setFormData({ name: '', about: '', image_url: '', link: '', link_as: 'Click here' });
      fetchAds();
    } catch (error) {
      console.error('Error creating ad:', error);
      toast({
        title: 'Error',
        description: 'Failed to create ad',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this ad?')) return;

    try {
      const { error } = await supabase
        .from('ads')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Ad deleted successfully'
      });

      fetchAds();
    } catch (error) {
      console.error('Error deleting ad:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete ad',
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-semibold mb-4">Create New Ad</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter ad name"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">About</label>
              <Textarea
                value={formData.about}
                onChange={(e) => setFormData(prev => ({ ...prev, about: e.target.value }))}
                placeholder="Enter ad description"
                rows={4}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Image</label>
              <div className="flex items-center gap-4">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploading}
                  className="flex-1"
                />
                {formData.image_url && (
                  <img
                    loading="lazy"
                    decoding="async"
                    src={formData.image_url} 
                    alt="Preview" 
                    className="w-20 h-20 object-cover rounded"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Link (Optional)</label>
              <Input
                value={formData.link}
                onChange={(e) => setFormData(prev => ({ ...prev, link: e.target.value }))}
                placeholder="Enter link URL"
                type="url"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Link Display Text</label>
              <Input
                value={formData.link_as}
                onChange={(e) => setFormData(prev => ({ ...prev, link_as: e.target.value }))}
                placeholder="e.g., Click here"
              />
            </div>

            <Button 
              type="submit" 
              disabled={loading || uploading}
              className="w-full"
            >
              {loading ? 'Creating...' : 'Create Ad'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-lg font-semibold mb-4">Saved Ads</h3>
        {loading ? (
          <p className="text-center text-gray-500">Loading ads...</p>
        ) : ads.length === 0 ? (
          <p className="text-center text-gray-500">No ads yet</p>
        ) : (
          <div className="grid gap-4">
            {ads.map((ad) => (
              <Card key={ad.id}>
                <CardContent className="pt-6">
                  <div className="flex gap-4">
                    <img
                      loading="lazy"
                      decoding="async"
                      src={ad.image_url} 
                      alt={ad.name}
                      className="w-24 h-24 object-cover rounded"
                    />
                    <div className="flex-1">
                      <h4 className="font-semibold">{ad.name}</h4>
                      <p className="text-sm text-gray-600 mt-1">{ad.about}</p>
                      {ad.link && (
                        <a 
                          href={ad.link} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline mt-1 block"
                        >
                          {ad.link_as || 'Click here'}
                        </a>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(ad.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => handleDelete(ad.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdsManagement;
