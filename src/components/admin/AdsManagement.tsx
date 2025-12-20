import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Upload, Video, Image as ImageIcon, Volume2, VolumeX, Play } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { compressImage } from '@/utils/imageCompression';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Ad {
  id: string;
  image_url: string;
  video_url: string | null;
  media_type: string;
  name: string;
  about: string;
  link: string | null;
  link_as: string | null;
  created_at: string;
  target_countries: string[];
}

// Country options
const COUNTRY_OPTIONS = [
  { code: 'GH', name: 'Ghana' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'KE', name: 'Kenya' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'UG', name: 'Uganda' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'RW', name: 'Rwanda' },
];

const AdsManagement = () => {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    about: '',
    image_url: '',
    video_url: '',
    media_type: 'image',
    link: '',
    link_as: 'Click here',
    target_countries: [] as string[]
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
      setAds((data as Ad[]) || []);
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

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 50MB for video)
    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: 'Error',
        description: 'Video must be smaller than 50MB',
        variant: 'destructive'
      });
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop() || 'mp4';
      const fileName = `${Math.random().toString(36).slice(2)}.${fileExt}`;
      const filePath = `ads/videos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('user-photos')
        .upload(filePath, file, {
          contentType: file.type,
          cacheControl: '3600'
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('user-photos')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, video_url: publicUrl }));
      toast({
        title: 'Success',
        description: 'Video uploaded successfully'
      });
    } catch (error) {
      console.error('Error uploading video:', error);
      toast({
        title: 'Error',
        description: 'Failed to upload video',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.about) {
      toast({
        title: 'Error',
        description: 'Please fill all required fields',
        variant: 'destructive'
      });
      return;
    }

    if (formData.media_type === 'image' && !formData.image_url) {
      toast({
        title: 'Error',
        description: 'Please upload an image',
        variant: 'destructive'
      });
      return;
    }

    if (formData.media_type === 'video' && !formData.video_url) {
      toast({
        title: 'Error',
        description: 'Please upload a video',
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
          image_url: formData.image_url || 'https://via.placeholder.com/400x300',
          video_url: formData.video_url || null,
          media_type: formData.media_type,
          link: formData.link || null,
          link_as: formData.link_as || 'Click here',
          target_countries: formData.target_countries
        } as any);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Ad created successfully'
      });

      setFormData({ name: '', about: '', image_url: '', video_url: '', media_type: 'image', link: '', link_as: 'Click here', target_countries: [] });
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
              <label className="block text-sm font-medium mb-2">Media Type</label>
              <Select 
                value={formData.media_type} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, media_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select media type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" />
                      Image
                    </div>
                  </SelectItem>
                  <SelectItem value="video">
                    <div className="flex items-center gap-2">
                      <Video className="w-4 h-4" />
                      Video
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.media_type === 'image' && (
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
            )}

            {formData.media_type === 'video' && (
              <div>
                <label className="block text-sm font-medium mb-2">Video (max 50MB)</label>
                <div className="flex items-center gap-4">
                  <Input
                    type="file"
                    accept="video/*"
                    onChange={handleVideoUpload}
                    disabled={uploading}
                    className="flex-1"
                  />
                  {formData.video_url && (
                    <div className="w-20 h-20 bg-gray-100 rounded flex items-center justify-center">
                      <Play className="w-8 h-8 text-gray-500" />
                    </div>
                  )}
                </div>
              </div>
            )}

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

            <div>
              <label className="block text-sm font-medium mb-2">Target Countries (leave empty for all)</label>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border rounded-md">
                {COUNTRY_OPTIONS.map((country) => (
                  <label key={country.code} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={formData.target_countries.includes(country.code)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData(prev => ({ ...prev, target_countries: [...prev.target_countries, country.code] }));
                        } else {
                          setFormData(prev => ({ ...prev, target_countries: prev.target_countries.filter(c => c !== country.code) }));
                        }
                      }}
                      className="rounded"
                    />
                    {country.name}
                  </label>
                ))}
              </div>
              {formData.target_countries.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Selected: {formData.target_countries.map(c => COUNTRY_OPTIONS.find(o => o.code === c)?.name).join(', ')}
                </p>
              )}
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
                    {ad.media_type === 'video' && ad.video_url ? (
                      <div className="w-24 h-24 bg-gray-100 rounded flex items-center justify-center relative">
                        <Video className="w-8 h-8 text-gray-500" />
                        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1 rounded">
                          Video
                        </div>
                      </div>
                    ) : (
                      <img
                        loading="lazy"
                        decoding="async"
                        src={ad.image_url} 
                        alt={ad.name}
                        className="w-24 h-24 object-cover rounded"
                      />
                    )}
                    <div className="flex-1">
                      <h4 className="font-semibold">{ad.name}</h4>
                      <p className="text-sm text-gray-600 mt-1">{ad.about}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {ad.media_type === 'video' ? (
                          <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded">Video</span>
                        ) : (
                          <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded">Image</span>
                        )}
                        {ad.target_countries && ad.target_countries.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {ad.target_countries.map((code) => (
                              <span key={code} className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded">
                                {COUNTRY_OPTIONS.find(c => c.code === code)?.name || code}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">All countries</span>
                        )}
                      </div>
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
