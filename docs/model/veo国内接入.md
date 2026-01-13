# Gemini Veo 视频生成 API 文档
本文档介绍如何使用 Gemini Veo 模型进行视频生成，包括文生视频、图生视频、帧插值和参考图片等功能。

## 支持的模型
| 模型 | 版本 | 速度 | 输出 | 图生视频 | 帧插值 | 参考图片 |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| veo-3.1-generate-preview | 3.1 | 标准 | 带音频 | ✅ 单图 | ✅ 双图 | ✅ 最多3张 |
| veo-3.1-fast-generate-preview | 3.1 | 快速 | 带音频 | ✅ 单图 | ✅ 双图 | ❌ 不支持 |

版本特性：
- Veo 3.1 标准版：支持文生视频、图生视频（单图）、帧插值（双图）和参考图片功能，输出视频包含音频
- Veo 3.1 快速版：支持文生视频、图生视频（单图）、帧插值（双图），不支持参考图片，生成速度更快

推荐使用：
- 需要帧插值（首尾帧生成）→ veo-3.1-generate-preview 或 veo-3.1-fast-generate-preview
- 需要参考图片功能 → 仅 veo-3.1-generate-preview（标准版）
- 快速生成 → veo-3.1-fast-generate-preview

## API 端点
推荐使用 OpenAI 兼容接口：
```
POST /v1/videos              # 提交视频生成任务
GET  /v1/videos/:task_id     # 查询任务状态
```
本文档使用 /v1/videos 接口作为示例。

## 基础用法
### 1. 文生视频（Text-to-Video）
最简单的使用方式，仅通过文本描述生成视频。

请求示例：
```bash
curl -X POST https://new.12ai.org/v1/videos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "veo-3.1-fast-generate-preview",
    "prompt": "一只可爱的橘猫在阳光明媚的花园里追逐蝴蝶，慢动作镜头，电影级画质"
  }'
```

响应示例：
```json
{
  "id": "bW9kZWxzL3Zlby0zLjEtZmFzdC1nZW5lcmF0ZS1wcmV2aWV3L29wZXJhdGlvbnMveHh4",
  "task_id": "bW9kZWxzL3Zlby0zLjEtZmFzdC1nZW5lcmF0ZS1wcmV2aWV3L29wZXJhdGlvbnMveHh4",
  "object": "video",
  "model": "veo-3.1-fast-generate-preview",
  "status": "",
  "progress": 0,
  "created_at": 1704672000
}
```

### 2. 图生视频（Image-to-Video）
使用一张图片作为视频的第一帧，让图片"动起来"。

请求示例：
```bash
curl -X POST https://new.12ai.org/v1/videos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "veo-3.1-fast-generate-preview",
    "prompt": "猫咪开始奔跑，镜头跟随",
    "images": [
      "https://example.com/cat-sitting.jpg"
    ]
  }'
```
注意： 仅使用一张图片时，该图片会作为视频的第一帧。

或使用 base64 编码：
```bash
curl -X POST https://new.12ai.org/v1/videos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "veo-3.1-fast-generate-preview",
    "prompt": "猫咪开始奔跑，镜头跟随",
    "images": [
      "iVBORw0KGgoAAAANSUhEUgAA..."
    ]
  }'
```

### 3. 帧插值（Frame Interpolation）
指定视频的第一帧和最后一帧，AI 自动生成中间的过渡动画。

重要限制：
- ⚠️ durationSeconds 必须为 8（不能是 4 或 6 秒）
- 必须同时提供两张图片（首帧和尾帧）
- ⚠️ 不能同时使用参考图片（referenceImages），两个功能互斥

请求示例：
```bash
curl -X POST https://new.12ai.org/v1/videos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "veo-3.1-fast-generate-preview",
    "prompt": "平滑过渡，自然变化",
    "images": [
      "https://example.com/frame-start.jpg",
      "https://example.com/frame-end.jpg"
    ],
    "metadata": {
      "durationSeconds": 8
    }
  }'
```

说明：
- images[0] - 视频的第一帧
- images[1] - 视频的最后一帧
- durationSeconds - 必须为 8 秒（帧插值的强制要求）
- AI 会自动生成中间的过渡帧

常见错误：

使用错误的时长：
```json
{
  "error": {
    "code": 400,
    "message": "Your use case is currently not supported.",
    "status": "INVALID_ARGUMENT"
  }
}
```
解决方案：将 durationSeconds 改为 8（不能使用 4 或 6 秒）

同时使用帧插值和参考图片：
```json
{
  "error": {
    "code": 400,
    "message": "`referenceImages` isn't supported by this model.",
    "status": "INVALID_ARGUMENT"
  }
}
```
解决方案：帧插值和参考图片功能互斥，只能二选一

## 高级用法
### 4. 使用参考图片（Reference Images）
⚠️ 重要：此功能仅 veo-3.1-generate-preview（标准版）支持，快速版不支持！

参考图片用于引导视频的风格、构图和内容，参考图片不会直接出现在视频中，而是作为"艺术指导"。

重要限制：
- ⚠️ 仅支持 veo-3.1-generate-preview（标准版），veo-3.1-fast-generate-preview 不支持
- ⚠️ 不能与 images 同时使用（不能和图生视频、帧插值组合）
- ⚠️ durationSeconds 必须为 8
- 最多 3 张参考图片
- 仅支持 16:9 宽高比
- referenceType 只支持 "asset"

请求示例：
```bash
curl -X POST https://new.12ai.org/v1/videos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "veo-3.1-generate-preview",
    "prompt": "一只可爱的猫咪在花园里玩耍",
    "metadata": {
      "aspectRatio": "16:9",
      "durationSeconds": 8,
      "referenceImages": [
        {
          "image": {
            "bytesBase64Encoded": "https://example.com/style-ref1.jpg"
          },
          "referenceType": "asset"
        },
        {
          "image": {
            "bytesBase64Encoded": "https://example.com/style-ref2.jpg"
          },
          "referenceType": "asset"
        }
      ]
    }
  }'
```

### 5. 完整参数配置示例（图生视频 + metadata）
```bash
curl -X POST https://new.12ai.org/v1/videos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "veo-3.1-fast-generate-preview",
    "prompt": "让画面动起来，镜头缓慢推进",
    "images": [
      "https://example.com/start-frame.jpg"
    ],
    "metadata": {
      "aspectRatio": "16:9",
      "durationSeconds": 6,
      "negativePrompt": "模糊，低质量，变形",
      "personGeneration": "allow_adult"
    }
  }'
```

## 参数详解
### 必需参数
| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| model | string | 模型名称：veo-3.1-generate-preview 或 veo-3.1-fast-generate-preview |
| prompt | string | 视频生成的文本描述（最多 1024 个词元） |

### 可选参数
#### images（图片数组）
| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| images | array | 图片数组，支持多种格式 |
| images[0] | string | 第一帧图片（图生视频或帧插值的起始帧） |
| images[1] | string | 最后一帧图片（帧插值的结束帧） |

图片格式支持：
- ✅ HTTP(S) URL：https://example.com/image.jpg（自动下载）
- ✅ Base64 字符串：iVBORw0KGgoAAAANSUhEUg...
- ✅ Data URI：data:image/png;base64,iVBORw0KGgo...

#### metadata（高级配置）
所有 metadata 参数完全遵循 Gemini 官方 API 文档。

| 参数 | 类型 | 默认值 | 说明 |
| ---- | ---- | ---- | ---- |
| aspectRatio | string | - | 视频宽高比，可选：16:9 或 9:16 |
| durationSeconds | number | - | 视频时长（秒），可选：4、6 或 8<br>⚠️ 帧插值和参考图片时必须为 8 |
| negativePrompt | string | - | 负面提示词，描述不想要的元素 |
| personGeneration | string | - | 人物生成策略：<br>• allow_adult - 允许成人人物（推荐使用）<br>• ❌ allow_all - 不支持，会报错<br>• 不填 - 使用默认策略 |
| resolution | string | - | 视频分辨率（具体值参考官方文档） |
| referenceImages | array | - | 参考图片数组（⚠️ 仅标准版支持，不能与 images 同时用，最多 3 张） |

#### referenceImages（参考图片）
每个参考图片对象包含：

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| image | object | 图片对象 |
| image.bytesBase64Encoded | string | 图片数据，支持：<br>• Base64 字符串<br>• HTTP(S) URL（自动下载转换）<br>• Data URI |
| image.mimeType | string | 图片 MIME 类型，如 image/png、image/jpeg（可选） |
| referenceType | string | 参考类型，通常为 asset |

示例：
```json
{
  "referenceImages": [
    {
      "image": {
        "bytesBase64Encoded": "https://example.com/style.jpg"
      },
      "referenceType": "asset"
    },
    {
      "image": {
        "bytesBase64Encoded": "iVBORw0KGgoAAAANSUhEUg...",
        "mimeType": "image/png"
      },
      "referenceType": "asset"
    }
  ]
}
```

## 查询任务状态
提交任务后，可以通过返回的 task_id 查询视频生成状态。
```bash
curl -X GET https://new.12ai.org/v1/videos/dmlkZW9fdGFzay0xMjM0NTY3ODkw \
  -H "Authorization: Bearer YOUR_API_KEY"
```

响应示例（处理中）：
```json
{
  "id": "bW9kZWxzL3Zlby0zLjEtZmFzdC1nZW5lcmF0ZS1wcmV2aWV3L29wZXJhdGlvbnMveHh4",
  "task_id": "bW9kZWxzL3Zlby0zLjEtZmFzdC1nZW5lcmF0ZS1wcmV2aWV3L29wZXJhdGlvbnMveHh4",
  "model": "veo-3.1-fast-generate-preview",
  "object": "video",
  "status": "in_progress",
  "progress": 50,
  "created_at": 1704672000
}
```

响应示例（完成）：
```json
{
  "id": "bW9kZWxzL3Zlby0zLjEtZmFzdC1nZW5lcmF0ZS1wcmV2aWV3L29wZXJhdGlvbnMveHh4",
  "task_id": "bW9kZWxzL3Zlby0zLjEtZmFzdC1nZW5lcmF0ZS1wcmV2aWV3L29wZXJhdGlvbnMveHh4",
  "model": "veo-3.1-fast-generate-preview",
  "object": "video",
  "status": "completed",
  "progress": 100,
  "created_at": 1704672000,
  "completed_at": 1704672060
}
```

状态说明：
- "" (空字符串)	已提交，等待处理
- in_progress	处理中
- completed	生成成功
- failure	生成失败

## 下载视频
视频生成成功后，通过 /v1/videos/{task_id}/content 下载：
```bash
curl -O https://new.12ai.org/v1/videos/{task_id}/content \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 使用场景总结
| 场景 | images 数量 | referenceImages | 时长要求 | 模型要求 |
| ---- | ---- | ---- | ---- | ---- |
| 文生视频 | 0 | ❌ 不使用 | 4/6/8秒 | 标准版 / 快速版 |
| 图生视频（单图） | 1 | ❌ 不使用 | 4/6/8秒 | 标准版 / 快速版 |
| 帧插值（双图） | 2 | ❌ 不支持 | 仅8秒 | 标准版 / 快速版 |
| 参考图片 | 0 | ✅ 必需（1-3 张） | 仅8秒 | 仅标准版 |

重要说明：
- ⚠️ 参考图片功能仅标准版（veo-3.1-generate-preview）支持，快速版不支持
- ⚠️ 参考图片不能与 images 同时使用
- ⚠️ 帧插值和参考图片的 durationSeconds 必须为 8

## 注意事项
- 图片格式灵活：所有图片字段（images、referenceImages）都支持 URL、Base64、Data URI 三种格式
- 参考图片限制：最多 3 张，仅标准版支持，不能与 images 同时使用
- 帧插值时长限制：使用帧插值功能时，durationSeconds 必须为 8
- 参考图片时长限制：使用参考图片功能时，durationSeconds 必须为 8
- 首尾帧自动处理：images[0] 自动作为首帧，images[1] 自动作为尾帧
- 异步处理：视频生成为异步任务，需要轮询查询状态

## 错误处理
常见错误：

| 错误信息 | 原因 | 解决方案 |
| ---- | ---- | ---- |
| referenceImages isn't supported by this model | 使用快速版或同时使用 images | 改用标准版，且不要同时使用 images |
| Your use case is currently not supported | 帧插值或参考图片时长不是 8 秒 | 将 durationSeconds 改为 8 |
| allow_all for personGeneration is currently not supported | 使用了不支持的 allow_all 值 | 改用 allow_adult 或移除该参数 |
| too many reference images | 超过 3 张参考图片 | 限制在 3 张以内 |
| failed to download image | URL 图片下载失败 | 检查 URL 是否可访问 |
| invalid base64 | Base64 格式错误 | 检查 base64 编码是否正确 |

## 完整 Python 示例
```python
import requests
import time
import json
import sys

API_BASE = "https://new.12ai.org"
API_KEY = "YOUR_API_KEY"

headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {API_KEY}"
}

# 测试图片
IMG1 = "https://example.com/image1.jpg"
IMG2 = "https://example.com/image2.jpg"

# 测试场景定义
TEST_CASES = {
    "1": {
        "name": "图生视频（单图作为首帧）",
        "payload": {
            "model": "veo-3.1-fast-generate-preview",
            "prompt": "让画面中的主体动起来，镜头缓慢推进，电影级画质",
            "images": [IMG1]
        }
    },
    "2": {
        "name": "帧插值（首尾帧生成中间过渡）",
        "payload": {
            "model": "veo-3.1-fast-generate-preview",
            "prompt": "平滑过渡，自然变化",
            "images": [IMG1, IMG2],
            "metadata": {"durationSeconds": 8}
        }
    },
    "3": {
        "name": "纯文生视频",
        "payload": {
            "model": "veo-3.1-fast-generate-preview",
            "prompt": "一只可爱的橘猫在花园里追逐蝴蝶，慢动作镜头"
        }
    },
    "4": {
        "name": "图生视频 + metadata参数",
        "payload": {
            "model": "veo-3.1-fast-generate-preview",
            "prompt": "让画面动起来，镜头缓慢推进",
            "images": [IMG1],
            "metadata": {
                "aspectRatio": "16:9",
                "durationSeconds": 6,
                "negativePrompt": "模糊，低质量，变形",
                "personGeneration": "allow_adult"
            }
        }
    },
    "5": {
        "name": "竖屏视频（9:16）",
        "payload": {
            "model": "veo-3.1-fast-generate-preview",
            "prompt": "一个人在城市街道上行走",
            "metadata": {"aspectRatio": "9:16", "durationSeconds": 4}
        }
    },
    "6": {
        "name": "文生视频 + 参考图片（仅标准版支持）",
        "payload": {
            "model": "veo-3.1-generate-preview",
            "prompt": "一只可爱的猫咪在花园里玩耍",
            "metadata": {
                "aspectRatio": "16:9",
                "durationSeconds": 8,
                "referenceImages": [
                    {"image": {"bytesBase64Encoded": IMG1}, "referenceType": "asset"},
                    {"image": {"bytesBase64Encoded": IMG2}, "referenceType": "asset"}
                ]
            }
        }
    }
}

# 选择测试场景
print("=" * 50)
print("Gemini Veo API 功能测试")
print("=" * 50)
for key, case in TEST_CASES.items():
    print(f"  {key}. {case['name']}")
print("=" * 50)

choice = sys.argv[1] if len(sys.argv) > 1 else input("请选择测试场景 (1-6): ").strip()
if choice not in TEST_CASES:
    print(f"无效选择: {choice}")
    sys.exit(1)

selected = TEST_CASES[choice]
print(f"\n>>> 运行测试: {selected['name']}")
payload = selected["payload"]
print(f"请求参数:\n{json.dumps(payload, ensure_ascii=False, indent=2)}\n")

# 提交任务
response = requests.post(f"{API_BASE}/v1/videos", headers=headers, json=payload)
result = response.json()
print(f"API 返回: {json.dumps(result, ensure_ascii=False, indent=2)}")

# 检查错误
if "error" in result:
    print(f"请求失败: {result['error']}")
    sys.exit(1)

task_id = result.get("task_id")
if not task_id:
    print(f"未找到 task_id，完整响应: {result}")
    sys.exit(1)

print(f"任务已提交，task_id: {task_id}")

# 轮询查询状态
while True:
    response = requests.get(f"{API_BASE}/v1/videos/{task_id}", headers=headers)
    status = response.json()

    current_status = status.get('status', '')
    progress = status.get('progress', 'N/A')
    print(f"状态: {current_status}, 进度: {progress}")

    if current_status == "completed":
        video_url = f"{API_BASE}/v1/videos/{task_id}/content"
        print(f"视频生成成功！URL: {video_url}")
        break
    elif current_status == "failure":
        print(f"视频生成失败: {status.get('fail_reason', 'Unknown error')}")
        break

    time.sleep(5)

# 下载视频
if current_status == "completed":
    response = requests.get(video_url, headers=headers)
    with open("output_video.mp4", "wb") as f:
        f.write(response.content)
    print("视频已下载到 output_video.mp4")
```
