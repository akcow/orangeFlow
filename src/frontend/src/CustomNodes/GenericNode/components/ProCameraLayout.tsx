import { cloneDeep } from "lodash";
import { type ReactFlowState, useStore } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import ShadTooltip from "@/components/common/shadTooltipComponent";
import HandleRenderComponent from "./handleRenderComponent";
import DoubaoQuickAddMenu from "./DoubaoQuickAddMenu";
import useFlowsManagerStore from "@/stores/flowsManagerStore";
import useFlowStore from "@/stores/flowStore";
import { useTypesStore } from "@/stores/typesStore";
import { track } from "@/customization/utils/analytics";
import { getNodeOutputColors } from "@/CustomNodes/helpers/get-node-output-colors";
import { getNodeOutputColorsName } from "@/CustomNodes/helpers/get-node-output-colors-name";
import useHandleOnNewValue from "../../hooks/use-handle-new-value";
import { scapeJSONParse, scapedJSONStringfy, getNodeId } from "@/utils/reactflowUtils";
import { cn } from "@/utils/utils";
import type { GenericNodeType, NodeDataType } from "@/types/flow";
import type { TypesStoreType } from "@/types/zustand/types";
import { BuildStatus } from "@/constants/enums";

const CAMERA_FIELD = "camera";
const LENS_FIELD = "lens";
const FOCAL_FIELD = "focal_length";
const APERTURE_FIELD = "aperture";
const PREFERRED_OUTPUT = "style_prompt";

// Static images live under `src/frontend/public/assets/pro-camera/**`.
// These filenames match what you placed in `public` (including spaces/case).
const CAMERA_IMAGE_FILES: Record<string, string | string[]> = {
  "Sony Venice": "Sony Venice.png",
  "ARRI Alexa 35": "Arri Alexa 35.png",
  "ARRI Alexa 65": "Arri Alexa 65.png",
  "RED V-Raptor": "Red V-Raptor.png",
  "RED MONSTRO 8K VV": "RED MONSTRO 8K VV.png",
  "Panavision DXL2": "Panavision DXL2.png",
  "Canon C700 FF": "Canon C700 FF.png",
  // Note: the user-provided filename is lowercase.
  "Blackmagic URSA Mini Pro 12K": "blackmagic ursa mini pro 12k.png",
  "Arricam LT": "Arricam LT.png",
  "ArriFlex 435": "ArriFlex 435.png",
  "IMAX Keighley": "IMAX Keighley.png",
  "IMAX Film Camera": "IMAX Film Camera.png",
};

const LENS_IMAGE_FILES: Record<string, string> = {
  "Zeiss Ultra Prime": "Zeiss Ultra Prime.png",
  "ARRI Signature Prime": "Arri Signature Prime.png",
  "Canon K-35": "Canon K-35.png",
  "Cooke S4": "Cooke S4.png",
  "Cooke Panchro": "Cooke Panchro.png",
  "Cooke SF 1.8x": "Cooke SF 1.8x.png",
  Helios: "Helios.png",
  "Panavision C-series": "Panavision C-series.png",
  "Panavision Primo": "Panavision Primo.png",
  // Note: option is "Hawk Class-X", but the file is "Hawk Class X.png"
  "Hawk Class-X": "Hawk Class X.png",
  "Leica Summicron-C": "Leica Summicron-C.webp",
  "Angenieux Optimo Ultra Compact": "Angenieux Optimo Ultra Compact.png",
  // Note: the user-provided filename has a double space between "Vista-C" and "Vista-P".
  "Tokina Cinema Vista-C / Vista-P": "Tokina Cinema Vista-C  Vista-P.webp",
};

const APERTURE_IMAGE_FILES: Record<string, string> = {
  "f/1.4": "f1.4.png",
  "f/4": "f4.png",
  "f/11": "f11.png",
};

const CAMERA_HINTS: Record<string, string> = {
  "Sony Venice": "中性电影色彩、宽容度高；适合剧情片/高端广告",
  "ARRI Alexa 35": "自然肤色、宽容度极高；适合剧情/纪录/商业",
  "ARRI Alexa 65": "大画幅浅景深、细腻肤色；适合史诗/高端商业",
  "RED V-Raptor": "锐利高细节、现代质感；适合动作/科幻/广告",
  "RED MONSTRO 8K VV": "超高解析、强可塑性；适合特效/高细节广告",
  "Panavision DXL2": "大画幅电影氛围、柔和高光；适合时尚/广告/电影",
  "Arricam LT": "35mm 胶片颗粒、有机质感；适合复古叙事/胶片质感",
  "ArriFlex 435": "35mm 高速胶片运动质感；适合动作/运动镜头/胶片风",
  "IMAX Keighley": "IMAX 70mm 巨幅细节与空间感；适合宏大景别/自然/史诗",
  "IMAX Film Camera": "IMAX 70mm 巨幅细节与空间感；适合宏大景别/自然/史诗",
  "Canon C700 FF": "自然色彩与肤色；适合纪录/商业拍摄",
  "Blackmagic URSA Mini Pro 12K": "高分辨率、调色空间大；适合重后期/广告",
};

const LENS_HINTS: Record<string, string> = {
  "Zeiss Ultra Prime": "清晰高对比、边缘锐利；适合现代叙事/商业",
  "ARRI Signature Prime": "过渡柔和、散景顺滑；适合大画幅人物/剧情",
  "Canon K-35": "复古暖调、轻微泛光；适合复古叙事/广告",
  "Cooke S4": "经典 Cooke Look、温润肤色；适合人物/剧情",
  "Cooke Panchro": "复古柔和、低对比；适合怀旧/梦幻",
  "Cooke SF 1.8x": "柔焦与高光光晕；适合浪漫/回忆感",
  Helios: "旋转散景、复古气质；适合梦境/复古风格",
  "Panavision C-series": "经典变形宽银幕、水平眩光；适合电影感/夜景霓虹",
  "Panavision Primo": "干净变形、现代宽银幕；适合商业/大片",
  "Hawk Class-X": "现代变形、更干净可控；适合动作/大片",
  "Leica Summicron-C": "高微对比、自然肤色；适合高级商业/剧情",
  "Angenieux Optimo Ultra Compact": "电影级变焦、稳定可靠；适合纪录/运动",
  "Tokina Cinema Vista-C / Vista-P": "大画幅高解析、干净；适合广告/高细节",
};

const FOCAL_HINTS: Record<string, string> = {
  "8mm": "极端超广角夸张透视；适合建筑/沉浸感/风格化镜头",
  "14mm": "超广角夸张透视；适合建筑/大场景/沉浸感",
  "24mm": "广角空间感强；适合环境人像/纪实",
  "35mm": "自然广角；适合叙事/街景",
  "50mm": "标准视角；适合对话/人像",
  "75mm": "人像压缩更强；适合特写/氛围镜头",
  "125mm": "强压缩与隔离主体；适合远景特写/电影化肖像",
};

const APERTURE_HINTS: Record<string, string> = {
  "f/1.4": "浅景深与强虚化、低光更强；适合梦幻/人像",
  "f/4": "景深适中、主体更稳；适合大多数叙事",
  "f/11": "深景深、整体清晰；适合风光/建筑/群像",
};

function publicAssetUrl(dir: string, filename: string) {
  // Encode spaces and other URL-reserved characters in filenames (Windows-friendly names).
  return `${dir}/${encodeURIComponent(filename)}`;
}

function uniqueStrings(items: readonly string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function buildPublicAssetCandidates(dir: string, option: string, override?: string) {
  const raw = [
    override ? publicAssetUrl(dir, override) : "",
    publicAssetUrl(dir, `${option}.png`),
    publicAssetUrl(dir, `${option}.webp`),
    publicAssetUrl(dir, `${option}.jpg`),
    publicAssetUrl(dir, `${option}.jpeg`),
    // Slug fallback helps when users prefer ASCII-only filenames.
    `${dir}/${slugifyLabel(option)}.png`,
    `${dir}/${slugifyLabel(option)}.webp`,
    `${dir}/${slugifyLabel(option)}.jpg`,
    `${dir}/${slugifyLabel(option)}.jpeg`,
  ];
  return uniqueStrings(raw);
}

type Props = {
  data: NodeDataType;
  types: TypesStoreType["types"];
  isToolMode: boolean;
  buildStatus: BuildStatus;
  selected?: boolean;
};

function rotateOption(
  options: readonly unknown[],
  currentValue: unknown,
  direction: -1 | 1,
) {
  const list = (options ?? []).map((o) => String(o));
  if (list.length === 0) return String(currentValue ?? "");
  const cur = String(currentValue ?? list[0]);
  const idx = Math.max(0, list.indexOf(cur));
  const next = (idx + direction + list.length) % list.length;
  return list[next];
}

function slugifyLabel(label: string) {
  // For local assets in /public. Keep it predictable and ASCII-only.
  return String(label || "")
    .trim()
    .toLowerCase()
    // Normalize common unicode dashes to '-' so filenames stay consistent.
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[/\\]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getWheelWindow(options: string[], value: string, radius = 2) {
  const list = (options ?? []).map((o) => String(o));
  if (list.length === 0) {
    return {
      list: [String(value ?? "")],
      currentIndex: 0,
      items: [{ value: String(value ?? ""), offset: 0 }],
    };
  }
  const current = String(value ?? list[0]);
  const idxRaw = list.indexOf(current);
  const currentIndex = idxRaw >= 0 ? idxRaw : 0;
  const items = Array.from({ length: radius * 2 + 1 }, (_, i) => {
    const offset = i - radius; // -2..2
    const wrapped =
      (currentIndex + offset + list.length) % Math.max(1, list.length);
    return { value: list[wrapped], offset };
  });
  return { list, currentIndex, items };
}

function WheelPickerColumn({
  label,
  icon,
  options,
  value,
  onPrev,
  onNext,
  onWheel,
  imageUrlForOption,
  hintForOption,
  isImageBroken,
  onImageBroken,
}: {
  label: string;
  icon: string;
  options: readonly unknown[];
  value: string;
  onPrev: () => void;
  onNext: () => void;
  onWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  imageUrlForOption?: (option: string) => string | string[];
  hintForOption?: (option: string) => string | undefined;
  isImageBroken?: (imageUrl: string) => boolean;
  onImageBroken?: (imageUrl: string) => void;
}) {
  const { items } = useMemo(
    () => getWheelWindow((options ?? []).map(String), String(value ?? ""), 2),
    [options, value],
  );

  return (
    <div
      className={cn(
        "nodrag relative flex flex-col px-4 py-3",
        "transition-colors",
      )}
      onWheelCapture={onWheel}
    >
      <div className="mb-2 flex w-full items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/40 ring-1 ring-border/60">
          <ForwardedIconComponent
            name={icon}
            className="h-5 w-5 text-muted-foreground"
          />
        </div>
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
      </div>

      {/* iOS-like wheel selector: center highlighted, top/bottom faded. */}
      <div
        className="nodrag relative h-[340px] overflow-hidden rounded-2xl bg-background/40 ring-1 ring-border/60"
        role="button"
        tabIndex={0}
        aria-label={`${label} 选择器`}
        onClick={(event) => {
          // Click top half -> previous, bottom half -> next.
          const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
          const y = event.clientY - rect.top;
          if (y < rect.height / 2) onPrev();
          else onNext();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onNext();
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            onPrev();
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            onNext();
          }
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-gradient-to-b from-background/90 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-12 bg-gradient-to-t from-background/90 to-transparent" />
        <div className="flex h-full flex-col items-stretch justify-center gap-1 px-2 py-2">
          {items.map((item) => {
            const isCenter = item.offset === 0;
            const imageUrlsRaw = imageUrlForOption?.(item.value);
            const imageUrls = Array.isArray(imageUrlsRaw)
              ? imageUrlsRaw
              : imageUrlsRaw
                ? [imageUrlsRaw]
                : [];
            // If multiple URLs are provided, treat them as fallbacks (not multiple images to render).
            const usableImageUrl = imageUrls.find((url) => !isImageBroken?.(url));
            const hint = hintForOption?.(item.value);
            const tooltipText = hint
              ? `${item.value}：${hint}`
              : `${item.value}：暂无风格说明`;
            return (
              <ShadTooltip
                key={`${item.offset}:${item.value}`}
                content={tooltipText}
                side="top"
                delayDuration={200}
                avoidCollisions={true}
                styleClasses="z-[9999]"
              >
                <div
                  className={cn(
                    "flex items-center justify-center rounded-2xl px-3 py-1.5",
                    "transition-all duration-150",
                    isCenter
                      ? "bg-background/80 ring-1 ring-border/70 shadow-sm"
                      : "opacity-45",
                    item.offset === -2 && "opacity-25",
                    item.offset === 2 && "opacity-25",
                  )}
                >
                  {usableImageUrl ? (
                    <div className="flex shrink-0 items-center justify-center gap-2">
                      <img
                        src={usableImageUrl}
                        alt={item.value}
                        className={cn(
                          "rounded-xl bg-muted/30 object-contain ring-1 ring-border/50",
                          isCenter ? "h-[140px] w-[140px]" : "h-[96px] w-[96px]",
                        )}
                        onError={() => onImageBroken?.(usableImageUrl)}
                        draggable={false}
                      />
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "flex shrink-0 items-center justify-center rounded-xl bg-muted/30 ring-1 ring-border/50",
                        isCenter ? "h-[140px] w-[140px]" : "h-[96px] w-[96px]",
                      )}
                    >
                      {imageUrlForOption ? (
                        <ForwardedIconComponent
                          name={icon}
                          className="h-4 w-4 text-muted-foreground"
                        />
                      ) : (
                        // For fields without images (e.g. focal length), show a clean value card.
                        <div
                          className={cn(
                            "px-1 text-center text-foreground",
                            isCenter
                              ? "text-xl font-semibold"
                              : "text-sm font-medium",
                          )}
                        >
                          {item.value}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </ShadTooltip>
            );
          })}
        </div>
      </div>

      {/* Selected value (must be fully visible; no ellipsis). */}
      <div className="mt-3 text-center text-base font-semibold text-foreground break-words">
        {String(value ?? "")}
      </div>
    </div>
  );
}

export default function ProCameraLayout({
  data,
  types,
  buildStatus: _buildStatus,
  selected = false,
}: Props) {
  // Space out downstream creators and keep them horizontally aligned with this node.
  const DOWNSTREAM_NODE_OFFSET_X = 1400;
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const setNodes = useFlowStore((state) => state.setNodes);
  const onConnect = useFlowStore((state) => state.onConnect);
  const setFilterEdge = useFlowStore((state) => state.setFilterEdge);
  const takeSnapshot = useFlowsManagerStore((state) => state.takeSnapshot);
  const templates = useTypesStore((state) => state.templates);

  const template = data.node?.template ?? {};
  const cameraField = template[CAMERA_FIELD];
  const lensField = template[LENS_FIELD];
  const focalField = template[FOCAL_FIELD];
  const apertureField = template[APERTURE_FIELD];

  const { handleOnNewValue: handleCameraChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: CAMERA_FIELD,
  });
  const { handleOnNewValue: handleLensChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: LENS_FIELD,
  });
  const { handleOnNewValue: handleFocalChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: FOCAL_FIELD,
  });
  const { handleOnNewValue: handleApertureChange } = useHandleOnNewValue({
    node: data.node!,
    nodeId: data.id,
    name: APERTURE_FIELD,
  });

  // Migrate legacy saved values to the newer, split options so the node remains "valid".
  useEffect(() => {
    const cameraOptions = (cameraField?.options ?? []).map(String);
    const focalOptions = (focalField?.options ?? []).map(String);

    const cameraValue = String(cameraField?.value ?? "");
    const focalValue = String(focalField?.value ?? "");

    const legacyCameraMap: Record<string, string> = {
      "ARRICAM LT / Arriflex 435": "Arricam LT",
      "IMAX Film /Keighley": "IMAX Keighley",
    };
    const legacyFocalMap: Record<string, string> = {
      "8-14mm": "14mm",
    };

    const nextCamera = legacyCameraMap[cameraValue] ?? cameraValue;
    if (nextCamera && cameraOptions.length > 0 && !cameraOptions.includes(nextCamera)) {
      handleCameraChange({ value: cameraOptions[0] });
    } else if (nextCamera !== cameraValue && cameraOptions.includes(nextCamera)) {
      handleCameraChange({ value: nextCamera });
    }

    const nextFocal = legacyFocalMap[focalValue] ?? focalValue;
    if (nextFocal && focalOptions.length > 0 && !focalOptions.includes(nextFocal)) {
      handleFocalChange({ value: focalOptions[0] });
    } else if (nextFocal !== focalValue && focalOptions.includes(nextFocal)) {
      handleFocalChange({ value: nextFocal });
    }
  }, [
    cameraField?.options,
    cameraField?.value,
    focalField?.options,
    focalField?.value,
    handleCameraChange,
    handleFocalChange,
  ]);

  const handlePrevCamera = useCallback(() => {
    const next = rotateOption(cameraField?.options ?? [], cameraField?.value, -1);
    handleCameraChange({ value: next });
  }, [cameraField?.options, cameraField?.value, handleCameraChange]);
  const handleNextCamera = useCallback(() => {
    const next = rotateOption(cameraField?.options ?? [], cameraField?.value, 1);
    handleCameraChange({ value: next });
  }, [cameraField?.options, cameraField?.value, handleCameraChange]);

  const handlePrevLens = useCallback(() => {
    const next = rotateOption(lensField?.options ?? [], lensField?.value, -1);
    handleLensChange({ value: next });
  }, [handleLensChange, lensField?.options, lensField?.value]);
  const handleNextLens = useCallback(() => {
    const next = rotateOption(lensField?.options ?? [], lensField?.value, 1);
    handleLensChange({ value: next });
  }, [handleLensChange, lensField?.options, lensField?.value]);

  const handlePrevFocal = useCallback(() => {
    const next = rotateOption(focalField?.options ?? [], focalField?.value, -1);
    handleFocalChange({ value: next });
  }, [focalField?.options, focalField?.value, handleFocalChange]);
  const handleNextFocal = useCallback(() => {
    const next = rotateOption(focalField?.options ?? [], focalField?.value, 1);
    handleFocalChange({ value: next });
  }, [focalField?.options, focalField?.value, handleFocalChange]);

  const handlePrevAperture = useCallback(() => {
    const next = rotateOption(apertureField?.options ?? [], apertureField?.value, -1);
    handleApertureChange({ value: next });
  }, [apertureField?.options, apertureField?.value, handleApertureChange]);
  const handleNextAperture = useCallback(() => {
    const next = rotateOption(apertureField?.options ?? [], apertureField?.value, 1);
    handleApertureChange({ value: next });
  }, [apertureField?.options, apertureField?.value, handleApertureChange]);

  // Wheel switching (matches the "scroll to change selection" UX in the reference).
  const wheelThrottleRef = useRef<Record<string, number>>({});
  const makeWheelHandler = useCallback(
    (key: string, onPrev: () => void, onNext: () => void) => {
      return (event: React.WheelEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const now = Date.now();
        const last = wheelThrottleRef.current[key] ?? 0;
        if (now - last < 120) return;
        wheelThrottleRef.current[key] = now;
        if (event.deltaY > 0) onNext();
        else onPrev();
      };
    },
    [],
  );

  // Optional "real device images" support:
  // - Put PNGs under `src/frontend/public/assets/pro-camera/cameras/*.png`
  //   and `src/frontend/public/assets/pro-camera/lenses/*.png`
  // - Filenames should match slugifyLabel(option) (e.g. "ARRI Alexa 65" -> "arri-alexa-65.png")
  const [brokenImageUrls, setBrokenImageUrls] = useState<Record<string, true>>(
    {},
  );
  const markImageBroken = useCallback((url: string) => {
    setBrokenImageUrls((cur) => (cur[url] ? cur : { ...cur, [url]: true }));
  }, []);
  const cameraImageUrlFor = useCallback((option: string) => {
    const override = CAMERA_IMAGE_FILES[option];
    if (Array.isArray(override)) {
      return override.map((f) => publicAssetUrl("/assets/pro-camera/cameras", f));
    }
    return buildPublicAssetCandidates("/assets/pro-camera/cameras", option, override);
  }, []);
  const lensImageUrlFor = useCallback(
    (option: string) => {
      const override = LENS_IMAGE_FILES[option];
      return buildPublicAssetCandidates("/assets/pro-camera/lenses", option, override);
    },
    [],
  );
  const apertureImageUrlFor = useCallback((option: string) => {
    const override = APERTURE_IMAGE_FILES[option];
    return buildPublicAssetCandidates("/assets/pro-camera/aperture", option, override);
  }, []);
  const isImageUrlBroken = useCallback(
    (url: string) => Boolean(brokenImageUrls[url]),
    [brokenImageUrls],
  );
  const onImageUrlBroken = useCallback(
    (url: string) => markImageBroken(url),
    [markImageBroken],
  );

  // "+" output handle / quick add (match the creation components UX).
  const [quickAddMenu, setQuickAddMenu] = useState<{
    x: number;
    y: number;
    kind: "output";
  } | null>(null);

  const previewWrapRef = useRef<HTMLDivElement>(null);
  const leaveGraceTimerRef = useRef<number | null>(null);
  const fadeOutTimerRef = useRef<number | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const [activePlus, setActivePlus] = useState(false);
  const [visiblePlus, setVisiblePlus] = useState(false);

  const canvasZoom = useStore((s: ReactFlowState) => s.transform[2]);
  const DEFAULT_PLUS_OFFSET = useMemo(() => ({ x: 106, y: 0 }), []);
  const [plusOffset, setPlusOffset] = useState(DEFAULT_PLUS_OFFSET);

  const clearPlusTimers = useCallback(() => {
    if (leaveGraceTimerRef.current) {
      window.clearTimeout(leaveGraceTimerRef.current);
      leaveGraceTimerRef.current = null;
    }
    if (fadeOutTimerRef.current) {
      window.clearTimeout(fadeOutTimerRef.current);
      fadeOutTimerRef.current = null;
    }
  }, []);

  const isPointerInCaptureZone = useCallback(
    (clientX: number, clientY: number, slopNodeSpace = 0) => {
      const rect = previewWrapRef.current?.getBoundingClientRect();
      if (!rect) return false;
      const zoom = canvasZoom || 1;
      const edgeX = rect.right;
      const centerY = rect.top + rect.height / 2;
      const rawX = (clientX - edgeX) / zoom;
      const rawY = (clientY - centerY) / zoom;
      const withinX = rawX >= 0 - slopNodeSpace && rawX <= 212 + slopNodeSpace;
      const withinY = rawY >= -106 - slopNodeSpace && rawY <= 106 + slopNodeSpace;
      return withinX && withinY;
    },
    [canvasZoom],
  );

  const computePlusOffset = useCallback(
    (clientX: number, clientY: number) => {
      const rect = previewWrapRef.current?.getBoundingClientRect();
      if (!rect) return DEFAULT_PLUS_OFFSET;
      const zoom = canvasZoom || 1;
      const edgeX = rect.right;
      const centerY = rect.top + rect.height / 2;
      const rawX = (clientX - edgeX) / zoom;
      const clampedX = Math.max(0, Math.min(212, rawX));
      const clampedY = Math.max(-106, Math.min(106, (clientY - centerY) / zoom));
      return { x: clampedX, y: clampedY };
    },
    [DEFAULT_PLUS_OFFSET, canvasZoom],
  );

  const showPlus = useCallback(
    (clientX?: number, clientY?: number) => {
      clearPlusTimers();
      setActivePlus(true);
      setVisiblePlus(true);
      if (typeof clientX === "number" && typeof clientY === "number") {
        lastPointerRef.current = { x: clientX, y: clientY };
        setPlusOffset(computePlusOffset(clientX, clientY));
      }
    },
    [clearPlusTimers, computePlusOffset],
  );

  const updatePlus = useCallback(
    (clientX: number, clientY: number) => {
      clearPlusTimers();
      setActivePlus(true);
      setVisiblePlus(true);
      lastPointerRef.current = { x: clientX, y: clientY };
      setPlusOffset(computePlusOffset(clientX, clientY));
    },
    [clearPlusTimers, computePlusOffset],
  );

  const startHidePlus = useCallback(
    (clientX?: number, clientY?: number) => {
      clearPlusTimers();
      const lastPointer = lastPointerRef.current;

      leaveGraceTimerRef.current = window.setTimeout(() => {
        if (
          typeof clientX === "number" &&
          typeof clientY === "number" &&
          isPointerInCaptureZone(clientX, clientY, 6)
        ) {
          return;
        }
        if (
          lastPointer &&
          isPointerInCaptureZone(lastPointer.x, lastPointer.y, 6)
        ) {
          return;
        }

        setActivePlus(false);
        setPlusOffset(DEFAULT_PLUS_OFFSET);
        fadeOutTimerRef.current = window.setTimeout(() => {
          if (!selected) setVisiblePlus(false);
        }, 200);
      }, 30);
    },
    [DEFAULT_PLUS_OFFSET, clearPlusTimers, isPointerInCaptureZone, selected],
  );

  useEffect(() => {
    clearPlusTimers();
    setActivePlus(false);
    setVisiblePlus(false);
    setPlusOffset(DEFAULT_PLUS_OFFSET);
  }, [DEFAULT_PLUS_OFFSET, clearPlusTimers, selected]);
  useEffect(() => () => clearPlusTimers(), [clearPlusTimers]);

  const previewOutputHandles = useMemo(() => {
    const outputs = data.node?.outputs ?? [];
    return outputs
      .filter((output) => !output.hidden)
      .map((output) => {
        const colors = getNodeOutputColors(output, data, types);
        const colorName = getNodeOutputColorsName(output, data, types);
        const resolvedType = output.selected ?? output.types?.[0] ?? "Data";
        return {
          id: {
            output_types: [resolvedType],
            id: data.id,
            dataType: data.type,
            name: output.name,
          },
          colors,
          colorName,
          tooltip:
            output.selected ??
            output.types?.[0] ??
            output.display_name ??
            "成像风格提示词",
          title: output.display_name ?? output.name,
          proxy: output.proxy,
        };
      });
  }, [data, types]);

  const handleCreateImageDownstreamNode = useCallback(() => {
    const currentNode = nodes.find((node) => node.id === data.id);
    if (!currentNode) return;

    const existingNodeId = edges
      .map((edge) => {
        if (edge.source !== data.id) return null;
        const targetNode = nodes.find((node) => node.id === edge.target);
        if (targetNode?.data?.type !== "DoubaoImageCreator") return null;
        if (targetNode.position.x <= currentNode.position.x) return null;

        const targetHandle =
          edge.data?.targetHandle ??
          (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
        if (targetHandle?.fieldName !== "prompt") return null;

        const sourceHandle =
          edge.data?.sourceHandle ??
          (edge.sourceHandle ? scapeJSONParse(edge.sourceHandle) : null);
        if (sourceHandle?.name !== PREFERRED_OUTPUT) return null;

        return targetNode.id;
      })
      .find(Boolean) as string | undefined;

    if (existingNodeId) {
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          selected: node.id === existingNodeId,
        })),
      );
      return;
    }

    const imageComponentTemplate = templates["DoubaoImageCreator"];
    if (!imageComponentTemplate) return;
    const promptTemplateField = imageComponentTemplate.template?.prompt;
    if (!promptTemplateField) return;

    takeSnapshot();

    const newNodeId = getNodeId("DoubaoImageCreator");
    const newNodeX = currentNode.position.x + DOWNSTREAM_NODE_OFFSET_X;
    const newNodeY = currentNode.position.y;

    const seeded = cloneDeep(imageComponentTemplate);
    // When created from ProCamera, keep the creator's prompt empty.
    if (seeded?.template?.prompt) seeded.template.prompt.value = "";

    const newNode: GenericNodeType = {
      id: newNodeId,
      type: "genericNode",
      position: { x: newNodeX, y: newNodeY },
      data: {
        node: seeded,
        showNode: !seeded.minimized,
        type: "DoubaoImageCreator",
        id: newNodeId,
      },
      selected: false,
    };

    setNodes((currentNodes) => [...currentNodes, newNode]);

    const outputDefinition =
      data.node?.outputs?.find((output) => output.name === PREFERRED_OUTPUT) ??
      data.node?.outputs?.find((output) => !output.hidden) ??
      data.node?.outputs?.[0];

    const sourceOutputTypes =
      outputDefinition?.types && outputDefinition.types.length === 1
        ? outputDefinition.types
        : outputDefinition?.selected
          ? [outputDefinition.selected]
          : ["Data"];

    const sourceHandle = {
      output_types: sourceOutputTypes,
      id: data.id,
      dataType: data.type,
      name: outputDefinition?.name ?? PREFERRED_OUTPUT,
      ...(outputDefinition?.proxy ? { proxy: outputDefinition.proxy } : {}),
    };

    const targetHandle = {
      inputTypes: promptTemplateField.input_types,
      type: promptTemplateField.type,
      id: newNodeId,
      fieldName: "prompt",
      ...(promptTemplateField.proxy ? { proxy: promptTemplateField.proxy } : {}),
    };

    onConnect({
      source: data.id,
      target: newNodeId,
      sourceHandle: scapedJSONStringfy(sourceHandle),
      targetHandle: scapedJSONStringfy(targetHandle),
    });

    track("ProCamera - Create Image Node", {
      sourceNodeId: data.id,
      targetNodeId: newNodeId,
      targetComponent: "DoubaoImageCreator",
    });
  }, [
    DOWNSTREAM_NODE_OFFSET_X,
    data.id,
    data.node?.outputs,
    data.type,
    edges,
    nodes,
    onConnect,
    setNodes,
    takeSnapshot,
    templates,
  ]);

  const handleCreateVideoDownstreamNode = useCallback(() => {
    const currentNode = nodes.find((node) => node.id === data.id);
    if (!currentNode) return;

    const existingNodeId = edges
      .map((edge) => {
        if (edge.source !== data.id) return null;
        const targetNode = nodes.find((node) => node.id === edge.target);
        if (targetNode?.data?.type !== "DoubaoVideoGenerator") return null;
        if (targetNode.position.x <= currentNode.position.x) return null;

        const targetHandle =
          edge.data?.targetHandle ??
          (edge.targetHandle ? scapeJSONParse(edge.targetHandle) : null);
        if (targetHandle?.fieldName !== "prompt") return null;

        const sourceHandle =
          edge.data?.sourceHandle ??
          (edge.sourceHandle ? scapeJSONParse(edge.sourceHandle) : null);
        if (sourceHandle?.name !== PREFERRED_OUTPUT) return null;

        return targetNode.id;
      })
      .find(Boolean) as string | undefined;

    if (existingNodeId) {
      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          selected: node.id === existingNodeId,
        })),
      );
      return;
    }

    const videoComponentTemplate = templates["DoubaoVideoGenerator"];
    if (!videoComponentTemplate) return;
    const promptTemplateField = videoComponentTemplate.template?.prompt;
    if (!promptTemplateField) return;

    takeSnapshot();

    const newNodeId = getNodeId("DoubaoVideoGenerator");
    const newNodeX = currentNode.position.x + DOWNSTREAM_NODE_OFFSET_X;
    const newNodeY = currentNode.position.y;

    const seeded = cloneDeep(videoComponentTemplate);
    // When created from ProCamera, keep the creator's prompt empty.
    if (seeded?.template?.prompt) seeded.template.prompt.value = "";

    const newNode: GenericNodeType = {
      id: newNodeId,
      type: "genericNode",
      position: { x: newNodeX, y: newNodeY },
      data: {
        node: seeded,
        showNode: !seeded.minimized,
        type: "DoubaoVideoGenerator",
        id: newNodeId,
      },
      selected: false,
    };

    setNodes((currentNodes) => [...currentNodes, newNode]);

    const outputDefinition =
      data.node?.outputs?.find((output) => output.name === PREFERRED_OUTPUT) ??
      data.node?.outputs?.find((output) => !output.hidden) ??
      data.node?.outputs?.[0];

    const sourceOutputTypes =
      outputDefinition?.types && outputDefinition.types.length === 1
        ? outputDefinition.types
        : outputDefinition?.selected
          ? [outputDefinition.selected]
          : ["Data"];

    const sourceHandle = {
      output_types: sourceOutputTypes,
      id: data.id,
      dataType: data.type,
      name: outputDefinition?.name ?? PREFERRED_OUTPUT,
      ...(outputDefinition?.proxy ? { proxy: outputDefinition.proxy } : {}),
    };

    const targetHandle = {
      inputTypes: promptTemplateField.input_types,
      type: promptTemplateField.type,
      id: newNodeId,
      fieldName: "prompt",
      ...(promptTemplateField.proxy ? { proxy: promptTemplateField.proxy } : {}),
    };

    onConnect({
      source: data.id,
      target: newNodeId,
      sourceHandle: scapedJSONStringfy(sourceHandle),
      targetHandle: scapedJSONStringfy(targetHandle),
    });

    track("ProCamera - Create Video Node", {
      sourceNodeId: data.id,
      targetNodeId: newNodeId,
      targetComponent: "DoubaoVideoGenerator",
    });
  }, [
    DOWNSTREAM_NODE_OFFSET_X,
    data.id,
    data.node?.outputs,
    data.type,
    edges,
    nodes,
    onConnect,
    setNodes,
    takeSnapshot,
    templates,
  ]);

  const quickAddItems = useMemo(() => {
    if (!quickAddMenu) return [];
    return [
      {
        key: "image-downstream",
        label: "图片创作",
        icon: "Image",
        onSelect: handleCreateImageDownstreamNode,
      },
      {
        key: "video-downstream",
        label: "视频创作",
        icon: "Clapperboard",
        onSelect: handleCreateVideoDownstreamNode,
      },
    ];
  }, [handleCreateImageDownstreamNode, handleCreateVideoDownstreamNode, quickAddMenu]);

  return (
    <div className="relative flex flex-col gap-4 px-4 pb-4">
      {quickAddMenu && (
        <DoubaoQuickAddMenu
          open={Boolean(quickAddMenu)}
          position={{ x: quickAddMenu.x, y: quickAddMenu.y }}
          title={"下游组件连接："}
          items={quickAddItems}
          onOpenChange={(open) => {
            if (!open) {
              setQuickAddMenu(null);
              setActivePlus(false);
            }
          }}
        />
      )}

      {/* Camera control strip (theme-aware; no fixed dark colors) */}
      <div ref={previewWrapRef} className="relative">
        <div
          className={cn(
            // Keep the layout consistent with other nodes: rely on the node container for the "card",
            // and avoid introducing an extra bordered/shadowed layer.
            "grid grid-cols-1 overflow-hidden rounded-[24px]",
            "lg:grid-cols-4 lg:divide-x lg:divide-border/60",
          )}
          onPointerMoveCapture={(event) => {
            if (quickAddMenu) return;
            // Make the "+" easier to trigger: include a small slop *inside* the node near the right edge.
            if (isPointerInCaptureZone(event.clientX, event.clientY, 24)) {
              updatePlus(event.clientX, event.clientY);
              return;
            }
            if (!selected) startHidePlus(event.clientX, event.clientY);
          }}
          onPointerLeave={(event) => {
            if (quickAddMenu) return;
            startHidePlus(event.clientX, event.clientY);
          }}
        >
          <WheelPickerColumn
            icon="Camera"
            label={cameraField?.display_name ?? "摄影机"}
            options={cameraField?.options ?? []}
            value={String(cameraField?.value ?? "")}
            onPrev={handlePrevCamera}
            onNext={handleNextCamera}
            onWheel={makeWheelHandler("camera", handlePrevCamera, handleNextCamera)}
            imageUrlForOption={cameraImageUrlFor}
            hintForOption={(option) => CAMERA_HINTS[option]}
            isImageBroken={isImageUrlBroken}
            onImageBroken={onImageUrlBroken}
          />
          <WheelPickerColumn
            icon="Aperture"
            label={lensField?.display_name ?? "镜头"}
            options={lensField?.options ?? []}
            value={String(lensField?.value ?? "")}
            onPrev={handlePrevLens}
            onNext={handleNextLens}
            onWheel={makeWheelHandler("lens", handlePrevLens, handleNextLens)}
            imageUrlForOption={lensImageUrlFor}
            hintForOption={(option) => LENS_HINTS[option]}
            isImageBroken={isImageUrlBroken}
            onImageBroken={onImageUrlBroken}
          />
          <WheelPickerColumn
            icon="Ruler"
            label={focalField?.display_name ?? "焦段"}
            options={focalField?.options ?? []}
            value={String(focalField?.value ?? "")}
            onPrev={handlePrevFocal}
            onNext={handleNextFocal}
            onWheel={makeWheelHandler("focal", handlePrevFocal, handleNextFocal)}
            hintForOption={(option) => FOCAL_HINTS[option]}
          />
          <WheelPickerColumn
            icon="CircleGauge"
            label={apertureField?.display_name ?? "光圈"}
            options={apertureField?.options ?? []}
            value={String(apertureField?.value ?? "")}
            onPrev={handlePrevAperture}
            onNext={handleNextAperture}
            onWheel={makeWheelHandler(
              "aperture",
              handlePrevAperture,
              handleNextAperture,
            )}
            imageUrlForOption={apertureImageUrlFor}
            hintForOption={(option) => APERTURE_HINTS[option]}
            isImageBroken={isImageUrlBroken}
            onImageBroken={onImageUrlBroken}
          />
        </div>

        {/* Hover/capture zone for the "+" output handle (right side).
            IMPORTANT: must not be inside an overflow-hidden container, otherwise it can't be hovered. */}
        <div
          className="absolute left-full top-1/2 z-[800] h-[212px] w-[212px] -translate-y-1/2"
          onPointerEnter={(event) =>
            quickAddMenu ? undefined : showPlus(event.clientX, event.clientY)
          }
          onPointerMove={(event) =>
            quickAddMenu ? undefined : updatePlus(event.clientX, event.clientY)
          }
          onPointerLeave={(event) =>
            quickAddMenu ? undefined : startHidePlus(event.clientX, event.clientY)
          }
        />

        {/* Output "+" handle(s) */}
        {previewOutputHandles.length > 0 && (
          <div className="absolute right-0 top-1/2 z-[1200] flex -translate-y-1/2 flex-col items-start">
            {previewOutputHandles.map((handle, index) => (
              <div key={`${handle.id.name ?? "style"}-${index}`} className="mb-3 last:mb-0">
                <HandleRenderComponent
                  left={false}
                  tooltipTitle={handle.tooltip}
                  id={handle.id}
                  title={handle.title}
                  nodeId={data.id}
                  myData={data}
                  colors={handle.colors}
                  setFilterEdge={setFilterEdge}
                  showNode={true}
                  testIdComplement={`${data.type?.toLowerCase()}-preview-output`}
                  proxy={handle.proxy}
                  colorName={handle.colorName}
                  uiVariant="plus"
                  visible={selected || visiblePlus}
                  isTracking={activePlus}
                  clickMode="menu"
                  onMenuRequest={({ x, y }) => {
                    setVisiblePlus(true);
                    setActivePlus(true);
                    setQuickAddMenu({ x, y, kind: "output" });
                  }}
                  onPlusPointerEnter={(event) =>
                    quickAddMenu ? undefined : showPlus(event.clientX, event.clientY)
                  }
                  onPlusPointerMove={(event) =>
                    quickAddMenu ? undefined : updatePlus(event.clientX, event.clientY)
                  }
                  onPlusPointerLeave={(event) =>
                    quickAddMenu ? undefined : startHidePlus(event.clientX, event.clientY)
                  }
                  visualOffset={plusOffset}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
