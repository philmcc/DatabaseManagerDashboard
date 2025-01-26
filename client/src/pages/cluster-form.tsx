import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation, useParams } from "wouter";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import type { SelectCluster } from "@db/schema";
import React from "react";
import Navbar from "@/components/layout/navbar";

const clusterSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

type ClusterFormValues = z.infer<typeof clusterSchema>;

export default function ClusterForm() {
  const [_, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!params.id;

  const { data: existingCluster, isLoading: isLoadingCluster } = useQuery<SelectCluster>({
    queryKey: [`/api/clusters/${params.id}`],
    enabled: isEditing,
  });

  const form = useForm<ClusterFormValues>({
    resolver: zodResolver(clusterSchema),
    defaultValues: {
      name: existingCluster?.name || "",
      description: existingCluster?.description || "",
    },
  });

  // Update form values when existing cluster data is loaded
  React.useEffect(() => {
    if (existingCluster) {
      form.reset({
        name: existingCluster.name,
        description: existingCluster.description || "",
      });
    }
  }, [existingCluster, form]);

  const mutation = useMutation({
    mutationFn: async (values: ClusterFormValues) => {
      const response = await fetch(
        isEditing ? `/api/clusters/${params.id}` : "/api/clusters",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(values),
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clusters"] });
      if (isEditing) {
        queryClient.invalidateQueries({ queryKey: [`/api/clusters/${params.id}`] });
      }
      toast({
        title: "Success",
        description: `Cluster ${isEditing ? "updated" : "created"} successfully`,
      });
      navigate("/clusters");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isEditing && isLoadingCluster) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  const onSubmit = (data: ClusterFormValues) => {
    mutation.mutate(data);
  };

  return (
    <div>
      <Navbar />
      <div className="container mx-auto py-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">
            {isEditing ? "Edit Cluster" : "Create New Cluster"}
          </h1>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cluster Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Production DB Cluster" {...field} />
                    </FormControl>
                    <FormDescription>
                      A unique name for your database cluster
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Optional description of the cluster"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Add details about the purpose and configuration of this cluster
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/clusters")}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  {isEditing ? "Update Cluster" : "Create Cluster"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}