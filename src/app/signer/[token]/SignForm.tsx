"use client";

import { useRef, useState } from "react";
import { Flash } from "@/components/Flash";

export function SignForm({ defaultName, action }: { defaultName: string; action: (fd: FormData) => Promise<void> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const ink = useRef(false);
  const [error, setError] = useState<{ text: string; at: number } | null>(null);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext("2d")!;
    const p = point(e);
    ctx.strokeStyle = "#1e3a5f";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    drawing.current = true;
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ink.current = true;
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    ink.current = false;
  }

  return (
    <form
      action={action}
      className="card card-pad space-y-4"
      onSubmit={(e) => {
        if (!ink.current) {
          e.preventDefault();
          setError({ text: "Signez dans le cadre avant d'envoyer.", at: Date.now() });
          return;
        }
        const input = e.currentTarget.elements.namedItem("signature") as HTMLInputElement;
        input.value = canvasRef.current!.toDataURL("image/png");
      }}
    >
      <input type="hidden" name="signature" defaultValue="" />
      <p className="text-lg font-bold tracking-tight text-navy">Bon pour accord</p>
      <p className="text-sm text-navy-600/80">Signez avec la souris ou le doigt. Cette signature vaut acceptation du devis.</p>
      <div>
        <label className="label" htmlFor="signerName">Nom du signataire</label>
        <input id="signerName" name="signerName" className="input" required defaultValue={defaultName} maxLength={200} />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="label mb-0">Signature</span>
          <button type="button" className="text-sm font-bold text-navy-600 transition hover:text-navy" onClick={clear}>Effacer</button>
        </div>
        <canvas
          ref={canvasRef}
          width={900}
          height={240}
          className="h-36 w-full touch-none cursor-crosshair rounded-xl border border-navy-200 bg-white"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
      </div>
      <label className="flex items-start gap-2 text-sm font-bold text-navy">
        <input type="checkbox" name="accord" value="1" required className="mt-1 h-4 w-4 accent-[#2C3E50]" />
        Je reconnais avoir pris connaissance du devis et je le signe pour accord.
      </label>
      {error && <Flash key={error.at} className="mb-0" tone="error" message={error.text} />}
      <button className="btn-primary">Signer le devis</button>
    </form>
  );
}
