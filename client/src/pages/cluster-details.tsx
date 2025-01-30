import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, PlusCircle } from "lucide-react";
import type { SelectCluster, SelectInstance } from "@db/schema";
import Navbar from "@/components/layout/navbar";

interface ClusterResponse extends SelectCluster {
  instances: SelectInstance[];
}

function ClusterDetails() {
  const [location, navigate] = useLocation();
  const params = useParams<{ id: string }>();

  const { data: cluster, isLoading } = useQuery<ClusterResponse>({
    queryKey: [`/api/clusters/${params.id}`],
    enabled: !!params.id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (!cluster) {
    return (
      <div>
        <Navbar />
        <div className="container mx-auto py-6">
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground">
                <p>Cluster not found.</p>
                <Button 
                  variant="link" 
                  onClick={() => navigate("/clusters")}
                  className="mt-4"
                >
                  Back to Clusters
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Navbar />
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">{cluster.name}</h1>
          <div className="space-x-4">
            <Button variant="outline" onClick={() => navigate("/clusters")}>
              Back
            </Button>
            <Button onClick={() => navigate(`/clusters/${params.id}/edit`)}>
              Edit Cluster
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-medium">Description</h3>
              <p className="text-muted-foreground">
                {cluster.description || "No description provided"}
              </p>
            </div>
            <div>
              <h3 className="font-medium">Created</h3>
              <p className="text-muted-foreground">
                {cluster.createdAt ? new Date(cluster.createdAt).toLocaleDateString() : 'N/A'}
              </p>
            </div>
            {cluster.updatedAt && (
              <div>
                <h3 className="font-medium">Last Updated</h3>
                <p className="text-muted-foreground">
                  {new Date(cluster.updatedAt).toLocaleDateString()}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Instances</h2>
          <Button onClick={() => navigate(`/clusters/${params.id}/instances/new`)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Instance
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cluster.instances.map((instance: SelectInstance) => (
            <Link key={instance.id} href={`/clusters/${params.id}/instances/${instance.id}`}>
              <Card className="hover:bg-accent/50 transition-colors">
                <CardHeader>
                  <CardTitle className="flex justify-between items-center">
                    <span>{instance.hostname}</span>
                  </CardTitle>
                  {instance.description && (
                    <p className="text-sm text-muted-foreground">{instance.description}</p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    {instance.isWriter && (
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        Writer
                      </span>
                    )}
                    {!instance.isWriter && (
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        Reader
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
          {!cluster.instances.length && (
            <Card className="col-span-full">
              <CardContent className="py-8">
                <div className="text-center text-muted-foreground">
                  <p>No instances found. Add your first instance to get started.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default ClusterDetails;