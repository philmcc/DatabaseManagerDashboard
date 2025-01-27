import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login, register } = useUser();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const result = await (isLogin ? login : register)({ username, password });
      if (result.ok) {
        toast({
          title: isLogin ? "Login Successful" : "Registration Successful",
          description: isLogin 
            ? "Welcome back!" 
            : "Your account has been created. Please wait for admin approval.",
        });
        if (isLogin) {
          setLocation("/dashboard");
        } else {
          // Invalidate users query after successful registration
          queryClient.invalidateQueries({ queryKey: ['/api/users'] });
          // Stay on the login page after registration
          setIsLogin(true);
          setUsername("");
          setPassword("");
        }
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.message,
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: isLogin ? "Login failed" : "Registration failed",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">
            {isLogin ? "Login" : "Register"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="email"
                placeholder="Email address"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Please wait..." : (isLogin ? "Login" : "Register")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setIsLogin(!isLogin);
                setUsername("");
                setPassword("");
              }}
              disabled={isLoading}
            >
              {isLogin ? "Need an account? Register" : "Have an account? Login"}
            </Button>
            {isLogin && (
              <Button
                type="button"
                variant="link"
                className="w-full"
                onClick={() => setLocation("/reset-password")}
                disabled={isLoading}
              >
                Forgot Password?
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}