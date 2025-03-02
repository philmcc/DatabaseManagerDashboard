import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

export default function ResetPassword() {
  console.log("ResetPassword component rendered");
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [token, setToken] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [, setLocation] = useLocation();

  // Check for token in URL hash on component mount
  useEffect(() => {
    console.log("ResetPassword useEffect running, checking for token");
    const hash = window.location.hash.substring(1);
    console.log("URL hash:", hash);
    if (hash) {
      setToken(hash);
      setIsResetting(true);
      console.log("Token found, showing reset form");
    } else {
      console.log("No token found, showing request form");
    }
  }, []);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Requesting password reset for email:", email);
    setIsLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const response = await fetch("/api/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: email }),
      });

      console.log("Forgot password response status:", response.status);
      
      if (response.ok) {
        setMessage({
          type: "success",
          text: "If an account exists with that email, you will receive reset instructions."
        });
        console.log("Reset instructions sent successfully");
      } else {
        const error = await response.text();
        console.error("Reset instructions error:", error);
        setMessage({
          type: "error",
          text: error || "Failed to send reset instructions"
        });
      }
    } catch (error) {
      console.error("Reset instructions exception:", error);
      setMessage({
        type: "error",
        text: "An unexpected error occurred"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Resetting password with token:", token);
    setMessage({ type: "", text: "" });
    
    if (password !== confirmPassword) {
      console.log("Passwords don't match");
      setMessage({
        type: "error",
        text: "Passwords don't match. Please make sure your passwords match."
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, password }),
      });

      console.log("Reset password response status:", response.status);
      
      if (response.ok) {
        setMessage({
          type: "success",
          text: "Password reset successful. You can now log in with your new password."
        });
        console.log("Password reset successful");
        // Redirect to login page after successful reset
        setTimeout(() => setLocation("/auth"), 2000);
      } else {
        const error = await response.text();
        console.error("Password reset error:", error);
        setMessage({
          type: "error",
          text: error || "Failed to reset password"
        });
      }
    } catch (error) {
      console.error("Password reset exception:", error);
      setMessage({
        type: "error",
        text: "An unexpected error occurred"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Show password reset form if token is present
  if (isResetting) {
    console.log("Rendering password reset form");
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md mx-4">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">
              Reset Your Password
            </CardTitle>
          </CardHeader>
          <CardContent>
            {message.text && (
              <div className={`mb-4 p-3 rounded ${message.type === "error" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
                {message.text}
              </div>
            )}
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Resetting..." : "Reset Password"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setLocation("/auth")}
              >
                Back to Login
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show request reset form
  console.log("Rendering request reset form");
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">
            Forgot Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          {message.text && (
            <div className={`mb-4 p-3 rounded ${message.type === "error" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
              {message.text}
            </div>
          )}
          <form onSubmit={handleRequestReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Sending..." : "Send Reset Instructions"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setLocation("/auth")}
            >
              Back to Login
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}