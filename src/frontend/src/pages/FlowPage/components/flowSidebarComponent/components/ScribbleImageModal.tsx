import { cloneDeep } from "lodash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/utils";
import useAlertStore from "@/stores/alertStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import useFlowStore from "@/stores/flowStore";
import { useTypesStore } from "@/stores/typesStore";
import { usePostUploadFile } from "@/controllers/API/queries/files/use-post-upload-file";
import useFileSizeValidator from "@/shared/hooks/use-file-size-validator";
import { createFileUpload } from "@/helpers/create-file-upload";
import { getNodeId } from "@/utils/reactflowUtils";
import { buildFlowVerticesWithFallback } from "@/utils/buildUtils";
import { BuildStatus, EventDeliveryType } from "@/constants/enums";
import type { OutputLogType, VertexBuildTypeAPI } from "@/types/api";
import {
  parseDoubaoPreviewData,
  type DoubaoPreviewDescriptor,
} from "@/CustomNodes/hooks/use-doubao-preview";
import { toRenderableImageSource } from "@/CustomNodes/GenericNode/components/DoubaoPreviewPanel/helpers";
import ScribbleEditor, { type ScribbleEditorHandle } from "@/components/ScribbleEditor";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Step = "pick" | "edit";
type SourceMode = "upload" | "blank";

function resolveViewportCenterFlow(reactFlowInstance: any) {
  if (reactFlowInstance?.getViewport) {
    const view = reactFlowInstance.getViewport();
    const zoom = Number(view?.zoom ?? 1) || 1;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    return {
      x: (cx - (Number(view?.x ?? 0) || 0)) / zoom,
      y: (cy - (Number(view?.y ?? 0) || 0)) / zoom,
    };
  }
  return { x: 0, y: 0 };
}

function createBlankDataUrl(size = 1024) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
  }
  return canvas.toDataURL("image/png");
}

const GEMINI_RATIOS = [
  { label: "1:1", w: 1, h: 1 },
  { label: "16:9", w: 16, h: 9 },
  { label: "9:16", w: 9, h: 16 },
  { label: "4:3", w: 4, h: 3 },
  { label: "3:4", w: 3, h: 4 },
  { label: "3:2", w: 3, h: 2 },
  { label: "2:3", w: 2, h: 3 },
];

function nearestGeminiAspectRatio(natural: { w: number; h: number } | null): string {
  const w0 = Number(natural?.w ?? 0);
  const h0 = Number(natural?.h ?? 0);
  if (!Number.isFinite(w0) || !Number.isFinite(h0) || w0 <= 0 || h0 <= 0) return "1:1";
  const r = w0 / h0;
  let best = GEMINI_RATIOS[0]!;
  let bestDiff = Infinity;
  for (const opt of GEMINI_RATIOS) {
    const rr = opt.w / opt.h;
    const diff = Math.abs(Math.log(r / rr));
    if (diff < bestDiff) {
      best = opt;
      bestDiff = diff;
    }
  }
  return best.label;
}

function extractPreviewFromBuild(
  buildData: VertexBuildTypeAPI,
  componentName: string,
): { preview: DoubaoPreviewDescriptor; rawPayload: any } | null {
  const outputs: any = buildData?.data?.outputs ?? {};
  const values = Object.values(outputs) as Array<OutputLogType | OutputLogType[] | undefined>;
  for (const output of values) {
    const logs = Array.isArray(output) ? output : output ? [output] : [];
    for (let i = logs.length - 1; i >= 0; i -= 1) {
      const payload = (logs[i] as any)?.message;
      const parsed = parseDoubaoPreviewData(componentName, payload);
      if (parsed) {
        return { preview: parsed, rawPayload: payload };
      }
    }
  }
  return null;
}

function resolvePrimaryPreviewImageSource(preview: DoubaoPreviewDescriptor | null): string {
  const payload: any = preview?.payload ?? null;
  if (!payload || typeof payload !== "object") return "";
  const images = Array.isArray(payload.images) ? payload.images : [];
  const first = images.find((img: any) => img?.image_data_url || img?.image_url) ?? null;
  return (
    String(first?.image_data_url || first?.image_url || payload.image_data_url || payload.image_url || "").trim()
  );
}

export default function ScribbleImageModal({ open, onOpenChange }: Props) {
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
  const currentFlowId = useFlowsManagerStore((state) => state.currentFlowId);
  const reactFlowInstance = useFlowStore((state) => state.reactFlowInstance);
  const setNodes = useFlowStore((state) => state.setNodes);
  const templates = useTypesStore((state) => state.templates);
  const { mutateAsync: uploadFile } = usePostUploadFile();
  const { validateFileSize } = useFileSizeValidator();

  const editorRef = useRef<ScribbleEditorHandle | null>(null);
  const lastSeededRef = useRef<any>(null);
  const lastPreviewRawRef = useRef<any>(null);

  const [step, setStep] = useState<Step>("pick");
  const [mode, setMode] = useState<SourceMode>("upload");
  const [isBusy, setBusy] = useState(false);

  const [baseLocalUrl, setBaseLocalUrl] = useState<string>("");
  const [baseFileName, setBaseFileName] = useState<string>("");
  const [baseServerPath, setBaseServerPath] = useState<string>("");
  const [baseNatural, setBaseNatural] = useState<{ w: number; h: number } | null>(null);

  const [prompt, setPrompt] = useState<string>("");
  const [preview, setPreview] = useState<DoubaoPreviewDescriptor | null>(null);
  const [previewRenderableUrl, setPreviewRenderableUrl] = useState<string>("");
  const previewRevokeRef = useRef<undefined | (() => void)>(undefined);

  const resetAll = useCallback(() => {
    setStep("pick");
    setMode("upload");
    setBusy(false);
    setPrompt("");
    setPreview(null);
    lastSeededRef.current = null;
    lastPreviewRawRef.current = null;

    previewRevokeRef.current?.();
    previewRevokeRef.current = undefined;
    setPreviewRenderableUrl("");

    if (baseLocalUrl && /^blob:/i.test(baseLocalUrl)) {
      try {
        URL.revokeObjectURL(baseLocalUrl);
      } catch {
        // ignore
      }
    }
    setBaseLocalUrl("");
    setBaseFileName("");
    setBaseServerPath("");
    setBaseNatural(null);
  }, [baseLocalUrl]);

  useEffect(() => {
    if (open) return;
    resetAll();
  }, [open, resetAll]);

  useEffect(() => {
    const src = resolvePrimaryPreviewImageSource(preview);
    previewRevokeRef.current?.();
    previewRevokeRef.current = undefined;
    setPreviewRenderableUrl("");
    if (!src) return;
    let cancelled = false;
    void toRenderableImageSource(src).then(({ url, revoke }) => {
      if (cancelled) {
        revoke?.();
        return;
      }
      setPreviewRenderableUrl(url);
      previewRevokeRef.current = revoke;
    });
    return () => {
      cancelled = true;
    };
  }, [preview]);

  const enterBlank = useCallback(() => {
    if (!currentFlowId) {
      setErrorData({ title: "请先保存画布后再使用涂鸦生图" });
      return;
    }
    const url = createBlankDataUrl(1024);
    setMode("blank");
    setBaseLocalUrl(url);
    setBaseFileName("blank.png");
    setBaseServerPath("");
    setBaseNatural({ w: 1024, h: 1024 });
    setStep("edit");
  }, [currentFlowId, setErrorData]);

  const enterUpload = useCallback(async () => {
    if (isBusy) return;
    if (!currentFlowId) {
      setErrorData({ title: "请先保存画布后再使用涂鸦生图" });
      return;
    }
    const files = await createFileUpload({ multiple: false, accept: "image/*" });
    const file = files[0];
    if (!file) return;
    const ok = validateFileSize(file);
    if (!ok) return;

    setBusy(true);
    try {
      const localUrl = URL.createObjectURL(file);
      setMode("upload");
      setBaseLocalUrl(localUrl);
      setBaseFileName(file.name);

      // Capture natural size early (for aspect ratio).
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = localUrl;
      });
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setBaseNatural({ w: img.naturalWidth, h: img.naturalHeight });
      }

      const resp = await uploadFile({ file, id: currentFlowId });
      const serverPath = String((resp as any)?.file_path || "").trim();
      if (!serverPath) throw new Error("缺少文件路径");
      setBaseServerPath(serverPath);
      setStep("edit");
    } catch (error: any) {
      setErrorData({ title: "上传失败", list: [String(error?.message || "网络异常，请稍后再试")] });
    } finally {
      setBusy(false);
    }
  }, [currentFlowId, isBusy, setErrorData, uploadFile, validateFileSize]);

  const handleBackToPick = useCallback(() => {
    resetAll();
  }, [resetAll]);

  const canInsert = Boolean(preview && lastSeededRef.current && lastPreviewRawRef.current);

  const buildPrompt = useCallback(
    (userPrompt: string) => {
      const safe = String(userPrompt || "").trim();
      if (mode === "upload") {
        const base = [
          "你会收到两张图片：图1是原图，图2是涂鸦/标注后的参考图。",
          "请以图1为基础进行图像编辑，优先根据图2的涂鸦/标注修改对应区域；",
          "尽量保持未标注区域的内容与风格不变；输出一张修改后的完整图片。",
        ].join("");
        return safe ? `${base}\n要求：${safe}` : base;
      }
      const base = [
        "你会收到一张涂鸦参考图。",
        "请根据涂鸦的构图/形状/大致布局生成一张完整的高质量图片；",
        "不要保留涂鸦线条或画布痕迹。",
      ].join("");
      return safe ? `${base}\n要求：${safe}` : base;
    },
    [mode],
  );

  const handleGenerate = useCallback(async () => {
    if (isBusy) return;
    if (!currentFlowId) {
      setErrorData({ title: "请先保存画布后再生成" });
      return;
    }

    const tpl = (templates as any)?.DoubaoImageCreator as any;
    if (!tpl) {
      setErrorData({ title: "组件未加载", list: ["未找到 DoubaoImageCreator 模板，请刷新页面后重试。"] });
      return;
    }

    const exported = await editorRef.current?.exportPngFile();
    if (!exported) {
      setErrorData({ title: "导出涂鸦图片失败" });
      return;
    }

    const aspectRatio = nearestGeminiAspectRatio(baseNatural);

    setBusy(true);
    try {
      const annotatedFile = exported.file;
      const uploadAnnotated = await uploadFile({ file: annotatedFile, id: currentFlowId });
      const annotatedPath = String((uploadAnnotated as any)?.file_path || "").trim();
      if (!annotatedPath) throw new Error("上传涂鸦图片失败");

      const referenceValue =
        mode === "upload" ? [baseFileName, annotatedFile.name] : [annotatedFile.name];
      const referencePaths =
        mode === "upload" ? [baseServerPath, annotatedPath] : [annotatedPath];

      const seeded = cloneDeep(tpl);
      seeded.display_name = "涂鸦生图";
      seeded.icon = "Paintbrush";
      seeded.template = seeded.template ?? {};
      const seededTpl = seeded.template;

      // Force Nano Banana Pro (Gemini pro image model).
      if (seededTpl.model_name) {
        seededTpl.model_name.value = "Nano Banana Pro";
      }

      // Ensure Gemini uses explicit aspectRatio enums (no "adaptive").
      if (seededTpl.aspect_ratio) {
        seededTpl.aspect_ratio.value = aspectRatio;
      }

      if (seededTpl.prompt) {
        seededTpl.prompt.value = buildPrompt(prompt);
      }
      if (seededTpl.image_count) {
        seededTpl.image_count.value = 1;
      }

      if (seededTpl.reference_images) {
        seededTpl.reference_images.value = referenceValue;
        seededTpl.reference_images.file_path = referencePaths;
      }

      // Avoid carrying cached previews into the run.
      if (seededTpl.draft_output) {
        delete seededTpl.draft_output;
      }

      lastSeededRef.current = seeded;

      const runNodeId = getNodeId("DoubaoImageCreator");
      const buildNode: any = {
        id: runNodeId,
        type: "genericNode",
        position: { x: 0, y: 0 },
        data: {
          node: seeded,
          showNode: true,
          type: "DoubaoImageCreator",
          id: runNodeId,
        },
      };

      await buildFlowVerticesWithFallback({
        flowId: currentFlowId,
        stopNodeId: runNodeId,
        nodes: [buildNode],
        edges: [],
        eventDelivery: EventDeliveryType.STREAMING,
        onBuildUpdate: (buildData, status) => {
          if (status !== BuildStatus.BUILT) return;
          if (!buildData || buildData.id !== runNodeId) return;
          const extracted = extractPreviewFromBuild(buildData, "DoubaoImageCreator");
          if (!extracted) return;
          lastPreviewRawRef.current = extracted.rawPayload;
          setPreview(extracted.preview);
        },
        onBuildError: (title: string, list: string[]) => {
          setErrorData({ title: title || "生成失败", list: list?.length ? list : undefined });
        },
        onBuildComplete: () => {},
        onGetOrderSuccess: () => {},
      } as any);
    } catch (error: any) {
      setErrorData({ title: "生成失败", list: [String(error?.message || "网络异常，请稍后再试")] });
    } finally {
      setBusy(false);
      try {
        URL.revokeObjectURL(exported.objectUrl);
      } catch {
        // ignore
      }
    }
  }, [
    baseFileName,
    baseNatural,
    baseServerPath,
    buildPrompt,
    currentFlowId,
    isBusy,
    mode,
    prompt,
    setErrorData,
    templates,
    uploadFile,
  ]);

  const handleInsert = useCallback(() => {
    if (!canInsert) return;
    if (!lastSeededRef.current) return;
    const seeded = cloneDeep(lastSeededRef.current);
    seeded.template = seeded.template ?? {};
    const seededTpl = seeded.template;
    seededTpl.draft_output = seededTpl.draft_output ?? { value: null };
    seededTpl.draft_output.value = lastPreviewRawRef.current;

    const newNodeId = getNodeId("DoubaoImageCreator");
    const center = resolveViewportCenterFlow(reactFlowInstance as any);
    const estimated = { width: 760, height: 640 };
    const position = {
      x: center.x - estimated.width / 2,
      y: center.y - estimated.height / 2,
    };

    const newNode: any = {
      id: newNodeId,
      type: "genericNode",
      position,
      width: estimated.width,
      height: estimated.height,
      data: {
        node: seeded,
        showNode: !seeded.minimized,
        type: "DoubaoImageCreator",
        id: newNodeId,
        cropPreviewOnly: true,
      },
      selected: true,
    };

    takeSnapshot();
    setNodes((current) => [
      ...(current ?? []).map((n: any) => ({ ...n, selected: false })),
      newNode,
    ]);

    onOpenChange(false);
  }, [canInsert, onOpenChange, reactFlowInstance, setNodes, takeSnapshot]);

  const title = useMemo(() => "涂鸦生图", []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1150px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {step === "pick" && (
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              className={cn(
                "group flex h-[180px] w-full flex-col justify-between rounded-2xl border bg-muted/30 p-5 text-left",
                "hover:bg-muted/50",
              )}
              onClick={() => void enterUpload()}
              disabled={isBusy}
            >
              <div className="flex items-center justify-between">
                <div className="text-base font-semibold">上传图片</div>
              </div>
              <div className="text-sm text-muted-foreground">
                先上传一张图片，再通过涂鸦/标注进行编辑生成
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  使用 Nano Banana Pro
                </div>
                <div className="text-sm font-medium group-hover:translate-x-0.5 transition">
                  进入 →
                </div>
              </div>
            </button>

            <button
              type="button"
              className={cn(
                "group flex h-[180px] w-full flex-col justify-between rounded-2xl border bg-muted/30 p-5 text-left",
                "hover:bg-muted/50",
              )}
              onClick={enterBlank}
              disabled={isBusy}
            >
              <div className="flex items-center justify-between">
                <div className="text-base font-semibold">空白创建</div>
              </div>
              <div className="text-sm text-muted-foreground">
                从空白画布开始涂鸦，结合提示词生成
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  使用 Nano Banana Pro
                </div>
                <div className="text-sm font-medium group-hover:translate-x-0.5 transition">
                  进入 →
                </div>
              </div>
            </button>
          </div>
        )}

        {step === "edit" && (
          <div className="grid grid-cols-[1fr_360px] gap-4">
            <div className="h-[640px]">
              <ScribbleEditor
                ref={editorRef as any}
                open={open}
                imageSource={baseLocalUrl}
                imageFileName={baseFileName}
                onBack={handleBackToPick}
              />
            </div>

            <div className="flex flex-col gap-3">
              <div className="rounded-2xl border p-3">
                <div className="text-sm font-semibold">提示词</div>
                <textarea
                  className="mt-2 h-[140px] w-full resize-none rounded-xl border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="描述你想要的效果..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={isBusy}
                />
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => void handleGenerate()} disabled={isBusy}>
                    {isBusy ? "生成中..." : "生成"}
                  </Button>
                  <Button variant="secondary" onClick={handleInsert} disabled={!canInsert}>
                    插入到画布
                  </Button>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  上传图片：图像编辑；空白创建：参考图生成
                </div>
              </div>

              <div className="flex-1 rounded-2xl border p-3">
                <div className="text-sm font-semibold">预览</div>
                <div className="mt-2 flex h-[360px] items-center justify-center overflow-hidden rounded-xl bg-muted/30">
                  {previewRenderableUrl ? (
                    <img
                      src={previewRenderableUrl}
                      alt="preview"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <div className="text-xs text-muted-foreground">暂无预览</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
