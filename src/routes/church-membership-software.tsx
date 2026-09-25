import { createFileRoute } from "@tanstack/react-router";
import { ProductPage } from "@/components/ProductPage";

const url = "https://menelog.site/church-membership-software";

export const Route = createFileRoute("/church-membership-software")({
  head: () => ({
    meta: [
      { title: "Church Membership Software for Growing Churches — Mene:Log" },
      { name: "description", content: "Church membership software for secure member records, attendance, follow-up, leadership groups, branches and clear church reports." },
      { property: "og:title", content: "Church Membership Software for Growing Churches — Mene:Log" },
      { property: "og:description", content: "Keep membership, attendance, care, leadership and branch records connected in one secure church workspace." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: "https://menelog.site/og-image.jpg" },
      { name: "twitter:image", content: "https://menelog.site/og-image.jpg" },
      { name: "robots", content: "index, follow" },
    ],
    links: [{ rel: "canonical", href: url }],
  }),
  component: MembershipSoftwarePage,
});

function MembershipSoftwarePage() {
  return <ProductPage eyebrow="Church membership software" title="Know your church beyond a list of names." intro="Mene:Log gives church teams one protected place for membership, attendance, follow-up, leadership structure and branch oversight — without turning pastoral care into paperwork." highlights={[
    { title: "One complete member record", body: "Keep contact details, membership status, groups and attendance history together in a searchable church registry." },
    { title: "Attendance connected to care", body: "See presence and absence patterns, identify people who may need follow-up, and keep every action within the church workspace." },
    { title: "Access shaped by responsibility", body: "Administrators, ushers and leaders see only the tools and people appropriate to their role, with church-level data isolation." },
  ]} workflow={["Import or add your existing membership records.", "Organize people around your church's branches, ministries, units or cells.", "Record attendance and turn clear patterns into thoughtful follow-up.", "Share aggregate reports with leaders without exposing unnecessary personal information."]} />;
}