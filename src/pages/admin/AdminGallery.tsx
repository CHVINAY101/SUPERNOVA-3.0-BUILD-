import { useEffect, useState, useCallback, useRef, ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { GalleryItem } from "@/types/database";
import { ImagePicker } from "@/components/admin/ImagePicker";
import { 
  Image as ImageIcon, 
  ExternalLink, 
  Plus, 
  Trash2, 
  CheckCircle, 
  AlertCircle, 
  UploadCloud, 
  Eye, 
  EyeOff, 
  Edit2, 
  X
} from "lucide-react";

interface DraftPhoto {
  tempId: string;
  file: File;
  previewUrl: string;
  title: string;
  description: string;
  category: string;
  uploading: boolean;
  uploadedUrl?: string;
}

export default function AdminGallery() {
  const { hasPermission } = useAuth();
  const canUpload = hasPermission("gallery:upload");
  const canEdit = hasPermission("gallery:edit");
  const canDelete = hasPermission("gallery:delete");

  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<GalleryItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Multi-upload draft batch state
  const [drafts, setDrafts] = useState<DraftPhoto[]>([]);
  const [publishingAll, setPublishingAll] = useState(false);
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  const fetchItems = useCallback(() => {
    setLoading(true);
    supabase
      .from("gallery_items")
      .select("*")
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setItems(data as GalleryItem[]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Handle multi-file selection
  const handleMultiFiles = (files: FileList | null) => {
    if (!canUpload) return;
    if (!files || files.length === 0) return;
    setStatusMsg(null);

    const newDrafts: DraftPhoto[] = [];
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;

      const previewUrl = URL.createObjectURL(file);
      const cleanTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

      newDrafts.push({
        tempId: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        file,
        previewUrl,
        title: cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1),
        description: "Festival exhibit & campus showcase",
        category: "general",
        uploading: false,
      });
    });

    setDrafts((prev) => [...prev, ...newDrafts]);
  };

  // Publish all drafts to Supabase
  const handlePublishAll = async () => {
    if (!canUpload) return;
    if (drafts.length === 0) return;
    setPublishingAll(true);
    setStatusMsg(null);

    let successCount = 0;

    for (const draft of drafts) {
      try {
        // Upload photo
        const ext = draft.file.name.split(".").pop() || "jpg";
        const cleanName = `gallery/${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${ext}`;

        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from("site-media")
          .upload(cleanName, draft.file, { contentType: draft.file.type });

        let publicUrl = draft.previewUrl;
        if (!uploadErr && uploadData?.path) {
          const { data: urlData } = supabase.storage.from("site-media").getPublicUrl(uploadData.path);
          publicUrl = urlData.publicUrl;
        }

        // Insert gallery record
        await supabase.from("gallery_items").insert({
          title: draft.title,
          description: draft.description,
          image_url: publicUrl,
          category: draft.category,
          is_published: true,
          sort_order: items.length + successCount + 1,
        });

        successCount++;
      } catch (err) {
        console.warn("Failed to publish draft:", err);
      }
    }

    setDrafts([]);
    setPublishingAll(false);
    fetchItems();

    setStatusMsg({
      type: "success",
      text: `Saved. ${successCount} photo${successCount > 1 ? "s are" : " is"} now live on the website!`,
    });
  };

  const handleSaveSingle = async () => {
    if (!editing || !editing.image_url) return;
    if (editing.id ? !canEdit : !canUpload) {
      setStatusMsg({ type: "error", text: "You do not have permission to save gallery items." });
      return;
    }
    setSaving(true);
    setStatusMsg(null);

    const payload = {
      title: editing.title || "Festival Photo",
      description: editing.description || null,
      image_url: editing.image_url,
      category: editing.category || "general",
      is_published: editing.is_published,
      sort_order: editing.sort_order || items.length + 1,
    };

    let result;
    if (editing.id) {
      result = await supabase.from("gallery_items").update(payload).eq("id", editing.id);
    } else {
      result = await supabase.from("gallery_items").insert(payload);
    }

    if (result.error) {
      setStatusMsg({ type: "error", text: `Failed to save photo: ${result.error.message}` });
    } else {
      setStatusMsg({ type: "success", text: "Saved. This photo is now live on the website." });
      setEditing(null);
      fetchItems();
    }
    setSaving(false);
  };

  const togglePublish = async (item: GalleryItem) => {
    if (!canEdit) return;
    const nextPublished = !item.is_published;
    await supabase.from("gallery_items").update({ is_published: nextPublished }).eq("id", item.id);
    setStatusMsg({
      type: "success",
      text: nextPublished ? "Photo published. Now live on the website." : "Photo unpublished from live view.",
    });
    fetchItems();
  };

  const deleteItem = async (id: string) => {
    if (!canDelete) return;
    if (!confirm("Are you sure you want to remove this photo?")) return;
    await supabase.from("gallery_items").delete().eq("id", id);
    setStatusMsg({ type: "success", text: "Photo removed successfully." });
    fetchItems();
  };

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", paddingBottom: 60 }}>
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(34, 211, 238, 0.15)", color: "var(--cyan-400)", display: "grid", placeItems: "center" }}>
              <ImageIcon size={20} />
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
              Photo Gallery
            </h1>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: 6 }}>
            Upload festival installations, student exhibits, and tournament ceremony photos for the public gallery.
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

          {canUpload && (
            <button
              onClick={() => multiFileInputRef.current?.click()}
              className="btn btn-primary"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem", fontWeight: 700 }}
            >
              <UploadCloud size={16} /> Select Photos
            </button>
          )}
        </div>
      </div>

      {/* Hidden file input for multi-file picker */}
      <input
        ref={multiFileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          handleMultiFiles(e.target.files);
          if (e.target) e.target.value = "";
        }}
        style={{ display: "none" }}
      />

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

      {/* MULTI-PHOTO UPLOAD DRAFTS BATCH PANEL */}
      {drafts.length > 0 && (
        <div
          style={{
            background: "rgba(34, 211, 238, 0.08)",
            border: "2px solid var(--cyan-400)",
            borderRadius: 16,
            padding: "24px 28px",
            marginBottom: 32,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#ffffff", margin: 0 }}>
                Draft Photos Ready for Review ({drafts.length})
              </h3>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 4 }}>
                Edit titles and captions below, then click "Publish All" to put them live on the public gallery.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setDrafts([])}
                className="btn btn-secondary"
                style={{ fontSize: "0.85rem" }}
              >
                Clear Drafts
              </button>
              <button
                onClick={handlePublishAll}
                disabled={publishingAll}
                className="btn btn-primary"
                style={{ padding: "10px 22px", fontSize: "0.95rem", fontWeight: 800 }}
              >
                {publishingAll ? "Publishing All..." : `Publish All (${drafts.length}) Photos`}
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            {drafts.map((draft, idx) => (
              <div
                key={draft.tempId}
                style={{
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 12,
                  padding: 14,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ position: "relative", height: 160, borderRadius: 8, overflow: "hidden" }}>
                  <img src={draft.previewUrl} alt={draft.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button
                    onClick={() => setDrafts((prev) => prev.filter((d) => d.tempId !== draft.tempId))}
                    style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.6)", color: "#ffffff", border: 0, cursor: "pointer", display: "grid", placeItems: "center" }}
                  >
                    <X size={15} />
                  </button>
                </div>

                <div>
                  <label style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                    Title
                  </label>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, title: val } : d)));
                    }}
                    style={{ width: "100%", padding: "6px 10px", borderRadius: 6, background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-subtle)", color: "#ffffff", fontSize: "0.85rem" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                    Caption / Description
                  </label>
                  <input
                    type="text"
                    value={draft.description}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, description: val } : d)));
                    }}
                    style={{ width: "100%", padding: "6px 10px", borderRadius: 6, background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-subtle)", color: "#ffffff", fontSize: "0.85rem" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SINGLE PHOTO EDIT / ADD MODAL */}
      {editing && (
        <div
          role="dialog"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(6px)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setEditing(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--navy-900)",
              border: "1.5px solid var(--border-subtle)",
              borderRadius: 18,
              padding: 28,
              maxWidth: 520,
              width: "100%",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#ffffff", margin: 0 }}>
                {editing.id ? "Edit Photo Details" : "Add Single Photo"}
              </h3>
              <button onClick={() => setEditing(null)} style={{ background: "transparent", border: 0, color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              <ImagePicker
                value={editing.image_url}
                onChange={(url) => setEditing({ ...editing, image_url: url })}
                label="Photo File (Optimized automatically)"
              />

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Title
                </label>
                <input
                  type="text"
                  value={editing.title ?? ""}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder="e.g. Science Expo Quadrangle Exhibit"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-subtle)", color: "#ffffff" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Description / Caption
                </label>
                <input
                  type="text"
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Short description displayed on hover"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-subtle)", color: "#ffffff" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
                  Category
                </label>
                <select
                  value={editing.category ?? "general"}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-subtle)", color: "#ffffff" }}
                >
                  <option value="general">General Festival</option>
                  <option value="science_expo">Science Expo</option>
                  <option value="school_exhibition">School Exhibition</option>
                  <option value="animation">Animation Department</option>
                  <option value="esports">Esports Arena</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" onClick={() => setEditing(null)} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving || !editing.image_url}
                  onClick={handleSaveSingle}
                  className="btn btn-primary"
                  style={{ fontWeight: 800 }}
                >
                  {saving ? "Saving..." : "Save Photo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PUBLISHED GALLERY GRID */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
            Published Photos ({items.length})
          </h2>
          {canUpload && (
            <button
              onClick={() =>
                setEditing({
                  id: "",
                  title: "",
                  description: "",
                  image_url: "",
                  category: "general",
                  is_published: true,
                  sort_order: items.length + 1,
                  created_at: "",
                  updated_at: "",
                })
              }
              className="btn btn-secondary"
              style={{ fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Plus size={14} /> Add One Photo
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
            <div className="loading-spinner" />
          </div>
        ) : items.length === 0 ? (
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
              borderRadius: 16,
              border: "1.5px dashed var(--border-subtle)",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <ImageIcon size={36} color="var(--text-muted)" style={{ margin: "0 auto 12px" }} />
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)" }}>
              No photos in the gallery yet. Click 'Select Photos' to upload one.
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: 6 }}>
              You can choose multiple photos from your device or phone camera.
            </p>
            {canUpload && (
              <button
                onClick={() => multiFileInputRef.current?.click()}
                className="btn btn-primary"
                style={{ marginTop: 16 }}
              >
                <UploadCloud size={16} /> Choose Photos to Upload
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  background: "rgba(23, 23, 27, 0.75)",
                  border: "1.5px solid var(--border-subtle)",
                  borderRadius: 14,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ height: 180, position: "relative", overflow: "hidden" }}>
                  <img
                    src={item.image_url}
                    alt={item.title || "Gallery"}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      top: 10,
                      left: 10,
                      padding: "3px 8px",
                      borderRadius: 6,
                      fontSize: "0.72rem",
                      fontWeight: 800,
                      background: item.is_published ? "rgba(16, 185, 129, 0.9)" : "rgba(239, 68, 68, 0.9)",
                      color: "#ffffff",
                    }}
                  >
                    {item.is_published ? "LIVE" : "DRAFT"}
                  </span>
                </div>

                <div style={{ padding: "14px 16px", flex: 1 }}>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0 0 4px", color: "var(--text-primary)" }}>
                    {item.title || "Untitled Photo"}
                  </h3>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0, lineHeight: 1.4 }}>
                    {item.description || "No caption added"}
                  </p>
                </div>

                {(canEdit || canDelete) && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.2)" }}>
                    {canEdit ? (
                      <button
                        onClick={() => togglePublish(item)}
                        style={{ background: "transparent", border: 0, color: "var(--cyan-400)", cursor: "pointer", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: 5 }}
                      >
                        {item.is_published ? <EyeOff size={13} /> : <Eye size={13} />}
                        {item.is_published ? "Unpublish" : "Publish"}
                      </button>
                    ) : <span />}

                    <div style={{ display: "flex", gap: 8 }}>
                      {canEdit && (
                        <button
                          onClick={() => setEditing(item)}
                          style={{ background: "transparent", border: 0, color: "var(--text-muted)", cursor: "pointer" }}
                          title="Edit photo info"
                        >
                          <Edit2 size={15} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => deleteItem(item.id)}
                          style={{ background: "transparent", border: 0, color: "#f87171", cursor: "pointer" }}
                          title="Delete photo"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
