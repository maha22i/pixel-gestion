"use client";

import { useState } from "react";

export function ImageField({
  id, name, removeName, label, help, customSrc, fallbackSrc, fallbackCaption, customCaption, removeLabel, tall,
}: {
  id: string; name: string; removeName: string; label: string; help: string;
  customSrc: string | null; fallbackSrc: string; fallbackCaption: string; customCaption: string; removeLabel: string;
  tall?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  const shown = preview ?? (remove || !customSrc ? fallbackSrc : customSrc);
  const usingDefault = !preview && (remove || !customSrc);

  return (
    <div className="sm:col-span-2">
      <label className="label" htmlFor={id}>{label}</label>
      <p className="text-sm text-navy-600/80 mb-3">{help}</p>
      <div className="flex flex-wrap items-center gap-4">
        <div className={`${tall ? "h-32 w-full max-w-md" : "h-20 w-44"} rounded-lg border border-navy-100 bg-white grid place-items-center overflow-hidden`}>
          <img src={shown} alt={`Aperçu : ${label}`} className={tall ? "max-h-28 max-w-full object-contain" : "max-h-16 max-w-[160px] object-contain"} />
        </div>
        <div className="min-w-0 flex-1">
          <input
            id={id}
            type="file"
            name={name}
            accept="image/png,image/jpeg,.png,.jpg,.jpeg"
            className="block w-full max-w-md text-sm text-navy-700 file:mr-3 file:h-9 file:rounded-lg file:border-0 file:bg-navy file:px-3.5 file:font-bold file:text-white hover:file:bg-navy-800"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setRemove(false);
              setPreview((old) => {
                if (old) URL.revokeObjectURL(old);
                return file ? URL.createObjectURL(file) : null;
              });
            }}
          />
          <p className="mt-2 text-sm text-navy-600/70">{usingDefault ? fallbackCaption : customCaption}</p>
          {customSrc && (
            <label className="mt-2 flex items-center gap-2 text-sm font-bold text-navy-700">
              <input
                type="checkbox"
                name={removeName}
                value="1"
                checked={remove}
                onChange={(e) => {
                  setRemove(e.target.checked);
                  if (e.target.checked) {
                    setPreview((old) => {
                      if (old) URL.revokeObjectURL(old);
                      return null;
                    });
                    const input = document.getElementById(id) as HTMLInputElement | null;
                    if (input) input.value = "";
                  }
                }}
              />
              {removeLabel}
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
