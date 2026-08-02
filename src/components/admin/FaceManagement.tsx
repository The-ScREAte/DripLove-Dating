import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, CheckCircle2, Scan, RefreshCw, User, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getFaceReferenceCode } from "@/utils/faceReference";

interface Face {
  faceId: string;
  externalImageId: string;
  imageId: string;
  confidence: number;
  associatedUserId?: string | null;
  associatedEmail?: string | null;
  associatedName?: string | null;
}

const PAGE_SIZE = 30;

export default function FaceManagement() {
  const [isClearing, setIsClearing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingFaceId, setDeletingFaceId] = useState<string | null>(null);
  const [faces, setFaces] = useState<Face[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Load faces on mount
  useEffect(() => {
    loadFaces();
  }, []);

  async function loadFaces() {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fnError } = await supabase.functions.invoke("face-verify", {
        body: { action: "list_faces" },
      });

      if (fnError) {
        setError(fnError.message);
        return;
      }

      if (data.success) {
        setFaces(data.faces || []);
      } else {
        setError(data.error || "Failed to load faces");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteFace(faceId: string) {
    if (!confirm("Are you sure you want to delete this face? The user will be able to register again.")) {
      return;
    }

    try {
      setDeletingFaceId(faceId);

      const { data, error: fnError } = await supabase.functions.invoke("face-verify", {
        body: { action: "delete_face", faceId },
      });

      if (fnError) {
        toast({
          title: "Error",
          description: fnError.message,
          variant: "destructive",
        });
        return;
      }

      if (data.success) {
        toast({
          title: "Success",
          description: "Face deleted successfully",
        });
        // Refresh the list
        await loadFaces();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to delete face",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setDeletingFaceId(null);
    }
  }

  async function clearAllFaces() {
    if (!confirm("Are you sure you want to delete ALL registered faces? This cannot be undone.")) {
      return;
    }

    try {
      setIsClearing(true);
      setResult(null);
      setError(null);

      const { data, error: fnError } = await supabase.functions.invoke("face-verify", {
        body: { action: "clear_collection" },
      });

      if (fnError) {
        setError(fnError.message);
        toast({
          title: "Error",
          description: fnError.message,
          variant: "destructive",
        });
        return;
      }

      if (data.success) {
        setResult(data.message);
        setFaces([]);
        toast({
          title: "Success",
          description: data.message,
        });
      } else {
        setError(data.error || "Failed to clear faces");
        toast({
          title: "Error",
          description: data.error || "Failed to clear faces",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      toast({
        title: "Error",
        description: err.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsClearing(false);
    }
  }

  // Parse the externalImageId to get user name
  function parseUserInfo(externalImageId: string): { name: string; userId: string } {
    if (!externalImageId || externalImageId === 'Unknown') {
      return { name: 'Unknown User', userId: '' };
    }
    
    // Format is: FirstName_LastName_userId or just userId
    const parts = externalImageId.split('_');
    
    if (parts.length >= 3) {
      // Has name: FirstName_LastName_userId
      const firstName = parts[0].replace(/%20/g, ' ');
      const lastName = parts[1].replace(/%20/g, ' ');
      const userId = parts.slice(2).join('_');
      return { 
        name: `${firstName} ${lastName}`,
        userId: userId.substring(0, 8) + '...'
      };
    } else if (parts.length === 2) {
      // Maybe FirstName_userId
      const firstName = parts[0].replace(/%20/g, ' ');
      return {
        name: firstName,
        userId: parts[1].substring(0, 8) + '...'
      };
    }
    
    // Just an ID
    if (externalImageId.startsWith('temp_')) {
      return { 
        name: 'Temp User', 
        userId: externalImageId.replace('temp_', '').substring(0, 12) + '...'
      };
    }
    
    if (externalImageId.length > 20) {
      return { 
        name: 'Unknown User', 
        userId: externalImageId.substring(0, 8) + '...'
      };
    }
    
    return { name: externalImageId, userId: '' };
  }

  // Filter faces based on search query
  const filteredFaces = faces.filter(face => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    const { name, userId } = parseUserInfo(face.externalImageId);
    const associatedName = (face.associatedName || '').toLowerCase();
    const associatedEmail = (face.associatedEmail || '').toLowerCase();
    const associatedUserId = (face.associatedUserId || '').toLowerCase();
    const referenceCode = getFaceReferenceCode(face).toLowerCase();
    
    return (
      name.toLowerCase().includes(query) ||
      userId.toLowerCase().includes(query) ||
      associatedName.includes(query) ||
      associatedEmail.includes(query) ||
      associatedUserId.includes(query) ||
      referenceCode.includes(query) ||
      face.externalImageId.toLowerCase().includes(query) ||
      face.faceId.toLowerCase().includes(query)
    );
  });

  // Search always runs against the full loaded set above; only the rendered
  // list is paginated, for DOM performance with large collections.
  const visibleFaces = filteredFaces.slice(0, visibleCount);
  const hasMore = visibleCount < filteredFaces.length;

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    setVisibleCount(PAGE_SIZE);
  }

  function handleFacesListScroll(e: React.UIEvent<HTMLDivElement>) {
    if (!hasMore) return;
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
      setVisibleCount(count => Math.min(count + PAGE_SIZE, filteredFaces.length));
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Scan className="w-4 h-4" />
              Face Recognition Management
            </CardTitle>
            <p className="text-xs text-gray-600 mt-1">
              Manage AWS Rekognition face collection ({faces.length} registered)
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadFaces}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by reference code, name, email, or ID..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Info about image storage */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-800">
            <strong>Note:</strong> AWS Rekognition stores face vectors, not actual images.
            Names are saved with face data for identification.
          </p>
        </div>

        {/* Face List */}
        {filteredFaces.length > 0 && (
          <>
            <p className="text-xs text-gray-500">
              Showing {visibleFaces.length} of {filteredFaces.length}
              {searchQuery.trim() ? ` matching "${searchQuery}"` : ''}
            </p>
            <div className="space-y-2 max-h-80 overflow-y-auto" onScroll={handleFacesListScroll}>
            {visibleFaces.map((face) => {
              const { name, userId } = parseUserInfo(face.externalImageId);
              const displayName = face.associatedName || name;
              const displayId = face.associatedUserId
                ? `${face.associatedUserId.substring(0, 8)}...`
                : userId;
              const referenceCode = getFaceReferenceCode(face);
              return (
                <div
                  key={face.faceId}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center border-2 border-purple-200">
                      <User className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {displayName}
                      </p>
                      {displayId && (
                        <p className="text-xs text-gray-500">
                          ID: {displayId}
                        </p>
                      )}
                      {face.associatedEmail && (
                        <p className="text-xs text-gray-500">{face.associatedEmail}</p>
                      )}
                      <p className="text-xs text-gray-400">
                        Confidence: {face.confidence?.toFixed(1)}%
                      </p>
                      <p className="text-xs text-gray-400">
                        Reference code: {referenceCode}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteFace(face.faceId)}
                    disabled={deletingFaceId === face.faceId}
                    className="shrink-0"
                  >
                    {deletingFaceId === face.faceId ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              );
            })}
            </div>
            {hasMore && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setVisibleCount(count => Math.min(count + PAGE_SIZE, filteredFaces.length))}
              >
                Load {Math.min(PAGE_SIZE, filteredFaces.length - visibleCount)} more
              </Button>
            )}
          </>
        )}

        {filteredFaces.length === 0 && faces.length > 0 && (
          <div className="text-center py-6 text-gray-500 text-sm">
            No faces match "{searchQuery}"
          </div>
        )}

        {faces.length === 0 && !isLoading && (
          <div className="text-center py-6 text-gray-500 text-sm">
            No registered faces
          </div>
        )}

        {isLoading && (
          <div className="text-center py-6 text-gray-500 text-sm">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
            Loading faces...
          </div>
        )}

        {result && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
            <p className="text-xs text-green-800">{result}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-xs text-red-800">{error}</p>
          </div>
        )}

        <Button
          onClick={clearAllFaces}
          disabled={isClearing || faces.length === 0}
          variant="destructive"
          className="w-full"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {isClearing ? "Clearing..." : "Clear All Registered Faces"}
        </Button>
      </CardContent>
    </Card>
  );
}
