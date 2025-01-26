import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useParams } from "wouter";
import BaseLayout from "@/components/layout/base-layout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database } from "lucide-react";
import { SelectDatabaseConnection } from "@db/schema";
import React from 'react';

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  host: z.string().min(1, "Host is required"),
  port: z.coerce.number().min(1, "Port is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  databaseName: z.string().min(1, "Database name is required"),
});

type FormData = z.infer<typeof formSchema>;

export default function DatabaseForm() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const params = useParams();
  const isEditMode = params.id != null;

  const { data: existingDatabase, isLoading: isLoadingDatabase } = useQuery<SelectDatabaseConnection>({
    queryKey: [`/api/databases/${params.id}`],
    enabled: isEditMode,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      port: 5432, // Default PostgreSQL port
    },
  });

  // Update form values when existing database data is loaded
  React.useEffect(() => {
    if (existingDatabase) {
      form.reset({
        name: existingDatabase.name,
        host: existingDatabase.host,
        port: existingDatabase.port,
        username: existingDatabase.username,
        password: existingDatabase.password,
        databaseName: existingDatabase.databaseName,
      });
    }
  }, [existingDatabase, form]);

  const { mutateAsync: createDatabase, isPending: isCreating } = useMutation({
    mutationFn: async (values: FormData) => {
      const res = await fetch("/api/databases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/databases'] });
    },
  });

  const { mutateAsync: updateDatabase, isPending: isUpdating } = useMutation({
    mutationFn: async (values: FormData) => {
      const res = await fetch(`/api/databases/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }

      return res.json();
    },
    onSuccess: () => {
      // Invalidate both the list query and the individual database query
      queryClient.invalidateQueries({ queryKey: ['/api/databases'] });
      queryClient.invalidateQueries({ queryKey: [`/api/databases/${params.id}`] });
    },
  });

  const onSubmit = async (values: FormData) => {
    try {
      if (isEditMode) {
        await updateDatabase(values);
        toast({
          title: "Success",
          description: "Database connection updated successfully",
        });
      } else {
        await createDatabase(values);
        toast({
          title: "Success",
          description: "Database connection added successfully",
        });
      }
      setLocation("/");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  if (isEditMode && isLoadingDatabase) {
    return (
      <BaseLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <p>Loading database details...</p>
        </div>
      </BaseLayout>
    );
  }

  return (
    <BaseLayout>
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              {isEditMode ? "Edit Database Connection" : "Add Database Connection"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="My Production Database" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="host"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Host</FormLabel>
                      <FormControl>
                        <Input placeholder="localhost" {...field} />
                      </FormControl>
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
                        <Input type="number" {...field} />
                      </FormControl>
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
                        <Input {...field} />
                      </FormControl>
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
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="databaseName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Database Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setLocation("/")}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isCreating || isUpdating}>
                    {isEditMode 
                      ? (isUpdating ? "Updating..." : "Update Database")
                      : (isCreating ? "Adding..." : "Add Database")
                    }
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </BaseLayout>
  );
}