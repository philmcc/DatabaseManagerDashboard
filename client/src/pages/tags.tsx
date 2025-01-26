import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tags as TagsIcon } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import BaseLayout from "@/components/layout/base-layout";
import { SelectTag } from "@db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function TagsPage() {
  const [newTagName, setNewTagName] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tags = [], isLoading } = useQuery<SelectTag[]>({
    queryKey: ['/api/tags'],
  });

  const { mutate: createTag, isPending: isCreating } = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tags'] });
      setNewTagName("");
      toast({
        title: "Success",
        description: "Tag created successfully",
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

  const handleCreateTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    createTag(newTagName.trim());
  };

  return (
    <BaseLayout>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TagsIcon className="h-5 w-5" />
            Manage Tags
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateTag} className="flex gap-2 mb-6">
            <Input
              placeholder="New tag name"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              className="max-w-xs"
            />
            <Button type="submit" disabled={isCreating || !newTagName.trim()}>
              {isCreating ? "Creating..." : "Create Tag"}
            </Button>
          </form>

          {isLoading ? (
            <p className="text-center text-muted-foreground">Loading tags...</p>
          ) : !tags.length ? (
            <p className="text-center text-muted-foreground">No tags created yet.</p>
          ) : (
            <div className="space-y-2">
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center justify-between p-2 rounded-md border"
                >
                  <span className="font-medium">{tag.name}</span>
                  <span className="text-sm text-muted-foreground">
                    Created: {new Date(tag.createdAt || "").toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </BaseLayout>
  );
}
