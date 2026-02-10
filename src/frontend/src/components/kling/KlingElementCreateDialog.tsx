import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/utils/utils";
import {
  KLING_TAG_OPTIONS,
  type KlingElement,
  useKlingElementsStore,
} from "@/stores/klingElementsStore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select-custom";
import { api } from "@/controllers/API/api";
import { getURL } from "@/controllers/API/helpers/constants";

type UploadedV2File = { id: string; name: string; path: string; size: number };

async function uploadV2File(file: File): Promise<UploadedV2File> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await api.post(getURL("FILES", {}, true), fd);
  const data = res?.data;
  if (!data?.id) throw new Error("上传失败：未返回文件ID");
  return {
    id: String(data.id),
    name: String(data.name ?? ""),
    path: String(data.path ?? ""),
    size: Number(data.size ?? 0),
  };
}

type AxiosLikeError = {
  message?: string;
  response?: {
    data?: {
      detail?: unknown;
      message?: unknown;
    };
  };
};

function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

export default function KlingElementCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (element: KlingElement) => void;
}) {
  const createCustom = useKlingElementsStore((s) => s.createCustom);

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [tagId, setTagId] = useState<string>("o_108");

  const [frontalFile, setFrontalFile] = useState<File | null>(null);
  const [referFiles, setReferFiles] = useState<Array<File | null>>([
    null,
    null,
    null,
  ]);

  const frontalPreview = useObjectUrl(frontalFile);
  const [referPreviews, setReferPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = referFiles.map((f) => (f ? URL.createObjectURL(f) : ""));
    setReferPreviews(urls);
    return () => {
      urls.filter(Boolean).forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch {
          // ignore
        }
      });
    };
  }, [referFiles]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const referFilledCount = useMemo(
    () => referFiles.filter(Boolean).length,
    [referFiles],
  );

  const canSubmit = useMemo(() => {
    return (
      name.trim().length > 0 &&
      desc.trim().length > 0 &&
      Boolean(frontalFile) &&
      referFilledCount >= 1 &&
      referFilledCount <= 3 &&
      Boolean(tagId)
    );
  }, [name, desc, frontalFile, referFilledCount, tagId]);

  const reset = useCallback(() => {
    setName("");
    setDesc("");
    setTagId("o_108");
    setFrontalFile(null);
    setReferFiles([null, null, null]);
    setSubmitting(false);
    setError(null);
  }, []);

  const handleClose = useCallback(
    (next: boolean) => {
      onOpenChange(next);
      if (!next) reset();
    },
    [onOpenChange, reset],
  );

  const onPickFrontal = useCallback((file: File | null) => {
    if (!file) return;
    setError(null);
    setFrontalFile(file);
  }, []);

  const pickSingleFile = useCallback(async () => {
    return await new Promise<File | null>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = false;
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.click();
    });
  }, []);

  const pickMultipleFiles = useCallback(async () => {
    return await new Promise<File[]>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = true;
      input.onchange = () => resolve(Array.from(input.files ?? []).slice(0, 3));
      input.click();
    });
  }, []);

  const replaceReferAt = useCallback(
    async (index: number) => {
      const file = await pickSingleFile();
      if (!file) return;
      setError(null);
      setReferFiles((prev) => {
        const next = [...prev];
        // Keep "first other reference image" in slot1 container whenever possible.
        if (!next[0] && index !== 0) {
          next[0] = file;
        } else {
          next[index] = file;
        }
        return next;
      });
    },
    [pickSingleFile],
  );

  const deleteReferAt = useCallback((index: number) => {
    setReferFiles((prev) => {
      const remaining = prev
        .filter((f, idx) => idx !== index && Boolean(f)) as File[];
      const next: Array<File | null> = [null, null, null];
      remaining.slice(0, 3).forEach((f, idx) => {
        next[idx] = f;
      });
      return next;
    });
  }, []);

  const handlePickReferSlot1 = useCallback(async () => {
    // Slot1 is special:
    // - empty: allow picking 1-3 images at once and fill slots 1..3
    // - filled: replace only slot1 (single)
    if (!referFiles[0]) {
      const files = await pickMultipleFiles();
      if (!files.length) return;
      const next: Array<File | null> = [null, null, null];
      files.forEach((f, idx) => {
        next[idx] = f;
      });
      setReferFiles(next);
    } else {
      await replaceReferAt(0);
    }
  }, [pickMultipleFiles, referFiles, replaceReferAt]);

  const submitLockRef = useRef(false);
  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitting) return;
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const frontalUp = await uploadV2File(frontalFile!);
      const referUps = [];
      for (const f of referFiles.filter(Boolean) as File[]) {
        referUps.push(await uploadV2File(f));
      }

      const created = await createCustom({
        element_name: name.trim(),
        element_description: desc.trim(),
        frontal_file_id: frontalUp.id,
        refer_file_ids: referUps.map((x) => x.id),
        tag_id: tagId,
      });

      onCreated?.(created);
      handleClose(false);
    } catch (e: unknown) {
      const err = e as AxiosLikeError;
      const detail = err?.response?.data?.detail ?? err?.response?.data?.message;
      setError(String(detail ?? err?.message ?? "创建主体失败"));
      setSubmitting(false);
      submitLockRef.current = false;
    }
  }, [canSubmit, submitting, frontalFile, referFiles, createCustom, name, desc, tagId, onCreated, handleClose]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[1100px] p-0">
        <div className="p-6">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle className="text-lg font-semibold">新建主体</DialogTitle>
          </DialogHeader>

          <div className="mt-6 grid grid-cols-[560px_1fr] gap-10">
            <div>
              <div className="text-sm font-medium">主体正面参考图（必填）</div>
              <div className="mt-3">
                <label
                  className={cn(
                    "relative flex h-[160px] w-[220px] cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/10",
                    frontalFile && "border-border/80",
                  )}
                >
                  {frontalPreview ? (
                    <img src={frontalPreview} className="h-full w-full object-cover" />
                  ) : (
                    <div className="text-[13px] text-muted-foreground">点击上传</div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onPickFrontal(e.target.files?.[0] ?? null)}
                  />
                </label>

                <div className="mt-2 text-xs text-muted-foreground">
                  支持 JPG/PNG/WebP；大小 10MB；宽高 300px；建议：正面清晰、主体完整。
                </div>
              </div>

              <div className="mt-7 text-sm font-medium">
                主体其他参考图（必填，1-3张）
              </div>
              <div className="mt-3 flex items-start gap-4">
                {/* slot 1 */}
                <div className="relative">
                  <button
                    type="button"
                    className="relative flex h-[180px] w-[260px] items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/10"
                    onClick={() => void handlePickReferSlot1()}
                  >
                    {referPreviews[0] ? (
                      <img src={referPreviews[0]} className="h-full w-full object-cover" />
                    ) : (
                      <div className="text-[13px] text-muted-foreground">点击上传</div>
                    )}
                  </button>
                  {referFiles[0] && (
                    <button
                      type="button"
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-black/55 text-white opacity-90 hover:bg-black/70"
                      onClick={() => deleteReferAt(0)}
                      title="删除"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* slot 2/3 */}
                <div className="flex flex-col gap-4">
                  {[1, 2].map((idx) => (
                    <div key={idx} className="relative">
                      <button
                        type="button"
                        className="relative flex h-[150px] w-[200px] items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/10"
                        onClick={() => void replaceReferAt(idx)}
                      >
                        {referPreviews[idx] ? (
                          <img src={referPreviews[idx]} className="h-full w-full object-cover" />
                        ) : (
                          <div className="text-[13px] text-muted-foreground">点击上传</div>
                        )}
                      </button>
                      {referFiles[idx] && (
                        <button
                          type="button"
                          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-black/55 text-white opacity-90 hover:bg-black/70"
                          onClick={() => deleteReferAt(idx)}
                          title="删除"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 text-sm text-muted-foreground">
                必须有正面和侧面（至少 1 张其他参考图）。
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <div className="mb-2 text-sm font-medium">主体名称（必填）</div>
                <Input
                  value={name}
                  maxLength={20}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="不超过20个字符"
                  className="h-11"
                />
                <div className="mt-1 text-right text-xs text-muted-foreground">
                  {name.length}/20
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium">标签（必选）</div>
                <Select value={tagId} onValueChange={setTagId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="选择标签" />
                  </SelectTrigger>
                  <SelectContent>
                    {KLING_TAG_OPTIONS.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium">主体描述（必填）</div>
                <Textarea
                  value={desc}
                  maxLength={100}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="不超过100个字符"
                  className="min-h-[180px]"
                />
                <div className="mt-1 text-right text-xs text-muted-foreground">
                  {desc.length}/100
                </div>
              </div>

              {error && (
                <div className="text-sm text-red-600">
                  {error}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="mt-8">
            <Button variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
              {submitting ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
