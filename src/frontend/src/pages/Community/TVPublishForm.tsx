import { useEffect, useId, useMemo, useRef, useState } from "react";
import IconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getURL } from "@/controllers/API/helpers/constants";
import { api } from "@/controllers/API/api";
import { useCustomNavigate } from "@/customization/hooks/use-custom-navigate";
import useAlertStore from "@/stores/alertStore";
import useAuthStore from "@/stores/authStore";
import { cn } from "@/utils/utils";

async function uploadToFlow(flowId: string, file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const r = await api.post<any>(`${getURL("FILES")}/upload/${flowId}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  const filePath = r?.data?.file_path;
  if (!filePath) throw new Error("上传成功但缺少 file_path");
  return filePath as string;
}

function makeObjectUrl(file: File | null) {
  if (!file) return null;
  return URL.createObjectURL(file);
}

function SelectFilePreview({
  label,
  required = false,
  accept,
  file,
  objectUrl,
  onChangeFile,
  autoPlayOnHover = false,
}: {
  label: string;
  required?: boolean;
  accept: string;
  file: File | null;
  objectUrl: string | null;
  onChangeFile: (file: File | null) => void;
  autoPlayOnHover?: boolean;
}) {
  const inputId = useId();
  const isVideo = Boolean(file?.type?.startsWith("video/"));
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleMouseEnter = async () => {
    if (!autoPlayOnHover) return;
    if (!isVideo) return;
    const el = videoRef.current;
    if (!el) return;
    try {
      await el.play();
    } catch {
      // Ignore autoplay failures (browser policy, etc.).
    }
  };

  const handleMouseLeave = () => {
    if (!autoPlayOnHover) return;
    if (!isVideo) return;
    const el = videoRef.current;
    if (!el) return;
    try {
      el.pause();
      // Reset to first frame so the preview feels "static" when not hovered.
      el.currentTime = 0;
    } catch {
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={inputId} className="text-sm">
          {label} {required ? <span className="text-destructive">*</span> : null}
        </Label>
      </div>

      <div className="rounded-2xl border bg-muted/5 p-2">
        <label
          htmlFor={inputId}
          className={cn(
            "group relative block cursor-pointer overflow-hidden rounded-xl bg-muted/15",
            "aspect-video",
          )}
          aria-label={label}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {file && objectUrl ? (
            isVideo ? (
              <video
                ref={videoRef}
                className="pointer-events-none h-full w-full object-cover"
                src={objectUrl}
                muted
                loop
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                className="pointer-events-none h-full w-full object-cover"
                src={objectUrl}
                alt={label}
              />
            )
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background/60 shadow-sm backdrop-blur">
                <IconComponent name="ArrowUpToLine" className="h-5 w-5" />
              </div>
              <div className="text-sm">点击上传</div>
            </div>
          )}

          {/* Minimal hover affordance; click anywhere to replace. */}
          <div className="pointer-events-none absolute inset-0 bg-black/20 opacity-0 transition-opacity group-hover:opacity-100" />
        </label>

        <input
          id={inputId}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => onChangeFile(e.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  );
}

export default function TVPublishForm({
  flowId,
  onClose,
  onSuccess,
  className,
}: {
  flowId: string;
  onClose?: () => void;
  onSuccess?: () => void;
  className?: string;
}) {
  const navigate = useCustomNavigate();
  const setSuccessData = useAlertStore((s) => s.setSuccessData);
  const setErrorData = useAlertStore((s) => s.setErrorData);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [publicCanvas, setPublicCanvas] = useState(true);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const mediaUrl = useMemo(() => makeObjectUrl(mediaFile), [mediaFile]);
  const coverUrl = useMemo(() => makeObjectUrl(coverFile), [coverFile]);

  useEffect(() => {
    return () => {
      if (mediaUrl) URL.revokeObjectURL(mediaUrl);
      if (coverUrl) URL.revokeObjectURL(coverUrl);
    };
  }, [coverUrl, mediaUrl]);

  const submit = async () => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    if (!flowId) {
      setErrorData({ title: "未找到 flow_id" });
      return;
    }
    if (!mediaFile) {
      setErrorData({ title: "请上传作品" });
      return;
    }
    if (!coverFile) {
      setErrorData({ title: "请上传封面" });
      return;
    }
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setErrorData({ title: "请输入作品名称" });
      return;
    }

    try {
      setSubmitting(true);
      const [mediaPath, coverPath] = await Promise.all([
        uploadToFlow(flowId, mediaFile),
        uploadToFlow(flowId, coverFile),
      ]);

      await api.post(`${getURL("COMMUNITY")}/items`, {
        type: "TV",
        flow_id: flowId,
        title: cleanTitle,
        description: description.trim() || null,
        media_path: mediaPath,
        cover_path: coverPath,
        public_canvas: publicCanvas,
        status: "UNREVIEWED",
      });

      setSuccessData({ title: "已提交审核" });
      onSuccess?.();
      onClose?.();
    } catch (e: any) {
      setErrorData({ title: "发布失败", list: [e?.message ?? "未知错误"] });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={cn("flex w-full flex-col gap-4 p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">发布作品到 TV</div>
          <div className="mt-1 text-sm text-muted-foreground">将您的作品发布到 TV，被更多创作者看到。</div>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="close">
            <IconComponent name="X" className="h-5 w-5" />
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-4">
          <SelectFilePreview
            label="上传作品"
            required
            accept="video/*,image/*"
            file={mediaFile}
            objectUrl={mediaUrl}
            onChangeFile={setMediaFile}
            autoPlayOnHover
          />
          <SelectFilePreview
            label="上传封面"
            required
            accept="image/*"
            file={coverFile}
            objectUrl={coverUrl}
            onChangeFile={setCoverFile}
          />
        </div>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>作品名称 *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="请输入作品名称"
              maxLength={80}
            />
            <div className="text-right text-xs text-muted-foreground">{title.length}/80</div>
          </div>

          <div className="grid gap-2">
            <Label>作品描述</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请输入作品描述"
              maxLength={500}
              rows={6}
            />
            <div className="text-right text-xs text-muted-foreground">
              {description.length}/500
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">公开画布（可选）</div>
              <div className="text-xs text-muted-foreground">开启后审核通过可被克隆。</div>
            </div>
            <Switch checked={publicCanvas} onCheckedChange={setPublicCanvas} />
          </div>

          <div className="flex items-center justify-end gap-2">
            {onClose && (
              <Button variant="ghost" onClick={onClose} disabled={submitting}>
                取消
              </Button>
            )}
            <Button variant="primary" onClick={submit} disabled={submitting}>
              {submitting ? "发布中..." : "发布并投稿"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
