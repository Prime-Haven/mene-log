import { createFileRoute } from "@tanstack/react-router";
import { ProductPage } from "@/components/ProductPage";

const url = "https://menelog.site/church-check-in-software";

export const Route = createFileRoute("/church-check-in-software")({
  head: () => ({
    meta: [
      { title: "Church Check-In Software with QR Attendance — Mene:Log" },
      { name: "description", content: "Church check-in software with fast QR attendance, branded check-in pages, member codes, service registers and secure reporting." },
      { property: "og:title", content: "Church Check-In Software with QR Attendance — Mene:Log" },
      { property: "og:description", content: "Welcome members and first-timers with fast QR check-in and a clear, secure attendance register." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: "https://menelog.site/og-image.jpg" },
      { name: "twitter:image", content: "https://menelog.site/og-image.jpg" },
      { name: "robots", content: "index, follow" },
    ],
    links: [{ rel: "canonical", href: url }],
  }),
  component: CheckInSoftwarePage,
});

function CheckInSoftwarePage() {
  return <ProductPage eyebrow="Church check-in software" title="A faster welcome at every church door." intro="Mene:Log makes attendance simple with branded church pages, QR codes, secure member codes and an usher-friendly register that works on phones." highlights={[
    { title: "Fast QR check-in", body: "Members can use their saved QR code while first-timers can enter through your church's branded public check-in page." },
    { title: "Built around each service", body: "Create services, open attendance, record people manually when needed, and review the final register from one place." },
    { title: "Private by design", body: "A public check-in never reveals the membership list. Each church's records remain isolated and protected by role-based permissions." },
  ]} workflow={["Create a service and share your permanent church check-in address.", "Members scan their QR code or use the church's guided check-in page.", "Ushers resolve exceptions through a focused attendance workspace.", "Leaders review attendance trends and follow up with care after the service."]} />;
}