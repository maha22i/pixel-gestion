"use client";

export function UseMyPosition({ latId, lngId }: { latId: string; lngId: string }) {
  return (
    <button
      type="button"
      className="btn-ghost"
      onClick={() => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition((pos) => {
          const lat = document.getElementById(latId);
          const lng = document.getElementById(lngId);
          if (lat instanceof HTMLInputElement) lat.value = pos.coords.latitude.toFixed(6);
          if (lng instanceof HTMLInputElement) lng.value = pos.coords.longitude.toFixed(6);
        });
      }}
    >
      Utiliser ma position actuelle
    </button>
  );
}
