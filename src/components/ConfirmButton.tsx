"use client";
import { useFormStatus } from "react-dom";

export function ConfirmButton({
  children, message, className = "btn-danger btn-sm", name, value,
}: { children: React.ReactNode; message: string; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      className={className}
      disabled={pending}
      name={name}
      value={value}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

export function SubmitButton({ children, className = "btn-primary" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending}>
      {pending ? "Enregistrement…" : children}
    </button>
  );
}
