# Seedream 4.0-4.5 接入指南

Seedream 4.0-4.5 原生支持文本、单图和多图输入，实现基于主体一致性的多图融合创作、图像编辑、组图生成等多样玩法，让图像创作更加自由可控。本文以 Seedream 4.5 为例介绍如何调用 Image generation API 进行图像创作。如需使用 Seedream 4.0 模型，将下文代码示例中的 model 字段替换为 `doubao-seedream-4-0-250828` 即可。

## ⚠️ 注意事项

Seedream 4.5 模型首周（2025年12月03日-12月09日）公测，公测期间每个账号的 IPM 为 50，12月10日开始恢复为 500。

## 🎨 模型效果

| 场景 | 输入 | 输出 |
|------|------|------|
| 多参考图生图 | 输入多张参考图，融合它们的风格、元素等特征来生成新图像 | 将图1的服装换为图2的服装 |
| 组图生成 | 基于用户输入的文字和图片，生成一组内容关联的图像 | 参考图1，生成四图片，图中人物分别带着墨镜，骑着摩托，带着帽子，拿着棒棒糖 |

## 🔧 模型选择

### Seedream 4.5
作为字节跳动最新的图像生成模型，能力最强，在编辑一致性（如主体细节与光影色调的保持）、人像美化和小字生成方面体验升级。同时，模型的多图组合能力显著增强，推理能力与画面美学持续优化，能够更精准、更具艺术感地呈现创意。

### Seedream 4.0
图像生成模型，适用于平衡预算与图片输出质量的场景，能满足一般性的图像生成需求。

| 模型名称 | 版本 | 模型 ID（Model ID） | 模型能力 | 限流 IPM（每分钟生成图片数量上限） | 定价 |
|----------|------|---------------------|----------|------------------------------------|------|
| doubao-seedream-4.5 | 251128 `强烈推荐` | doubao-seedream-4-5-251128 | 文生图<br>图生图：单张图生图、多参考图生图<br>生成组图：文生组图、单张图生组图、多参考图生组图 | 50（1203-1210）；500（1211日及之后） | 图片生成模型 |
| doubao-seedream-4.0 | 250828 `推荐` | doubao-seedream-4-0-250828 | 文生图、图生图、生成组图 | 500 | 图片生成模型 |

## 📋 前提条件

1. 获取 API Key
2. 开通模型服务
3. 在模型列表获取所需 Model ID
4. 通过 Endpoint ID 调用模型服务

## 🚀 快速体验

### API 调用示例

#### Python 代码示例
```python
import os
from volcenginesdkarkruntime import Ark

client = Ark(
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    api_key=os.getenv("YOUR_API_KEY"),
)

imagesResponse = client.images.generate(
    model="doubao-seedream-4-5-251128",
    prompt="充满活力的特写编辑肖像，模特眼神犀利，头戴雕塑感帽子",
    size="2K",
    response_format="url",
    watermark=False
)

print(imagesResponse.data[0].url)
```

#### OpenAI 代码示例
```python
import os
from openai import OpenAI

client = OpenAI(
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    api_key=os.getenv("YOUR_API_KEY"),
)

imagesResponse = client.images.generate(
    model="doubao-seedream-4-5-251128",
    prompt="充满活力的特写编辑肖像，模特眼神犀利，头戴雕塑感帽子",
    size="2K",
    response_format="url",
    extra_body={
        "watermark": false,
    },
)

print(imagesResponse.data[0].url)
```

## 📖 基础使用

### 1. 文生图（纯文本输入单图输出）

通过给模型提供清晰准确的文字指令，即可快速获得符合描述的高质量单张图片。

### 2. 图文生图（单图输入单图输出）

基于已有图片，结合文字指令进行图像编辑，包括图像元素增删、风格转化、材质替换、色调迁移等。

### 3. 多图融合（多图输入单图输出）

根据您输入的文本描述和多张参考图片，融合它们的风格、元素等特征来生成新图像。

### 4. 组图输出（多图输出）

支持通过一张或者多张图片和文字信息，生成漫画分镜、品牌视觉等一组内容关联的图片。

## 💡 提示词建议

1. 建议用简洁连贯的自然语言写明 **主体 + 行为 + 环境**
2. 文本提示词（prompt）建议不超过300个汉字或600个英文单词

## 📝 使用限制

### 图片传入限制
- **图片格式**：jpeg、png、webp、bmp、tiff、gif
- **宽高比（宽 / 高）范围**：[1/16, 16]
- **宽高长度（px）**：> 14
- **大小**：不超过 10 MB
- **总像素**：不超过 6000×6000 px
- **最多支持传入 14 张参考图**

### 保存时间
任务数据（如任务状态、图片 URL 等）仅保留 24 小时，超时后会被自动清除。

### 限流说明
**RPM 限流**：账号下同模型（区分模型版本）每分钟生成图片数量上限。