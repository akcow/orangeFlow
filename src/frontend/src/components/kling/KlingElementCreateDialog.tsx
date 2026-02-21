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
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import {
  KLING_TAG_OPTIONS,
  type KlingElement,
  useKlingElementsStore,
} from "@/stores/klingElementsStore";
import { getFilesDownloadUrl } from "@/utils/workflowUtils";
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
type ReferSlot = { local: File | null; uploaded: UploadedV2File | null };

function isSupportedKlingImage(file: File): boolean {
  // Kling "advanced-custom-elements" doc: jpg/jpeg/png only.
  const type = String(file.type || "").toLowerCase();
  if (type === "image/jpeg" || type === "image/jpg" || type === "image/png") return true;
  const name = String(file.name || "").toLowerCase();
  return name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png");
}

function isSupportedKlingVideo(file: File): boolean {
  // Kling doc: MP4/MOV only.
  const type = String(file.type || "").toLowerCase();
  if (type === "video/mp4" || type === "video/quicktime") return true;
  const name = String(file.name || "").toLowerCase();
  return name.endsWith(".mp4") || name.endsWith(".mov");
}

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
  const [referenceType, setReferenceType] = useState<"image_refer" | "video_refer">("image_refer");

  const [frontalFile, setFrontalFile] = useState<File | null>(null);
  const [frontalUploaded, setFrontalUploaded] = useState<UploadedV2File | null>(null);
  const [referSlots, setReferSlots] = useState<ReferSlot[]>([
    { local: null, uploaded: null },
    { local: null, uploaded: null },
    { local: null, uploaded: null },
  ]);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const videoPreview = useObjectUrl(videoFile);
  const [voiceId, setVoiceId] = useState("");

  const frontalPreview = useObjectUrl(frontalFile);
  const [referPreviews, setReferPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = referSlots.map((s) =>
      s.local
        ? URL.createObjectURL(s.local)
        : s.uploaded
          ? getFilesDownloadUrl(s.uploaded.path)
          : "",
    );
    setReferPreviews(urls);
    return () => {
      // Only revoke object urls we created for local files.
      urls.forEach((u, idx) => {
        if (!u) return;
        if (!referSlots[idx]?.local) return;
        try {
          URL.revokeObjectURL(u);
        } catch {
          // ignore
        }
      });
    };
  }, [referSlots]);

  const [submitting, setSubmitting] = useState(false);
  const [filling, setFilling] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const referFilledCount = useMemo(
    () => referSlots.filter((s) => Boolean(s.local || s.uploaded)).length,
    [referSlots],
  );

  const canSubmit = useMemo(() => {
    const baseOk = name.trim().length > 0 && desc.trim().length > 0 && Boolean(tagId);
    if (!baseOk) return false;
    if (referenceType === "video_refer") {
      return Boolean(videoFile);
    }
    return (
      Boolean(frontalFile || frontalUploaded) &&
      referFilledCount >= 1 &&
      referFilledCount <= 3
    );
  }, [name, desc, tagId, referenceType, videoFile, frontalFile, frontalUploaded, referFilledCount]);

  const reset = useCallback(() => {
    setName("");
    setDesc("");
    setTagId("o_108");
    setReferenceType("image_refer");
    setFrontalFile(null);
    setFrontalUploaded(null);
    setReferSlots([
      { local: null, uploaded: null },
      { local: null, uploaded: null },
      { local: null, uploaded: null },
    ]);
    setVideoFile(null);
    setVoiceId("");
    setSubmitting(false);
    setFilling(false);
    setDescribing(false);
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
    if (!isSupportedKlingImage(file)) {
      setError("仅支持 JPG/JPEG/PNG 图片");
      return;
    }
    setFrontalFile(file);
    setFrontalUploaded(null); // re-upload if the user changes the file
  }, []);

  const onPickVideo = useCallback((file: File | null) => {
    if (!file) return;
    setError(null);
    if (!isSupportedKlingVideo(file)) {
      setError("仅支持 MP4/MOV 视频");
      return;
    }
    setVideoFile(file);
  }, []);

  const pickSingleFile = useCallback(async () => {
    return await new Promise<File | null>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg";
      input.multiple = false;
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.click();
    });
  }, []);

  const pickMultipleFiles = useCallback(async () => {
    return await new Promise<File[]>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg";
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
      if (!isSupportedKlingImage(file)) {
        setError("仅支持 JPG/JPEG/PNG 图片");
        return;
      }
      setReferSlots((prev) => {
        const next = [...prev];
        const slot0Empty = !next[0]?.local && !next[0]?.uploaded;
        const target = slot0Empty && index !== 0 ? 0 : index;
        next[target] = { local: file, uploaded: null };
        return next;
      });
    },
    [pickSingleFile],
  );

  const deleteReferAt = useCallback((index: number) => {
    setReferSlots((prev) => {
      const remaining = prev.filter((s, idx) => idx !== index && Boolean(s.local || s.uploaded));
      const next: ReferSlot[] = [
        { local: null, uploaded: null },
        { local: null, uploaded: null },
        { local: null, uploaded: null },
      ];
      remaining.slice(0, 3).forEach((s, idx) => {
        next[idx] = s;
      });
      return next;
    });
  }, []);

  const handlePickReferSlot1 = useCallback(async () => {
    // Slot1 is special:
    // - empty: allow picking 1-3 images at once and fill slots 1..3
    // - filled: replace only slot1 (single)
    if (!referSlots[0]?.local && !referSlots[0]?.uploaded) {
      const files = await pickMultipleFiles();
      if (!files.length) return;
      const bad = files.find((f) => !isSupportedKlingImage(f));
      if (bad) {
        setError("仅支持 JPG/JPEG/PNG 图片");
        return;
      }
      const next: ReferSlot[] = [
        { local: null, uploaded: null },
        { local: null, uploaded: null },
        { local: null, uploaded: null },
      ];
      files.forEach((f, idx) => {
        next[idx] = { local: f, uploaded: null };
      });
      setReferSlots(next);
    } else {
      await replaceReferAt(0);
    }
  }, [pickMultipleFiles, referSlots, replaceReferAt]);

  const handleSmartFill = useCallback(async () => {
    if (referenceType !== "image_refer") return;
    if (filling || submitting) return;
    const need = 3 - referFilledCount;
    if (need <= 0) return;

    if (!frontalFile && !frontalUploaded) {
      setError("请先上传主体正面参考图");
      return;
    }

    setFilling(true);
    setError(null);
    try {
      const frontalUp = frontalUploaded ?? (await uploadV2File(frontalFile!));
      if (!frontalUploaded) setFrontalUploaded(frontalUp);

      const res = await api.post(getURL("KLING_ELEMENTS", {}, true) + "/smart-fill", {
        frontal_file_id: frontalUp.id,
        need,
      });
      const raw = res?.data as any;
      const filesRaw = Array.isArray(raw?.files) ? raw.files : [];
      const filled = filesRaw
        .filter((x: any) => x && x.id && x.path)
        .map(
          (x: any): UploadedV2File => ({
            id: String(x.id),
            name: String(x.name ?? ""),
            path: String(x.path),
            size: Number(x.size ?? 0),
          }),
        );
      if (!filled.length) throw new Error("补齐失败：未返回图片");

      setReferSlots((prev) => {
        const next = [...prev];
        const emptyIdx = next
          .map((s, idx) => (!s.local && !s.uploaded ? idx : -1))
          .filter((idx) => idx >= 0);
        let j = 0;
        for (const idx of emptyIdx) {
          if (j >= filled.length) break;
          next[idx] = { local: null, uploaded: filled[j++] };
        }
        return next;
      });
    } catch (e: unknown) {
      const err = e as AxiosLikeError;
      const detail = err?.response?.data?.detail ?? err?.response?.data?.message;
      setError(String(detail ?? err?.message ?? "智能补齐失败"));
    } finally {
      setFilling(false);
    }
  }, [referenceType, filling, submitting, referFilledCount, frontalFile, frontalUploaded]);

  const handleSmartDescribe = useCallback(async () => {
    if (referenceType !== "image_refer") return;
    if (describing || filling || submitting) return;
    if (!frontalFile && !frontalUploaded) {
      setError("请先上传主体正面参考图");
      return;
    }
    if (referFilledCount < 1) {
      setError("请先上传至少 1 张主体其他参考图（或先点“智能补齐”）");
      return;
    }

    setDescribing(true);
    setError(null);
    try {
      const frontalUp = frontalUploaded ?? (await uploadV2File(frontalFile!));
      if (!frontalUploaded) setFrontalUploaded(frontalUp);

      // Ensure all filled refer slots have uploaded file ids so the backend can read them.
      const filledRefs = referSlots
        .map((s, idx) => ({ s, idx }))
        .filter(({ s }) => Boolean(s.local || s.uploaded));

      const uploadedByIdx = new Map<number, UploadedV2File>();
      for (const { s, idx } of filledRefs) {
        if (s.uploaded) {
          uploadedByIdx.set(idx, s.uploaded);
          continue;
        }
        if (s.local) {
          uploadedByIdx.set(idx, await uploadV2File(s.local));
        }
      }

      // Persist uploads into state (keep local preview if present).
      if (uploadedByIdx.size > 0) {
        setReferSlots((prev) => {
          const next = [...prev];
          for (const [idx, up] of uploadedByIdx.entries()) {
            if (!next[idx]) continue;
            next[idx] = { local: next[idx]!.local, uploaded: up };
          }
          return next;
        });
      }

      const fileIds = [
        frontalUp.id,
        ...filledRefs
          .map(({ idx }) => uploadedByIdx.get(idx))
          .filter(Boolean)
          .map((x) => (x as UploadedV2File).id),
      ].slice(0, 4);

      const res = await api.post(getURL("KLING_ELEMENTS", {}, true) + "/smart-describe", {
        file_ids: fileIds,
        user_description: desc.trim() ? desc.trim() : undefined,
      });
      const raw = res?.data as any;
      const nextDesc = String(raw?.description ?? "").trim();
      if (!nextDesc) throw new Error("智能描述失败：未返回描述");
      setDesc(nextDesc.slice(0, 100));
    } catch (e: unknown) {
      const err = e as AxiosLikeError;
      const detail = err?.response?.data?.detail ?? err?.response?.data?.message;
      setError(String(detail ?? err?.message ?? "智能描述失败"));
    } finally {
      setDescribing(false);
    }
  }, [
    referenceType,
    describing,
    filling,
    submitting,
    frontalFile,
    frontalUploaded,
    referSlots,
    referFilledCount,
    desc,
  ]);

  const submitLockRef = useRef(false);
  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitting) return;
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      let created: KlingElement;
      if (referenceType === "video_refer") {
        const videoUp = await uploadV2File(videoFile!);
        created = await createCustom({
          element_name: name.trim(),
          element_description: desc.trim(),
          reference_type: "video_refer",
          video_file_id: videoUp.id,
          tag_id: tagId,
          element_voice_id: voiceId.trim() ? voiceId.trim() : undefined,
        });
      } else {
        const frontalUp = frontalUploaded ?? (await uploadV2File(frontalFile!));
        const referUps: UploadedV2File[] = [];
        for (const slot of referSlots) {
          if (slot.uploaded) {
            referUps.push(slot.uploaded);
            continue;
          }
          if (slot.local) {
            referUps.push(await uploadV2File(slot.local));
          }
        }

        created = await createCustom({
          element_name: name.trim(),
          element_description: desc.trim(),
          reference_type: "image_refer",
          frontal_file_id: frontalUp.id,
          refer_file_ids: referUps.map((x) => x.id),
          tag_id: tagId,
        });
      }

      onCreated?.(created);
      handleClose(false);
    } catch (e: unknown) {
      const err = e as AxiosLikeError;
      const detail = err?.response?.data?.detail ?? err?.response?.data?.message;
      setError(String(detail ?? err?.message ?? "创建主体失败"));
      setSubmitting(false);
      submitLockRef.current = false;
    }
  }, [canSubmit, submitting, referenceType, videoFile, voiceId, frontalFile, frontalUploaded, referSlots, createCustom, name, desc, tagId, onCreated, handleClose]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[1100px] p-0">
        <div className="p-6">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle className="text-lg font-semibold">新建主体</DialogTitle>
          </DialogHeader>

          <div className="mt-6 grid grid-cols-[560px_1fr] gap-10">
            <div>
              <div className="mb-4 flex items-center gap-2">
                <Button
                  type="button"
                  variant={referenceType === "image_refer" ? "secondary" : "outline"}
                  className="h-10 px-4"
                  onClick={() => {
                    setError(null);
                    setReferenceType("image_refer");
                    setVideoFile(null);
                    setVoiceId("");
                  }}
                >
                  图片定制
                </Button>
                <Button
                  type="button"
                  variant={referenceType === "video_refer" ? "secondary" : "outline"}
                  className="h-10 px-4"
                  onClick={() => {
                    setError(null);
                    setReferenceType("video_refer");
                    setFrontalFile(null);
                    setFrontalUploaded(null);
                    setReferSlots([
                      { local: null, uploaded: null },
                      { local: null, uploaded: null },
                      { local: null, uploaded: null },
                    ]);
                  }}
                >
                  视频定制
                </Button>
              </div>

              {referenceType === "video_refer" ? (
                <div>
                  <div className="text-sm font-medium">主体参考视频（必填，1段）</div>
                  <div className="mt-3">
                    <label
                      className={cn(
                        "relative flex h-[220px] w-[420px] cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/10",
                        videoFile && "border-border/80",
                      )}
                    >
                      {videoPreview ? (
                        <video src={videoPreview} className="h-full w-full object-cover" controls />
                      ) : (
                        <div className="text-[13px] text-muted-foreground">点击上传</div>
                      )}
                      <input
                        type="file"
                        accept="video/mp4,video/quicktime"
                        className="hidden"
                        onChange={(e) => onPickVideo(e.target.files?.[0] ?? null)}
                      />
                    </label>

                    {videoFile && (
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <div className="truncate pr-2">{videoFile.name}</div>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setVideoFile(null)}
                        >
                          清除
                        </Button>
                      </div>
                    )}

                    <div className="mt-2 text-xs text-muted-foreground">
                      仅支持 MP4/MOV；3-8秒；1080P；16:9 或 9:16；最大 200MB。
                    </div>
                  </div>
                </div>
              ) : (
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
                        accept="image/png,image/jpeg"
                        className="hidden"
                        onChange={(e) => onPickFrontal(e.target.files?.[0] ?? null)}
                      />
                    </label>

                    <div className="mt-2 text-xs text-muted-foreground">
                      支持 JPG/JPEG/PNG；大小 10MB；宽高 300px；建议：正面清晰、主体完整。
                    </div>
                  </div>

                  <div className="mt-7 flex items-center justify-between">
                    <div className="text-sm font-medium">
                      主体其他参考图（必填，1-3张）
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9"
                      disabled={
                        filling ||
                        submitting ||
                        referFilledCount >= 3 ||
                        (!frontalFile && !frontalUploaded)
                      }
                      onClick={() => void handleSmartFill()}
                      title="根据正面图智能补齐其他参考图（只补空位）"
                    >
                      {filling ? "补齐中..." : "智能补齐"}
                    </Button>
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
                      {(referSlots[0]?.local || referSlots[0]?.uploaded) && (
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
                          {(referSlots[idx]?.local || referSlots[idx]?.uploaded) && (
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
              )}
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

              {referenceType === "video_refer" && (
                <div>
                  <div className="mb-2 text-sm font-medium">绑定音色ID（可选）</div>
                  <Input
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                    placeholder="填写音色库中的 voice_id"
                    className="h-11"
                  />
                  <div className="mt-1 text-xs text-muted-foreground">
                    仅视频定制主体支持绑定音色。
                  </div>
                </div>
              )}

              <div>
                <div className="mb-2 text-sm font-medium">主体描述（必填）</div>
                <div className="relative">
                  <Textarea
                    value={desc}
                    maxLength={100}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder={
                      "请描述主体的核心特征，如「一个可爱甜美的短发女孩」。还可以描述希望保留的细节，如「佩戴着金色耳环」;或者描述想要忽略的特征，如「不要脸上的雀斑」。不超过100字"
                    }
                    className="min-h-[180px] pb-12"
                  />

                  <Button
                    type="button"
                    variant="outline"
                    className="absolute bottom-2 left-2 h-9 px-3 text-xs"
                    disabled={
                      referenceType !== "image_refer" ||
                      describing ||
                      filling ||
                      submitting ||
                      (!frontalFile && !frontalUploaded) ||
                      referFilledCount < 1
                    }
                    onClick={() => void handleSmartDescribe()}
                    title="用 Gemini 分析主体图片并生成/优化描述（不超过100字）"
                  >
                    <ForwardedIconComponent
                      name={describing ? "Loader2" : "Sparkles"}
                      className={cn("mr-2 h-4 w-4", describing && "animate-spin")}
                    />
                    {describing ? "生成中..." : "智能描述"}
                  </Button>
                </div>

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
