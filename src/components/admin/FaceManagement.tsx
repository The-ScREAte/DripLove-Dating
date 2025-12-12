import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, CheckCircle2, AlertTriangle, Scan } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function FaceManagement() {
  const [isClearing, setIsClearing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Scan className="w-4 h-4" />
          Face Recognition Management
        </CardTitle>
        <p className="text-xs text-gray-600 mt-1">
          Manage AWS Rekognition face collection for user verification
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-yellow-800">
              <p className="font-medium">Warning</p>
              <p>Clearing faces will allow previously registered users to register again with face verification. Use this only for testing or when absolutely necessary.</p>
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
          disabled={isClearing}
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
