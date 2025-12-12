import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, CheckCircle2, AlertTriangle, Scan, RefreshCw, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Face {
  faceId: string;
  externalImageId: string;
  imageId: string;
  confidence: number;
}

export default function FaceManagement() {
  const [isClearing, setIsClearing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [deletingFaceId, setDeletingFaceId] = useState<string | null>(null);
  const [faces, setFaces] = useState<Face[]>([]);
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
  function parseUserName(externalImageId: string): string {
    if (!externalImageId || externalImageId === 'Unknown') return 'Unknown User';
    
    // Format is: Name_Surname_userId or just userId
    const parts = externalImageId.split('_');
    if (parts.length >= 3) {
      // Remove the last part (userId) and join the rest
      const nameParts = parts.slice(0, -1);
      return nameParts.join(' ');
    }
    // If it's just an ID, return it shortened
    if (externalImageId.length > 20) {
      return externalImageId.substring(0, 8) + '...';
    }
    return externalImageId;
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
        {/* Face List */}
        {faces.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {faces.map((face) => (
              <div
                key={face.faceId}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <User className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {parseUserName(face.externalImageId)}
                    </p>
                    <p className="text-xs text-gray-500">
                      Confidence: {face.confidence?.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteFace(face.faceId)}
                  disabled={deletingFaceId === face.faceId}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {faces.length === 0 && !isLoading && (
          <div className="text-center py-6 text-gray-500 text-sm">
            No registered faces
          </div>
        )}

        {isLoading && (
          <div className="text-center py-6 text-gray-500 text-sm">
            Loading faces...
          </div>
        )}

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-yellow-800">
              <p className="font-medium">Warning</p>
              <p>Deleting a face will allow that user to register again with face verification.</p>
            </div>
          </div>
        </div>

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
