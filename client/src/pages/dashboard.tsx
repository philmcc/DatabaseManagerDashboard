import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Settings, LogOut, Database } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import BaseLayout from "@/components/layout/base-layout";
import { SelectDatabaseConnection } from "@db/schema";

export default function Dashboard() {
  const { user, logout } = useUser();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: databases = [], isLoading } = useQuery<SelectDatabaseConnection[]>({
    queryKey: ['/api/databases'],
    enabled: !!user,
  });

  const { mutate: testConnection, isPending: isTestingConnection } = useMutation({
    mutationFn: async (databaseId: number) => {
      const res = await fetch(`/api/databases/${databaseId}/test`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }

      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const handleLogout = async () => {
    try {
      const result = await logout();
      if (result.ok) {
        setLocation("/");
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.message,
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to logout",
      });
    }
  };

  return (
    <BaseLayout>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">
            Welcome {user?.fullName || user?.username}
          </h1>
          <div className="space-x-2">
            <Button
              variant="outline"
              onClick={() => setLocation("/profile-settings")}
            >
              <Settings className="mr-2 h-4 w-4" />
              Profile Settings
            </Button>
            <Button
              variant="outline"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  Loading databases...
                </p>
              </CardContent>
            </Card>
          ) : databases.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  No databases added yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            databases.map((db) => (
              <Card key={db.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {db.name}
                  </CardTitle>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground">
                    <p>{db.databaseName} @ {db.host}:{db.port}</p>
                    <p>Username: {db.username}</p>
                  </div>
                  <div className="mt-2 space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation(`/databases/${db.id}/edit`)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isTestingConnection}
                      onClick={() => testConnection(db.id)}
                    >
                      {isTestingConnection ? "Testing..." : "Test Connection"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Button
          className="mt-4"
          onClick={() => setLocation("/databases/new")}
        >
          <Database className="mr-2 h-4 w-4" />
          Add New Database
        </Button>
      </div>
    </BaseLayout>
  );
}