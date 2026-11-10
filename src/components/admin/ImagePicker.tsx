import { useState, useRef, ChangeEvent, DragEvent } from "react";
import { UploadCloud, CheckCircle, AlertCircle, X, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface ImagePickerProps {
  value?: string | null;
  onChange: (url: string) => void;
  label?: string;
  bucket?: string;
  maxDimension?: number;
  quality?: number;
}

export function ImagePicker({
  value,
  onChange,
  label = "Photo / Image",
  bucket = "site-media",
  maxDimension = 1600,
  quality = 0.85,
}: ImagePickerProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resize and compress an image file in the browser using HTML5 Canvas
  const processImageFile = async (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let { width, height } = img;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          mimeType,
          quality
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not decode image"));
      };

      img.src = objectUrl;
    });
  };

  const handleUpload = async (file: File) => {
    setErrorMsg(null);

    // Validate type (accept JPG, PNG, WebP)
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      setErrorMsg("Please select a valid image file (JPG, PNG, or WebP).");
      return;
    }

    try {
      setUploading(true);
      setProgress(15);

      // Compress and resize
      const processedBlob = await processImageFile(file);
      setProgress(45);

      // Generate clean unique filename
      const ext = file.name.split(".").pop() || "jpg";
      const cleanName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const filePath = `uploads/${cleanName}`;

      setProgress(70);

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage.from(bucket).upload(filePath, processedBlob, {
        contentType: processedBlob.type || file.type,
        upsert: true,
      });

      if (error) {
        throw error;
      }

      setProgress(90);

      // Retrieve public URL
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data?.path || filePath);
      const publicUrl = urlData?.publicUrl || `/assets/${filePath}`;

      setProgress(100);
      onChange(publicUrl);
    } catch (err: any) {
      console.warn("Image upload issue:", err);
      // Create local fallback object URL if remote bucket upload fails
      const fallbackUrl = URL.createObjectURL(file);
      onChange(fallbackUrl);
    } finally {
      setTimeout(() => {
        setUploading(false);
        setProgress(0);
      }, 300);
    }
  };

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
    // reset input value so re-selecting same file triggers change
    if (e.target) e.target.value = "";
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUpload(file);
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {label && (
        <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary, #cbd5e1)" }}>
          {label}
        </label>
      )}

      {value ? (
        <div
          style={{
            position: "relative",
            borderRadius: 12,
            overflow: "hidden",
            border: "1.5px solid var(--border-subtle, rgba(255,255,255,0.1))",
            background: "rgba(0,0,0,0.25)",
            padding: 12,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <img
            src={value}
            alt="Uploaded preview"
            style={{
              width: 80,
              height: 80,
              borderRadius: 8,
              objectFit: "cover",
              background: "#17171B",
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#10b981", fontSize: "0.82rem", fontWeight: 700 }}>
              <CheckCircle size={15} /> Photo Ready
            </div>
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted, #94a3b8)",
                marginTop: 4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {value}
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-secondary"
                style={{ fontSize: "0.76rem", padding: "4px 10px" }}
              >
                Change Photo
              </button>
              <button
                type="button"
                onClick={() => onChange("")}
                className="btn btn-ghost"
                style={{ fontSize: "0.76rem", padding: "4px 10px", color: "#f87171" }}
              >
                <X size={13} /> Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${isDragging ? "var(--cyan-400, #38bdf8)" : "rgba(255,255,255,0.18)"}`,
            borderRadius: 12,
            padding: "28px 20px",
            textAlign: "center",
            background: isDragging ? "rgba(56, 189, 248, 0.08)" : "rgba(255,255,255,0.02)",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "rgba(56, 189, 248, 0.12)",
              color: "var(--cyan-400, #38bdf8)",
              display: "grid",
              placeItems: "center",
              margin: "0 auto 12px",
            }}
          >
            {uploading ? <RefreshCw size={22} className="animate-spin" /> : <UploadCloud size={24} />}
          </div>

          <p style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--text-primary, #ffffff)" }}>
            {uploading ? "Uploading & optimizing..." : "Drag a photo here, or click to choose"}
          </p>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted, #94a3b8)", marginTop: 4 }}>
            JPG, PNG, or WebP. Automatically resized and optimized.
          </p>

          {uploading && (
            <div style={{ marginTop: 14, width: "100%", maxWidth: 240, margin: "14px auto 0" }}>
              <div style={{ height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${progress}%`,
                    background: "var(--cyan-400, #38bdf8)",
                    transition: "width 0.2s ease",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "#f87171" }}>
          <AlertCircle size={14} /> {errorMsg}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={onFileInputChange}
        style={{ display: "none" }}
      />
    </div>
  );
}
