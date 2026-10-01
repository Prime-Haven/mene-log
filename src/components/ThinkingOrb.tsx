import { useEffect, useRef } from "react";

interface Point3D {
  x: number;
  y: number;
  z: number;
  baseRadius: number;
  alpha: number;
}

interface OrbCallout {
  pointIndex: number;
  label: string;
  baseValue: number;
  range: number;
  suffix?: string;
}

const callouts: OrbCallout[] = [
  { pointIndex: 118, label: "Checked in", baseValue: 412, range: 27 },
  { pointIndex: 286, label: "First-timers", baseValue: 18, range: 9, suffix: "+" },
  { pointIndex: 453, label: "Attendance", baseValue: 86, range: 8, suffix: "%" },
  { pointIndex: 647, label: "Services", baseValue: 12, range: 5 },
  { pointIndex: 826, label: "Branches", baseValue: 6, range: 4 },
];

export function ThinkingOrb({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Responsive resize listener
    const onResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener("resize", onResize);

    // Mouse coordinates with easing
    let targetRotationX = 0;
    let targetRotationY = 0;
    let rotationX = 0;
    let rotationY = 0;

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left - width / 2;
      const y = e.clientY - rect.top - height / 2;
      targetRotationY = (x / width) * 1.5;
      targetRotationX = -(y / height) * 1.2;
    };

    window.addEventListener("mousemove", onMouseMove);

    // Generate huge sphere points using golden ratio Fibonacci spiral
    const NUM_POINTS = 950;
    const points: Point3D[] = [];
    const phi = Math.PI * (3 - Math.sqrt(5)); // Golden angle

    for (let i = 0; i < NUM_POINTS; i++) {
      const y = 1 - (i / (NUM_POINTS - 1)) * 2; // y goes from 1 to -1
      const radiusAtY = Math.sqrt(1 - y * y); // radius at y
      const theta = phi * i;

      const x = Math.cos(theta) * radiusAtY;
      const z = Math.sin(theta) * radiusAtY;

      points.push({
        x,
        y,
        z,
        baseRadius: Math.random() > 0.92 ? 2.5 : Math.random() > 0.7 ? 1.8 : 1.2,
        alpha: 0.3 + Math.random() * 0.7,
      });
    }

    let angle = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Smooth inertia rotation interpolation
      rotationX += (targetRotationX - rotationX) * 0.05;
      rotationY += (targetRotationY - rotationY) * 0.05;
      if (!reducedMotion) angle += 0.0035;

      const sphereRadius = Math.min(width, height) * 0.52;
      const centerX = width / 2;
      const centerY = height / 2;

      // Combined rotation angles
      const rotY = angle + rotationY;
      const rotX = rotationX * 0.5;

      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);

      // Sort points from back to front for proper depth rendering
      const projectedPoints: Array<{
        index: number;
        px: number;
        py: number;
        size: number;
        opacity: number;
        z: number;
      }> = [];

      for (let i = 0; i < points.length; i++) {
        const pt = points[i];

        // 3D rotation around Y axis
        const x1 = pt.x * cosY - pt.z * sinY;
        const z1 = pt.z * cosY + pt.x * sinY;

        // 3D rotation around X axis
        const y1 = pt.y * cosX - z1 * sinX;
        const z2 = z1 * cosX + pt.y * sinX;

        // Perspective projection
        const fov = 1.8;
        const scale = fov / (fov + z2 * 0.65);
        const px = centerX + x1 * sphereRadius * scale;
        const py = centerY + y1 * sphereRadius * scale;

        // Depth cueing: front dots are larger, brighter; back dots are smaller and translucent
        const depthNorm = (z2 + 1) / 2; // 0 (back) to 1 (front)
        const size = pt.baseRadius * (0.5 + depthNorm * 0.85);
        const opacity = Math.max(0.1, Math.min(1, pt.alpha * (0.15 + depthNorm * 0.85)));

        projectedPoints.push({ index: i, px, py, size, opacity, z: z2 });
      }

      // Sort back to front
      projectedPoints.sort((a, b) => a.z - b.z);

      // Draw atmospheric center halo glow
      const glowGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        sphereRadius * 0.1,
        centerX,
        centerY,
        sphereRadius * 1.15
      );
      glowGrad.addColorStop(0, "rgba(56, 189, 248, 0.12)"); // Sky blue
      glowGrad.addColorStop(0.4, "rgba(99, 102, 241, 0.08)"); // Indigo
      glowGrad.addColorStop(0.7, "rgba(168, 85, 247, 0.04)"); // Purple
      glowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, sphereRadius * 1.2, 0, Math.PI * 2);
      ctx.fill();

      // Draw all polka dots with depth glow
      for (const p of projectedPoints) {
        ctx.beginPath();
        ctx.arc(p.px, p.py, p.size, 0, Math.PI * 2);

        // Highlight front dots with radiant cyan-white tint
        if (p.z > 0.4) {
          ctx.fillStyle = `rgba(230, 245, 255, ${p.opacity})`;
          ctx.shadowColor = "rgba(56, 189, 248, 0.75)";
          ctx.shadowBlur = 6;
        } else if (p.z > -0.2) {
          ctx.fillStyle = `rgba(147, 197, 253, ${p.opacity * 0.9})`;
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = `rgba(99, 102, 241, ${p.opacity * 0.6})`;
          ctx.shadowBlur = 0;
        }

        ctx.fill();
      }

      // A handful of individual dots carry live, counting attendance signals.
      // Keeping these in the canvas makes every connector travel with its dot.
      const elapsedStep = reducedMotion ? 0 : Math.floor(performance.now() / 1100);
      const compact = width < 640;
      const labelWidth = compact ? 112 : 138;
      const labelHeight = compact ? 38 : 42;

      callouts.forEach((callout, calloutIndex) => {
        const point = projectedPoints.find((candidate) => candidate.index === callout.pointIndex);
        if (!point) return;

        const depthOpacity = Math.max(0.22, Math.min(0.92, (point.z + 1.1) / 1.8));
        const placeRight = point.px < centerX;
        const horizontalReach = compact ? 26 : 42;
        const labelX = Math.max(
          8,
          Math.min(
            width - labelWidth - 8,
            placeRight ? point.px + horizontalReach : point.px - horizontalReach - labelWidth,
          ),
        );
        const verticalOffset = calloutIndex % 2 === 0 ? -labelHeight - 12 : 12;
        const labelY = Math.max(82, Math.min(height - labelHeight - 24, point.py + verticalOffset));
        const lineEndX = placeRight ? labelX : labelX + labelWidth;
        const lineEndY = labelY + labelHeight / 2;
        const value = callout.baseValue + ((elapsedStep + calloutIndex * 2) % callout.range);
        const renderedValue = `${callout.suffix === "+" ? "+" : ""}${value}${callout.suffix === "%" ? "%" : ""}`;

        ctx.save();
        ctx.globalAlpha = depthOpacity;
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(125, 211, 252, 0.72)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(point.px, point.py);
        ctx.lineTo(lineEndX, lineEndY);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(point.px, point.py, compact ? 4 : 5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(240, 249, 255, 0.98)";
        ctx.shadowColor = "rgba(56, 189, 248, 0.9)";
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = "rgba(5, 10, 24, 0.82)";
        ctx.strokeStyle = "rgba(125, 211, 252, 0.48)";
        ctx.beginPath();
        ctx.roundRect(labelX, labelY, labelWidth, labelHeight, 7);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "rgba(186, 230, 253, 0.78)";
        ctx.font = `${compact ? 8 : 9}px Manrope, sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillText(callout.label.toUpperCase(), labelX + 10, labelY + 7);
        ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
        ctx.font = `700 ${compact ? 13 : 15}px Sora, sans-serif`;
        ctx.fillText(renderedValue, labelX + 10, labelY + (compact ? 19 : 20));
        ctx.restore();
      });

      ctx.shadowBlur = 0;
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  return (
    <div className={`relative overflow-hidden pointer-events-none ${className}`}>
      {/* Blurred world globe backdrop glow */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(37,99,235,0.18)_0%,_rgba(79,70,229,0.12)_35%,_rgba(15,23,42,0.85)_80%)] blur-2xl"
      />
      {/* High-fidelity interactive dot canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </div>
  );
}
