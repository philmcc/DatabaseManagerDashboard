import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import type { SelectInstance, SelectCluster } from "@db/schema";
import React from "react";
import Navbar from "@/components/layout/navbar";

const instanceSchema = z.object({
  hostname: z.string().min(1, "Hostname is required"),
  port: z.number().int().min(1, "Port is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  description: z.string().optional(),
  isWriter: z.boolean().default(false),
  defaultDatabaseName: z.string().optional(),
});

type FormData = z.infer<typeof instanceSchema>;

const defaultFormValues: FormData = {
  hostname: "",
  port: 5432,
  username: "",
  password: "",
  description: "",
  isWriter: false,
  defaultDatabaseName: "",
};

function InstanceForm() {
  const [_, navigate] = useLocation();
  const params = useParams<{ id?: string; clusterId: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!params.id;

  const { data: instance, isLoading: isLoadingInstance } = useQuery<SelectInstance>({
    queryKey: [`/api/instances/${params.id}`],
    enabled: isEditing,
  });

  const { data: cluster, isLoading: isLoadingCluster } = useQuery<SelectCluster>({
    queryKey: [`/api/clusters/${params.clusterId}`],
    enabled: !!params.clusterId,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(instanceSchema),
    defaultValues: defaultFormValues,
  });

  // Update form values only when editing and instance data is loaded
  React.useEffect(() => {
    if (isEditing && instance) {
      form.reset({
        hostname: instance.hostname,
        port: instance.port,
        username: instance.username,
        password: instance.password,
        description: instance.description || "",
        isWriter: instance.isWriter || false,
        defaultDatabaseName: instance.defaultDatabaseName || "",
      });
    }
  }, [instance, form, isEditing]);

  const testConnection = useMutation({
    mutationFn: async (values: FormData) => {
      const response = await fetch(`/api/instances/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Connection test successful",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Connection Failed",
        description: error.message,
      });
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormData) => {
      const endpoint = isEditing
        ? `/api/instances/${params.id}`
        : `/api/clusters/${params.clusterId}/instances`;

      const response = await fetch(endpoint, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
        credentials: "include",
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clusters/${params.clusterId}`] });
      if (isEditing) {
        queryClient.invalidateQueries({ queryKey: [`/api/instances/${params.id}`] });
      }
      toast({
        title: "Success",
        description: `Instance ${isEditing ? "updated" : "created"} successfully`,
      });
      navigate(`/clusters/${params.clusterId}`);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  if ((isEditing && isLoadingInstance) || isLoadingCluster) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  // If we're not editing and there's no cluster found, show an error
  if (!isEditing && !cluster) {
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

  const onSubmit = (data: FormData) => {
    mutation.mutate(data);
  };

  const handleTestConnection = () => {
    const values = form.getValues();
    testConnection.mutate(values);
  };

  return (
    <div>
      <Navbar />
      <div className="container mx-auto py-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">
            {isEditing ? "Edit Instance" : `New Instance for ${cluster?.name || ''}`}
          </h1>
          <Card>
            <CardHeader>
              <CardTitle>Instance Details</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                  <FormField
                    control={form.control}
                    name="hostname"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hostname</FormLabel>
                        <FormControl>
                          <Input placeholder="db-1.example.com" {...field} />
                        </FormControl>
                        <FormDescription>
                          The hostname or IP address of the database instance
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="port"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Port</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="5432" 
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                          />
                        </FormControl>
                        <FormDescription>
                          The port number for the PostgreSQL instance (default: 5432)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input placeholder="postgres" {...field} />
                        </FormControl>
                        <FormDescription>
                          Database user with access to this instance
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} />
                        </FormControl>
                        <FormDescription>
                          Password for the database user
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
                            placeholder="Primary database instance for production workload"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Optional description of this instance's purpose and configuration
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isWriter"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Writer Instance</FormLabel>
                          <FormDescription>
                            Make this instance the writer for the cluster. This will make all other instances readers.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="defaultDatabaseName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Default Database Name</FormLabel>
                        <FormControl>
                          <Input placeholder="postgres" {...field} />
                        </FormControl>
                        <FormDescription>
                          The default database to connect to on this instance
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-between gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTestConnection}
                      disabled={testConnection.isPending}
                    >
                      {testConnection.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        'Test Connection'
                      )}
                    </Button>
                    <div className="flex gap-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => navigate(`/clusters/${params.clusterId}`)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={mutation.isPending}>
                        {mutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {isEditing ? "Updating..." : "Creating..."}
                          </>
                        ) : (
                          isEditing ? "Update Instance" : "Create Instance"
                        )}
                      </Button>
                    </div>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default InstanceForm;