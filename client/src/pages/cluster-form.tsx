import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

const clusterSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

type ClusterFormValues = z.infer<typeof clusterSchema>;

export default function ClusterForm() {
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ClusterFormValues>({
    resolver: zodResolver(clusterSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const createCluster = useMutation({
    mutationFn: async (values: ClusterFormValues) => {
      const response = await fetch("/api/clusters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clusters"] });
      toast({
        title: "Success",
        description: "Cluster created successfully",
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

  const onSubmit = (data: ClusterFormValues) => {
    createCluster.mutate(data);
  };

  return (
    <div className="container mx-auto py-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Create New Cluster</h1>
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
              <Button type="submit">Create Cluster</Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
