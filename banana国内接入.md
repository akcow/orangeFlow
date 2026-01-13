# Gemini 图片生成 (NanoBanana)
Gemini 可以通过对话方式生成和处理图片。您可以使用文本、图片或两者结合来向模型发出提示，从而创建、修改和迭代视觉内容。

可用模型：

- gemini-2.5-flash-image (Nano Banana) - 快速高效，适合大批量、低延迟任务
- gemini-3-pro-image-preview (Nano Banana Pro) - 专业素材制作，支持高达 4K 分辨率

官方文档：Gemini Image Generation

## 文本生成图片¶
根据文本描述生成图片。

POST /v1beta/models/{model}:generateContent

### Body¶
| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| contents | array | 是 | 包含文本提示的内容数组 |
| generationConfig | object | 否 | 生成配置 |

### generationConfig.imageConfig 子属性¶
| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| aspectRatio | string | 宽高比。可选：1:1、16:9、9:16、4:3、3:4、3:2、2:3、5:4、4:5、21:9 |
| imageSize | string | 图片尺寸（仅 gemini-3-pro-image-preview）。可选：1K、2K、4K |

### generationConfig.responseModalities 说明¶
| 值 | 说明 |
| ---- | ---- |
| ["IMAGE"] | 仅返回图片 |
| ["TEXT", "IMAGE"] | 返回文本和图片（默认） |

### 请求示例¶

#### cURL
#### Python (官方 SDK)
```python
from google import genai
from google.genai import types

# 直接在 Client 中设置自定义 base URL
client = genai.Client(
    api_key="YOUR_API_KEY",
    http_options={"base_url": "https://new.12ai.org"}
)

response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=["draw a pig"],
    config=types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=types.ImageConfig(
            aspect_ratio="16:9",
            image_size="2K",
        ),
    ),
)

# 保存图片
for part in response.candidates[0].content.parts:
    if part.inline_data is not None:
        image = part.as_image()
        image.save("output.png")
        print("图片已保存为 output.png")
        break
    elif part.text:
        print("文本响应:", part.text)
```

### 响应示例¶
响应中的图片以 base64 编码的 inline_data 形式返回：
```json
{
  "candidates": [{
    "content": {
      "parts": [{
        "inline_data": {
          "mime_type": "image/png",
          "data": "<BASE64_IMAGE_DATA>"
        }
      }],
      "role": "model"
    },
    "finishReason": "STOP"
  }],
  "usageMetadata": {
    "promptTokenCount": 10,
    "candidatesTokenCount": 1290,
    "totalTokenCount": 1300
  }
}
```

## 图片编辑¶
提供图片和文本提示来修改图片。

### 限制
仅支持通过 inline_data 以 base64 方式上传图片。

### 请求示例¶
#### cURL
#### Python (官方 SDK)
```python
from google import genai
from google.genai import types
from PIL import Image

# 直接在 Client 中设置自定义 base URL
client = genai.Client(
    api_key="YOUR_API_KEY",
    http_options={"base_url": "https://new.12ai.org"}
)

# 加载图片
image = Image.open("input.jpg")

response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents=[
        "Add a wizard hat to the cat in this image",
        image,
    ],
)

# 保存编辑后的图片
for part in response.candidates[0].content.parts:
    if part.inline_data is not None:
        part.as_image().save("edited.png")
        print("编辑后的图片已保存为 edited.png")
        break
```

## 多轮图片对话¶
通过多轮对话迭代优化图片。

### 请求示例¶
```bash
# 第一轮：生成信息图
curl -s -X POST \
  "https://new.12ai.org/v1beta/models/gemini-3-pro-image-preview:generateContent?key=$API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "role": "user",
      "parts": [
        {"text": "Create an infographic about photosynthesis for a 4th grader"}
      ]
    }],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"]
    }
  }' > turn1.json

# 第二轮：将文字改为西班牙语
# 需要将第一轮的响应加入对话历史
```

### 在本项目（LangFlow 组件）中使用
- **多轮图片对话**：`DoubaoImageCreator` 支持自动维护并透传 `gemini_history`（字段 `enable_multi_turn`）。
- **历史存放位置**：输出的 `gemini_history` 与 `doubao_preview.payload.gemini_history`。
- **最大轮数**：默认 4 轮，可通过环境变量 `GEMINI_MULTI_TURN_MAX_TURNS` 调整（1–12）。

## 高级功能¶
### 高分辨率输出 (gemini-3-pro-image-preview)¶
```bash
curl -s -X POST \
  "https://new.12ai.org/v1beta/models/gemini-3-pro-image-preview:generateContent?key=$API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "A detailed butterfly illustration"}]}],
    "generationConfig": {
      "responseModalities": ["IMAGE"],
      "imageConfig": {
        "aspectRatio": "1:1",
        "imageSize": "4K"
      }
    }
  }'
```

### 使用 Google 搜索进行接地¶
根据实时信息生成图片：
```bash
curl -s -X POST \
  "https://new.12ai.org/v1beta/models/gemini-3-pro-image-preview:generateContent?key=$API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "Visualize the current weather forecast for San Francisco"}]}],
    "tools": [{"google_search": {}}],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"],
      "imageConfig": {"aspectRatio": "16:9"}
    }
  }'
```

#### 在本项目（LangFlow 组件）中使用
- **Google 搜索接地**：`DoubaoImageCreator` 提供开关 `enable_google_search`；也可用环境变量 `GEMINI_ENABLE_GOOGLE_SEARCH=1` 强制开启。
- **请求差异**：开启后会自动设置 `responseModalities=["TEXT","IMAGE"]` 并携带 `tools=[{"google_search":{}}]`。
- **兼容性**：部分国内代理/网关可能不支持 `google_search` tools，如遇 4xx 错误需在网关侧开启或关闭该开关。

### 多张参考图片 (gemini-3-pro-image-preview)¶
最多可使用 14 张参考图片：
- 最多 6 张高保真对象图片
- 最多 5 张人像照片（保持角色一致性）

## 宽高比和分辨率¶
### gemini-2.5-flash-image¶
| 宽高比 | 分辨率 | 令牌数 |
| ---- | ---- | ---- |
| 1:1 | 1024x1024 | 1290 |
| 16:9 | 1344x768 | 1290 |
| 9:16 | 768x1344 | 1290 |
| 4:3 | 1184x864 | 1290 |
| 3:4 | 864x1184 | 1290 |
| 3:2 | 1248x832 | 1290 |
| 2:3 | 832x1248 | 1290 |

### gemini-3-pro-image-preview¶
| 宽高比 | 1K 分辨率 | 2K 分辨率 | 4K 分辨率 |
| ---- | ---- | ---- | ---- |
| 1:1 | 1024x1024 | 2048x2048 | 4096x4096 |
| 16:9 | 1376x768 | 2752x1536 | 5504x3072 |
| 9:16 | 768x1376 | 1536x2752 | 3072x5504 |
| 4:3 | 1200x896 | 2400x1792 | 4800x3584 |
| 3:4 | 896x1200 | 1792x2400 | 3584x4800 |

## 提示技巧¶
### 逼真场景¶
使用摄影术语：拍摄角度、镜头类型、光线和细节。

A photorealistic close-up portrait of an elderly Japanese ceramicist
with deep wrinkles and a warm smile. Soft, golden hour light streaming
through a window. Captured with an 85mm portrait lens with soft bokeh.

### 风格化插画¶
明确说明样式：

A kawaii-style sticker of a happy red panda wearing a bamboo hat.
Bold, clean outlines, simple cel-shading, vibrant colors. White background.

### 准确的文字渲染¶
清楚说明文字内容和字体样式：

Create a modern, minimalist logo for a coffee shop called 'The Daily Grind'.
Clean, bold, sans-serif font. Black and white color scheme.
Put the logo in a circle. Use a coffee bean in a clever way.

## 限制¶
- 图片生成不支持音频或视频输入
- gemini-2.5-flash-image 最多接受 3 张输入图片
- gemini-3-pro-image-preview 最多接受 14 张输入图片
- 所有生成的图片都包含 SynthID 水印
- 推荐语言：英语、中文、日语、韩语、法语、德语、西班牙语等

我可以帮你把这份文档里的**代码示例**整理成可直接运行的脚本文件，需要吗？
