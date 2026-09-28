import QRCode from "qrcode";

/** QR code PNG with the church and member name printed underneath. */
export async function labelledQr(
  token: string,
  church: string,
  name: string,
  kind = "Member",
): Promise<string> {
  const qr = await QRCode.toDataURL(token, { width: 480, margin: 2 });
  const img = new Image();
  img.src = qr;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 580;
  const ctx = canvas.getContext("2d");
  if (!ctx) return qr;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 480, 580);
  ctx.drawImage(img, 0, 0, 480, 480);
  ctx.fillStyle = "#0f172a";
  ctx.textAlign = "center";
  ctx.font = "bold 24px sans-serif";
  ctx.fillText(name.slice(0, 34), 240, 512);
  ctx.fillStyle = "#3b82f6";
  ctx.font = "600 16px sans-serif";
  ctx.fillText(`${kind} · ${church}`.slice(0, 50), 240, 544);
  return canvas.toDataURL("image/png");
}
