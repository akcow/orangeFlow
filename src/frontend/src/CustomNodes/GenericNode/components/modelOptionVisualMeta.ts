export type ModelOptionScope = "image" | "video" | "text" | "unknown";

export type ModelOptionVisualMeta = {
  icon: string;
  description: string;
};

const DEFAULT_MODEL_META: ModelOptionVisualMeta = {
  icon: "Sparkles",
  description: "\u901a\u7528\u6a21\u578b\uff0c\u9002\u5408\u5728\u8d28\u91cf\u4e0e\u901f\u5ea6\u4e4b\u95f4\u53d6\u5f97\u5e73\u8861\u3002",
};

function normalizeModelName(rawValue: string): string {
  return String(rawValue ?? "")
    .toLowerCase()
    .replaceAll("\uFF08", "(")
    .replaceAll("\uFF09", ")")
    .replace(/[\u00B7|\uFF5C]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeModelName(normalizedName: string): string {
  const noParen = normalizedName.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();

  if (noParen.startsWith("seedream 4.5")) return "seedream 4.5";
  if (noParen.startsWith("seedream 4.0")) return "seedream 4.0";
  if (noParen.startsWith("seedance 1.5 pro")) return "seedance 1.5 pro";
  if (noParen.startsWith("seedance 1.0 pro")) return "seedance 1.0 pro";

  return noParen;
}

const MODEL_NAME_ALIASES: Record<string, string> = {
  "doubao-seedance-1-5-pro-251215": "seedance 1.5 pro",
  "doubao-seedance-1.5-pro 251215": "seedance 1.5 pro",
  "doubao-seedance-1-0-pro-250528": "seedance 1.0 pro",
  "doubao-seedance-1.0-pro 250528": "seedance 1.0 pro",
  "kling-v3-omni": "kling o3",
  "kling-v3": "kling v3",
  "deepseek": "deepseek-chat",
};

// Image models (DoubaoImageCreator)
export const IMAGE_MODEL_META_BY_NAME: Record<string, ModelOptionVisualMeta> = {
  "seedream 4.5": {
    icon: "ModelSeedSeries",
    description: "字节跳动最新推出的图像多模态模型，整合了文生图、图生图、组图输出等能力，融合常识和推理能力。相比前代4.0模型生成效果大幅提升，具备更好的编辑一致性和多图融合效果，能更精准的控制画面细节，小字、小人脸生成更自然，图片排版、色彩更和谐，美感提升",
  },
  "seedream 4.0": {
    icon: "ModelSeedSeries",
    description: " 原生支持文本 、单图和多图输入，并能通过对提示词的深度推理，自动适配最优的图像比例尺寸与生成数量，可一次性连续输出最多 15 张内容关联的图像，支持 4K 超高清输出",
  },
  "nano banana 2": {
    icon: "ModelBananaSeries",
    description: "更快更便宜的图片生成/编辑模型",
  },
  "nano banana pro": {
    icon: "ModelBananaSeries",
    description: "世界最强图片生成/编辑模型",
  },
  "wan2.6": {
    icon: "ModelWanSeries",
    description: "阿里巴巴旗舰级专业图像创作模型，文生图支持艺术风格高度还原与精准可控，电影级人像质感、光影细节入微；图生图强化多图融合与创意重组，可参考多图元素生成全新视觉作品，美学要素迁移能力突出；图像编辑实现高精度局部 / 全局调整，图文一体化混排生成",
  },
  "wan2.5": {
    icon: "ModelWanSeries",
    description: "支持文生图、图生图与全能图像编辑，具备精准文字渲染（中英文 / 小语种 / 艺术字）、强逻辑构图与多主体一致性，可生成海报、Logo、图表等结构化图文，提供背景替换、目标检测、多图融合等智能编辑能力，画质清晰、细节还原到位",
  },
  "kling o1": {
    icon: "ModelKlingSeries",
    description:
      "快手可灵官方O1图像模型，强调主体一致性和参考图可控融合，支持多图与主体库协同创作、单图和组图输出及最高4K清晰度，适合人物海报、商品主视觉与品牌KV等高还原场景。",
  },
  "kling o3": {
    icon: "ModelKlingSeries",
    description:
      "快手可灵官方O3图像模型，在复杂提示词理解、构图推理和多元素重组上更强，支持参考图与主体联合控制、风格统一与细节增强，适合商业广告、电商物料和叙事型视觉方案生产。",
  },
  "kling v3": {
    icon: "ModelKlingSeries",
    description:
      "快手可灵官方V3图像模型，文生图与图生图能力均衡，兼顾生成速度与画质表现，支持主体引用、多比例与2K高清输出，适合批量创意迭代、风格化海报和日常高质量设计出图。",
  },
};

// Video models (DoubaoVideoGenerator)
export const VIDEO_MODEL_META_BY_NAME: Record<string, ModelOptionVisualMeta> = {
  "seedance 1.5 pro": {
    icon: "ModelSeedSeries",
    description: "作为全球领先的视频生成模型，可生成音画高精同步的视频内容。支持多人多语言对白，全面覆盖环境音、动作音、合成音、乐器音、背景音及人声，支持首尾帧，实现影视级叙事效果，满足影视、漫剧、电商及广告领域的高阶创作需求",
  },
  "seedance 1.0 pro": {
    icon: "ModelSeedSeries",
    description: "一款支持多镜头叙事的视频生成基础模型，在各维度表现出色。它在语义理解与指令遵循能力上取得突破，能生成运动流畅、细节丰富、风格多样且具备影视级美感的 1080P 高清视频",
  },
  "wan2.6": {
    icon: "ModelWanSeries",
    description: "阿里巴巴推出的旗舰级视频生成模型，在Wan2.5基础上升级，支持文本、图片转视频，拥有原生口型同步、多镜头叙事功能，可生成15秒1080p电影级画质视频，增强物理规律理解，动作流畅度与细节表现大幅提升",
  },
  "wan2.5": {
    icon: "ModelWanSeries",
    description: "阿里巴巴推出的多模态视频生成模型，支持文本、图片转视频，具备原生音画同步能力，覆盖480p至1080p主流分辨率，生成速度快、性价比高，能稳定还原主体与场景细节",
  },
  "veo3.1": {
    icon: "Sparkles",
    description: "谷歌推出的旗舰级 AI 视频生成模型，支持文本 / 图像转视频、视频延伸与对象级编辑，具备三图定人设、精准相机控制与原生音画同步（对话 / 环境音 / 配乐一体生成），可出 1080p 电影级画质、最长 148 秒视频，光影材质细腻、角色稳定",
  },
  "veo3.1-fast": {
    icon: "Sparkles",
    description: "谷歌轻量版速度优化型视频生成模型，核心功能与标准版一致，主打 30–60 秒极速生成、成本更低，720p 画质仍保持高水准（极端细节略逊），支持原生音频同步",
  },
  "sora-2": {
    icon: "ModelSoraSeries",
    description: "OpenAI新一代原生多模态模型，支持文/图/视频输入。核心特色是极致物理模拟（精准还原重力、流体等）与原生音画同步（自动生成音效及对口型），能创作连贯的多镜头叙事视频",
  },
  "sora-2-pro": {
    icon: "ModelSoraSeries",
    description: "面向专业场景的sora-2增强版。主打高精度可控性（支持分镜故事板、角色动作微调）与长时高分辨率生成，确保复杂商业广告与影视制作中的角色特征稳定及细节完美还原",
  },
  "kling o1": {
    icon: "ModelKlingSeries",
    description:
      "支持文生视频、图生视频、首尾帧控制与参考视频驱动，分镜与时长可配置，画面稳定性和主体连续性表现突出，适合剧情片段、产品演示和品牌短视频制作。",
  },
  "kling o3": {
    icon: "ModelKlingSeries",
    description:
      "快手可灵官方O3视频模型，强化多镜头叙事、复杂运镜与镜头语言控制能力，可结合参考图与参考视频进行混合驱动，支持分镜编排与风格统一，适合广告分镜、故事化内容和高要求成片任务。",
  },
  "kling v3": {
    icon: "ModelKlingSeries",
    description:
      "快手可灵官方V3视频模型，兼顾生成质量、速度与成本效率，支持文生/图生、多镜头分镜和时长配置，最高可输出1080P成片，在人物动作连贯性与场景细节上表现稳定，适合规模化视频生产。",
  },
  "viduq2-pro": {
    icon: "ModelViduSeries",
    description:
      "Vidu Q2 Pro视频模型，覆盖图生视频、首尾帧过渡、参考生视频与视频编辑替换等核心流程，支持分辨率与时长灵活配置，细节表现和可控性均衡，适合创意试验、电商展示和多场景内容批量生成。",
  },
  "viduq3-pro": {
    icon: "ModelViduSeries",
    description:
      "Vidu Q3 Pro旗舰视频模型，支持文生/图生与音视频直出能力，最长可生成16秒内容，在动态表现、空间层次和立体感上更突出，同时兼顾清晰度与稳定性，适合直接成片输出与高质量商业传播。",
  },
};

// Text models (TextCreation)
export const TEXT_MODEL_META_BY_NAME: Record<string, ModelOptionVisualMeta> = {
  "deepseek-chat": {
    icon: "ModelDeepseekWhale",
    description: "极速响应（首 token 延迟 < 50ms），支持多轮对话、知识问答、内容创作与代码生成，中文语境优化，自然流畅",
  },
  "deepseek-reasoner": {
    icon: "ModelDeepseekWhale",
    description: "深度求索专业级推理模型，生成速度偏慢，全量调动参数进行多步逻辑拆解，输出可解释的推理过程，强化数学推导、逻辑分析、复杂决策与代码调试能力",
  },
  "gemini-3-pro-preview": {
    icon: "Sparkles",
    description: "谷歌最先进的推理模型",
  },
  "gemini-3-flash-preview": {
    icon: "Sparkles",
    description: "双子星3系列的快速高效ai文本模型",
  },
};

function getScopedModelMap(scope: ModelOptionScope): Record<string, ModelOptionVisualMeta> {
  if (scope === "image") return IMAGE_MODEL_META_BY_NAME;
  if (scope === "video") return VIDEO_MODEL_META_BY_NAME;
  if (scope === "text") return TEXT_MODEL_META_BY_NAME;
  return {};
}

function resolveScopedMeta(
  scope: ModelOptionScope,
  normalizedName: string,
): ModelOptionVisualMeta | undefined {
  const scopedMap = getScopedModelMap(scope);
  if (!Object.keys(scopedMap).length) return undefined;

  const canonical = canonicalizeModelName(normalizedName);
  const aliasOfNormalized = MODEL_NAME_ALIASES[normalizedName];
  const aliasOfCanonical = MODEL_NAME_ALIASES[canonical];

  const candidates = [normalizedName, canonical, aliasOfNormalized, aliasOfCanonical].filter(
    (item): item is string => Boolean(item),
  );

  for (const candidate of candidates) {
    const found = scopedMap[candidate];
    if (found) return found;
  }

  return undefined;
}

const FALLBACK_RULES: Array<{
  match: (normalizedName: string) => boolean;
  meta: ModelOptionVisualMeta;
}> = [
    {
      match: (name) => name.includes("seedance") || name.includes("seedream"),
      meta: {
        icon: "ModelSeedSeries",
        description: "Seed \u7cfb\u5217\u6a21\u578b\uff1a\u9002\u5408\u9ad8\u8d28\u91cf\u89c6\u89c9\u5185\u5bb9\u751f\u6210\u3002",
      },
    },
    {
      match: (name) => name.includes("wan2."),
      meta: {
        icon: "ModelWanSeries",
        description: "Wan \u7cfb\u5217\u6a21\u578b\uff1a\u652f\u6301\u591a\u8f93\u5165\u5f62\u5f0f\uff0c\u9002\u5408\u901a\u7528\u521b\u4f5c\u6d41\u7a0b\u3002",
      },
    },
    {
      match: (name) => name.includes("kling"),
      meta: {
        icon: "ModelKlingSeries",
        description: "Kling \u7cfb\u5217\u6a21\u578b\uff1a\u9002\u5408\u98ce\u683c\u5316\u4e0e\u955c\u5934\u63a7\u5236\u7c7b\u5185\u5bb9\u751f\u6210\u3002",
      },
    },
    {
      match: (name) => name.includes("vidu"),
      meta: {
        icon: "ModelViduSeries",
        description: "Vidu \u7cfb\u5217\u6a21\u578b\uff1a\u9002\u5408\u9ad8\u541e\u5410\u89c6\u9891\u751f\u4ea7\u4e0e\u8fed\u4ee3\u3002",
      },
    },
    {
      match: (name) => name.includes("sora"),
      meta: {
        icon: "ModelSoraSeries",
        description: "Sora \u7cfb\u5217\u6a21\u578b\uff1a\u9002\u5408\u53d9\u4e8b\u955c\u5934\u4e0e\u957f\u65f6\u6bb5\u8868\u8fbe\u3002",
      },
    },
    {
      match: (name) => name.includes("banana"),
      meta: {
        icon: "ModelBananaSeries",
        description: "Banana \u7cfb\u5217\u6a21\u578b\uff1a\u9002\u5408\u4ea4\u4e92\u5f0f\u56fe\u50cf\u7f16\u8f91\u4e0e\u7ec6\u5316\u3002",
      },
    },
    {
      match: (name) => name.includes("deepseek"),
      meta: {
        icon: "ModelDeepseekWhale",
        description: "DeepSeek \u7cfb\u5217\u6a21\u578b\uff1a\u9002\u5408\u6587\u672c\u7406\u89e3\u3001\u63a8\u7406\u4e0e\u5199\u4f5c\u3002",
      },
    },
  ];

export function getModelOptionVisualMeta(
  modelName: string,
  scope: ModelOptionScope = "unknown",
): ModelOptionVisualMeta {
  const normalized = normalizeModelName(modelName);

  const scopedMeta = resolveScopedMeta(scope, normalized);
  if (scopedMeta) return scopedMeta;

  const fallbackScopedOrder: ModelOptionScope[] = ["video", "image", "text"];
  for (const fallbackScope of fallbackScopedOrder) {
    const resolved = resolveScopedMeta(fallbackScope, normalized);
    if (resolved) return resolved;
  }

  const fallbackRule = FALLBACK_RULES.find((item) => item.match(normalized));
  return fallbackRule?.meta ?? DEFAULT_MODEL_META;
}
