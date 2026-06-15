import { useEffect, useRef } from "react";

const COLORS = [
  "#FF4136", // Red
  "#FF851B", // Orange
  "#FFDC00", // Yellow
  "#2ECC40", // Green
  "#0074D9", // Blue
  "#7B68EE", // Medium Slate Blue
  "#FF69B4", // Hot Pink
  "#B10DC9", // Purple
  "#FF6B6B", // Coral Red
  "#4ECDC4"  // Turquoise
];

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Detect if mobile to optimize performance
    const isMobile = window.innerWidth < 768;
    const maxParticles = isMobile ? 100 : 300;

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      rotation: number;
      rotationSpeed: number;
      size: number;
      color: string;
      opacity: number;
      decay: number;
    }

    let particles: Particle[] = [];

    // Create a particle helper
    const createParticle = (x: number, y: number, isInitial = false) => {
      const size = Math.random() * 4 + 2; // 2px to 6px
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2 + 0.5;

      // Slow drift for initial particles, burst speed for mouse spawn
      const vx = isInitial 
        ? (Math.random() - 0.5) * 0.8
        : Math.cos(angle) * speed + (Math.random() - 0.5) * 0.5;
      const vy = isInitial
        ? (Math.random() - 0.5) * 0.8
        : Math.sin(angle) * speed - 1.0; // slightly upwards burst then fall

      particles.push({
        x,
        y,
        vx,
        vy,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.05,
        size,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        opacity: isInitial ? Math.random() * 0.5 + 0.2 : 1.0,
        decay: Math.random() * 0.008 + 0.004 // decays over 100-250 frames
      });
    };

    // Initialize floating particles spread across the screen
    const initialCount = isMobile ? 30 : 80;
    for (let i = 0; i < initialCount; i++) {
      createParticle(Math.random() * width, Math.random() * height, true);
    }

    // Tracking last mouse position to throttle spawning
    let lastX = 0;
    let lastY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Spawn particles only if mouse has moved a certain distance (throttling)
      const threshold = isMobile ? 25 : 12;
      if (dist > threshold) {
        // Spawn 1-3 particles
        const spawnCount = Math.min(3, Math.floor(dist / threshold));
        for (let i = 0; i < spawnCount; i++) {
          if (particles.length < maxParticles) {
            // Add a tiny random offset around the cursor
            const rx = e.clientX + (Math.random() - 0.5) * 8;
            const ry = e.clientY + (Math.random() - 0.5) * 8;
            createParticle(rx, ry);
          }
        }
        lastX = e.clientX;
        lastY = e.clientY;
      }
    };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("resize", handleResize);

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Loop backwards to allow safe deletion
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        // Apply light gravity and drift
        p.vy += 0.035; // gravity pulling particles down
        p.vx += Math.sin(p.rotation * 2) * 0.01; // subtle wind drift

        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        p.opacity -= p.decay;

        // Remove if faded or out of bounds
        if (p.opacity <= 0 || p.y > height + 20 || p.x < -20 || p.x > width + 20) {
          particles.splice(i, 1);
          continue;
        }

        // Draw particle (oval/pill shape)
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;

        // Pill dimensions: width is longer, height is size
        const w = p.size * 2.2;
        const h = p.size;

        ctx.beginPath();
        // Draw centered rectangle (which becomes a pill at small scale)
        ctx.rect(-w / 2, -h / 2, w, h);
        ctx.fill();
        ctx.restore();
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none"
      }}
    />
  );
}
