import { useEffect, useState } from "react";

export function BeeCursor() {
  const [enabled, setEnabled] = useState(true);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [trail, setTrail] = useState<{ id: number; x: number; y: number }[]>([]);
  const [angle, setAngle] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    
    const updateStatus = () => {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("bee-cursor-enabled");
        setEnabled(stored !== "false"); // Defaults to true
      }
    };

    updateStatus();

    window.addEventListener("bee-cursor-toggle", updateStatus);
    return () => {
      window.removeEventListener("bee-cursor-toggle", updateStatus);
    };
  }, []);

  useEffect(() => {
    if (!isMounted || !enabled) return;

    // Hide default cursor globally
    const style = document.createElement("style");
    style.id = "bee-cursor-hide-native";
    style.innerHTML = `
      *, *::before, *::after {
        cursor: none !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      const el = document.getElementById("bee-cursor-hide-native");
      if (el) el.remove();
    };
  }, [isMounted, enabled]);

  useEffect(() => {
    if (!isMounted || !enabled) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let trailId = 0;

    const handleMouseMove = (e: MouseEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;

      // Detect hover over interactive elements
      const target = e.target as HTMLElement | null;
      if (target) {
        const isInteractive = 
          target.tagName === "BUTTON" ||
          target.tagName === "A" ||
          target.closest("button") ||
          target.closest("a") ||
          window.getComputedStyle(target).cursor === "pointer" ||
          target.getAttribute("role") === "button" ||
          target.classList.contains("cursor-pointer");

        setIsHovering(!!isInteractive);
      }
    };

    const handleMouseDown = () => setIsClicking(true);
    const handleMouseUp = () => setIsClicking(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);

    let frameId: number;
    const animate = () => {
      const dx = targetX - currentX;
      const dy = targetY - currentY;

      // Damping/Interpolation for smooth glide
      currentX += dx * 0.18;
      currentY += dy * 0.18;

      setPosition({ x: currentX, y: currentY });

      // Rotate based on movement direction (flip horizontal)
      if (Math.abs(dx) > 0.5) {
        const targetAngle = dx > 0 ? 0 : 180;
        setAngle(targetAngle);
      }

      // Generate golden honey trails
      if (Math.random() < 0.25 && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
        const id = trailId++;
        setTrail((prev) => [
          ...prev.slice(-8),
          { id, x: currentX, y: currentY }
        ]);
        setTimeout(() => {
          setTrail((prev) => prev.filter((t) => t.id !== id));
        }, 600);
      }

      frameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      cancelAnimationFrame(frameId);
    };
  }, [isMounted, enabled]);

  // Safe SSR escape
  if (!isMounted || !enabled) return null;

  return (
    <>
      {/* Honey droplets trails */}
      {trail.map((t) => (
        <div
          key={t.id}
          className="fixed pointer-events-none z-[9999] rounded-full bg-amber-400/90"
          style={{
            left: t.x - 3,
            top: t.y - 3,
            width: "6px",
            height: "6px",
            boxShadow: "0 0 6px 1px rgba(245, 158, 11, 0.6)",
            animation: "honey-drop 0.6s ease-out forwards",
          }}
        />
      ))}

      {/* Main Bee/Honey cursor icon */}
      <div
        className="fixed pointer-events-none z-[10000] select-none flex items-center justify-center transition-transform duration-100 ease-out"
        style={{
          left: position.x,
          top: position.y,
          transform: `translate(-50%, -50%) scale(${isClicking ? 0.85 : isHovering ? 1.25 : 1.0})`,
        }}
      >
        <div
          className="text-2xl transition-transform duration-200"
          style={{
            transform: `scaleX(${angle === 180 ? -1 : 1})`,
          }}
        >
          {isHovering ? "🍯" : "🐝"}
        </div>
      </div>
    </>
  );
}
