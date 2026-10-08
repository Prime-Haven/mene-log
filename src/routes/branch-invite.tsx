import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2 } from "lucide-react";
import { claimBranchInvite } from "@/lib/branches.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MeneLogLogo } from "@/components/MeneLogLogo";

export const Route = createFileRoute("/branch-invite")({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === "string" ? s.token : "",
  }),
  head: () => ({
    meta: [
      { title: "Accept your branch invitation — Mene:Log" },
      {
        name: "description",
        content: "Set up your administrator account for your church branch on Mene:Log.",
      },
      { property: "og:title", content: "Accept your branch invitation — Mene:Log" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BranchInvitePage,
});

function BranchInvitePage() {
  const { token } = useSearch({ from: "/branch-invite" });
  const claimFn = useServerFn(claimBranchInvite);
  const [f, setF] = useState({ full_name: "", email: "", password: "" });
  const [done, setDone] = useState<string | null>(null);

  const claim = useMutation({
    mutationFn: () => claimFn({ data: { token, ...f } }),
    onSuccess: (r) => {
      if (r.ok) setDone(r.message);
    },
  });

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <MeneLogLogo onBackground="white" className="h-10 w-auto" />
        </div>
        {!token ? (
          <div className="surface p-6 text-center">
            <p className="font-semibold">This link is incomplete</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask your head office to share the full invite link again.
            </p>
          </div>
        ) : done ? (
          <div className="surface p-6 text-center">
            <Building2 className="mx-auto size-8 text-primary" />
            <p className="mt-3 font-semibold">You're in</p>
            <p className="mt-1 text-sm text-muted-foreground">{done}</p>
            <Button asChild className="mt-4">
              <Link to="/auth">Sign in</Link>
            </Button>
          </div>
        ) : (
          <form
            className="surface space-y-4 p-6"
            onSubmit={(e) => {
              e.preventDefault();
              claim.mutate();
            }}
          >
            <div>
              <p className="font-display text-lg font-bold">Accept your branch invitation</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create your administrator account for your branch. This link works once.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Your full name</Label>
              <Input
                required
                minLength={2}
                maxLength={120}
                value={f.full_name}
                onChange={(e) => setF({ ...f, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Your email</Label>
              <Input
                required
                type="email"
                maxLength={160}
                value={f.email}
                onChange={(e) => setF({ ...f, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Choose a password</Label>
              <Input
                required
                type="password"
                minLength={8}
                maxLength={64}
                value={f.password}
                onChange={(e) => setF({ ...f, password: e.target.value })}
              />
            </div>
            {claim.data && !claim.data.ok && (
              <p className="text-sm text-destructive">{claim.data.message}</p>
            )}
            {claim.isError && (
              <p className="text-sm text-destructive">
                {claim.error instanceof Error ? claim.error.message : "Something went wrong."}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={claim.isPending}>
              {claim.isPending ? "Setting up…" : "Accept and create my account"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
