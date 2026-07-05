"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

/** Draw the selected crop area onto a 512px square canvas and export a JPEG blob. */
async function getCroppedBlob(src: string, area: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  const OUT = 512;
  const canvas = document.createElement("canvas");
  canvas.width = OUT;
  canvas.height = OUT;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, OUT, OUT);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Crop failed"))),
      "image/jpeg",
      0.9
    );
  });
}

export default function AvatarCropModal({
  src,
  busy,
  onCancel,
  onCropped,
}: {
  src: string;
  busy: boolean;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);

  const onComplete = useCallback((_: Area, pixels: Area) => setAreaPixels(pixels), []);

  async function save() {
    if (!areaPixels) return;
    const blob = await getCroppedBlob(src, areaPixels);
    onCropped(blob);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60" onClick={busy ? undefined : onCancel} />
      <div className="relative z-10 w-full max-w-md animate-fade-in overflow-hidden rounded-2xl bg-white shadow-note">
        <div className="border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">Crop your photo</h3>
          <p className="text-sm text-slate-500">Drag to reposition, zoom to frame it.</p>
        </div>

        {/* Crop area */}
        <div className="relative h-72 w-full bg-slate-900">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onComplete}
          />
        </div>

        {/* Zoom control */}
        <div className="flex items-center gap-3 px-6 py-4">
          <span className="text-sm text-slate-400">➖</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-brand-600"
            aria-label="Zoom"
          />
          <span className="text-sm text-slate-400">➕</span>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={busy || !areaPixels}>
            {busy ? "Saving…" : "Save photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
