import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit2, Database, Server } from "lucide-react";
import { Loader2 } from "lucide-react";
import type { SelectInstance, SelectDatabaseConnection } from "@db/schema";

interface InstanceWithDatabases extends SelectInstance {
  databases: SelectDatabaseConnection[];
  cluster: {
    id: number;
    name: string;
  };
}

function InstanceDetails() {
  const [location, navigate] = useLocation();
  const params = useParams<{ id: string }>();

  const { data: instance, isLoading } = useQuery<InstanceWithDatabases>({
    queryKey: { scope: 'instances', id: params.id },
    queryFn: async () => {
      const response = await fetch(`/api/instances/${params.id}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch instance details');
      }
      return response.json();
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (!instance) {
    return (
      <Card className="max-w-md mx-auto mt-8">
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Instance not found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Server className="h-8 w-8" />
          {instance.hostname}
        </h1>
        <Button asChild>
          <Link href={`/instances/${instance.id}/edit`}>
            <Edit2 className="mr-2 h-4 w-4" />
            Edit Instance
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Instance Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-medium">Cluster</h3>
              <Link href={`/clusters/${instance.cluster.id}`} className="text-primary hover:underline">
                {instance.cluster.name}
              </Link>
            </div>
            <div>
              <h3 className="font-medium">Role</h3>
              <Badge variant={instance.isWriter ? "default" : "secondary"}>
                {instance.isWriter ? "Writer" : "Reader"}
              </Badge>
            </div>
            {instance.defaultDatabaseName && (
              <div>
                <h3 className="font-medium">Default Database</h3>
                <p>{instance.defaultDatabaseName}</p>
              </div>
            )}
            {instance.description && (
              <div>
                <h3 className="font-medium">Description</h3>
                <p className="text-muted-foreground">{instance.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Databases</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href={`/databases/new?instanceId=${instance.id}`}>
                <Database className="mr-2 h-4 w-4" />
                New Database
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {instance.databases.map((db) => (
                <Link key={db.id} href={`/databases/${db.id}`}>
                  <div className="p-4 rounded-lg border hover:bg-accent/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{db.name}</h3>
                      <Badge variant="outline">{db.databaseName}</Badge>
                    </div>
                  </div>
                </Link>
              ))}
              {instance.databases.length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  No databases configured for this instance
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default InstanceDetails;