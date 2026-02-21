import { cloneDeep } from "lodash";
import { useCallback, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/utils";
import useAlertStore from "@/stores/alertStore";
import useFlowStore from "@/stores/flowStore";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import { useTypesStore } from "@/stores/typesStore";
import { usePostUploadFile } from "@/controllers/API/queries/files/use-post-upload-file";
import useFileSizeValidator from "@/shared/hooks/use-file-size-validator";
import { createFileUpload } from "@/helpers/create-file-upload";
import { getNodeId } from "@/utils/reactflowUtils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type JointId =
  | "head"
  | "neck"
  | "shoulder_l"
  | "elbow_l"
  | "wrist_l"
  | "shoulder_r"
  | "elbow_r"
  | "wrist_r"
  | "hip"
  | "hip_l"
  | "knee_l"
  | "ankle_l"
  | "hip_r"
  | "knee_r"
  | "ankle_r";

type Joint = { id: JointId; x: number; y: number };

const SKELETON_EDGES: Array<[JointId, JointId]> = [
  ["head", "neck"],
  ["neck", "shoulder_l"],
  ["shoulder_l", "elbow_l"],
  ["elbow_l", "wrist_l"],
  ["neck", "shoulder_r"],
  ["shoulder_r", "elbow_r"],
  ["elbow_r", "wrist_r"],
  ["neck", "hip"],
  ["hip", "hip_l"],
  ["hip_l", "knee_l"],
  ["knee_l", "ankle_l"],
  ["hip", "hip_r"],
  ["hip_r", "knee_r"],
  ["knee_r", "ankle_r"],
];

// A more "natural" neutral standing pose (arms down, legs slightly apart).
const DEFAULT_JOINTS: Joint[] = [
  { id: "head", x: 0.5, y: 0.14 },
  { id: "neck", x: 0.5, y: 0.24 },
  { id: "shoulder_l", x: 0.42, y: 0.30 },
  { id: "elbow_l", x: 0.41, y: 0.44 },
  { id: "wrist_l", x: 0.42, y: 0.60 },
  { id: "shoulder_r", x: 0.58, y: 0.30 },
  { id: "elbow_r", x: 0.59, y: 0.44 },
  { id: "wrist_r", x: 0.58, y: 0.60 },
  { id: "hip", x: 0.5, y: 0.50 },
  { id: "hip_l", x: 0.47, y: 0.50 },
  { id: "knee_l", x: 0.46, y: 0.70 },
  { id: "ankle_l", x: 0.45, y: 0.90 },
  { id: "hip_r", x: 0.53, y: 0.50 },
  { id: "knee_r", x: 0.54, y: 0.70 },
  { id: "ankle_r", x: 0.55, y: 0.90 },
];

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function jointsToMap(joints: Joint[]) {
  const map = new Map<JointId, Joint>();
  joints.forEach((j) => map.set(j.id, j));
  return map;
}

function resolvePoseCanvasSize(natural: { w: number; h: number } | null) {
  const w0 = Number(natural?.w ?? 0);
  const h0 = Number(natural?.h ?? 0);
  if (!Number.isFinite(w0) || !Number.isFinite(h0) || w0 <= 0 || h0 <= 0) {
    return { w: 768, h: 768 };
  }
  const base = 1024; // keep it clear but small (uploads remain tiny)
  const r = w0 / h0;
  let w = 0;
  let h = 0;
  if (r >= 1) {
    w = base;
    h = Math.round(base / r);
  } else {
    h = base;
    w = Math.round(base * r);
  }
  w = Math.max(512, Math.min(1024, w));
  h = Math.max(512, Math.min(1024, h));
  return { w, h };
}

function drawPoseToDataUrl(joints: Joint[], size: { w: number; h: number }) {
  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // White background improves readability for the model (stick-figure pose map).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size.w, size.h);

  const jointMap = jointsToMap(joints);
  const toPxX = (v: number) => v * size.w;
  const toPxY = (v: number) => v * size.h;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Dark lines + red joints (similar to common pose maps / OpenPose-style guides).
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = Math.max(8, Math.round(Math.min(size.w, size.h) * 0.014));

  SKELETON_EDGES.forEach(([a, b]) => {
    const ja = jointMap.get(a);
    const jb = jointMap.get(b);
    if (!ja || !jb) return;
    ctx.beginPath();
    ctx.moveTo(toPxX(ja.x), toPxY(ja.y));
    ctx.lineTo(toPxX(jb.x), toPxY(jb.y));
    ctx.stroke();
  });

  ctx.fillStyle = "#ef4444";
  const r = Math.max(10, Math.round(Math.min(size.w, size.h) * 0.02));
  joints.forEach((j) => {
    ctx.beginPath();
    ctx.arc(toPxX(j.x), toPxY(j.y), r, 0, Math.PI * 2);
    ctx.fill();
  });

  return canvas.toDataURL("image/png");
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

function resolveInAppImageUrl(filePath: string) {
  const raw = String(filePath || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!raw) return "";
  if (/^(data:|blob:|https?:)/i.test(raw)) return raw;
  const parts = raw.split("?", 1)[0].split("/").filter(Boolean);
  if (parts.length < 2) return raw;
  const flowId = parts[0];
  const fileName = parts[parts.length - 1];
  return `/api/v1/files/images/${encodeURIComponent(flowId)}/${encodeURIComponent(fileName)}`;
}

function resolveQwenSizeFromReference(natural: { w: number; h: number } | null): string {
  const w0 = Number(natural?.w ?? 0);
  const h0 = Number(natural?.h ?? 0);
  if (!Number.isFinite(w0) || !Number.isFinite(h0) || w0 <= 0 || h0 <= 0) {
    return "1024*1024";
  }
  const base = 2048;
  const r = w0 / h0;
  let w = 0;
  let h = 0;
  if (r >= 1) {
    w = base;
    h = Math.round(base / r);
  } else {
    h = base;
    w = Math.round(base * r);
  }
  w = Math.max(512, Math.min(2048, w));
  h = Math.max(512, Math.min(2048, h));
  return `${w}*${h}`;
}

export default function PoseGeneratorModal({ open, onOpenChange }: Props) {
  const setErrorData = useAlertStore((state) => state.setErrorData);
  const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
  const currentFlowId = useFlowsManagerStore((state) => state.currentFlowId);
  const buildFlow = useFlowStore((state) => state.buildFlow);
  const setNodes = useFlowStore((state) => state.setNodes);
  const reactFlowInstance = useFlowStore((state) => state.reactFlowInstance);
  const templates = useTypesStore((state) => state.templates);
  const { mutateAsync: uploadFile } = usePostUploadFile();
  const { validateFileSize } = useFileSizeValidator();

  const [referenceLocalUrl, setReferenceLocalUrl] = useState<string>("");
  const [referenceFileName, setReferenceFileName] = useState<string>("");
  const [referenceServerPath, setReferenceServerPath] = useState<string>("");
  const [referenceNatural, setReferenceNatural] = useState<{ w: number; h: number } | null>(null);

  const [joints, setJoints] = useState<Joint[]>(DEFAULT_JOINTS);
  const [selectedJointIds, setSelectedJointIds] = useState<JointId[]>([]);
  const selectedSet = useMemo(() => new Set(selectedJointIds), [selectedJointIds]);
  const jointMap = useMemo(() => jointsToMap(joints), [joints]);

  const [actionPrompt, setActionPrompt] = useState<string>("");
  const [isBusy, setBusy] = useState(false);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<
    | null
    | {
        mode: "drag_joints" | "lasso";
        startClientX: number;
        startClientY: number;
        startJoints: Joint[];
        dragJointIds: JointId[];
        rect?: { x0: number; y0: number; x1: number; y1: number };
        additive: boolean;
      }
  >(null);
  const [lassoRect, setLassoRect] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);

  const hitTestJoint = useCallback(
    (clientX: number, clientY: number) => {
      const el = editorRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const radius = 16;
      for (const j of joints) {
        const px = j.x * rect.width;
        const py = j.y * rect.height;
        const dx = x - px;
        const dy = y - py;
        if (dx * dx + dy * dy <= radius * radius) {
          return j.id;
        }
      }
      return null;
    },
    [joints],
  );

  const commitLasso = useCallback(() => {
    const el = editorRef.current;
    const s = dragRef.current;
    if (!el || !s || s.mode !== "lasso" || !s.rect) return;
    const rect = el.getBoundingClientRect();
    const left = Math.min(s.rect.x0, s.rect.x1);
    const right = Math.max(s.rect.x0, s.rect.x1);
    const top = Math.min(s.rect.y0, s.rect.y1);
    const bottom = Math.max(s.rect.y0, s.rect.y1);
    const hits: JointId[] = [];
    joints.forEach((j) => {
      const px = j.x * rect.width;
      const py = j.y * rect.height;
      if (px >= left && px <= right && py >= top && py <= bottom) hits.push(j.id);
    });
    setSelectedJointIds((prev) => {
      if (!s.additive) return hits;
      const next = new Set<JointId>(prev);
      hits.forEach((id) => next.add(id));
      return Array.from(next);
    });
  }, [joints]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const el = editorRef.current;
      if (!el) return;
      el.setPointerCapture(event.pointerId);
      event.preventDefault();

      const isMeta = event.ctrlKey || event.metaKey;
      const hit = hitTestJoint(event.clientX, event.clientY);

      // Ctrl/Cmd + click: toggle selection only (no drag start).
      if (hit && isMeta) {
        setSelectedJointIds((prev) => {
          const next = new Set(prev);
          if (next.has(hit)) next.delete(hit);
          else next.add(hit);
          return Array.from(next);
        });
        dragRef.current = null;
        return;
      }

      if (hit) {
        const nextSelection = selectedSet.has(hit) ? selectedJointIds : [hit];
        setSelectedJointIds(nextSelection);
        dragRef.current = {
          mode: "drag_joints",
          startClientX: event.clientX,
          startClientY: event.clientY,
          startJoints: joints,
          dragJointIds: (nextSelection.length ? nextSelection : [hit]) as JointId[],
          additive: false,
        };
        return;
      }

      // Blank area -> lasso selection. Ctrl/Cmd makes it additive.
      dragRef.current = {
        mode: "lasso",
        startClientX: event.clientX,
        startClientY: event.clientY,
        startJoints: joints,
        dragJointIds: [],
        rect: undefined,
        additive: isMeta,
      };
      setLassoRect(null);
    },
    [hitTestJoint, joints, selectedJointIds, selectedSet],
  );

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const el = editorRef.current;
    const s = dragRef.current;
    if (!el || !s) return;
    event.preventDefault();

    if (s.mode === "lasso") {
      const rect = el.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const x0 = s.rect?.x0 ?? x;
      const y0 = s.rect?.y0 ?? y;
      const next = { x0, y0, x1: x, y1: y };
      s.rect = next;
      setLassoRect(next);
      return;
    }

    if (s.mode === "drag_joints") {
      const rect = el.getBoundingClientRect();
      const dx = (event.clientX - s.startClientX) / Math.max(1, rect.width);
      const dy = (event.clientY - s.startClientY) / Math.max(1, rect.height);
      const ids = new Set<JointId>(s.dragJointIds);
      setJoints(
        s.startJoints.map((j) => {
          if (!ids.has(j.id)) return j;
          return { ...j, x: clamp01(j.x + dx), y: clamp01(j.y + dy) };
        }),
      );
    }
  }, []);

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const el = editorRef.current;
      const s = dragRef.current;
      if (!el || !s) return;
      event.preventDefault();
      try {
        el.releasePointerCapture(event.pointerId);
      } catch {
        // noop
      }

      if (s.mode === "lasso") {
        commitLasso();
        setLassoRect(null);
      }
      dragRef.current = null;
    },
    [commitLasso],
  );

  const handleResetPose = useCallback(() => {
    setJoints(DEFAULT_JOINTS);
    setSelectedJointIds([]);
  }, []);

  const handleSelectReference = useCallback(async () => {
    if (!currentFlowId) {
      setErrorData({
        title: "无法上传参考图",
        list: ["请先保存画布后再试。"],
      });
      return;
    }
    const files = await createFileUpload({ multiple: false, accept: ".jpg,.jpeg,.png" });
    const file = files[0];
    if (!file) return;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!["jpg", "jpeg", "png"].includes(ext)) {
      setErrorData({ title: "文件格式不支持", list: ["仅支持 JPG / PNG"] });
      return;
    }
    try {
      validateFileSize(file);
    } catch (error) {
      if (error instanceof Error) setErrorData({ title: error.message });
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setReferenceLocalUrl((old) => {
      try {
        if (old && old.startsWith("blob:")) URL.revokeObjectURL(old);
      } catch {
        // noop
      }
      return localUrl;
    });
    setReferenceFileName(file.name);

    // Read natural size for a stable qwen output size mapping.
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        setReferenceNatural({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
        resolve();
      };
      img.onerror = () => {
        setReferenceNatural(null);
        resolve();
      };
      img.src = localUrl;
    });

    try {
      setBusy(true);
      const resp = await uploadFile({ file, id: currentFlowId });
      const serverPath = String((resp as any)?.file_path || "").trim();
      if (!serverPath) throw new Error("缺少文件路径");
      setReferenceServerPath(serverPath);
    } catch (error: any) {
      setErrorData({ title: "上传失败", list: [String(error?.message || "网络异常，请稍后再试。")] });
    } finally {
      setBusy(false);
    }
  }, [currentFlowId, setErrorData, uploadFile, validateFileSize]);

  const handleGenerate = useCallback(async () => {
    if (isBusy) return;
    if (!currentFlowId) {
      setErrorData({ title: "请先保存画布后再生成" });
      return;
    }
    if (!referenceServerPath || !referenceFileName) {
      setErrorData({ title: "请先上传人物形象参考图" });
      return;
    }

    const template = templates?.DoubaoImageCreator as any;
    if (!template) {
      setErrorData({ title: "组件未加载", list: ["未找到 DoubaoImageCreator 模板，请刷新页面后重试。"] });
      return;
    }

    // Pre-generate an id so we can use it as a stable, unique suffix (avoid overwriting
    // previous pose skeleton images in the same flow storage).
    const newNodeId = getNodeId("DoubaoImageCreator");

    const poseSize = resolvePoseCanvasSize(referenceNatural);
    const poseDataUrl = drawPoseToDataUrl(joints, poseSize);
    if (!poseDataUrl) {
      setErrorData({ title: "生成姿势骨架图失败" });
      return;
    }

    setBusy(true);
    try {
      // Upload pose skeleton PNG into the current flow storage.
      const poseBlob = await fetch(poseDataUrl).then((r) => r.blob());
      const poseFileName = `pose-skeleton-${newNodeId}.png`;
      const poseFile = new File([poseBlob], poseFileName, { type: poseBlob.type || "image/png" });
      const poseResp = await uploadFile({ file: poseFile, id: currentFlowId });
      const posePath = String((poseResp as any)?.file_path || "").trim();
      if (!posePath) throw new Error("上传姿势骨架图失败");

      // Build prompt mapping (user confirmed: 图1=人物参考图, 图2=姿势骨架图).
      const baseInstruction = [
        "图2是一张火柴人姿势骨架示意图（姿势指导图）。请严格按图2的姿势（头/躯干朝向、四肢方向与关节弯曲角度）调整图1人物。",
        "保持图1人物身份、服装、画风不变；只改变姿势与肢体动作；背景尽量保持不变。",
        "不要在结果中出现/保留图2的火柴人骨架线条；确保四肢完整、比例自然，避免多手多脚与肢体扭曲。",
      ].join("");
      const safeAction = String(actionPrompt || "").trim();
      const prompt = safeAction ? `${baseInstruction}\n补充要求：${safeAction}` : baseInstruction;

      const seeded = cloneDeep(template);
      seeded.display_name = "姿势结果";
      seeded.icon = "PersonStanding";

      // Force qwen-image-edit-max (docs/model/千问-图像编辑Qwen-Image-Edit.md).
      const tpl = (seeded.template ??= {});
      tpl.tool_model_override = tpl.tool_model_override ?? { value: "" };
      tpl.tool_model_override.value = "qwen-image-edit-max";

      // Keep the instruction literal; prompt_extend may rewrite and weaken "按图2姿势" constraints.
      if (tpl.prompt_extend) {
        tpl.prompt_extend.value = false;
      }

      // Keep output size stable to the reference image aspect ratio (avoid last-image ratio heuristics).
      tpl.tool_size_override = tpl.tool_size_override ?? { value: "" };
      tpl.tool_size_override.value = resolveQwenSizeFromReference(referenceNatural);

      // Set reference images in-order: [ref, pose]
      const refField = tpl.reference_images;
      if (refField) {
        refField.value = [referenceFileName, poseFileName];
        refField.file_path = [referenceServerPath, posePath];
      }

      if (tpl.prompt) {
        tpl.prompt.value = prompt;
      }
      if (tpl.image_count) {
        tpl.image_count.value = 1;
      }
      if (tpl.negative_prompt) {
        tpl.negative_prompt.value = [
          "火柴人",
          "骨架线条",
          "skeleton",
          "stick figure",
          "多余肢体",
          "畸形手脚",
          "额外人物",
        ].join(", ");
      }

      // Tool result nodes should not carry draft_output.
      if (tpl.draft_output) {
        delete tpl.draft_output;
      }

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

      // Start build + center viewport at 48% zoom (same UX as other tool-generated result nodes).
      window.requestAnimationFrame(() => {
        try {
          void buildFlow({ stopNodeId: newNodeId });
        } catch {
          // noop
        }
      });

      window.requestAnimationFrame(() => {
        const instance: any = reactFlowInstance as any;
        if (!instance || typeof instance.setViewport !== "function") return;

        const container =
          (typeof document !== "undefined" &&
            (document.getElementById("react-flow-id") as HTMLElement | null)) ||
          null;
        const rect = container?.getBoundingClientRect();
        const viewW = rect?.width ?? window.innerWidth;
        const viewH = rect?.height ?? window.innerHeight;
        const targetZoom = 0.48;

        const targetCenter = {
          x: position.x + estimated.width / 2,
          y: position.y + estimated.height / 2,
        };
        const viewportTo = {
          x: viewW / 2 - targetCenter.x * targetZoom,
          y: viewH / 2 - targetCenter.y * targetZoom,
          zoom: targetZoom,
        };
        try {
          instance.setViewport(viewportTo, { duration: 800 });
        } catch {
          instance.setViewport(viewportTo);
        }
      });
    } catch (error: any) {
      setErrorData({
        title: "生成失败",
        list: [String(error?.message || "网络异常，请稍后再试。")],
      });
    } finally {
      setBusy(false);
    }
  }, [
    actionPrompt,
    buildFlow,
    currentFlowId,
    isBusy,
    joints,
    onOpenChange,
    reactFlowInstance,
    referenceFileName,
    referenceNatural,
    referenceServerPath,
    setErrorData,
    setNodes,
    takeSnapshot,
    templates,
    uploadFile,
  ]);

  const lassoOverlay = useMemo(() => {
    if (!lassoRect) return null;
    const left = Math.min(lassoRect.x0, lassoRect.x1);
    const top = Math.min(lassoRect.y0, lassoRect.y1);
    const width = Math.abs(lassoRect.x1 - lassoRect.x0);
    const height = Math.abs(lassoRect.y1 - lassoRect.y0);
    return (
      <div
        className="pointer-events-none absolute rounded-md border border-white/40 bg-white/10"
        style={{ left, top, width, height }}
      />
    );
  }, [lassoRect]);

  const referencePreviewSrc = useMemo(() => {
    if (referenceLocalUrl) return referenceLocalUrl;
    if (referenceServerPath) return resolveInAppImageUrl(referenceServerPath);
    return "";
  }, [referenceLocalUrl, referenceServerPath]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[86vh] w-[96vw] max-w-6xl overflow-hidden p-0">
        <div className="flex h-full flex-col">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="text-base">姿势生成器</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 pb-6 pt-4 lg:flex-row">
            {/* Left: reference */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-muted/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">上传人物形象参考图</div>
                <Button size="sm" variant="secondary" onClick={handleSelectReference} disabled={isBusy}>
                  选择图片
                </Button>
              </div>
              <div className="mt-3 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border bg-background/60">
                {referencePreviewSrc ? (
                  <img
                    src={referencePreviewSrc}
                    alt="reference"
                    className="h-full w-full object-contain"
                    draggable={false}
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">支持的文件格式：JPG、PNG</div>
                )}
              </div>
            </div>

            {/* Right: pose editor + controls */}
            <div className="flex w-full flex-col overflow-hidden rounded-2xl bg-muted/40 p-4 lg:w-[420px] lg:shrink-0">
              <div className="text-sm font-medium">拖拽关节点来调整火柴人的姿势</div>
              <div className="mt-1 text-xs text-muted-foreground">
                按住 Ctrl/Cmd 点击关节可多选，拖拽空白区域进行框选；选中关节后可拖拽整体移动
              </div>

              <div
                ref={editorRef}
                className={cn(
                  "nodrag relative mt-3 h-[320px] w-full overflow-hidden rounded-xl",
                  "bg-[#0b1220] ring-1 ring-border/60",
                )}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                {lassoOverlay}
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
                  {SKELETON_EDGES.map(([a, b]) => {
                    const ja = jointMap.get(a);
                    const jb = jointMap.get(b);
                    if (!ja || !jb) return null;
                    return (
                      <line
                        key={`${a}-${b}`}
                        x1={ja.x}
                        y1={ja.y}
                        x2={jb.x}
                        y2={jb.y}
                        stroke="#ff2d2d"
                        strokeWidth={0.012}
                        strokeLinecap="round"
                      />
                    );
                  })}
                  {joints.map((j) => {
                    const isSelected = selectedSet.has(j.id);
                    return (
                      <circle
                        key={j.id}
                        cx={j.x}
                        cy={j.y}
                        r={isSelected ? 0.028 : 0.022}
                        fill="#ff2d2d"
                        stroke={isSelected ? "rgba(255,255,255,0.85)" : "transparent"}
                        strokeWidth={isSelected ? 0.006 : 0}
                      />
                    );
                  })}
                </svg>
              </div>

              <div className="mt-4 text-sm font-medium">请描述动作（可选）</div>
              <textarea
                className={cn(
                  "mt-2 min-h-[120px] w-full resize-none rounded-xl border bg-background/60 p-3 text-sm",
                  "outline-none focus:ring-2 focus:ring-primary/30",
                )}
                placeholder="例如：跳跃、奔跑、坐姿、踢腿……（留空则仅按骨架姿势调整）"
                value={actionPrompt}
                onChange={(e) => setActionPrompt(e.target.value)}
                disabled={isBusy}
              />

              <div className="mt-4 flex items-center justify-end gap-3">
                <Button variant="secondary" onClick={handleResetPose} disabled={isBusy}>
                  重置姿势
                </Button>
                <Button onClick={handleGenerate} disabled={isBusy}>
                  {isBusy ? "生成中…" : "生成姿势"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
