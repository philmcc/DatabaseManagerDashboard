import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import type { SelectCluster } from "@db/schema";

function ClusterDetails() {
  const [location, navigate] = useLocation();
  const params = useParams<{ id: string }>();

  const { data: cluster, isLoading } = useQuery<SelectCluster>({
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
    );
  }

  return (
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
              {new Date(cluster.createdAt!).toLocaleDateString()}
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
    </div>
  );
}

export default ClusterDetails;