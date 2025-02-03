import React from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function PermissionDenied() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold mb-4 text-red-500">
        Permission Denied
      </h1>
      <p className="mb-8">You don't have permission to view this page.</p>
      <Button onClick={() => setLocation("/")}>Go Home</Button>
    </div>
  );
} 