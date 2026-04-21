import { useState, type FormEvent } from "react";
import { Server } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AuthPage() {
  const { registrationOpen, login, register } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isRegister = registrationOpen;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isRegister) {
        await register(username, password);
      } else {
        await login(username, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background font-mono p-4">
      <div className="w-full max-w-sm border border-border bg-card rounded-md p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-primary" />
          <span className="font-bold tracking-tight">PROXY_MGR</span>
        </div>
        <div>
          <h1 className="text-lg font-semibold">
            {isRegister ? "Create owner account" : "Sign in"}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {isRegister
              ? "First-time setup. This account will own this instance."
              : "Enter your credentials to manage profiles and keys."}
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={isRegister ? 8 : 1}
            />
            {isRegister && (
              <p className="text-xs text-muted-foreground">
                Minimum 8 characters.
              </p>
            )}
          </div>
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5">
              {error}
            </div>
          )}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting
              ? "Please wait…"
              : isRegister
                ? "Create account"
                : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
