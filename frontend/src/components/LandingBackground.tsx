'use client';

import { useEffect, useRef } from 'react';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  pulsePhase: number;
  pulseSpeed: number;
  type: 'pick' | 'player' | 'budget';
  label?: string;
}

interface Connection {
  from: number;
  to: number;
  opacity: number;
  progress: number;
  speed: number;
  active: boolean;
}

const PICK_LABELS = ['$42', '$17', '$31', '$88', '$5', '$63', '$24', '$99', '$11', '$47'];
const PLAYER_LABELS = ['1B', 'OF', 'SP', 'C', '2B', 'SS', 'RP', '3B', 'DH'];

export default function LandingBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<Node[]>([]);
  const connectionsRef = useRef<Connection[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mint = { r: 30, g: 201, b: 166 };
    const sky = { r: 125, g: 211, b: 252 };

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);

    const W = () => canvas.offsetWidth;
    const H = () => canvas.offsetHeight;

    // Bias nodes toward bottom-right quadrant
    const spawnNode = (): Node => {
      const inBottomRight = Math.random() < 0.65;
      const x = inBottomRight
        ? W() * 0.5 + Math.random() * W() * 0.5
        : Math.random() * W();
      const y = inBottomRight
        ? H() * 0.45 + Math.random() * H() * 0.55
        : Math.random() * H();

      const types: Node['type'][] = ['pick', 'player', 'budget'];
      const type = types[Math.floor(Math.random() * types.length)];
      const label =
        type === 'pick'
          ? PICK_LABELS[Math.floor(Math.random() * PICK_LABELS.length)]
          : type === 'player'
          ? PLAYER_LABELS[Math.floor(Math.random() * PLAYER_LABELS.length)]
          : undefined;

      return {
        x,
        y,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        radius: type === 'pick' ? 18 : type === 'player' ? 14 : 8,
        opacity: 0,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.01 + Math.random() * 0.02,
        type,
        label,
      };
    };

    // Init nodes
    const NODE_COUNT = 28;
    nodesRef.current = Array.from({ length: NODE_COUNT }, spawnNode).map((n) => ({
      ...n,
      opacity: Math.random() * 0.6 + 0.1,
    }));

    // Init connections
    const spawnConnection = (): Connection => ({
      from: Math.floor(Math.random() * NODE_COUNT),
      to: Math.floor(Math.random() * NODE_COUNT),
      opacity: 0,
      progress: 0,
      speed: 0.003 + Math.random() * 0.005,
      active: true,
    });

    connectionsRef.current = Array.from({ length: 20 }, spawnConnection);

    let tick = 0;

    const draw = () => {
      const w = W();
      const h = H();
      ctx.clearRect(0, 0, w, h);
      tick++;

      const nodes = nodesRef.current;
      const conns = connectionsRef.current;

      // Update + draw connections
      conns.forEach((conn, i) => {
        const a = nodes[conn.from];
        const b = nodes[conn.to];
        if (!a || !b || a === b) return;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > w * 0.55) {
          connectionsRef.current[i] = spawnConnection();
          return;
        }

        conn.progress += conn.speed;
        if (conn.progress >= 1) {
          conn.opacity = Math.max(0, conn.opacity - 0.02);
          if (conn.opacity <= 0) {
            connectionsRef.current[i] = spawnConnection();
          }
        } else {
          conn.opacity = Math.min(0.35, conn.opacity + 0.01);
        }

        // Draw line up to progress point
        const px = a.x + dx * Math.min(conn.progress, 1);
        const py = a.y + dy * Math.min(conn.progress, 1);

        const grad = ctx.createLinearGradient(a.x, a.y, px, py);
        grad.addColorStop(0, `rgba(${mint.r},${mint.g},${mint.b},0)`);
        grad.addColorStop(0.4, `rgba(${mint.r},${mint.g},${mint.b},${conn.opacity})`);
        grad.addColorStop(1, `rgba(${sky.r},${sky.g},${sky.b},${conn.opacity * 0.5})`);

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(px, py);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Travelling dot
        if (conn.progress < 1) {
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${mint.r},${mint.g},${mint.b},${conn.opacity * 2})`;
          ctx.fill();
        }
      });

      // Update + draw nodes
      nodes.forEach((node) => {
        node.x += node.vx;
        node.y += node.vy;

        // Soft bounce at edges
        if (node.x < 0 || node.x > w) node.vx *= -1;
        if (node.y < 0 || node.y > h) node.vy *= -1;
        node.x = Math.max(0, Math.min(w, node.x));
        node.y = Math.max(0, Math.min(h, node.y));

        node.pulsePhase += node.pulseSpeed;
        const pulse = Math.sin(node.pulsePhase) * 0.15 + 0.85;
        const r = node.radius * pulse;
        const alpha = node.opacity;

        if (node.type === 'pick') {
          // Hexagon-ish pick node
          ctx.save();
          ctx.translate(node.x, node.y);

          // Glow
          const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3);
          glow.addColorStop(0, `rgba(${mint.r},${mint.g},${mint.b},${alpha * 0.3})`);
          glow.addColorStop(1, `rgba(${mint.r},${mint.g},${mint.b},0)`);
          ctx.beginPath();
          ctx.arc(0, 0, r * 3, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();

          // Node body
          ctx.beginPath();
          ctx.roundRect(-r, -r, r * 2, r * 2, 4);
          ctx.fillStyle = `rgba(16,34,53,${alpha * 0.9})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(${mint.r},${mint.g},${mint.b},${alpha * 0.8})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Label
          if (node.label) {
            ctx.fillStyle = `rgba(${mint.r},${mint.g},${mint.b},${alpha})`;
            ctx.font = `bold ${r * 0.75}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.label, 0, 0);
          }
          ctx.restore();
        } else if (node.type === 'player') {
          // Circle player badge
          ctx.save();
          ctx.translate(node.x, node.y);

          const glow2 = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.5);
          glow2.addColorStop(0, `rgba(${sky.r},${sky.g},${sky.b},${alpha * 0.2})`);
          glow2.addColorStop(1, `rgba(${sky.r},${sky.g},${sky.b},0)`);
          ctx.beginPath();
          ctx.arc(0, 0, r * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = glow2;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(16,34,53,${alpha * 0.85})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(${sky.r},${sky.g},${sky.b},${alpha * 0.6})`;
          ctx.lineWidth = 1;
          ctx.stroke();

          if (node.label) {
            ctx.fillStyle = `rgba(${sky.r},${sky.g},${sky.b},${alpha})`;
            ctx.font = `bold ${r * 0.7}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(node.label, 0, 0);
          }
          ctx.restore();
        } else {
          // Small budget dot
          ctx.save();
          ctx.translate(node.x, node.y);
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${mint.r},${mint.g},${mint.b},${alpha * 0.4})`;
          ctx.fill();
          ctx.restore();
        }
      });

      // Subtle bottom-right vignette glow
      const vigGrad = ctx.createRadialGradient(w, h, 0, w, h, w * 0.7);
      vigGrad.addColorStop(0, `rgba(${mint.r},${mint.g},${mint.b},0.04)`);
      vigGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, w, h);

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ opacity: 1 }}
      aria-hidden="true"
    />
  );
}
