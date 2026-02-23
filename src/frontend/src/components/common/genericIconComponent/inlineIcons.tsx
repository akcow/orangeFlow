import React, { forwardRef } from "react";

// A small set of "high-frequency, obvious" canvas button icons rendered as inline SVG.
// This avoids lazy-loading delays/chunk misses for common UI affordances.

export type InlineIconProps = React.SVGProps<SVGSVGElement> & {
  // ForwardedIconComponent passes this down to some icon components; inline icons ignore it.
  isDark?: boolean;
};

type IconNode = Array<
  [
    keyof JSX.IntrinsicElements,
    // Include `key` and any SVG element attributes (d, points, x1, etc).
    Record<string, any>,
  ]
>;

const DEFAULT_STROKE_WIDTH = 1.5;

function createInlineLucideIcon(displayName: string, iconNode: IconNode) {
  const Comp = forwardRef<SVGSVGElement, InlineIconProps>(
    ({ className, style, children, ...props }, ref) => {
      // Keep parity with ForwardedIconComponent defaults: strokeWidth 1.5 unless overridden.
      const mergedStyle: React.CSSProperties = {
        strokeWidth: DEFAULT_STROKE_WIDTH,
        ...style,
      };

      return (
        <svg
          ref={ref}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
          style={mergedStyle}
          aria-hidden="true"
          focusable="false"
          {...props}
        >
          {iconNode.map(([tag, attrs]) => React.createElement(tag, attrs))}
          {children}
        </svg>
      );
    },
  );
  Comp.displayName = `InlineIcon(${displayName})`;
  return Comp;
}

// Icon node data is copied from lucide-react (ISC) to keep visuals consistent with existing icons.
const inlineIcons: Record<string, React.ComponentType<InlineIconProps>> = {
  Plus: createInlineLucideIcon("Plus", [
    ["path", { d: "M5 12h14", key: "1ays0h" }],
    ["path", { d: "M12 5v14", key: "s699le" }],
  ]),
  Minus: createInlineLucideIcon("Minus", [
    ["path", { d: "M5 12h14", key: "1ays0h" }],
  ]),
  X: createInlineLucideIcon("X", [
    ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
    ["path", { d: "m6 6 12 12", key: "d8bk6v" }],
  ]),
  Check: createInlineLucideIcon("Check", [
    ["path", { d: "M20 6 9 17l-5-5", key: "1gmf2c" }],
  ]),
  Ellipsis: createInlineLucideIcon("Ellipsis", [
    ["circle", { cx: "12", cy: "12", r: "1", key: "41hilf" }],
    ["circle", { cx: "19", cy: "12", r: "1", key: "1wjl8i" }],
    ["circle", { cx: "5", cy: "12", r: "1", key: "1pcz8c" }],
  ]),
  // lucide's `more-horizontal` re-exports `ellipsis`; keep an explicit alias since code uses both names.
  MoreHorizontal: createInlineLucideIcon("MoreHorizontal", [
    ["circle", { cx: "12", cy: "12", r: "1", key: "41hilf" }],
    ["circle", { cx: "19", cy: "12", r: "1", key: "1wjl8i" }],
    ["circle", { cx: "5", cy: "12", r: "1", key: "1pcz8c" }],
  ]),
  ChevronDown: createInlineLucideIcon("ChevronDown", [
    ["path", { d: "m6 9 6 6 6-6", key: "qrunsl" }],
  ]),
  ChevronRight: createInlineLucideIcon("ChevronRight", [
    ["path", { d: "m9 18 6-6-6-6", key: "mthhwq" }],
  ]),
  ChevronLeft: createInlineLucideIcon("ChevronLeft", [
    ["path", { d: "m15 18-6-6 6-6", key: "1wnfg3" }],
  ]),
  FileText: createInlineLucideIcon("FileText", [
    [
      "path",
      {
        d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",
        key: "1rqfz7",
      },
    ],
    ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4", key: "tnqrlb" }],
    ["path", { d: "M10 9H8", key: "b1mrlr" }],
    ["path", { d: "M16 13H8", key: "t4e002" }],
    ["path", { d: "M16 17H8", key: "z1uh3a" }],
  ]),
  Image: createInlineLucideIcon("Image", [
    [
      "rect",
      { width: "18", height: "18", x: "3", y: "3", rx: "2", ry: "2", key: "1m3agn" },
    ],
    ["circle", { cx: "9", cy: "9", r: "2", key: "af1f0g" }],
    [
      "path",
      { d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21", key: "1xmnt7" },
    ],
  ]),
  CircleAlert: createInlineLucideIcon("CircleAlert", [
    ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
    ["line", { x1: "12", x2: "12", y1: "8", y2: "12", key: "1pkeuh" }],
    ["line", { x1: "12", x2: "12.01", y1: "16", y2: "16", key: "4dfq90" }],
  ]),
  Download: createInlineLucideIcon("Download", [
    [
      "path",
      { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", key: "ih7n3h" },
    ],
    ["polyline", { points: "7 10 12 15 17 10", key: "2ggqvy" }],
    ["line", { x1: "12", x2: "12", y1: "15", y2: "3", key: "1vk2je" }],
  ]),
  Upload: createInlineLucideIcon("Upload", [
    [
      "path",
      { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", key: "ih7n3h" },
    ],
    ["polyline", { points: "17 8 12 3 7 8", key: "t8dd8p" }],
    ["line", { x1: "12", x2: "12", y1: "3", y2: "15", key: "widbto" }],
  ]),
  Copy: createInlineLucideIcon("Copy", [
    [
      "rect",
      {
        width: "14",
        height: "14",
        x: "8",
        y: "8",
        rx: "2",
        ry: "2",
        key: "17jyea",
      },
    ],
    [
      "path",
      {
        d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
        key: "zix9uf",
      },
    ],
  ]),
  Clipboard: createInlineLucideIcon("Clipboard", [
    [
      "rect",
      { width: "8", height: "4", x: "8", y: "2", rx: "1", ry: "1", key: "tgr4d6" },
    ],
    [
      "path",
      {
        d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
        key: "116196",
      },
    ],
  ]),
  Save: createInlineLucideIcon("Save", [
    [
      "path",
      {
        d: "M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
        key: "1c8476",
      },
    ],
    [
      "path",
      { d: "M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7", key: "1ydtos" },
    ],
    ["path", { d: "M7 3v4a1 1 0 0 0 1 1h7", key: "t51u73" }],
  ]),
  Trash2: createInlineLucideIcon("Trash2", [
    ["path", { d: "M3 6h18", key: "d0wm0j" }],
    [
      "path",
      {
        d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",
        key: "4alrt4",
      },
    ],
    [
      "path",
      {
        d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",
        key: "v07s0e",
      },
    ],
    ["line", { x1: "10", x2: "10", y1: "11", y2: "17", key: "1uufr5" }],
    ["line", { x1: "14", x2: "14", y1: "11", y2: "17", key: "xtxkd" }],
  ]),
  Maximize2: createInlineLucideIcon("Maximize2", [
    ["polyline", { points: "15 3 21 3 21 9", key: "mznyad" }],
    ["polyline", { points: "9 21 3 21 3 15", key: "1avn1i" }],
    ["line", { x1: "21", x2: "14", y1: "3", y2: "10", key: "ota7mn" }],
    ["line", { x1: "3", x2: "10", y1: "21", y2: "14", key: "1atl0r" }],
  ]),
  Undo2: createInlineLucideIcon("Undo2", [
    ["path", { d: "M9 14 4 9l5-5", key: "102s5s" }],
    [
      "path",
      {
        d: "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11",
        key: "f3b9sd",
      },
    ],
  ]),
  Redo2: createInlineLucideIcon("Redo2", [
    ["path", { d: "m15 14 5-5-5-5", key: "12vg1m" }],
    [
      "path",
      {
        d: "M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13",
        key: "6uklza",
      },
    ],
  ]),
  MousePointer2: createInlineLucideIcon("MousePointer2", [
    [
      "path",
      {
        d: "M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z",
        key: "edeuup",
      },
    ],
  ]),
  RotateCcw: createInlineLucideIcon("RotateCcw", [
    [
      "path",
      {
        d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",
        key: "1357e3",
      },
    ],
    ["path", { d: "M3 3v5h5", key: "1xhq8a" }],
  ]),
  PanelLeftOpen: createInlineLucideIcon("PanelLeftOpen", [
    ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
    ["path", { d: "M9 3v18", key: "fh3hqa" }],
    ["path", { d: "m14 9 3 3-3 3", key: "8010ee" }],
  ]),
  SlidersHorizontal: createInlineLucideIcon("SlidersHorizontal", [
    ["line", { x1: "21", x2: "14", y1: "4", y2: "4", key: "obuewd" }],
    ["line", { x1: "10", x2: "3", y1: "4", y2: "4", key: "1q6298" }],
    ["line", { x1: "21", x2: "12", y1: "12", y2: "12", key: "1iu8h1" }],
    ["line", { x1: "8", x2: "3", y1: "12", y2: "12", key: "ntss68" }],
    ["line", { x1: "21", x2: "16", y1: "20", y2: "20", key: "14d8ph" }],
    ["line", { x1: "12", x2: "3", y1: "20", y2: "20", key: "m0wm8r" }],
    ["line", { x1: "14", x2: "14", y1: "2", y2: "6", key: "14e1ph" }],
    ["line", { x1: "8", x2: "8", y1: "10", y2: "14", key: "1i6ji0" }],
    ["line", { x1: "16", x2: "16", y1: "18", y2: "22", key: "1lctlv" }],
  ]),
  Settings2: createInlineLucideIcon("Settings2", [
    ["path", { d: "M20 7h-9", key: "3s1dr2" }],
    ["path", { d: "M14 17H5", key: "gfn3mx" }],
    ["circle", { cx: "17", cy: "17", r: "3", key: "18b49y" }],
    ["circle", { cx: "7", cy: "7", r: "3", key: "dfmy0x" }],
  ]),
  Scan: createInlineLucideIcon("Scan", [
    ["path", { d: "M3 7V5a2 2 0 0 1 2-2h2", key: "aa7l1z" }],
    ["path", { d: "M17 3h2a2 2 0 0 1 2 2v2", key: "4qcy5o" }],
    ["path", { d: "M21 17v2a2 2 0 0 1-2 2h-2", key: "6vwrx8" }],
    ["path", { d: "M7 21H5a2 2 0 0 1-2-2v-2", key: "ioqczr" }],
  ]),
  Brush: createInlineLucideIcon("Brush", [
    [
      "path",
      { d: "m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08", key: "1styjt" },
    ],
    [
      "path",
      {
        d: "M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z",
        key: "z0l1mu",
      },
    ],
  ]),
  Scissors: createInlineLucideIcon("Scissors", [
    ["circle", { cx: "6", cy: "6", r: "3", key: "1lh9wr" }],
    ["path", { d: "M8.12 8.12 12 12", key: "1alkpv" }],
    ["path", { d: "M20 4 8.12 15.88", key: "xgtan2" }],
    ["circle", { cx: "6", cy: "18", r: "3", key: "fqmcym" }],
    ["path", { d: "M14.8 14.8 20 20", key: "ptml3r" }],
  ]),
  Eraser: createInlineLucideIcon("Eraser", [
    [
      "path",
      {
        d: "m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21",
        key: "182aya",
      },
    ],
    ["path", { d: "M22 21H7", key: "t4ddhn" }],
    ["path", { d: "m5 11 9 9", key: "1mo9qw" }],
  ]),
  Keyboard: createInlineLucideIcon("Keyboard", [
    ["path", { d: "M10 8h.01", key: "1r9ogq" }],
    ["path", { d: "M12 12h.01", key: "1mp3jc" }],
    ["path", { d: "M14 8h.01", key: "1primd" }],
    ["path", { d: "M16 12h.01", key: "1l6xoz" }],
    ["path", { d: "M18 8h.01", key: "emo2bl" }],
    ["path", { d: "M6 8h.01", key: "x9i8wu" }],
    ["path", { d: "M7 16h10", key: "wp8him" }],
    ["path", { d: "M8 12h.01", key: "czm47f" }],
    ["rect", { width: "20", height: "16", x: "2", y: "4", rx: "2", key: "18n3k1" }],
  ]),
  Pause: createInlineLucideIcon("Pause", [
    ["rect", { x: "14", y: "4", width: "4", height: "16", rx: "1", key: "zuxfzm" }],
    ["rect", { x: "6", y: "4", width: "4", height: "16", rx: "1", key: "1okwgv" }],
  ]),
  Sparkles: createInlineLucideIcon("Sparkles", [
    [
      "path",
      {
        d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z",
        key: "4pj2yx",
      },
    ],
    ["path", { d: "M20 3v4", key: "1olli1" }],
    ["path", { d: "M22 5h-4", key: "1gvqau" }],
    ["path", { d: "M4 17v2", key: "vumght" }],
    ["path", { d: "M5 18H3", key: "zchphs" }],
  ]),
  MessagesSquare: createInlineLucideIcon("MessagesSquare", [
    [
      "path",
      {
        d: "M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z",
        key: "p1xzt8",
      },
    ],
    [
      "path",
      {
        d: "M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1",
        key: "1cx29u",
      },
    ],
  ]),
  SquarePen: createInlineLucideIcon("SquarePen", [
    [
      "path",
      { d: "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", key: "1m0v6g" },
    ],
    [
      "path",
      {
        d: "M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z",
        key: "ohrbg2",
      },
    ],
  ]),
  Workflow: createInlineLucideIcon("Workflow", [
    ["rect", { width: "8", height: "8", x: "3", y: "3", rx: "2", key: "by2w9f" }],
    ["path", { d: "M7 11v4a2 2 0 0 0 2 2h4", key: "xkn7yn" }],
    ["rect", { width: "8", height: "8", x: "13", y: "13", rx: "2", key: "1cgmvn" }],
  ]),
};

export function getInlineIconComponent(name: string) {
  return inlineIcons[name];
}
