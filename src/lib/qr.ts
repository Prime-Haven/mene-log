import QRCode from "qrcode/lib/browser";

/** QR code PNG with the church, member name, and member code printed underneath. */
export async function labelledQr(
  token: string,
  church: string,
  name: string,
  kind = "Member",
  memberCode?: string | null,
): Promise<string> {
  const qrPayload = memberCode || token;
  const qr = await QRCode.toDataURL(qrPayload, { width: 480, margin: 2 });
  const img = new Image();
  img.src = qr;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 600;
  const ctx = canvas.getContext("2d");
  if (!ctx) return qr;

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 480, 600);
  ctx.drawImage(img, 0, 0, 480, 480);

  // Member Name
  ctx.fillStyle = "#0f172a";
  ctx.textAlign = "center";
  ctx.font = "bold 23px sans-serif";
  ctx.fillText(name.slice(0, 32), 240, 510);

  // Church & Role
  ctx.fillStyle = "#3b82f6";
  ctx.font = "600 15px sans-serif";
  ctx.fillText(`${kind} · ${church}`.slice(0, 46), 240, 538);

  // Member Code
  const displayCode = memberCode || (token.length <= 16 ? token : token.slice(0, 10).toUpperCase());
  ctx.fillStyle = "#64748b";
  ctx.font = "bold 14px monospace";
  ctx.fillText(`Code: ${displayCode}`, 240, 568);

  return canvas.toDataURL("image/png");
}
