"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

/** Liste déroulante de période : la navigation se fait dès qu'on change de valeur. */
export function MonthSelect({ value, options, label }: { value: string; options: { value: string; label: string; href: string }[]; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      key={value}
      aria-label={label}
      defaultValue={value}
      aria-busy={pending}
      className={`input h-9 w-auto min-w-[11.5rem] border-transparent bg-transparent font-bold capitalize shadow-none transition hover:border-navy-200 ${pending ? "opacity-60" : ""}`}
      onChange={(e) => {
        const target = options.find((o) => o.value === e.currentTarget.value);
        if (target) start(() => router.push(target.href, { scroll: false }));
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
