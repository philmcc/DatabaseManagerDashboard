import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser } from "@/hooks/use-user";
import { useLocation } from "wouter";

export default function Home() {
  const [, setLocation] = useLocation();
  const { user } = useUser();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-center bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
            DBA Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center">
            <Button
              size="lg"
              className="w-full max-w-xs"
              onClick={() => setLocation(user ? "/dashboard" : "/auth")}
            >
              {user ? "Go to Dashboard" : "Login"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
