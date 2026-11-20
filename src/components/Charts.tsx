"use client";
import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ");
const short = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M` : n >= 1000 ? `${Math.round(n / 1000)} k` : String(n));

export function MonthlyChart({ data }: { data: { label: string; facture: number; encaisse: number; depenses: number }[] }) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return (
    <div className="h-[240px] w-full min-w-0 sm:h-[280px]">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barGap={narrow ? 1 : 2} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#dbe2eb" strokeDasharray="3 3" />
        <XAxis dataKey="label" interval={narrow ? 1 : 0} tickLine={false} axisLine={false} tick={{ fill: "#6B7A89", fontSize: narrow ? 10 : 12 }} />
        <YAxis tickFormatter={short} tickLine={false} axisLine={false} tick={{ fill: "#6B7A89", fontSize: narrow ? 10 : 12 }} width={narrow ? 32 : 48} />
        <Tooltip
          formatter={(v, name) => [`${fmt(Number(v))} FDJ`, String(name)]}
          cursor={{ fill: "rgba(245,166,35,0.08)" }}
          contentStyle={{
            borderRadius: 14,
            border: "1px solid #dbe2eb",
            boxShadow: "0 20px 38px -28px rgba(24,34,44,0.65)",
            fontFamily: "Carlito, Calibri, sans-serif",
            backgroundColor: "rgba(255,255,255,0.96)",
            backdropFilter: "blur(6px)",
          }}
        />
        <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
        <Bar dataKey="facture" name="Facturé" fill="#2f4458" radius={[7, 7, 0, 0]} maxBarSize={narrow ? 8 : 18} />
        <Bar dataKey="encaisse" name="Encaissé" fill="#f5a623" radius={[7, 7, 0, 0]} maxBarSize={narrow ? 8 : 18} />
        <Bar dataKey="depenses" name="Dépenses" fill="#9dacbc" radius={[7, 7, 0, 0]} maxBarSize={narrow ? 8 : 18} />
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}
