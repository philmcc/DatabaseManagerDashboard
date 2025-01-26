import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Loader2 } from "lucide-react";
import type { SelectCluster } from "@db/schema";

function ClustersPage() {
  const [location, navigate] = useLocation();
  const { data: clusters, isLoading } = useQuery({
    queryKey: ['/api/clusters'],
    queryFn: async ({ queryKey }) => {
      const response = await fetch(queryKey[0]);
      if (!response.ok) {
        throw new Error('Failed to fetch clusters');
      }
      const data: SelectCluster[] = await response.json();
      return data;
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Database Clusters</h1>
        <Button asChild>
          <Link href="/clusters/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Cluster
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {clusters?.map((cluster: SelectCluster) => (
          <Card key={cluster.id} className="hover:bg-accent/50 transition-colors">
            <CardHeader className="cursor-pointer" onClick={() => navigate(`/clusters/${cluster.id}`)}>
              <CardTitle className="flex justify-between items-center">
                <span>{cluster.name}</span>
              </CardTitle>
              {cluster.description && (
                <p className="text-sm text-muted-foreground">{cluster.description}</p>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                {/* TODO: Add tags display once we implement tags fetching */}
              </div>
            </CardContent>
          </Card>
        ))}
        {!clusters?.length && (
          <Card className="col-span-full">
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground">
                <p>No clusters found. Create your first cluster to get started.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default ClustersPage;