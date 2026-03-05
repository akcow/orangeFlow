import { cloneDeep } from "lodash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { toRenderableImageSource } from "@/CustomNodes/GenericNode/components/DoubaoPreviewPanel/helpers";
import {
  parseDoubaoPreviewData,
  type DoubaoPreviewDescriptor,
} from "@/CustomNodes/hooks/use-doubao-preview";
import ScribbleStudioCanvas, {
  type ScribbleStudioCanvasHandle,
  type StudioLayer,
  type StudioTool,
} from "./ScribbleStudioCanvas";
import ScribbleStudioRail, {
  type RailContextAction,
} from "./ScribbleStudioRail";
import { getLayerThumbnailSrc } from "./scribbleLayerThumbnail";

type Props = {
  active: boolean;
  onRequestClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
};

type SourceMode = "upload" | "blank";

type GeneratedItem = {
  id: string;
  label: string;
  src: string;
  natural?: { w: number; h: number } | null;
  rawPayloadSingle: any;
};

const RESOLUTION_PRESETS = [
  { key: "1K", label: "1K" },
  { key: "2K", label: "2K" },
  { key: "4K", label: "4K" },
] as const;

const ASPECT_PRESETS = [
  { key: "adaptive", label: "自适应" },
  { key: "1:1", label: "1:1" },
  { key: "4:3", label: "4:3" },
  { key: "3:4", label: "3:4" },
  { key: "16:9", label: "16:9" },
  { key: "9:16", label: "9:16" },
  { key: "3:2", label: "3:2" },
  { key: "2:3", label: "2:3" },
] as const;

function nextId(prefix: string) {
  return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

async function loadNaturalSize(
  url: string,
): Promise<{ w: number; h: number } | null> {
  const src = String(url || "").trim();
  if (!src) return null;
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
    return { w: img.naturalWidth, h: img.naturalHeight };
  }
  return null;
}

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

function nearestGeminiAspectRatio(
  natural: { w: number; h: number } | null,
): string {
  const opts = [
    { label: "1:1", w: 1, h: 1 },
    { label: "16:9", w: 16, h: 9 },
    { label: "9:16", w: 9, h: 16 },
    { label: "4:3", w: 4, h: 3 },
    { label: "3:4", w: 3, h: 4 },
    { label: "3:2", w: 3, h: 2 },
    { label: "2:3", w: 2, h: 3 },
  ];
  const w0 = Number(natural?.w ?? 0);
  const h0 = Number(natural?.h ?? 0);
  if (!Number.isFinite(w0) || !Number.isFinite(h0) || w0 <= 0 || h0 <= 0)
    return "1:1";
  const r = w0 / h0;
  let best = opts[0]!;
  let bestDiff = Infinity;
  for (const opt of opts) {
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
  const values = Object.values(outputs) as Array<
    OutputLogType | OutputLogType[] | undefined
  >;
  for (const output of values) {
    const logs = Array.isArray(output) ? output : output ? [output] : [];
    for (let i = logs.length - 1; i >= 0; i -= 1) {
      const payload = (logs[i] as any)?.message;
      const parsed = parseDoubaoPreviewData(componentName, payload);
      if (parsed) return { preview: parsed, rawPayload: payload };
    }
  }
  return null;
}

function clonePreviewPayloadSingle(rawPayload: any, imageIndex: number): any {
  if (!rawPayload || typeof rawPayload !== "object") return rawPayload;
  const cloned = cloneDeep(rawPayload);
  const dp = (cloned as any)?.doubao_preview;
  const payload = dp?.payload;
  const images = Array.isArray(payload?.images) ? payload.images : [];
  const one =
    images.find((img: any) => Number(img?.index ?? 0) === imageIndex) ??
    images[imageIndex] ??
    null;
  if (one) {
    (dp.payload as any).images = [{ ...one, index: 0 }];
  }
  return cloned;
}

function extractFirstImageSrcFromPreview(
  preview: DoubaoPreviewDescriptor | null | undefined,
): string {
  if (!preview) return "";
  const payload: any = (preview as any)?.payload ?? null;

  // Newer payloads can provide a list of images.
  const images = Array.isArray(payload?.images) ? payload.images : [];
  const first = images[0] ?? null;
  const fromImages = String(
    first?.image_data_url || first?.image_url || "",
  ).trim();
  if (fromImages) return fromImages;

  // Fallbacks (older / simplified payloads).
  return String(
    payload?.image_data_url ||
      payload?.image_url ||
      payload?.edited_image_url ||
      payload?.original_image_url ||
      payload?.preview_base64 ||
      payload?.preview_data_url ||
      "",
  ).trim();
}

export default function ScribbleImageStudio({
  active,
  onRequestClose,
  onDirtyChange,
}: Props) {
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
  const currentFlowId = useFlowsManagerStore((state) => state.currentFlowId);
  const reactFlowInstance = useFlowStore((state) => state.reactFlowInstance);
  const setNodes = useFlowStore((state) => state.setNodes);
  const templates = useTypesStore((state) => state.templates);
  const { mutateAsync: uploadFile } = usePostUploadFile();
  const { validateFileSize } = useFileSizeValidator();

  const canvasRef = useRef<ScribbleStudioCanvasHandle | null>(null);
  const previewRevokeRef = useRef<Array<() => void>>([]);
  const initHistoryRef = useRef(false);

  const [step, setStep] = useState<"pick" | "edit">("pick");
  const [sourceMode, setSourceMode] = useState<SourceMode>("upload");
  const [isBusy, setBusy] = useState(false);

  const [baseFileName, setBaseFileName] = useState<string>("");
  const [baseServerPath, setBaseServerPath] = useState<string>("");
  const [baseNatural, setBaseNatural] = useState<{
    w: number;
    h: number;
  } | null>(null);

  const [aspectKey, setAspectKey] =
    useState<(typeof ASPECT_PRESETS)[number]["key"]>("adaptive");
  const [resolutionKey, setResolutionKey] =
    useState<(typeof RESOLUTION_PRESETS)[number]["key"]>("2K");
  const [backgroundMode, setBackgroundMode] = useState<"white" | "transparent">(
    "white",
  );

  const [tool, setTool] = useState<StudioTool>("select");
  const [toolColor, setToolColor] = useState<string>("#2E7BFF");
  const [toolWidth, setToolWidth] = useState<number>(10);
  const [textColor, setTextColor] = useState<string>("#2E7BFF");
  const [textFontSize, setTextFontSize] = useState<number>(48);
  const [aspectPopoverOpen, setAspectPopoverOpen] = useState(false);
  const [uiMode, setUiMode] = useState<"normal" | "crop">("normal");
  const [layers, setLayers] = useState<StudioLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string>("");

  const [generated, setGenerated] = useState<GeneratedItem[]>([]);
  const [selectedGeneratedId, setSelectedGeneratedId] = useState<string>("");

  const [prompt, setPrompt] = useState<string>("");
  const [imageCount, setImageCount] = useState<number>(1);

  const hasAnyVisualContent = useMemo(() => {
    return (
      layers.some((l) => {
        if (!l.visible) return false;
        const hasBitmap = Boolean(String(l.bitmapSrc || "").trim());
        const hasItems = Array.isArray(l.items) && l.items.length > 0;
        return hasBitmap || hasItems;
      }) || false
    );
  }, [layers]);

  const canGenerate = useMemo(() => {
    // Match requirement: disable only when both prompt and image/content are missing.
    return Boolean(String(prompt || "").trim()) || hasAnyVisualContent;
  }, [hasAnyVisualContent, prompt]);

  const isDirty = useMemo(() => {
    if (!active || step !== "edit") return false;
    const hasPrompt = Boolean(String(prompt || "").trim());
    const hasGenerated = generated.length > 0;
    const hasCustomConfig =
      sourceMode !== "upload" ||
      aspectKey !== "adaptive" ||
      resolutionKey !== "2K" ||
      backgroundMode !== "white" ||
      imageCount !== 1;
    return hasPrompt || hasGenerated || hasAnyVisualContent || hasCustomConfig;
  }, [
    active,
    aspectKey,
    backgroundMode,
    generated.length,
    hasAnyVisualContent,
    imageCount,
    prompt,
    resolutionKey,
    sourceMode,
    step,
  ]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const selectedLayer = useMemo(
    () => layers.find((l) => l.id === selectedLayerId) ?? null,
    [layers, selectedLayerId],
  );

  const layerThumbnailById = useMemo(() => {
    const out: Record<string, string> = {};
    for (const layer of layers) {
      out[layer.id] = getLayerThumbnailSrc(layer);
    }
    return out;
  }, [layers]);

  const canCropSelectedLayer = useMemo(() => {
    return Boolean(String(selectedLayer?.bitmapSrc || "").trim());
  }, [selectedLayer?.bitmapSrc]);

  const resetAll = useCallback(() => {
    setStep("pick");
    setSourceMode("upload");
    setBusy(false);
    setBaseFileName("");
    setBaseServerPath("");
    setBaseNatural(null);
    setAspectKey("adaptive");
    setResolutionKey("2K");
    setBackgroundMode("white");
    setTool("select");
    setToolColor("#2E7BFF");
    setToolWidth(10);
    setTextColor("#2E7BFF");
    setTextFontSize(48);
    setAspectPopoverOpen(false);
    setUiMode("normal");
    setLayers([]);
    setSelectedLayerId("");
    setGenerated([]);
    setSelectedGeneratedId("");
    setPrompt("");
    setImageCount(1);

    previewRevokeRef.current.forEach((fn) => {
      try {
        fn();
      } catch {
        // ignore
      }
    });
    previewRevokeRef.current = [];
  }, []);

  useEffect(() => {
    if (active) return;
    resetAll();
  }, [active, resetAll]);

  useEffect(() => {
    if (!active) return;
    if (step !== "edit") {
      initHistoryRef.current = false;
      return;
    }
    if (initHistoryRef.current) return;
    initHistoryRef.current = true;
    window.requestAnimationFrame(() => {
      canvasRef.current?.checkpoint?.();
    });
  }, [active, step]);

  useEffect(() => {
    if (!active) return;
    if (step !== "edit") return;
    if (uiMode !== "crop") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      canvasRef.current?.cancelCrop?.();
      setUiMode("normal");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, step, uiMode]);

  const handleBackToPick = useCallback(() => {
    resetAll();
  }, [resetAll]);

  const handleEnterBlank = useCallback(() => {
    if (!currentFlowId) {
      setErrorData({ title: "请先保存画布后再使用涂鸦生图" });
      return;
    }
    setSourceMode("blank");
    setBaseFileName("blank.png");
    setBaseServerPath("");
    setBaseNatural(null);

    const baseLayer: StudioLayer = {
      id: nextId("layer"),
      name: "画布",
      visible: true,
      bitmapSrc: null,
      bitmapNatural: null,
      center: { x: 0, y: 0 },
      scale: 1,
      flipX: false,
      flipY: false,
      items: [],
      isBase: true,
    };
    setLayers([baseLayer]);
    setSelectedLayerId(baseLayer.id);
    setStep("edit");
  }, [currentFlowId, setErrorData]);

  const handleEnterUpload = useCallback(async () => {
    if (isBusy) return;
    if (!currentFlowId) {
      setErrorData({ title: "请先保存画布后再使用涂鸦生图" });
      return;
    }
    const files = await createFileUpload({
      multiple: false,
      accept: "image/*",
    });
    const file = files[0];
    if (!file) return;
    const ok = validateFileSize(file);
    if (!ok) return;

    setBusy(true);
    try {
      const localUrl = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = localUrl;
      });
      const natural =
        img.naturalWidth > 0 && img.naturalHeight > 0
          ? { w: img.naturalWidth, h: img.naturalHeight }
          : null;
      setBaseNatural(natural);

      const resp = await uploadFile({ file, id: currentFlowId });
      const serverPath = String((resp as any)?.file_path || "").trim();
      if (!serverPath) throw new Error("缺少文件路径");

      setSourceMode("upload");
      setBaseFileName(file.name);
      setBaseServerPath(serverPath);

      const baseLayer: StudioLayer = {
        id: nextId("layer"),
        name: "原图",
        visible: true,
        bitmapSrc: localUrl,
        bitmapNatural: natural,
        center: { x: 0, y: 0 },
        // Keep the base image at 1:1 pixel scale; the viewport auto-fits it to the screen.
        scale: 1,
        flipX: false,
        flipY: false,
        items: [],
        isBase: true,
      };
      setLayers([baseLayer]);
      setSelectedLayerId(baseLayer.id);
      setStep("edit");
    } catch (error: any) {
      setErrorData({
        title: "上传失败",
        list: [String(error?.message || "网络异常，请稍后再试")],
      });
    } finally {
      setBusy(false);
    }
  }, [currentFlowId, isBusy, setErrorData, uploadFile, validateFileSize]);

  const selectedGenerated = useMemo(
    () => generated.find((g) => g.id === selectedGeneratedId) ?? null,
    [generated, selectedGeneratedId],
  );

  const aspectLabel = useMemo(
    () => ASPECT_PRESETS.find((x) => x.key === aspectKey)?.label ?? "自适应",
    [aspectKey],
  );

  const buildPrompt = useCallback(
    (userPrompt: string) => {
      const safe = String(userPrompt || "").trim();
      if (sourceMode === "upload") {
        const base = [
          "你会收到一张参考图：它是原图与涂鸦/标注合并后的图片。",
          "请基于这张参考图进行图像编辑，并优先参考标注区域。",
          "尽量保持未标注区域不变，输出一张修改后的完整图片。",
        ].join("");
        return safe ? `${base}\n要求：${safe}` : base;
      }
      const base = [
        "你会收到一张涂鸦参考图。",
        "请根据涂鸦的构图与形状生成高质量完整图片。",
        "不要保留涂鸦线条或画布痕迹。",
      ].join("");
      return safe ? `${base}\n要求：${safe}` : base;
    },
    [sourceMode],
  );

  const resolveAspectForModel = useCallback(() => {
    if (aspectKey !== "adaptive") return aspectKey;
    const size = canvasRef.current?.getCanvasSize?.() ?? null;
    if (size?.w && size?.h)
      return nearestGeminiAspectRatio({ w: size.w, h: size.h });
    return nearestGeminiAspectRatio(baseNatural);
  }, [aspectKey, baseNatural]);

  const resolveResolutionForModel = useCallback(() => {
    if (resolutionKey === "1K") return "1K（草稿）";
    if (resolutionKey === "4K") return "4K（超清）";
    return "2K（推荐）";
  }, [resolutionKey]);

  const runModelOnce = useCallback(
    async (
      seededTemplate: any,
      onDone: (preview: DoubaoPreviewDescriptor, rawPayload: any) => void,
    ) => {
      if (!currentFlowId) {
        setErrorData({ title: "请先保存画布后再生成" });
        return;
      }
      const runNodeId = getNodeId("DoubaoImageCreator");
      const buildNode: any = {
        id: runNodeId,
        type: "genericNode",
        position: { x: 0, y: 0 },
        data: {
          node: seededTemplate,
          showNode: true,
          type: "DoubaoImageCreator",
          id: runNodeId,
        },
      };

      await buildFlowVerticesWithFallback({
        flowId: currentFlowId,
        // Keep this aligned with other single-node runs in the app.
        // `stopNodeId` avoids backend graph-order edge cases for isolated builds.
        stopNodeId: runNodeId,
        nodes: [buildNode],
        edges: [],
        eventDelivery: EventDeliveryType.STREAMING,
        onBuildUpdate: (buildData, status) => {
          if (status !== BuildStatus.BUILT) return;
          if (!buildData) return;
          const extracted = extractPreviewFromBuild(
            buildData,
            "DoubaoImageCreator",
          );
          if (!extracted) return;
          onDone(extracted.preview, extracted.rawPayload);
        },
        onBuildError: (title: string, list: string[]) => {
          setErrorData({
            title: title || "生成失败",
            list: list?.length ? list : undefined,
          });
        },
        onBuildComplete: () => {},
        onGetOrderSuccess: () => {},
      } as any);
    },
    [currentFlowId, setErrorData],
  );

  const handleGenerate = useCallback(async () => {
    if (isBusy) return;
    if (!currentFlowId) {
      setErrorData({ title: "请先保存画布后再生成" });
      return;
    }
    const tpl = (templates as any)?.DoubaoImageCreator as any;
    if (!tpl) {
      setErrorData({
        title: "组件未加载",
        list: ["未找到 DoubaoImageCreator 模板，请刷新页面后重试。"],
      });
      return;
    }
    const exported = await canvasRef.current?.exportCompositePngFile?.({
      backgroundMode,
    });
    if (!exported) {
      setErrorData({ title: "导出图片失败" });
      return;
    }

    setBusy(true);
    try {
      const compositeFile = exported.file;
      const compositeUpload = await uploadFile({
        file: compositeFile,
        id: currentFlowId,
      });
      const compositePath = String(
        (compositeUpload as any)?.file_path || "",
      ).trim();
      if (!compositePath) throw new Error("上传涂鸦图片失败");

      const seeded = cloneDeep(tpl);
      seeded.display_name = "涂鸦生图";
      seeded.icon = "Paintbrush";
      seeded.template = seeded.template ?? {};
      const seededTpl = seeded.template;

      if (seededTpl.model_name) seededTpl.model_name.value = "Nano Banana Pro";
      if (seededTpl.aspect_ratio)
        seededTpl.aspect_ratio.value = resolveAspectForModel();
      if (seededTpl.resolution)
        seededTpl.resolution.value = resolveResolutionForModel();
      if (seededTpl.prompt) seededTpl.prompt.value = buildPrompt(prompt);
      if (seededTpl.image_count)
        seededTpl.image_count.value = clampInt(imageCount, 1, 6);
      if (seededTpl.draft_output) delete seededTpl.draft_output;

      if (seededTpl.reference_images) {
        // Always send a single merged reference image to the model.
        seededTpl.reference_images.value = [compositeFile.name];
        seededTpl.reference_images.file_path = [compositePath];
      }

      const rawItems: Array<{ src: string; raw: any; idx: number }> = [];
      await runModelOnce(seeded, (preview, rawPayload) => {
        const images = Array.isArray(preview?.payload?.images)
          ? preview.payload.images
          : [];
        images.forEach((img: any, idx: number) => {
          const src = String(
            img?.image_data_url || img?.image_url || "",
          ).trim();
          if (!src) return;
          rawItems.push({
            src,
            raw: clonePreviewPayloadSingle(
              rawPayload,
              Number(img?.index ?? idx),
            ),
            idx,
          });
        });
      });

      if (!rawItems.length) {
        setErrorData({ title: "未获取到生成结果" });
        return;
      }

      const renderables: GeneratedItem[] = [];
      const revokers: Array<() => void> = [];
      for (const item of rawItems) {
        const { url, revoke } = await toRenderableImageSource(item.src);
        if (revoke) revokers.push(revoke);
        const natural = await loadNaturalSize(url);
        renderables.push({
          id: nextId("gen"),
          label: `结果 ${item.idx + 1}`,
          src: url,
          natural,
          rawPayloadSingle: item.raw,
        });
      }
      previewRevokeRef.current.push(...revokers);

      const newLayers: StudioLayer[] = renderables.map((g, idx) => ({
        id: nextId("layer"),
        name: `生成结果 ${idx + 1}`,
        visible: true,
        bitmapSrc: g.src,
        bitmapNatural: g.natural ?? null,
        center: { x: 0, y: 0 },
        scale: 1,
        flipX: false,
        flipY: false,
        items: [],
        isBase: false,
        meta: { kind: "generated", rawPayloadSingle: g.rawPayloadSingle },
      }));

      setGenerated(renderables);
      setSelectedGeneratedId(renderables[0]!.id);
      setLayers((prev) => [...prev, ...newLayers]);
      setSelectedLayerId(newLayers[newLayers.length - 1]!.id);
      window.requestAnimationFrame(() => canvasRef.current?.checkpoint?.());
    } catch (error: any) {
      setErrorData({
        title: "生成失败",
        list: [String(error?.message || "网络异常，请稍后再试")],
      });
    } finally {
      setBusy(false);
    }
  }, [
    backgroundMode,
    baseFileName,
    baseServerPath,
    buildPrompt,
    currentFlowId,
    imageCount,
    isBusy,
    prompt,
    resolveAspectForModel,
    resolveResolutionForModel,
    runModelOnce,
    setErrorData,
    sourceMode,
    templates,
    uploadFile,
  ]);

  const handleCutout = useCallback(async () => {
    if (isBusy) return;
    if (!currentFlowId) {
      setErrorData({ title: "请先保存画布后再生成" });
      return;
    }
    const tpl = (templates as any)?.DoubaoImageCreator as any;
    if (!tpl) {
      setErrorData({
        title: "组件未加载",
        list: ["未找到 DoubaoImageCreator 模板，请刷新页面后重试。"],
      });
      return;
    }
    const exported = await canvasRef.current?.exportCompositePngFile?.({
      backgroundMode: "white",
    });
    if (!exported) {
      setErrorData({ title: "导出图片失败" });
      return;
    }

    setBusy(true);
    try {
      const compositeFile = exported.file;
      const compositeUpload = await uploadFile({
        file: compositeFile,
        id: currentFlowId,
      });
      const compositePath = String(
        (compositeUpload as any)?.file_path || "",
      ).trim();
      if (!compositePath) throw new Error("上传图片失败");

      const seeded = cloneDeep(tpl);
      seeded.display_name = "抠图结果";
      seeded.icon = "Cutout";
      seeded.template = seeded.template ?? {};
      const seededTpl = seeded.template;

      const CUTOUT_PROMPT = [
        "请对参考图进行抠图：仅保留主体，移除背景，并将背景设为透明。",
        "输出要求：返回带 alpha 通道的 PNG，不添加新背景或新物体，不改变主体细节与颜色，边缘自然干净。",
      ].join("\n");

      if (seededTpl.model_name) seededTpl.model_name.value = "Nano Banana Pro";
      if (seededTpl.aspect_ratio)
        seededTpl.aspect_ratio.value = resolveAspectForModel();
      if (seededTpl.resolution)
        seededTpl.resolution.value = resolveResolutionForModel();
      if (seededTpl.image_count) seededTpl.image_count.value = 1;
      if (seededTpl.prompt) seededTpl.prompt.value = CUTOUT_PROMPT;
      if (seededTpl.draft_output) delete seededTpl.draft_output;
      if (seededTpl.reference_images) {
        seededTpl.reference_images.value = [compositeFile.name];
        seededTpl.reference_images.file_path = [compositePath];
      }

      let cutoutSrc = "";
      let cutoutRaw: any = null;
      await runModelOnce(seeded, (preview, rawPayload) => {
        cutoutSrc = extractFirstImageSrcFromPreview(preview);
        // Best-effort: keep a single-image payload when possible.
        const images = Array.isArray((preview as any)?.payload?.images)
          ? (preview as any).payload.images
          : [];
        const first = images[0] ?? null;
        cutoutRaw = first
          ? clonePreviewPayloadSingle(rawPayload, Number(first?.index ?? 0))
          : rawPayload;
      });
      if (!cutoutSrc) {
        setErrorData({ title: "未获取到抠图结果" });
        return;
      }

      const { url, revoke } = await toRenderableImageSource(cutoutSrc);
      const natural = await loadNaturalSize(url);
      if (revoke) previewRevokeRef.current.push(revoke);

      // Also append a "抠图结果" node under the currently selected generated result (left panel).
      if (cutoutRaw) {
        const cutoutGen: GeneratedItem = {
          id: nextId("gen"),
          label: "抠图结果",
          src: url,
          natural,
          rawPayloadSingle: cutoutRaw,
        };
        setGenerated((prev) => {
          const next = prev.slice();
          const idx = next.findIndex((g) => g.id === selectedGeneratedId);
          if (idx >= 0) next.splice(idx + 1, 0, cutoutGen);
          else next.push(cutoutGen);
          return next;
        });
        setSelectedGeneratedId(cutoutGen.id);
      }

      const cutoutLayerId = nextId("layer");
      setLayers((prev) => [
        ...prev,
        {
          id: cutoutLayerId,
          name: "抠图结果",
          visible: true,
          bitmapSrc: url,
          bitmapNatural: natural,
          center: { x: 0, y: 0 },
          scale: 1,
          flipX: false,
          flipY: false,
          items: [],
          isBase: false,
          meta: { kind: "cutout" },
        },
      ]);
      setSelectedLayerId(cutoutLayerId);
      window.requestAnimationFrame(() => canvasRef.current?.checkpoint?.());
    } catch (error: any) {
      setErrorData({
        title: "抠图失败",
        list: [String(error?.message || "网络异常，请稍后再试")],
      });
    } finally {
      setBusy(false);
    }
  }, [
    currentFlowId,
    isBusy,
    resolveAspectForModel,
    resolveResolutionForModel,
    runModelOnce,
    setErrorData,
    selectedGeneratedId,
    templates,
    uploadFile,
  ]);

  const insertGeneratedToCanvas = useCallback(
    (rawPayloadSingle: any) => {
      const tpl = (templates as any)?.DoubaoImageCreator as any;
      if (!tpl) {
        setErrorData({
          title: "组件未加载",
          list: ["未找到 DoubaoImageCreator 模板，请刷新页面后重试。"],
        });
        return;
      }
      const seeded = cloneDeep(tpl);
      seeded.display_name = "生成结果";
      seeded.icon = "Layers";
      seeded.template = seeded.template ?? {};
      const seededTpl = seeded.template;
      seededTpl.draft_output = seededTpl.draft_output ?? { value: null };
      seededTpl.draft_output.value = rawPayloadSingle;

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
      onRequestClose();
    },
    [
      onRequestClose,
      reactFlowInstance,
      setErrorData,
      setNodes,
      takeSnapshot,
      templates,
    ],
  );

  const handleClearCanvas = useCallback(() => {
    setLayers((prev) =>
      prev
        .filter((l) => l.isBase)
        .map((l) => ({
          ...l,
          items: [],
          center: { x: 0, y: 0 },
          scale: l.scale,
          flipX: false,
          flipY: false,
        })),
    );
    window.requestAnimationFrame(() => canvasRef.current?.checkpoint?.());
  }, []);

  const layerContextActions = useMemo(() => {
    const actions: RailContextAction[] = [
      {
        key: "new-layer",
        iconName: "SquareStack",
        label: "新建图层",
        disabled: false,
        onClick: (_targetId) => {
          const id = nextId("layer");
          setLayers((prev) => {
            const base = "新建图层";
            const count = prev.filter((l) =>
              String(l.name || "").startsWith(base),
            ).length;
            const name = count ? `${base} ${count + 1}` : base;
            const layer: StudioLayer = {
              id,
              name,
              visible: true,
              bitmapSrc: null,
              bitmapNatural: null,
              center: { x: 0, y: 0 },
              scale: 1,
              flipX: false,
              flipY: false,
              items: [],
              isBase: false,
            };
            return [...prev, layer];
          });
          window.requestAnimationFrame(() => setSelectedLayerId(id));
          window.requestAnimationFrame(() => canvasRef.current?.checkpoint?.());
        },
      },
      {
        key: "duplicate",
        iconName: "Copy",
        label: "复制图层",
        disabled: false,
        onClick: (id) => {
          let clonedId = "";
          setLayers((prev) => {
            const idx = prev.findIndex((l) => l.id === id);
            if (idx < 0) return prev;
            const base = prev[idx]!;
            const cloned: StudioLayer = {
              ...cloneDeep(base),
              id: nextId("layer"),
              name: `${base.name} 副本`,
              isBase: false,
            };
            clonedId = cloned.id;
            const next = prev.slice();
            next.splice(idx + 1, 0, cloned);
            return next;
          });
          if (clonedId) {
            window.requestAnimationFrame(() => setSelectedLayerId(clonedId));
          }
          window.requestAnimationFrame(() => canvasRef.current?.checkpoint?.());
        },
      },
      {
        key: "move-up",
        iconName: "ArrowUp",
        label: "上移图层",
        disabled: false,
        onClick: (id) => {
          setLayers((prev) => {
            const idx = prev.findIndex((l) => l.id === id);
            if (idx <= 0) return prev;
            const next = prev.slice();
            const [item] = next.splice(idx, 1);
            next.splice(idx - 1, 0, item!);
            return next;
          });
          window.requestAnimationFrame(() => canvasRef.current?.checkpoint?.());
        },
      },
      {
        key: "move-down",
        iconName: "ArrowDown",
        label: "下移图层",
        disabled: false,
        onClick: (id) => {
          setLayers((prev) => {
            const idx = prev.findIndex((l) => l.id === id);
            if (idx < 0 || idx >= prev.length - 1) return prev;
            const next = prev.slice();
            const [item] = next.splice(idx, 1);
            next.splice(idx + 1, 0, item!);
            return next;
          });
          window.requestAnimationFrame(() => canvasRef.current?.checkpoint?.());
        },
      },
      {
        key: "delete",
        iconName: "Trash2",
        label: "删除图层",
        danger: true,
        disabled: false,
        onClick: (id) => {
          setLayers((prev) => {
            const target = prev.find((l) => l.id === id);
            if (target?.isBase) return prev;
            const next = prev.filter((l) => l.id !== id);
            if (!next.some((l) => l.id === selectedLayerId)) {
              setSelectedLayerId(next[next.length - 1]?.id ?? "");
            }
            return next;
          });
          window.requestAnimationFrame(() => canvasRef.current?.checkpoint?.());
        },
      },
    ];
    return actions;
  }, [selectedLayerId]);

  if (!active) return null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-background text-foreground">
      {step === "pick" && (
        <div className="flex h-full items-center justify-center px-10 py-10">
          <div className="w-full max-w-[1200px]">
            <div className="px-10 py-10">
              <div className="mx-auto w-full max-w-[920px] overflow-hidden rounded-2xl bg-muted/30">
                {/* Inline preview (keeps the layout 1:1 without shipping external assets). */}
                <svg
                  viewBox="0 0 1280 420"
                  className="h-[280px] w-full"
                  xmlns="http://www.w3.org/2000/svg"
                  role="img"
                  aria-label="涂鸦生图示例"
                >
                  <defs>
                    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#ffffff" />
                      <stop offset="1" stopColor="#f3f4f6" />
                    </linearGradient>
                  </defs>
                  <rect x="0" y="0" width="1280" height="420" fill="url(#bg)" />
                  {/* bottle */}
                  <rect
                    x="560"
                    y="50"
                    width="160"
                    height="310"
                    rx="50"
                    fill="#e5e7eb"
                  />
                  <rect
                    x="585"
                    y="80"
                    width="110"
                    height="250"
                    rx="24"
                    fill="#ffffff"
                  />
                  <rect
                    x="585"
                    y="50"
                    width="110"
                    height="55"
                    rx="18"
                    fill="#60a5fa"
                  />
                  <text
                    x="640"
                    y="210"
                    textAnchor="middle"
                    fontFamily="Inter, system-ui"
                    fontSize="42"
                    fill="#111827"
                  >
                    Milk
                  </text>
                  {/* scribble */}
                  <path
                    d="M420 70 C 520 20, 740 20, 820 70 C 930 140, 930 280, 820 330 C 740 370, 520 370, 420 330"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="22"
                    strokeLinecap="round"
                  />
                  <path
                    d="M500 350 C 560 390, 720 390, 780 350"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="26"
                    strokeLinecap="round"
                  />
                  <text
                    x="980"
                    y="130"
                    fontFamily="Inter, system-ui"
                    fontSize="26"
                    fill="#2563eb"
                  >
                    MILK SP
                  </text>
                  <path
                    d="M1040 170 C 1100 190, 1120 230, 1100 270"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="10"
                    strokeLinecap="round"
                  />
                  <path
                    d="M1100 270 L 1085 248 M1100 270 L 1120 255"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="10"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <div className="mt-10 text-center">
                <div className="text-5xl font-semibold tracking-wide">
                  涂鸦生图
                </div>
                <div className="mx-auto mt-6 h-px w-[min(720px,100%)] bg-border/70" />
                <div className="mt-5 text-sm text-muted-foreground">
                  简单涂鸦，快速生成精美图片                </div>
              </div>

              <div className="mt-10 flex items-center justify-center gap-6">
                <button
                  type="button"
                  className={cn(
                    "h-12 w-[420px] max-w-[45%] rounded-full bg-white text-sm font-medium text-black",
                    "hover:brightness-95",
                    isBusy && "cursor-not-allowed opacity-60",
                  )}
                  onClick={() => void handleEnterUpload()}
                  disabled={isBusy}
                >
                  上传图片
                </button>
                <button
                  type="button"
                  className={cn(
                    "h-12 w-[420px] max-w-[45%] rounded-full bg-muted/60 text-sm font-medium text-foreground",
                    "hover:bg-muted/80",
                    isBusy && "cursor-not-allowed opacity-60",
                  )}
                  onClick={handleEnterBlank}
                  disabled={isBusy}
                >
                  空白创建
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === "edit" && (
        <div className="relative h-full w-full">
          <ScribbleStudioCanvas
            ref={canvasRef as any}
            active={active}
            sourceMode={sourceMode}
            aspectKey={aspectKey}
            resolutionKey={resolutionKey}
            backgroundMode={backgroundMode}
            tool={tool}
            toolColor={toolColor}
            toolWidth={toolWidth}
            textColor={textColor}
            textFontSize={textFontSize}
            layers={layers}
            setLayers={setLayers}
            selectedLayerId={selectedLayerId}
            setSelectedLayerId={setSelectedLayerId}
            onRequestToolChange={setTool}
            onRequestBack={handleBackToPick}
          />

          {/* Top-left: aspect + background */}
          <div className="absolute left-10 top-8 z-20 flex items-center gap-4">
            <Popover
              open={aspectPopoverOpen}
              onOpenChange={setAspectPopoverOpen}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-12 items-center gap-3 rounded-2xl border border-border bg-background px-4 text-sm font-medium text-foreground shadow-sm",
                    "hover:bg-background",
                  )}
                >
                  <span>{aspectLabel}</span>
                  <ForwardedIconComponent
                    name="ChevronDown"
                    className={cn(
                      "h-4 w-4 opacity-70 transition-transform duration-200",
                      aspectPopoverOpen && "rotate-180",
                    )}
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] border-border bg-popover p-3 text-popover-foreground">
                <div className="text-xs font-medium text-muted-foreground">
                  比例
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {ASPECT_PRESETS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setAspectKey(opt.key)}
                      className={cn(
                        "rounded-lg border border-border px-2 py-2 text-center text-xs",
                        opt.key === aspectKey
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-foreground hover:bg-muted",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 text-xs font-medium text-muted-foreground">
                  分辨率
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {RESOLUTION_PRESETS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setResolutionKey(opt.key)}
                      className={cn(
                        "rounded-lg border border-border px-2 py-2 text-center text-xs",
                        opt.key === resolutionKey
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-foreground hover:bg-muted",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <button
              type="button"
              aria-label="切换画布背景"
              title="切换画布背景"
              onClick={() =>
                setBackgroundMode((prev) =>
                  prev === "white" ? "transparent" : "white",
                )
              }
              className={cn(
                "h-10 w-10 rounded-full border border-border",
                backgroundMode === "white"
                  ? "bg-white"
                  : "bg-[conic-gradient(from_90deg,#ffffff_0_25%,#1f2937_0_50%,#ffffff_0_75%,#1f2937_0)] bg-[length:16px_16px]",
              )}
            />
          </div>

          {/* Top-center toolbar */}
          <div className="absolute left-1/2 top-8 z-20 -translate-x-1/2">
            {uiMode === "crop" ? (
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-popover px-3 py-2 text-popover-foreground">
                <button
                  type="button"
                  title="重置图片位置"
                  aria-label="重置图片位置"
                  onClick={() =>
                    canvasRef.current?.resetSelectedLayerTransform?.()
                  }
                  className="h-9 w-9 rounded-xl hover:bg-muted/60"
                >
                  <ForwardedIconComponent
                    name="Fullscreen"
                    className="mx-auto h-4 w-4 opacity-80"
                  />
                </button>
                <button
                  type="button"
                  title="移到顶层"
                  aria-label="移到顶层"
                  onClick={() =>
                    canvasRef.current?.bringSelectedLayerToFront?.()
                  }
                  className="h-9 w-9 rounded-xl hover:bg-muted/60"
                >
                  <ForwardedIconComponent
                    name="ArrowUpToLine"
                    className="mx-auto h-4 w-4 opacity-80"
                  />
                </button>
                <button
                  type="button"
                  title="移到底层"
                  aria-label="移到底层"
                  onClick={() => canvasRef.current?.sendSelectedLayerToBack?.()}
                  className="h-9 w-9 rounded-xl hover:bg-muted/60"
                >
                  <ForwardedIconComponent
                    name="ArrowDownToLine"
                    className="mx-auto h-4 w-4 opacity-80"
                  />
                </button>
                <button
                  type="button"
                  title="清空画布"
                  aria-label="清空画布"
                  onClick={handleClearCanvas}
                  className="h-9 w-9 rounded-xl hover:bg-muted/60"
                >
                  <ForwardedIconComponent
                    name="Trash2"
                    className="mx-auto h-4 w-4 opacity-80"
                  />
                </button>

                <div className="mx-1 h-6 w-px bg-border" />

                <button
                  type="button"
                  onClick={async () => {
                    const ok = await canvasRef.current?.confirmCrop?.();
                    if (ok) setUiMode("normal");
                  }}
                  disabled={!canCropSelectedLayer}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white",
                    "shadow-[0_12px_24px_rgba(46,123,255,0.25)] transition",
                    !canCropSelectedLayer
                      ? "cursor-not-allowed bg-slate-300 shadow-none hover:bg-slate-300"
                      : "bg-[#2E7BFF] hover:bg-[#0F5CE0]",
                  )}
                >
                  <ForwardedIconComponent name="Check" className="h-4 w-4" />
                  完成裁剪
                </button>
              </div>
            ) : tool === "brush" || tool === "eraser" ? (
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-popover px-3 py-2 text-popover-foreground">
                <button
                  type="button"
                  title="画笔"
                  aria-label="画笔"
                  onClick={() => setTool("brush")}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-medium",
                    tool === "brush" ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <ForwardedIconComponent
                    name="Paintbrush"
                    className="h-4 w-4"
                  />
                  画笔
                </button>
                <button
                  type="button"
                  title="橡皮擦"
                  aria-label="橡皮擦"
                  onClick={() => setTool("eraser")}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-medium",
                    tool === "eraser" ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <ForwardedIconComponent name="Eraser" className="h-4 w-4" />
                  橡皮擦
                </button>

                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      title="画笔设置"
                      aria-label="画笔设置"
                      className="h-9 w-9 rounded-xl hover:bg-muted/60"
                    >
                      <ForwardedIconComponent
                        name="SlidersHorizontal"
                        className="mx-auto h-4 w-4 opacity-80"
                      />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[240px] border-border bg-popover p-3 text-popover-foreground">
                    <div className="text-xs font-medium text-muted-foreground">
                      粗细
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={60}
                      step={1}
                      value={toolWidth}
                      onChange={(e) => setToolWidth(Number(e.target.value))}
                      className="mt-2 w-full accent-[#2E7BFF]"
                    />
                    <div className="mt-4 text-xs font-medium text-muted-foreground">
                      颜色
                    </div>
                    <div className="mt-2 grid grid-cols-6 gap-2">
                      {[
                        "#2E7BFF",
                        "#ffffff",
                        "#111827",
                        "#22c55e",
                        "#f59e0b",
                        "#ef4444",
                        "#a855f7",
                        "#14b8a6",
                        "#eab308",
                        "#0ea5e9",
                        "#f472b6",
                        "#94a3b8",
                      ].map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={cn(
                            "h-7 w-7 rounded-full border shadow-sm",
                            toolColor === c
                              ? "border-[#2E7BFF] ring-2 ring-[#2E7BFF]/30"
                              : "border-border/60 hover:border-border",
                          )}
                          style={{ backgroundColor: c }}
                          onClick={() => setToolColor(c)}
                          aria-label={`颜色 ${c}`}
                        />
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-xs text-muted-foreground">自定义</div>
                      <input
                        type="color"
                        value={toolColor}
                        onChange={(e) => setToolColor(e.target.value)}
                        className="h-8 w-14 rounded border border-border bg-transparent p-0"
                        aria-label="自定义颜色"
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-popover px-3 py-2 text-popover-foreground">
                <button
                  type="button"
                  onClick={() => void handleCutout()}
                  disabled={isBusy || !hasAnyVisualContent}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white",
                    "shadow-[0_12px_24px_rgba(46,123,255,0.25)] transition",
                    isBusy || !hasAnyVisualContent
                      ? "cursor-not-allowed bg-slate-300 shadow-none hover:bg-slate-300"
                      : "bg-[#2E7BFF] hover:bg-[#0F5CE0]",
                  )}
                >
                  <ForwardedIconComponent name="Cutout" className="h-4 w-4" />
                  抠图
                </button>

                <div className="mx-1 h-6 w-px bg-border" />

                <button
                  type="button"
                  title="重置图片位置"
                  aria-label="重置图片位置"
                  onClick={() =>
                    canvasRef.current?.resetSelectedLayerTransform?.()
                  }
                  className="h-9 w-9 rounded-xl hover:bg-muted/60"
                >
                  <ForwardedIconComponent
                    name="Fullscreen"
                    className="mx-auto h-4 w-4 opacity-80"
                  />
                </button>
                <button
                  type="button"
                  title="移到顶层"
                  aria-label="移到顶层"
                  onClick={() =>
                    canvasRef.current?.bringSelectedLayerToFront?.()
                  }
                  className="h-9 w-9 rounded-xl hover:bg-muted/60"
                >
                  <ForwardedIconComponent
                    name="ArrowUpToLine"
                    className="mx-auto h-4 w-4 opacity-80"
                  />
                </button>
                <button
                  type="button"
                  title="移到底层"
                  aria-label="移到底层"
                  onClick={() => canvasRef.current?.sendSelectedLayerToBack?.()}
                  className="h-9 w-9 rounded-xl hover:bg-muted/60"
                >
                  <ForwardedIconComponent
                    name="ArrowDownToLine"
                    className="mx-auto h-4 w-4 opacity-80"
                  />
                </button>
                <button
                  type="button"
                  title="清空画布"
                  aria-label="清空画布"
                  onClick={handleClearCanvas}
                  className="h-9 w-9 rounded-xl hover:bg-muted/60"
                >
                  <ForwardedIconComponent
                    name="Trash2"
                    className="mx-auto h-4 w-4 opacity-80"
                  />
                </button>

                <div className="mx-1 h-6 w-px bg-border" />

                <button
                  type="button"
                  title="裁剪"
                  aria-label="裁剪"
                  disabled={!canCropSelectedLayer}
                  onClick={() => {
                    if (!canCropSelectedLayer) return;
                    setUiMode("crop");
                    setTool("select");
                    canvasRef.current?.enterCropMode?.();
                  }}
                  className={cn(
                    "h-9 w-9 rounded-xl",
                    canCropSelectedLayer
                      ? "hover:bg-muted/60"
                      : "cursor-not-allowed opacity-40",
                  )}
                >
                  <ForwardedIconComponent
                    name="Crop"
                    className="mx-auto h-4 w-4 opacity-80"
                  />
                </button>
                <button
                  type="button"
                  title="水平翻转"
                  aria-label="水平翻转"
                  onClick={() => canvasRef.current?.flipSelectedLayer?.("x")}
                  className="h-9 w-9 rounded-xl hover:bg-muted/60"
                >
                  <ForwardedIconComponent
                    name="FlipHorizontal"
                    className="mx-auto h-4 w-4 opacity-80"
                  />
                </button>
                <button
                  type="button"
                  title="垂直翻转"
                  aria-label="垂直翻转"
                  onClick={() => canvasRef.current?.flipSelectedLayer?.("y")}
                  className="h-9 w-9 rounded-xl hover:bg-muted/60"
                >
                  <ForwardedIconComponent
                    name="FlipVertical"
                    className="mx-auto h-4 w-4 opacity-80"
                  />
                </button>
              </div>
            )}
          </div>

          {/* Left: generated results rail */}
          <div className="absolute left-8 top-1/2 z-20 -translate-y-1/2">
            <ScribbleStudioRail
              side="left"
              title="生成结果"
              items={generated.map((g) => ({
                id: g.id,
                thumbnailSrc: g.src,
                label: g.label,
              }))}
              selectedId={selectedGeneratedId}
              onSelect={setSelectedGeneratedId}
              contextActions={[
                {
                  key: "insert",
                  label: "插入画布",
                  disabled: !selectedGenerated,
                  onClick: (_id) => {
                    if (!selectedGenerated) return;
                    insertGeneratedToCanvas(selectedGenerated.rawPayloadSingle);
                  },
                },
              ]}
            />
          </div>

          {/* Right: layer rail */}
          <div className="absolute right-8 top-1/2 z-20 -translate-y-1/2">
            <ScribbleStudioRail
              side="right"
              title="图层"
              items={layers.slice().reverse().map((l) => ({
                id: l.id,
                thumbnailSrc: layerThumbnailById[l.id] || "",
                label: l.name,
              }))}
              selectedId={selectedLayerId}
              onSelect={setSelectedLayerId}
              contextActions={layerContextActions}
            />
          </div>

          {/* Bottom prompt bar */}
          <div className="absolute bottom-5 left-1/2 z-30 w-[min(1240px,calc(100%-120px))] -translate-x-1/2">
            <div className="flex items-center gap-3 rounded-2xl bg-muted/40 p-3">
              <input
                className="h-12 flex-1 rounded-xl bg-background/50 px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                placeholder="输入提示词..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isBusy}
              />

              <div className="flex h-12 items-center rounded-xl bg-background/50 px-2 text-foreground">
                <button
                  type="button"
                  className={cn(
                    "h-9 w-9 rounded-lg hover:bg-muted",
                    (isBusy || imageCount <= 1) &&
                      "cursor-not-allowed opacity-50",
                  )}
                  disabled={isBusy || imageCount <= 1}
                  onClick={() => setImageCount((v) => clampInt(v - 1, 1, 6))}
                >
                  <ForwardedIconComponent
                    name="Minus"
                    className="mx-auto h-4 w-4"
                  />
                </button>
                <div className="w-8 text-center text-sm font-medium">
                  {imageCount}
                </div>
                <button
                  type="button"
                  className={cn(
                    "h-9 w-9 rounded-lg hover:bg-muted",
                    (isBusy || imageCount >= 6) &&
                      "cursor-not-allowed opacity-50",
                  )}
                  disabled={isBusy || imageCount >= 6}
                  onClick={() => setImageCount((v) => clampInt(v + 1, 1, 6))}
                >
                  <ForwardedIconComponent
                    name="Plus"
                    className="mx-auto h-4 w-4"
                  />
                </button>
              </div>

              <button
                type="button"
                className={cn(
                  "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-6 text-sm font-medium text-white",
                  "shadow-[0_12px_24px_rgba(46,123,255,0.25)] transition",
                  isBusy || !canGenerate
                    ? "cursor-not-allowed bg-slate-300 shadow-none hover:bg-slate-300"
                    : "bg-[#2E7BFF] hover:bg-[#0F5CE0]",
                )}
                disabled={isBusy || !canGenerate}
                onClick={() => void handleGenerate()}
              >
                <ForwardedIconComponent
                  name="Sparkles"
                  className="h-4 w-4 shrink-0"
                />
                生成
              </button>
            </div>
          </div>

          {/* Bottom toolbar */}
          <div className="absolute bottom-[132px] left-1/2 z-30 -translate-x-1/2">
            <div className="flex items-center gap-1 rounded-2xl bg-muted/40 p-2 text-foreground">
              <button
                type="button"
                className={cn(
                  "h-12 w-12 rounded-xl",
                  tool === "select"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted/60",
                )}
                onClick={() => setTool("select")}
                title="编辑模式"
              >
                <ForwardedIconComponent
                  name="MousePointer2"
                  className="mx-auto h-5 w-5"
                />
              </button>

              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "h-12 w-12 rounded-xl",
                      tool === "brush" || tool === "eraser"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted/60",
                    )}
                    onClick={() =>
                      setTool((prev) =>
                        prev === "brush" || prev === "eraser"
                          ? prev
                          : "brush",
                      )
                    }
                    title="绘画模式"
                  >
                    <ForwardedIconComponent
                      name="Palette"
                      className="mx-auto h-5 w-5"
                    />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[160px] border-border bg-popover p-2 text-popover-foreground">
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted",
                      tool === "brush" && "bg-muted",
                    )}
                    onClick={() => setTool("brush")}
                  >
                    <ForwardedIconComponent
                      name="Paintbrush"
                      className="h-4 w-4"
                    />
                    画笔
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted",
                      tool === "eraser" && "bg-muted",
                    )}
                    onClick={() => setTool("eraser")}
                  >
                    <ForwardedIconComponent name="Eraser" className="h-4 w-4" />
                    橡皮擦
                  </button>
                </PopoverContent>
              </Popover>

              <button
                type="button"
                className={cn(
                  "h-12 w-12 rounded-xl",
                  tool === "rect"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted/60",
                )}
                onClick={() => setTool("rect")}
                title="矩形"
              >
                <ForwardedIconComponent
                  name="Square"
                  className="mx-auto h-5 w-5"
                />
              </button>
              <button
                type="button"
                className={cn(
                  "h-12 w-12 rounded-xl",
                  tool === "arrow"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted/60",
                )}
                onClick={() => setTool("arrow")}
                title="箭头"
              >
                <ForwardedIconComponent
                  name="ArrowUpRight"
                  className="mx-auto h-5 w-5"
                />
              </button>
              <button
                type="button"
                className={cn(
                  "h-12 w-12 rounded-xl",
                  tool === "pen"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted/60",
                )}
                onClick={() => setTool("pen")}
                title="Pen tool (Enter 完成，ESC 取消)"
              >
                <ForwardedIconComponent
                  name="PenTool"
                  className="mx-auto h-5 w-5"
                />
              </button>
              <button
                type="button"
                className={cn(
                  "h-12 w-12 rounded-xl",
                  tool === "text"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted/60",
                )}
                onClick={() => setTool("text")}
                title="添加文本"
              >
                <span className="mx-auto block text-lg font-semibold">T</span>
              </button>
              <button
                type="button"
                className="h-12 w-12 rounded-xl hover:bg-muted/60"
                onClick={() => canvasRef.current?.addImageLayer?.()}
                title="上传图片"
              >
                <ForwardedIconComponent
                  name="Image"
                  className="mx-auto h-5 w-5"
                />
              </button>
              <div className="mx-1 h-8 w-px bg-border" />
              <button
                type="button"
                className="h-12 w-12 rounded-xl hover:bg-muted/60"
                onClick={() => canvasRef.current?.resetView?.()}
                title="重置视图"
              >
                <ForwardedIconComponent
                  name="Fullscreen"
                  className="mx-auto h-5 w-5"
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
