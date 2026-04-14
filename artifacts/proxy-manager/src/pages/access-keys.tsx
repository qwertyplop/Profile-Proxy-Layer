import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Trash2, Copy, Check, ShieldCheck } from "lucide-react";
import {
  useListAccessKeys,
  getListAccessKeysQueryKey,
  useCreateAccessKey,
  useDeleteAccessKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
      title="Copy"
    >
      {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

function MaskedKey({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false);
  const display = revealed ? value : `${value.slice(0, 8)}${"•".repeat(20)}`;
  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <span className="font-mono text-xs text-primary truncate">{display}</span>
      <button
        onClick={() => setRevealed((v) => !v)}
        className="text-muted-foreground hover:text-foreground text-xs shrink-0 underline underline-offset-2"
      >
        {revealed ? "hide" : "reveal"}
      </button>
      <CopyButton text={value} />
    </div>
  );
}

export default function AccessKeys() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");

  const { data: keys = [], isLoading } = useListAccessKeys({
    query: { queryKey: getListAccessKeysQueryKey() },
  });

  const createMutation = useCreateAccessKey({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccessKeysQueryKey() });
        setLabel("");
        toast({ title: "Access key created" });
      },
      onError: () => {
        toast({ title: "Failed to create key", variant: "destructive" });
      },
    },
  });

  const deleteMutation = useDeleteAccessKey({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAccessKeysQueryKey() });
        toast({ title: "Access key deleted" });
      },
      onError: () => {
        toast({ title: "Failed to delete key", variant: "destructive" });
      },
    },
  });

  const handleCreate = () => {
    createMutation.mutate({ data: { label: label.trim() || null } });
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="h-14 border-b border-border flex items-center px-6 bg-card/50 shrink-0 gap-3">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <h1 className="font-bold text-foreground">Access Keys</h1>
        <Badge variant="secondary" className="font-mono">{keys.length}</Badge>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">

          <section className="bg-card border border-border rounded-lg p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">
              What are access keys?
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Access keys protect your <span className="font-mono text-primary">/v1</span> endpoint.
              Any client (including SillyTavern) must send one as{" "}
              <span className="font-mono text-primary">Authorization: Bearer &lt;key&gt;</span>.
              If no keys exist, the endpoint is open. Once you add at least one key, all requests without a valid key are rejected.
            </p>
          </section>

          <section className="bg-card border border-border rounded-lg p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
              Generate new key
            </h2>
            <div className="flex gap-2">
              <Input
                placeholder="Label (optional)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="font-mono text-sm"
              />
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="gap-1 shrink-0"
              >
                <Plus className="w-4 h-4" />
                Generate
              </Button>
            </div>
          </section>

          <section className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Active keys
              </h2>
            </div>

            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : keys.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <KeyRound className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No access keys — endpoint is open to all requests.</p>
                <p className="text-xs mt-1 opacity-60">Generate a key above to require authentication.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {keys.map((key) => (
                  <li key={key.id} className="flex items-center gap-3 px-4 py-3">
                    <KeyRound className="w-4 h-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      {key.label && (
                        <p className="text-xs text-muted-foreground mb-0.5">{key.label}</p>
                      )}
                      <MaskedKey value={key.keyValue} />
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                      {new Date(key.createdAt).toLocaleDateString()}
                    </span>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete access key?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Any client using this key will immediately lose access.
                            {key.label && ` (${key.label})`}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate({ id: key.id })}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </li>
                ))}
              </ul>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}
