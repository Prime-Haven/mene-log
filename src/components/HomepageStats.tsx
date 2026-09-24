import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { BarChart3, Church, ScanLine, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type PublicStats = {
  churches: number;
  members: number;
  checkins: number;
  average_sunday_attendance: number;
  updated_at: string;
};

const number = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function HomepageStats() {
  const reduceMotion = useReducedMotion();
  const stats = useQuery({
    queryKey: ["public-platform-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_platform_stats");
      if (error) throw error;
      return data as unknown as PublicStats;
    },
    staleTime: 15 * 60 * 1000,
  });

  const rows = [
    { icon: Church, value: stats.data?.churches, label: "active churches" },
    { icon: Users, value: stats.data?.members, label: "members cared for" },
    { icon: ScanLine, value: stats.data?.checkins, label: "check-ins recorded" },
    { icon: BarChart3, value: stats.data?.average_sunday_attendance, label: "average Sunday attendance" },
  ];

  return (
    <section aria-label="Mene:Log activity" className="bg-deep px-5 py-16 text-deep-foreground">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-deep-foreground/55">Growing together</p>
        <div className="mt-7 grid gap-px overflow-hidden rounded-lg border border-deep-foreground/15 bg-deep-foreground/15 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map(({ icon: Icon, value, label }, index) => (
            <motion.div
              key={label}
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, delay: index * 0.07 }}
              className="bg-deep p-6"
            >
              <Icon className="size-5 text-primary" />
              <p className="mt-6 font-display text-3xl font-bold text-deep-foreground">
                {number.format(Number(value ?? 0) || 0)}
              </p>
              <p className="mt-1 text-sm text-deep-foreground/55">{label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}