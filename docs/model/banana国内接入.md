# Gemini 图片生成 (NanoBanana)

Gemini 可以通过对话方式生成和处理图片。您可以使用文本、图片或两者结合来向模型发出提示，从而创建、修改和迭代视觉内容。

## 可用模型

- **gemini-3.1-flash-image-preview (Nano Banana 2)** - 推荐首选，性能/智能/成本/延迟的最佳平衡，支持图片搜索接地
- **gemini-3-pro-image-preview (Nano Banana Pro)** - 专业素材制作，支持高达 4K 分辨率，高级推理能力
- **gemini-2.5-flash-image (Nano Banana)** - 快速高效，适合大批量、低延迟任务

官方文档：[Gemini Image Generation]()

---

## 文本生成图片

根据文本描述生成图片。

**POST /v1beta/models/{model}:generateContent**

### Body

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| contents | array | 是 | 包含文本提示的内容数组 |
| generationConfig | object | 否 | 生成配置 |

### generationConfig.imageConfig 子属性

| 参数 | 类型 | 说明 |
|------|------|------|
| aspectRatio | string | 宽高比。可选：1:1、1:4、1:8、2:3、3:2、3:4、4:1、4:3、4:5、5:4、8:1、9:16、16:9、21:9 |
| imageSize | string | 图片尺寸（仅 Gemini 3 系列）。可选：512px（仅 3.1 Flash）、1K、2K、4K |

### imageSize 大小写
imageSize 必须使用大写 K（如 1K、2K、4K）。小写参数（如 1k）会被拒绝。

### generationConfig.responseModalities 说明

| 值 | 说明 |
|------|------|
| ["IMAGE"] | 仅返回图片 |
| ["TEXT", "IMAGE"] | 返回文本和图片（默认） |

---

## 请求示例

### cURL
```bash
curl -s -X POST \
  "https://cdn.12ai.org/v1beta/models/gemini-3-pro-image-preview:generateContent?key=$API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [
        {"text": "Create a picture of a cute cat playing in the sunshine"}
      ]
    }],
    "generationConfig": {
      "responseModalities": ["IMAGE"],
      "imageConfig": {
        "aspectRatio": "16:9"
      }
    }
  }' \
  | grep -o '"data": "[^"]*"' \
  | cut -d'"' -f4 \
  | base64 --decode > output.png
```

### Python (官方 SDK)
```python
# 参考下文通用 SDK 写法
```

---

## 响应示例

响应中的图片以 base64 编码的 inlineData 形式返回：

```json
{
  "candidates": [{
    "content": {
      "parts": [{
        "inlineData": {
          "mimeType": "image/png",
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

---

# 图片编辑

提供图片和文本提示来修改图片。

### 限制
仅支持通过 inline_data 以 base64 方式上传图片。

## 请求示例

### cURL
```bash
# 将图片转为 base64
IMG_BASE64=$(base64 -w0 input.jpg)

curl -X POST \
  "https://cdn.12ai.org/v1beta/models/gemini-3-pro-image-preview:generateContent?key=$API_KEY" \
  -H 'Content-Type: application/json' \
  -d "{
    \"contents\": [{
      \"parts\": [
        {\"text\": \"Add a wizard hat to the cat in this image\"},
        {
          \"inline_data\": {
            \"mime_type\": \"image/jpeg\",
            \"data\": \"$IMG_BASE64\"
          }
        }
      ]
    }]
  }" \
  | grep -o '"data": "[^"]*"' \
  | cut -d'"' -f4 \
  | base64 --decode > edited.png
```

---

# 更多编辑场景

## 局部重绘（语义遮盖）

通过文本描述定义需要修改的区域，保持其余部分不变：

```python
from google import genai
from google.genai import types
from PIL import Image

client = genai.Client(
    api_key="YOUR_API_KEY",
    http_options={"base_url": "https://cdn.12ai.org"}
)

living_room = Image.open("living_room.png")

response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=[
        living_room,
        "Change only the blue sofa to be a vintage brown leather chesterfield sofa. "
        "Keep the rest of the room unchanged.",
    ],
)

for part in response.candidates[0].content.parts:
    if part.inline_data is not None:
        part.as_image().save("living_room_edited.png")
        break
```

## 风格迁移

将图片以不同的艺术风格重新创作：

```python
from google import genai
from google.genai import types
from PIL import Image

client = genai.Client(
    api_key="YOUR_API_KEY",
    http_options={"base_url": "https://cdn.12ai.org"}
)

city_image = Image.open("city.png")

response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=[
        city_image,
        "Transform this photograph into the artistic style of Vincent van Gogh's "
        "'Starry Night'. Preserve the original composition but render all elements "
        "with swirling, impasto brushstrokes and a palette of deep blues and bright yellows.",
    ],
)

for part in response.candidates[0].content.parts:
    if part.inline_data is not None:
        part.as_image().save("city_style_transfer.png")
        break
```

## 高级合成：组合多张图片

提供多张图片作为上下文，创建新的合成场景：

```python
from google import genai
from google.genai import types
from PIL import Image

client = genai.Client(
    api_key="YOUR_API_KEY",
    http_options={"base_url": "https://cdn.12ai.org"}
)

dress_image = Image.open("dress.png")
model_image = Image.open("model.png")

response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=[
        dress_image,
        model_image,
        "Create a professional e-commerce fashion photo. Take the blue floral dress "
        "from the first image and let the woman from the second image wear it. "
        "Generate a realistic full-body shot with natural lighting and shadows.",
    ],
)

for part in response.candidates[0].content.parts:
    if part.inline_data is not None:
        part.as_image().save("fashion_photo.png")
        break
```

---

# 多轮图片对话

通过多轮对话迭代优化图片。建议使用聊天或多轮对话的方式来迭代图片。

## 请求示例

### cURL
```bash
# 第一轮：生成信息图
curl -s -X POST \
  "https://cdn.12ai.org/v1beta/models/gemini-3-pro-image-preview:generateContent?key=$API_KEY" \
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

---

# Gemini 3 Pro Image 高级功能

Gemini 3 Pro Image (gemini-3-pro-image-preview) 针对专业素材制作进行了优化，具备以下高级能力：

- 高分辨率输出（1K / 2K / 4K）
- 高级文字渲染（信息图表、菜单、图表、营销素材）
- 使用 Google 搜索进行接地（基于实时数据生成图片）
- 思考模式（推理复杂提示，生成临时构思图片后输出最终结果）
- 最多 14 张参考图片输入

## 高分辨率输出

```bash
curl -s -X POST \
  "https://cdn.12ai.org/v1beta/models/gemini-3-pro-image-preview:generateContent?key=$API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "A detailed butterfly illustration in Da Vinci style"}]}],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"],
      "imageConfig": {
        "aspectRatio": "1:1",
        "imageSize": "4K"
      }
    }
  }'
```

## 使用 Google 搜索进行接地

模型可以使用 Google 搜索来验证事实，并根据实时数据（如天气、股票、近期活动）生成图片。

### 注意
将搜索与图片生成搭配使用时，基于图片的搜索结果不会传递给生成模型。响应中包含 groundingMetadata，其中有 searchEntryPoint 和 groundingChunks 字段。

```bash
curl -s -X POST \
  "https://cdn.12ai.org/v1beta/models/gemini-3-pro-image-preview:generateContent?key=$API_KEY" \
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

## 多张参考图片

最多可混合使用 14 张参考图片：
- 最多 6 张高保真对象图片（用于包含在最终图片中）
- 最多 5 张人物图片（保持角色一致性）

```python
from google import genai
from google.genai import types
from PIL import Image

client = genai.Client(
    api_key="YOUR_API_KEY",
    http_options={"base_url": "https://cdn.12ai.org"}
)

response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=[
        "An office group photo of these people, they are making funny faces.",
        Image.open("person1.png"),
        Image.open("person2.png"),
        Image.open("person3.png"),
        Image.open("person4.png"),
        Image.open("person5.png"),
    ],
    config=types.GenerateContentConfig(
        response_modalities=["TEXT", "IMAGE"],
        image_config=types.ImageConfig(
            aspect_ratio="5:4",
            image_size="2K",
        ),
    ),
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif image := part.as_image():
        image.save("office_group.png")
```

## 思考模式

Gemini 3 Pro Image 预览版会针对复杂提示使用推理流程（"思考"）。此功能默认启用且无法在 API 中停用。模型最多会生成两张临时"构思图片"来优化构图，最后输出最终的高质量图片。

查看思考过程：

```python
for part in response.parts:
    if part.thought:
        if part.text:
            print("思考:", part.text)
        elif image := part.as_image():
            image.show()  # 临时构思图片
    else:
        if part.text:
            print(part.text)
        elif image := part.as_image():
            image.save("final.png")
```

### 思考签名
所有响应都包含 thought_signature 字段，这是模型内部思考过程的加密表示。在多轮对话中，如果您手动管理对话历史，需要将 thought_signature 原样传递回下一轮。使用官方 SDK 的聊天功能（client.chats.create）时，签名会被自动处理，无需手动管理。

---

# Gemini 3.1 Flash Image 新增功能

Gemini 3.1 Flash Image (gemini-3.1-flash-image-preview) 是 Gemini 3 系列的高效版本，在性能、智能、成本和延迟之间实现了最佳平衡。

## Google 图片搜索接地

仅 Gemini 3.1 Flash Image 支持。模型可以使用通过 Google 图片搜索检索到的网络图片作为视觉背景信息。

```python
from google import genai
from google.genai import types

client = genai.Client(
    api_key="YOUR_API_KEY",
    http_options={"base_url": "https://cdn.12ai.org"}
)

response = client.models.generate_content(
    model="gemini-3.1-flash-image-preview",
    contents="A detailed painting of a Timareta butterfly resting on a flower",
    config=types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        tools=[
            types.Tool(google_search=types.GoogleSearch(
                search_types=types.SearchTypes(
                    web_search=types.WebSearch(),
                    image_search=types.ImageSearch()
                )
            ))
        ]
    ),
)

# 显示来源信息（如果可用）
if response.candidates and response.candidates[0].grounding_metadata:
    print(response.candidates[0].grounding_metadata.search_entry_point.rendered_content)

for part in response.parts:
    if image := part.as_image():
        image.save("butterfly.png")
```

### 图片来源展示要求
使用图片搜索接地时，您必须：
- 以用户能够识别为链接的方式，提供指向包含来源图片的网页的链接
- 如显示来源图片，必须提供从来源图片到其所在网页的直接点击路径

API 响应中的 groundingMetadata 包含：
- imageSearchQueries：模型用于视觉上下文的具体查询
- groundingChunks：来源信息（包含 uri 着陆页和 image_uri 直接图片网址）
- searchEntryPoint：符合展示要求的 HTML 和 CSS

## 控制思考等级

Gemini 3.1 Flash Image 允许控制模型使用的思考量，以平衡质量和延迟。默认级别为 minimal，支持 minimal 和 high。

```python
from google import genai
from google.genai import types

client = genai.Client(
    api_key="YOUR_API_KEY",
    http_options={"base_url": "https://cdn.12ai.org"}
)

response = client.models.generate_content(
    model="gemini-3.1-flash-image-preview",
    contents="A futuristic city built inside a giant glass bottle floating in space",
    config=types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        thinking_config=types.ThinkingConfig(
            thinking_level="high",
            include_thoughts=True  # 是否返回思考过程
        ),
    ),
)

for part in response.parts:
    if part.thought:  # 跳过思考输出
        continue
    if image := part.as_image():
        image.save("city.png")
```

### 思考令牌计费
无论 include_thoughts 设置为 true 还是 false，思考令牌都会被计费，因为思考过程默认会进行。

## 512px 分辨率

Gemini 3.1 Flash Image 新增了较小的 512 像素 (0.5K) 分辨率选项，适合需要快速预览或低带宽场景。

```python
response = client.models.generate_content(
    model="gemini-3.1-flash-image-preview",
    contents="A cute cat icon",
    config=types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=types.ImageConfig(
            aspect_ratio="1:1",
            image_size="512px",
        ),
    ),
)
```

## 参考图片限制

Gemini 3.1 Flash Image 支持：
- 最多 **10 张**高保真对象图片（用于包含在最终图片中）
- 最多 **4 张**人物图片（保持角色一致性）

---

# 宽高比和分辨率

## gemini-2.5-flash-image

| 宽高比 | 分辨率 | 令牌数 |
|--------|--------|--------|
| 1:1 | 1024x1024 | 1290 |
| 2:3 | 832x1248 | 1290 |
| 3:2 | 1248x832 | 1290 |
| 3:4 | 864x1184 | 1290 |
| 4:3 | 1184x864 | 1290 |
| 4:5 | 896x1152 | 1290 |
| 5:4 | 1152x896 | 1290 |
| 9:16 | 768x1344 | 1290 |
| 16:9 | 1344x768 | 1290 |
| 21:9 | 1536x672 | 1290 |

## gemini-3.1-flash-image-preview

| 宽高比 | 512px 分辨率 | 512px 令牌 | 1K 分辨率 | 1K 令牌 | 2K 分辨率 | 2K 令牌 | 4K 分辨率 | 4K 令牌 |
|--------|--------------|------------|-----------|---------|-----------|---------|-----------|---------|
| 1:1 | 512x512 | 747 | 1024x1024 | 1120 | 2048x2048 | 1120 | 4096x4096 | 2000 |
| 1:4 | 256x1024 | 747 | 512x2048 | 1120 | 1024x4096 | 1120 | 2048x8192 | 2000 |
| 1:8 | 192x1536 | 747 | 384x3072 | 1120 | 768x6144 | 1120 | 1536x12288 | 2000 |
| 2:3 | 424x632 | 747 | 848x1264 | 1120 | 1696x2528 | 1120 | 3392x5056 | 2000 |
| 3:2 | 632x424 | 747 | 1264x848 | 1120 | 2528x1696 | 1120 | 5056x3392 | 2000 |
| 3:4 | 448x600 | 747 | 896x1200 | 1120 | 1792x2400 | 1120 | 3584x4800 | 2000 |
| 4:1 | 1024x256 | 747 | 2048x512 | 1120 | 4096x1024 | 1120 | 8192x2048 | 2000 |
| 4:3 | 600x448 | 747 | 1200x896 | 1120 | 2400x1792 | 1120 | 4800x3584 | 2000 |
| 4:5 | 464x576 | 747 | 928x1152 | 1120 | 1856x2304 | 1120 | 3712x4608 | 2000 |
| 5:4 | 576x464 | 747 | 1152x928 | 1120 | 2304x1856 | 1120 | 4608x3712 | 2000 |
| 8:1 | 1536x192 | 747 | 3072x384 | 1120 | 6144x768 | 1120 | 12288x1536 | 2000 |
| 9:16 | 384x688 | 747 | 768x1376 | 1120 | 1536x2752 | 1120 | 3072x5504 | 2000 |
| 16:9 | 688x384 | 747 | 1376x768 | 1120 | 2752x1536 | 1120 | 5504x3072 | 2000 |
| 21:9 | 792x168 | 747 | 1584x672 | 1120 | 3168x1344 | 1120 | 6336x2688 | 2000 |

---

# 提示技巧

## 逼真场景
使用摄影术语：拍摄角度、镜头类型、光线和细节。

```text
A photorealistic close-up portrait of an elderly Japanese ceramicist
with deep wrinkles and a warm smile. Soft, golden hour light streaming
through a window. Captured with an 85mm portrait lens with soft bokeh.
```

## 风格化插画
明确说明样式：

```text
A kawaii-style sticker of a happy red panda wearing a bamboo hat.
Bold, clean outlines, simple cel-shading, vibrant colors. White background.
```

## 准确的文字渲染
清楚说明文字内容和字体样式：

```text
Create a modern, minimalist logo for a coffee shop called 'The Daily Grind'.
Clean, bold, sans-serif font. Black and white color scheme.
Put the logo in a circle. Use a coffee bean in a clever way.
```

---

# 限制

- 图片生成不支持音频或视频输入
- 模型不一定会严格按照用户要求的图片输出数量生成图片
- 参考图片限制：
  - gemini-2.5-flash-image：最多 3 张输入图片
  - gemini-3.1-flash-image-preview：最多 10 张对象图片 + 4 张人物图片，总共最多 14 张
  - gemini-3-pro-image-preview：最多 6 张对象图片 + 5 张人物图片，总共最多 14 张
- 所有生成的图片都包含 SynthID 水印
- 为图片生成文字时，建议先生成文字再要求生成包含该文字的图片
- 推荐语言：英语、中文、日语、韩语、法语、德语、西班牙语、葡萄牙语、俄语、意大利语等

---

# 模型选择

| 模型 | 适用场景 | 特点 |
|------|----------|------|
| gemini-3.1-flash-image-preview | 推荐首选，日常图片生成 | 性能/成本/延迟最佳平衡，支持图片搜索接地、思考等级控制、512px-4K 分辨率 |
| gemini-3-pro-image-preview | 专业素材制作、复杂指令 | 支持 4K、高级推理、搜索接地、14 张参考图 |
| gemini-2.5-flash-image | 大批量、低延迟任务 | 速度快，1024px 分辨率 |