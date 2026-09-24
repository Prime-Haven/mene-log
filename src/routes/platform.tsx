import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CircleDollarSign, CreditCard, LogOut, Plus, Search, ShieldCheck, Users, Activity, AlertTriangle, Pencil, Star, Check, X } from "lucide-react";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { staggerContainer, fadeUp } from "@/lib/animations";

export const Route = createFileRoute("/platform")({ ssr: false, head: () => ({ meta: [
  { title: "Prime Haven console — Mene:Log" },
  { name: "description", content: "Restricted account, package, billing health, and review operations for Mene:Log." },
  { property: "og:title", content: "Prime Haven console — Mene:Log" },
  { property: "og:description", content: "Restricted account, package, billing health, and review operations for Mene:Log." },
  { property: "og:type", content: "website" },
  { name: "twitter:card", content: "summary" },
  { name: "robots", content: "noindex, nofollow" },
] }), component: Platform });

type Church = { id:string; name:string; subdomain:string; tier:"free"|"basic"|"standard"|"premium"; status:"active"|"grace"|"suspended"|"closed"; approval_status:string; trial_ends_at:string|null; contact_email:string|null; contact_phone:string|null; created_at:string; members:number; staff:number; period_end:string|null; auto_renew:boolean|null; last_payment_status:string|null; last_payment_at:string|null };
type Payment = { id:string; church:string; tier:string; amount:number; currency:string; status:string; channel:string|null; created_at:string; paid_at:string|null };
type Audit = { id:string; action:string; tenant_id:string|null; church:string|null; detail:unknown; created_at:string };
type Review = { id:string; church_name:string; quote:string; rating:number; author_name:string; author_role:string; status:string; created_at:string };
type Overview = { tenants:number; active_tenants:number; grace_tenants:number; suspended_tenants:number; members:number; attendance_30d:number; by_tier:Record<string,number>; revenue_usd_90d:number; payments_30d:number; failed_payments_30d:number; churches:Church[]; recent_payments:Payment[]; audit:Audit[] };
type Form = { id?:string; name:string; subdomain:string; tier:Church["tier"]; status:Church["status"]; contact_email:string; contact_phone:string };
const emptyForm: Form = { name:"", subdomain:"", tier:"basic", status:"active", contact_email:"", contact_phone:"" };
const fmtDate = (value:string|null) => value ? new Intl.DateTimeFormat(undefined,{dateStyle:"medium"}).format(new Date(value)) : "—";

function Platform() {
  const { session, loading } = useAuth(); const navigate = useNavigate(); const qc = useQueryClient();
  const operator = useQuery({queryKey:["platform-access",session?.user.id],enabled:!!session,retry:false,queryFn:async()=>{const {data,error}=await supabase.rpc("is_platform_admin");if(error)throw error;return data===true;}});
  const isOperator = operator.data === true;

  const [search,setSearch]=useState(""); const [tier,setTier]=useState("all"); const [status,setStatus]=useState("all"); const [form,setForm]=useState<Form|null>(null); const [selected,setSelected]=useState<Church|null>(null);
  const overview = useQuery({
    queryKey:["platform-overview"],
     enabled: isOperator,
    retry:false,
    queryFn:async()=>{
      const {data,error}=await supabase.rpc("platform_overview");
      if(error) throw error;
      return data as unknown as Overview;
    }
  });

  const save = useMutation({ mutationFn:async(value:Form)=>{ if(value.id){ const {error}=await supabase.rpc("platform_update_tenant",{p_tenant:value.id,p_name:value.name,p_subdomain:value.subdomain,p_tier:value.tier,p_status:value.status,p_contact_email:value.contact_email,p_contact_phone:value.contact_phone}); if(error) throw error; } else { const {error}=await supabase.rpc("platform_create_tenant",{p_name:value.name,p_subdomain:value.subdomain,p_tier:value.tier,p_contact_email:value.contact_email,p_contact_phone:value.contact_phone}); if(error) throw error; } }, onSuccess:()=>{toast.success(form?.id?"Church updated":"Church shell created");setForm(null);qc.invalidateQueries({queryKey:["platform-overview"]});},onError:(error)=>toast.error(error instanceof Error?error.message:"Could not save church") });
  const changeStatus=useMutation({mutationFn:async({id,next}:{id:string;next:Church["status"]})=>{const {error}=await supabase.rpc("platform_set_tenant_status",{p_tenant:id,p_status:next});if(error)throw error;},onSuccess:()=>{toast.success("Church status updated");setSelected(null);qc.invalidateQueries({queryKey:["platform-overview"]});},onError:()=>toast.error("Could not update this church")});
  
  const approveChurch = useMutation({
    mutationFn: async (tenantId: string) => {
      const { error } = await supabase.rpc("platform_approve_church", { p_tenant: tenantId });
       if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Church application approved and activated!");
      qc.invalidateQueries({ queryKey: ["platform-overview"] });
    },
    onError: () => toast.error("Could not approve church"),
  });
  const rejectChurch = useMutation({mutationFn:async(tenantId:string)=>{const reason=window.prompt("Reason for rejection?");if(!reason)throw new Error("A reason is required");const {error}=await supabase.rpc("platform_reject_church",{p_tenant:tenantId,p_reason:reason});if(error)throw error;},onSuccess:()=>{toast.success("Church application rejected");qc.invalidateQueries({queryKey:["platform-overview"]});},onError:(error)=>toast.error(error instanceof Error?error.message:"Could not reject church")});
  const grantSpace = useMutation({mutationFn:async(tenantId:string)=>{const raw=window.prompt("Set this church's total extra member spaces:","500");const slots=Number(raw);if(!Number.isInteger(slots)||slots<0)throw new Error("Enter a whole number of spaces");const {error}=await supabase.rpc("platform_grant_space",{p_tenant:tenantId,p_slots:slots});if(error)throw error;},onSuccess:()=>toast.success("Extra member space updated"),onError:(error)=>toast.error(error instanceof Error?error.message:"Could not update space")});

  const reviews=useQuery({queryKey:["platform-reviews"],enabled:isOperator,retry:false,queryFn:async()=>{const {data,error}=await supabase.rpc("platform_reviews");if(error) throw error; return (data??[]) as Review[];}});
  const setReviewStatus=useMutation({mutationFn:async({id,status}:{id:string;status:"approved"|"rejected"})=>{const {error}=await supabase.rpc("platform_set_review_status",{p_review:id,p_status:status});if(error)throw error;},onSuccess:(_data,vars)=>{toast.success(vars.status==="approved"?"Review approved — it's now live on the homepage":"Review rejected");qc.invalidateQueries({queryKey:["platform-reviews"]});},onError:()=>toast.error("Could not update this review")});
  const pendingReviews=useMemo(()=>reviews.data?.filter(r=>r.status==="pending")??[],[reviews.data]);
  const decidedReviews=useMemo(()=>reviews.data?.filter(r=>r.status!=="pending")??[],[reviews.data]);
  const churches=useMemo(()=>overview.data?.churches.filter(c=>(tier==="all"||c.tier===tier)&&(status==="all"||c.status===status)&&`${c.name} ${c.subdomain} ${c.contact_email??""}`.toLowerCase().includes(search.toLowerCase()))??[],[overview.data,search,tier,status]);
  const pendingChurches = useMemo(() => overview.data?.churches.filter((c) => c.approval_status === "pending_approval") ?? [], [overview.data]);

  if(loading||operator.isLoading||(isOperator&&overview.isLoading))return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading Prime Haven console…</div>;
  if(!isOperator)return <div className="grid min-h-screen place-items-center px-5 text-center"><div><ShieldCheck className="mx-auto size-8 text-muted-foreground"/><h1 className="mt-4 text-xl font-bold">Prime Haven access only</h1><p className="mt-2 text-sm text-muted-foreground">This console never grants access to church member records.</p><Button asChild className="mt-5"><Link to="/super-admin">Sign in as Super Admin</Link></Button></div></div>;
  const d=overview.data ?? { tenants: 0, active_tenants: 0, grace_tenants: 0, suspended_tenants: 0, members: 0, attendance_30d: 0, by_tier: {}, revenue_usd_90d: 0, payments_30d: 0, failed_payments_30d: 0, churches: [], recent_payments: [], audit: [] };
  const stats=[{label:"Churches",value:d.tenants,icon:Building2},{label:"Active",value:d.active_tenants,icon:Activity},{label:"Aggregate members",value:d.members,icon:Users},{label:"Attendance · 30 days",value:d.attendance_30d,icon:Activity},{label:"Revenue · 90 days",value:`$${Number(d.revenue_usd_90d).toLocaleString()}`,icon:CircleDollarSign},{label:"Failed payments",value:d.failed_payments_30d,icon:AlertTriangle}];
  
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/super-admin" });
  };

  return <div className="min-h-screen bg-muted/25">
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6"><span className="grid size-9 place-items-center rounded-xl bg-deep text-deep-foreground"><ShieldCheck className="size-4"/></span><div><p className="font-display text-sm font-bold">Prime Haven</p><p className="text-[10px] uppercase tracking-widest text-muted-foreground">Mene:Log operations</p></div><Button variant="ghost" size="sm" className="ml-auto" onClick={handleSignOut}><LogOut className="size-4"/> Sign out</Button></div></header>
    <main className="mx-auto max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-eyebrow">Platform overview</p><h1 className="mt-2 font-display text-3xl font-bold">Operations console</h1><p className="mt-1 text-sm text-muted-foreground">Account operations and aggregate health only. No church database access.</p></div><Button onClick={()=>setForm({...emptyForm})}><Plus className="size-4"/> Create church shell</Button></div>
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{stats.map(({label,value,icon:Icon})=><motion.div variants={fadeUp} key={label} className="surface p-4"><Icon className="size-4 text-primary"/><p className="mt-4 text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></motion.div>)}</motion.div>
    <Tabs defaultValue="churches"><TabsList className="w-full justify-start overflow-x-auto sm:w-auto"><TabsTrigger value="churches">Churches</TabsTrigger><TabsTrigger value="pending">Pending Approvals{pendingChurches.length > 0 && <Badge variant="destructive" className="ml-1.5 px-1.5">{pendingChurches.length}</Badge>}</TabsTrigger><TabsTrigger value="payments">Payments</TabsTrigger><TabsTrigger value="reviews">Reviews{pendingReviews.length>0&&<Badge variant="destructive" className="ml-1.5 px-1.5">{pendingReviews.length}</Badge>}</TabsTrigger><TabsTrigger value="audit">Audit</TabsTrigger></TabsList>
      <TabsContent value="pending" className="space-y-4">
        <div className="surface divide-y overflow-hidden">
          {pendingChurches.map((c: any) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div>
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs text-muted-foreground">/c/{c.subdomain} · {c.contact_email} · {c.contact_phone}</p>
                <Badge variant="secondary" className="mt-1 capitalize">{c.tier} package</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => approveChurch.mutate(c.id)} disabled={approveChurch.isPending} className="bg-success text-success-foreground hover:bg-success/90">
                  <Check className="size-4" /> Approve &amp; Activate
                </Button>
                 <Button size="sm" variant="outline" onClick={() => rejectChurch.mutate(c.id)} disabled={rejectChurch.isPending}>
                  Reject
                </Button>
              </div>
            </div>
          ))}
          {!pendingChurches.length && <p className="p-10 text-center text-sm text-muted-foreground">No pending church registrations waiting for review.</p>}
        </div>
      </TabsContent>
      <TabsContent value="churches" className="space-y-4"><div className="surface grid gap-3 p-4 md:grid-cols-[1fr_180px_180px]"><div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground"/><Input className="pl-9" placeholder="Search churches" value={search} onChange={e=>setSearch(e.target.value)}/></div><Select value={tier} onValueChange={setTier}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All packages</SelectItem><SelectItem value="free">Free</SelectItem><SelectItem value="basic">Standard</SelectItem><SelectItem value="standard">Pro</SelectItem><SelectItem value="premium">Premium</SelectItem></SelectContent></Select><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="grace">Grace</SelectItem><SelectItem value="suspended">Suspended</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent></Select></div>
      <div className="surface divide-y overflow-hidden">{churches.map(c=><button key={c.id} onClick={()=>setSelected(c)} className="flex w-full flex-wrap items-center gap-4 p-4 text-left transition-colors hover:bg-muted/50"><div className="min-w-48 flex-1"><p className="font-semibold">{c.name}</p><p className="text-xs text-muted-foreground">/c/{c.subdomain} · created {fmtDate(c.created_at)}</p></div><div className="hidden text-right sm:block"><p className="text-sm font-semibold">{c.members.toLocaleString()} members</p><p className="text-xs text-muted-foreground">{c.staff} staff seats used</p></div><Badge variant="secondary" className="capitalize">{c.tier}</Badge><Badge variant={c.status==="active"?"default":"outline"} className="capitalize">{c.status}</Badge></button>)}{!churches.length&&<p className="p-10 text-center text-sm text-muted-foreground">No churches match these filters.</p>}</div></TabsContent>
      <TabsContent value="payments"><div className="surface divide-y">{d.recent_payments.map(p=><div key={p.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto_auto_auto]"><div><p className="font-medium">{p.church}</p><p className="text-xs text-muted-foreground">{fmtDate(p.created_at)} · {p.channel??"Unknown channel"}</p></div><Badge variant="secondary" className="w-fit capitalize">{p.tier}</Badge><p className="font-semibold">{p.currency} {Number(p.amount).toFixed(2)}</p><Badge variant={p.status==="success"?"default":"outline"} className="w-fit capitalize">{p.status}</Badge></div>)}{!d.recent_payments.length&&<p className="p-10 text-center text-sm text-muted-foreground">No recent payments.</p>}</div></TabsContent>
      <TabsContent value="reviews" className="space-y-4">
        <div className="surface divide-y">
          {pendingReviews.map(r=>
            <div key={r.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto]">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{r.church_name}</p>
                  <div className="flex gap-0.5">{Array.from({length:5}).map((_,i)=><Star key={i} className={`size-3.5 ${i<r.rating?"fill-primary text-primary":"text-muted-foreground"}`}/>)}</div>
                </div>
                <p className="mt-1 text-sm">“{r.quote}”</p>
                <p className="mt-1 text-xs text-muted-foreground">{r.author_name}{r.author_role?` · ${r.author_role}`:""} · {fmtDate(r.created_at)}</p>
              </div>
              <div className="flex items-start gap-2">
                <Button size="sm" disabled={setReviewStatus.isPending} onClick={()=>setReviewStatus.mutate({id:r.id,status:"approved"})}><Check className="size-4"/> Approve</Button>
                <Button size="sm" variant="outline" disabled={setReviewStatus.isPending} onClick={()=>setReviewStatus.mutate({id:r.id,status:"rejected"})}><X className="size-4"/> Reject</Button>
              </div>
            </div>
          )}
          {!pendingReviews.length&&<p className="p-10 text-center text-sm text-muted-foreground">No reviews waiting for approval.</p>}
        </div>
        {decidedReviews.length>0&&<div className="surface divide-y">
          {decidedReviews.map(r=>
            <div key={r.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto]">
              <div>
                <p className="font-medium">{r.church_name} <span className="font-normal text-muted-foreground">— {r.author_name}</span></p>
                <p className="mt-1 text-sm text-muted-foreground">“{r.quote}”</p>
              </div>
              <Badge variant={r.status==="approved"?"default":"outline"} className="h-fit w-fit capitalize">{r.status}</Badge>
            </div>
          )}
        </div>}
      </TabsContent>
      <TabsContent value="audit"><div className="surface divide-y">{d.audit.map(a=><div key={a.id} className="p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-mono text-xs font-semibold">{a.action}</p><p className="text-xs text-muted-foreground">{fmtDate(a.created_at)}</p></div><p className="mt-1 text-sm">{a.church??"Platform"}</p></div>)}{!d.audit.length&&<p className="p-10 text-center text-sm text-muted-foreground">No platform actions yet.</p>}</div></TabsContent>
    </Tabs></main>
    <Dialog open={!!selected} onOpenChange={open=>!open&&setSelected(null)}><DialogContent>{selected&&<><DialogHeader><DialogTitle>{selected.name}</DialogTitle><DialogDescription>Account and billing health. Member-level records are intentionally unavailable.</DialogDescription></DialogHeader><div className="grid gap-3 rounded-xl bg-muted/50 p-4 text-sm sm:grid-cols-2"><p><span className="text-muted-foreground">Package</span><br/><b className="capitalize">{selected.tier}</b></p><p><span className="text-muted-foreground">Status</span><br/><b className="capitalize">{selected.status}</b></p><p><span className="text-muted-foreground">Members</span><br/><b>{selected.members}</b></p><p><span className="text-muted-foreground">Staff</span><br/><b>{selected.staff}</b></p><p><span className="text-muted-foreground">Trial ends</span><br/><b>{fmtDate(selected.trial_ends_at)}</b></p><p><span className="text-muted-foreground">Last payment</span><br/><b>{selected.last_payment_status??"None"}</b></p></div><DialogFooter><Button variant="outline" onClick={()=>grantSpace.mutate(selected.id)}>Set extra space</Button><Button variant="outline" onClick={()=>{setForm({id:selected.id,name:selected.name,subdomain:selected.subdomain,tier:selected.tier,status:selected.status,contact_email:selected.contact_email??"",contact_phone:selected.contact_phone??""});setSelected(null)}}><Pencil className="size-4"/> Edit</Button><Button variant={selected.status==="active"?"destructive":"default"} onClick={()=>{const next=selected.status==="active"?"suspended":"active";if(window.confirm(`${next==="suspended"?"Suspend":"Restore"} ${selected.name}?`))changeStatus.mutate({id:selected.id,next})}}>{selected.status==="active"?"Suspend":"Restore"}</Button></DialogFooter></>}</DialogContent></Dialog>
    <Dialog open={!!form} onOpenChange={open=>!open&&setForm(null)}><DialogContent><DialogHeader><DialogTitle>{form?.id?"Edit church account":"Create church shell"}</DialogTitle><DialogDescription>This creates the operational account only. It does not grant Prime Haven access to church records.</DialogDescription></DialogHeader>{form&&<form className="space-y-4" onSubmit={e=>{e.preventDefault();save.mutate(form)}}><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label>Church name</Label><Input required minLength={2} maxLength={120} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div><div className="space-y-2"><Label>Subdomain</Label><Input required pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" value={form.subdomain} onChange={e=>setForm({...form,subdomain:e.target.value.toLowerCase()})}/></div><div className="space-y-2"><Label>Package</Label><Select value={form.tier} onValueChange={value=>setForm({...form,tier:value as Form["tier"]})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="free">Free</SelectItem><SelectItem value="basic">Standard</SelectItem><SelectItem value="standard">Pro</SelectItem><SelectItem value="premium">Premium</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Contact email</Label><Input type="email" value={form.contact_email} onChange={e=>setForm({...form,contact_email:e.target.value})}/></div><div className="space-y-2"><Label>Contact phone</Label><Input value={form.contact_phone} onChange={e=>setForm({...form,contact_phone:e.target.value})}/></div>{form.id&&<div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={value=>setForm({...form,status:value as Form["status"]})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="grace">Grace</SelectItem><SelectItem value="suspended">Suspended</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent></Select></div>}</div><DialogFooter><Button type="button" variant="outline" onClick={()=>setForm(null)}>Cancel</Button><Button type="submit" disabled={save.isPending}>{save.isPending?"Saving…":"Save church"}</Button></DialogFooter></form>}</DialogContent></Dialog>
  </div>;
}