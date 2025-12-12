import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Trash2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function ClearFaces() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function clearAllFaces() {
    try {
      setIsLoading(true);
      setResult(null);
      setError(null);

      const { data, error: fnError } = await supabase.functions.invoke("face-verify", {
        body: { action: "clear_collection" },
      });

      if (fnError) {
        setError(fnError.message);
        return;
      }

      if (data.success) {
        setResult(data.message);
      } else {
        setError(data.error || "Failed to clear faces");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-pink-800 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-white text-center mb-2">Clear Test Faces</h1>
        <p className="text-white/70 text-center text-sm mb-6">
          This will delete all faces from the AWS Rekognition collection. Use this for testing only.
        </p>

        {result && (
          <div className="bg-green-500/20 border border-green-500/40 rounded-lg p-4 mb-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0" />
            <p className="text-green-200 text-sm">{result}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-500/20 border border-red-500/40 rounded-lg p-4 mb-4">
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

        <Button
          onClick={clearAllFaces}
          disabled={isLoading}
          className="w-full py-5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold mb-4"
        >
          <Trash2 className="mr-2 h-5 w-5" />
          {isLoading ? "Clearing..." : "Clear All Test Faces"}
        </Button>

        <Button
          onClick={() => navigate("/")}
          variant="outline"
          className="w-full py-5 rounded-xl border-white/40 text-white hover:bg-white/10"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to App
        </Button>
      </div>
    </div>
  );
}
