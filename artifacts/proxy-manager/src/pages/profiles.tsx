import { useState } from "react";
import { Link } from "wouter";
import { Plus, Server, KeyRound, ArrowRight, Activity, Terminal } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";

import {
  useListProfiles,
  useCreateProfile,
  getListProfilesQueryKey,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const createProfileSchema = z.object({
  name: z.string().min(1, "Name is required").regex(/^[a-zA-Z0-9-]+$/, "Only alphanumeric characters and hyphens allowed"),
  targetUrl: z.string().url("Must be a valid URL"),
});

export default function Profiles() {
  const { data: profiles = [], isLoading } = useListProfiles();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="flex-1 overflow-auto">
      <div className="h-14 border-b border-border flex items-center justify-between px-6 bg-card/50">
        <h1 className="font-semibold text-foreground">Profiles</h1>
        <CreateProfileDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      </div>

      <div className="p-6 max-w-6xl mx-auto">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-40 bg-card/50 border border-border rounded-lg" />
            <Skeleton className="h-40 bg-card/50 border border-border rounded-lg" />
            <Skeleton className="h-40 bg-card/50 border border-border rounded-lg" />
          </div>
        ) : profiles?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-border rounded-lg bg-card/30">
            <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center mb-4">
              <Server className="w-6 h-6 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold mb-2">No profiles configured</h2>
            <p className="text-muted-foreground max-w-md mb-6">
              Create a proxy profile to forward requests to an LLM API. Profiles manage key rotation and target endpoints.
            </p>
            <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Create Profile
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {profiles?.map((profile) => (
              <Link key={profile.id} href={`/profiles/${profile.id}`}>
                <div className="group block h-full bg-card border border-border rounded-lg p-5 hover:border-primary transition-colors cursor-pointer relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-primary" />
                      <h3 className="font-bold text-base truncate">{profile.name}</h3>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1 font-semibold uppercase tracking-wider">Target</div>
                      <div className="text-xs truncate bg-secondary/50 px-2 py-1 rounded border border-border font-mono text-muted-foreground">
                        {profile.targetUrl}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1 font-semibold uppercase tracking-wider">
                          <KeyRound className="w-3 h-3" />
                          Keys
                        </div>
                        <div className="text-sm font-medium">
                          {profile.keys?.length || 0}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1 font-semibold uppercase tracking-wider">
                          <Activity className="w-3 h-3" />
                          Active Idx
                        </div>
                        <div className="text-sm font-medium">
                          {profile.currentKeyIndex}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createProfile = useCreateProfile();

  const form = useForm<z.infer<typeof createProfileSchema>>({
    resolver: zodResolver(createProfileSchema),
    defaultValues: {
      name: "",
      targetUrl: "",
    },
  });

  const onSubmit = (values: z.infer<typeof createProfileSchema>) => {
    createProfile.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProfilesQueryKey() });
          toast({
            title: "Profile created",
            description: `Successfully created profile ${values.name}`,
          });
          onOpenChange(false);
          form.reset();
        },
        onError: (err) => {
          toast({
            title: "Error creating profile",
            description: err.data?.error || "An unknown error occurred",
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Create Profile
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] font-mono">
        <DialogHeader>
          <DialogTitle>Create Proxy Profile</DialogTitle>
          <DialogDescription>
            A profile represents a destination API and its associated keys.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Profile Name</FormLabel>
                  <FormControl>
                    <Input placeholder="openai-gpt4" {...field} className="font-mono text-sm" />
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
                  <FormLabel>Target URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://api.openai.com"
                      {...field}
                      className="font-mono text-sm"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <Button type="submit" disabled={createProfile.isPending}>
                {createProfile.isPending ? "Creating..." : "Create Profile"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
