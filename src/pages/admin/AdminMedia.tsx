import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { MediaItem } from "@/types/database";
import { ImagePicker } from "@/components/admin/ImagePicker";
import {
  Image as ImageIcon,
  Plus,
  Trash2,
  Copy,
  Check,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  X,
  RefreshCw,
} from "lucide-react";

export default function AdminMedia() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // New photo form state
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newCaption, setNewCaption] = useState("");

  // Visible delete confirmation modal
  const [itemToDelete, setItemToDelete] = useState<MediaItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchMedia = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("media_items")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Could not load media items:", error);
      } else if (data) {
        setMedia(data as MediaItem[]);
      }
    } catch (err) {
      console.warn("Error fetching media:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const handleCopyUrl = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAddMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl) {
      setStatusMsg({ type: "error", text: "Please upload or choose an image first." });
      return;
    }

    setSaving(true);
    setStatusMsg(null);

    const payload = {
      title: newTitle.trim() || `Asset-${Date.now().toString(36)}`,
      url: newUrl,
      alt_text: newTitle.trim() || "Festival Media Asset",
      caption: newCaption.trim() || null,
      file_size: "Optimized WebP/JPEG",
    };

    const { error } = await supabase.from("media_items").insert(payload);

    if (error) {
      setStatusMsg({ type: "error", text: `Failed to save photo: ${error.message}` });
    } else {
      setStatusMsg({ type: "success", text: "Saved. This photo is now live on the website." });
      setNewTitle("");
      setNewUrl("");
      setNewCaption("");
      setIsAdding(false);
      fetchMedia();
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    setStatusMsg(null);

    const { error } = await supabase.from("media_items").delete().eq("id", itemToDelete.id);

    if (error) {
      setStatusMsg({ type: "error", text: `Failed to delete: ${error.message}` });
    } else {
      setStatusMsg({ type: "success", text: "Photo removed successfully." });
      setItemToDelete(null);
      fetchMedia();
    }
    setIsDeleting(false);
  };

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", paddingBottom: 60 }}>
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(34, 211, 238, 0.15)", color: "var(--cyan-400)", display: "grid", placeItems: "center" }}>
              <ImageIcon size={20} />
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Photos & Media Assets
            </h1>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: 6 }}>
            Upload, store, and copy links to banners, logos, and photos used across the website.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link
            to="/gallery"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}
          >
            <span>View on website</span> <ExternalLink size={13} />
          </Link>

          <button
            onClick={() => {
              setIsAdding(!isAdding);
              setStatusMsg(null);
            }}
            className="btn btn-primary"
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.88rem", fontWeight: 700 }}
          >
            {isAdding ? <X size={16} /> : <Plus size={16} />}
            {isAdding ? "Close Form" : "Upload New Photo"}
          </button>
        </div>
      </div>

      {/* Feedback Alert */}
      {statusMsg && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: 10,
            marginBottom: 20,
            fontSize: "0.92rem",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: statusMsg.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
            border: `1.5px solid ${statusMsg.type === "success" ? "rgba(16, 185, 129, 0.35)" : "rgba(239, 68, 68, 0.35)"}`,
            color: statusMsg.type === "success" ? "#10b981" : "#ef4444",
          }}
        >
          {statusMsg.type === "success" ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Upload Form using ImagePicker */}
      {isAdding && (
        <form
          onSubmit={handleAddMedia}
          style={{
            background: "rgba(19, 24, 38, 0.95)",
            border: "2px solid var(--cyan-400)",
            borderRadius: 16,
            padding: "24px 28px",
            marginBottom: 32,
            boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#ffffff", margin: 0 }}>
              Upload Photo or Graphic
            </h3>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              style={{ background: "transparent", border: 0, color: "var(--text-muted)", cursor: "pointer" }}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            {/* Direct Image Picker with auto-resizing & storage upload */}
            <ImagePicker
              value={newUrl}
              onChange={(url) => setNewUrl(url)}
              label="Select or Drag & Drop Image (Resized automatically to max 1600px)"
            />

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
                Asset Name / Title *
              </label>
              <input
                type="text"
                required
                className="input"
                placeholder="e.g. Science Expo Quadrangle Banner"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
                Caption or Notes (Optional)
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Main entrance photography display"
                value={newCaption}
                onChange={(e) => setNewCaption(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !newUrl}
                className="btn btn-primary"
                style={{ fontWeight: 800, padding: "10px 24px" }}
              >
                {saving ? "Saving..." : "Add to Library"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div
          role="dialog"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            backdropFilter: "blur(4px)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setItemToDelete(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--navy-900)",
              border: "1.5px solid rgba(239, 68, 68, 0.4)",
              borderRadius: 16,
              padding: "26px 28px",
              maxWidth: 440,
              width: "100%",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", display: "grid", placeItems: "center" }}>
                <Trash2 size={22} />
              </div>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#ffffff", margin: 0 }}>
                Delete Photo Asset?
              </h3>
            </div>

            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", lineHeight: 1.5, marginBottom: 18 }}>
              Are you sure you want to delete <strong style={{ color: "#ffffff" }}>"{itemToDelete.title}"</strong>? Any page referencing this image URL will no longer be able to display it.
            </p>

            {itemToDelete.url && (
              <div style={{ height: 120, borderRadius: 8, overflow: "hidden", marginBottom: 20, background: "#000" }}>
                <img
                  src={itemToDelete.url}
                  alt={itemToDelete.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="btn btn-secondary"
                disabled={isDeleting}
              >
                Keep Photo
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                style={{
                  background: "#ef4444",
                  color: "#ffffff",
                  border: 0,
                  padding: "10px 18px",
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  cursor: "pointer",
                }}
              >
                {isDeleting ? "Deleting..." : "Yes, Delete Photo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Media Grid Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
          Media Library ({media.length})
        </h2>
        <button
          onClick={fetchMedia}
          className="btn btn-secondary"
          style={{ fontSize: "0.8rem", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Media Grid or Empty State */}
      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)" }}>
          Loading photos...
        </div>
      ) : media.length === 0 ? (
        <div
          style={{
            padding: "54px 24px",
            textAlign: "center",
            borderRadius: 16,
            border: "1.5px dashed var(--border-subtle)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <ImageIcon size={40} color="var(--text-muted)" style={{ margin: "0 auto 12px" }} />
          <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>
            No photos uploaded yet.
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", margin: 0, maxWidth: 440, marginInline: "auto" }}>
            Click "Upload New Photo" to add festival banners, logos, or posters. Images are automatically compressed and saved to the cloud storage bucket.
          </p>
          <button
            onClick={() => setIsAdding(true)}
            className="btn btn-primary"
            style={{ marginTop: 20 }}
          >
            <Plus size={16} /> Upload First Photo
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
          {media.map((item) => (
            <div
              key={item.id}
              style={{
                background: "rgba(23, 23, 27, 0.75)",
                border: "1.5px solid var(--border-subtle)",
                borderRadius: 14,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ height: 180, background: "#0a0c14", position: "relative", overflow: "hidden" }}>
                <img
                  src={item.url}
                  alt={item.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e) => {
                    // Fallback if image fails to render
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              </div>

              <div style={{ padding: "14px 16px", flexGrow: 1, display: "flex", flexDirection: "column" }}>
                <h3
                  title={item.title}
                  style={{
                    fontSize: "0.98rem",
                    fontWeight: 700,
                    marginBottom: 4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "var(--text-primary)",
                  }}
                >
                  {item.title}
                </h3>
                {item.caption && (
                  <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0 0 8px", lineHeight: 1.3 }}>
                    {item.caption}
                  </p>
                )}
                <p style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginBottom: 14 }}>
                  Size: {item.file_size || "Optimized"}
                </p>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    paddingTop: 10,
                    marginTop: "auto",
                  }}
                >
                  <button
                    onClick={() => handleCopyUrl(item.id, item.url)}
                    className="btn btn-ghost"
                    style={{
                      fontSize: "0.8rem",
                      padding: "4px 8px",
                      color: copiedId === item.id ? "#10b981" : "var(--cyan-400)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check size={13} /> Copied Link
                      </>
                    ) : (
                      <>
                        <Copy size={13} /> Copy Link
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => setItemToDelete(item)}
                    className="btn btn-ghost"
                    style={{
                      fontSize: "0.8rem",
                      padding: "4px 8px",
                      color: "#ef4444",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
