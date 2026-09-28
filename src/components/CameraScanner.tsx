import { Scanner } from "@yudiel/react-qr-scanner";

/**
 * High-definition browser QR scanner with crisp auto-focus constraints
 * and format restriction strictly to qr_code for fastest decode latency.
 */
export default function CameraScanner({
  onToken,
  paused = false,
}: {
  onToken: (token: string) => void;
  paused?: boolean;
}) {
  return (
    <Scanner
      onScan={(codes) => {
        if (paused) return;
        const value = codes[0]?.rawValue;
        if (value) onToken(value.trim());
      }}
      onError={() => {}}
      paused={paused}
      formats={["qr_code"]}
      sound={false}
      scanDelay={80}
      constraints={{
        facingMode: "environment",
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 },
        frameRate: { ideal: 30, max: 60 },
      }}
      styles={{
        container: { width: "100%", height: "100%" },
        video: { objectFit: "cover" },
      }}
    />
  );
}
