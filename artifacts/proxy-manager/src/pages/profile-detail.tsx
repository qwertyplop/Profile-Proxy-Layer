import { useState, useMemo } from "react";
import { useRoute, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { 
  ArrowLeft, 
  Trash2, 
  KeyRound, 
  RefreshCw, 
  Plus, 
  Eye, 
  EyeOff,
  Copy,
  Check,
  Settings,
  AlertTriangle
} from "lucide-react";

import {
  useGetProfile,
  getGetProfileQueryKey,
  useUpdateProfile,
  useDeleteProfile,
  useListProfileKeys,
  getListProfileKeysQueryKey,
  useAddProfileKey,
  useDeleteProfileKey,
  useRotateProfileKey,
  getListProfilesQueryKey,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const updateProfileSchema = z.object({
  name: z.string().min(1, "Name is required").regex(/^[a-zA-Z0-9-]+$/, "Only alphanumeric characters and hyphens allowed"),
  targetUrl: z.string().url("Must be a valid URL"),
});

const addKeySchema = z.object({
  keyValue: z.string().min(1, "Key value is required"),
  label: z.string().optional(),
});

export default function ProfileDetail() {
  const [, params] = useRoute("/profiles/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  
  const { data: profile, isLoading } = useGetProfile(id, {
    query: { enabled: !!id, queryKey: getGetProfileQueryKey(id) }
  });

  if (isLoading) {
    return <ProfileDetailSkeleton />;
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold mb-2">Profile not found</h2>
        <Link href="/">
          <Button variant="outline" className="mt-4 gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Profiles
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="h-14 border-b border-border flex items-center justify-between px-6 bg-card/50 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="h-4 w-px bg-border"></div>
          <h1 className="font-bold text-foreground flex items-center gap-2">
            {profile.name}
            <Badge variant="outline" className="font-mono text-xs text-muted-foreground ml-2">
              ID: {profile.id}
            </Badge>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <RotateKeyButton id={id} />
          <DeleteProfileButton id={id} />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-8">
          
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-6">
              <section className="bg-card border border-border rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4 text-foreground">
                  <Settings className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-bold">Configuration</h2>
                </div>
                <UpdateProfileForm profile={profile} />
              </section>

              <section className="bg-card border border-border rounded-lg p-6">
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">SillyTavern Setup</h2>
                <p className="text-sm text-muted-foreground mb-3">
                  Point SillyTavern (or any OpenAI-compatible client) to the unified endpoint below. Models from all profiles are listed as <span className="font-mono text-primary">ProfileName - ModelName</span> — select one and requests are routed here automatically with round-robin key rotation.
                </p>
                <div className="bg-secondary/50 border border-border rounded p-3 font-mono text-sm mb-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">API URL</span>
                    <span className="text-primary truncate mx-2">{window.location.origin}/v1</span>
                    <CopyButton text={`${window.location.origin}/v1`} />
                  </div>
                </div>
                <div className="bg-secondary/50 border border-border rounded p-3 font-mono text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">Model prefix</span>
                    <span className="text-primary truncate mx-2">{profile.name} - &lt;model&gt;</span>
                    <CopyButton text={`${profile.name} - `} />
                  </div>
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <section className="bg-card border border-border rounded-lg flex flex-col h-full max-h-[600px]">
                <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-bold">API Keys</h2>
                    <Badge variant="secondary" className="ml-2">{profile.keys.length}</Badge>
                  </div>
                  <AddKeyDialog id={id} />
                </div>
                
                <div className="flex-1 overflow-auto p-4 space-y-2">
                  {profile.keys.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-lg bg-card/30">
                      <KeyRound className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No keys configured.</p>
                      <p className="text-xs mt-1">Add keys to start proxying requests.</p>
                    </div>
                  ) : (
                    profile.keys.map((key, idx) => (
                      <KeyRow 
                        key={key.id} 
                        apiKey={key} 
                        isActive={idx === profile.currentKeyIndex}
                        profileId={id}
                      />
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function UpdateProfileForm({ profile }: { profile: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateProfile = useUpdateProfile();

  const form = useForm<z.infer<typeof updateProfileSchema>>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      name: profile.name,
      targetUrl: profile.targetUrl,
    },
  });

  const onSubmit = (values: z.infer<typeof updateProfileSchema>) => {
    updateProfile.mutate(
      { id: profile.id, data: values },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetProfileQueryKey(profile.id), data);
          queryClient.invalidateQueries({ queryKey: getListProfilesQueryKey() });
          toast({ title: "Profile updated" });
        },
        onError: (err) => {
          toast({
            title: "Error updating profile",
            description: err.error || "Unknown error",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs uppercase text-muted-foreground font-semibold">Name</FormLabel>
              <FormControl>
                <Input {...field} className="font-mono bg-background" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="targetUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs uppercase text-muted-foreground font-semibold">Target URL</FormLabel>
              <FormControl>
                <Input {...field} className="font-mono bg-background" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button 
          type="submit" 
          disabled={updateProfile.isPending || !form.formState.isDirty}
          className="w-full"
        >
          {updateProfile.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </form>
    </Form>
  );
}

function KeyRow({ apiKey, isActive, profileId }: { apiKey: any; isActive: boolean; profileId: number }) {
  const [show, setShow] = useState(false);
  const deleteKey = useDeleteProfileKey();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = () => {
    deleteKey.mutate(
      { id: profileId, keyId: apiKey.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey(profileId) });
          toast({ title: "Key deleted" });
        },
        onError: (err) => {
          toast({
            title: "Error deleting key",
            description: err.error || "Unknown error",
            variant: "destructive",
          });
        }
      }
    );
  };

  return (
    <div className={`p-3 rounded border font-mono text-sm flex items-center justify-between transition-colors ${
      isActive 
        ? "bg-primary/10 border-primary/50 text-primary-foreground" 
        : "bg-secondary/30 border-border text-muted-foreground hover:bg-secondary/50"
    }`}>
      <div className="flex flex-col min-w-0 gap-1 flex-1 pr-4">
        <div className="flex items-center gap-2">
          {isActive && <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
          {apiKey.label && <span className="font-bold text-xs uppercase tracking-wider">{apiKey.label}</span>}
          {!apiKey.label && <span className="text-xs uppercase tracking-wider opacity-50">Unnamed Key</span>}
        </div>
        <div className="truncate flex items-center gap-2">
          {show ? apiKey.keyValue : "••••••••••••••••••••••••••••••"}
        </div>
      </div>
      
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShow(!show)}>
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDelete} disabled={deleteKey.isPending}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function AddKeyDialog({ id }: { id: number }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const addKey = useAddProfileKey();

  const form = useForm<z.infer<typeof addKeySchema>>({
    resolver: zodResolver(addKeySchema),
    defaultValues: {
      keyValue: "",
      label: "",
    },
  });

  const onSubmit = (values: z.infer<typeof addKeySchema>) => {
    addKey.mutate(
      { id, data: { keyValue: values.keyValue, label: values.label || null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey(id) });
          toast({ title: "Key added" });
          setOpen(false);
          form.reset();
        },
        onError: (err) => {
          toast({
            title: "Error adding key",
            description: err.error || "Unknown error",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1 h-8 text-xs">
          <Plus className="w-3 h-3" /> Add Key
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] font-mono">
        <DialogHeader>
          <DialogTitle>Add API Key</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="keyValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Key Value</FormLabel>
                  <FormControl>
                    <Input placeholder="sk-..." type="password" {...field} className="font-mono text-sm" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Paid Tier Key" {...field} className="font-mono text-sm" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <Button type="submit" disabled={addKey.isPending}>
                {addKey.isPending ? "Adding..." : "Save Key"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function RotateKeyButton({ id }: { id: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const rotateKey = useRotateProfileKey();

  const handleRotate = () => {
    rotateKey.mutate(
      { id },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetProfileQueryKey(id), data);
          toast({ title: "Rotated to next key manually" });
        },
        onError: (err) => {
          toast({
            title: "Error rotating key",
            description: err.error || "Unknown error",
            variant: "destructive",
          });
        }
      }
    );
  };

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={handleRotate} 
      disabled={rotateKey.isPending}
      className="gap-2 bg-background"
    >
      <RefreshCw className={`w-4 h-4 ${rotateKey.isPending ? "animate-spin" : ""}`} />
      Rotate Active
    </Button>
  );
}

function DeleteProfileButton({ id }: { id: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteProfile = useDeleteProfile();
  const [, setLocation] = useRoute("/profiles/:id");

  const handleDelete = () => {
    deleteProfile.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProfilesQueryKey() });
          toast({ title: "Profile deleted" });
          window.location.href = "/";
        },
        onError: (err) => {
          toast({
            title: "Error deleting profile",
            description: err.error || "Unknown error",
            variant: "destructive",
          });
        }
      }
    );
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" className="gap-2">
          <Trash2 className="w-4 h-4" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="font-mono">
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the profile and all associated API keys.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleDelete} 
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteProfile.isPending}
          >
            {deleteProfile.isPending ? "Deleting..." : "Delete Profile"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      onClick={handleCopy} 
      className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 shrink-0"
    >
      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
    </Button>
  );
}

function ProfileDetailSkeleton() {
  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="h-14 border-b border-border flex items-center px-6 bg-card/50">
        <Skeleton className="h-6 w-48" />
      </div>
      <div className="p-6 max-w-5xl mx-auto w-full grid gap-6 md:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    </div>
  );
}
