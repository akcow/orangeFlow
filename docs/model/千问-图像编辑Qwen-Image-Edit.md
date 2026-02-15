 ```markdown
# 千问-图像编辑模型

千问-图像编辑模型支持多图输入和多图输出，可精确修改图内文字、增删或移动物体、改变主体动作、迁移图片风格及增强画面细节。

## 快速开始

本示例将演示如何使用 `qwen-image-edit-max` 模型，根据3张输入图像和提示词，生成2张编辑后的图像。

**输入提示词：** 图1中的女生穿着图2中的黑色裙子按图3的姿势坐下。

### 输入图像

| 输入图像1 | 输入图像2 | 输入图像3 |
|:---------:|:---------:|:---------:|
| image99 | image98 | image89 |

### 输出图像（多张图像）

| 输出图像1 | 输出图像2 |
|:---------:|:---------:|
| image100 | imageout2 |

---

## 环境准备

在调用前，您需要获取 API Key，再配置 API Key 到环境变量。

如需通过 SDK 进行调用，请安装 DashScope SDK。目前，该 SDK 已支持 Python 和 Java。

> **注意：** 千问-图像编辑模型系列模型均支持传入 1-3 张图像。其中，`qwen-image-edit-max` 和 `qwen-image-edit-plus` 系列模型支持生成 1-6 张图像，`qwen-image-edit` 模型仅支持生成1张图像。生成的图像 URL 链接有效期为24小时，请及时通过 URL 下载图像到本地。

---

## 代码示例

### Python

```python
import json
import os
from dashscope import MultiModalConversation
import dashscope

# 以下为中国（北京）地域url，若使用新加坡地域的模型，需将url替换为：https://dashscope-intl.aliyuncs.com/api/v1 
dashscope.base_http_api_url = 'https://dashscope.aliyuncs.com/api/v1'

# 模型支持输入1-3张图片
messages = [
    {
        "role": "user",
        "content": [
            {"image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/thtclx/input1.png"},
            {"image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/iclsnx/input2.png"},
            {"image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/gborgw/input3.png"},
            {"text": "图1中的女生穿着图2中的黑色裙子按图3的姿势坐下"}
        ]
    }
]

# 新加坡和北京地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key 
# 若没有配置环境变量，请用百炼 API Key 将下行替换为：api_key="sk-xxx"
api_key = os.getenv("DASHSCOPE_API_KEY")

# qwen-image-edit-max、qwen-image-edit-plus系列支持输出1-6张图片，此处以2张为例
response = MultiModalConversation.call(
    api_key=api_key,
    model="qwen-image-edit-max",
    messages=messages,
    stream=False,
    n=2,
    watermark=False,
    negative_prompt="",
    prompt_extend=True,
    size="1024*1536",
)

if response.status_code == 200:
    # 如需查看完整响应，请取消下行注释
    # print(json.dumps(response, ensure_ascii=False))
    for i, content in enumerate(response.output.choices[0].message.content):
        print(f"输出图像{i+1}的URL:{content['image']}")
else:
    print(f"HTTP返回码：{response.status_code}")
    print(f"错误码：{response.code}")
    print(f"错误信息：{response.message}")
    print("请参考文档：https://help.aliyun.com/zh/model-studio/error-code")
```

### Java

（请参考官方文档获取 Java SDK 调用示例）

### cURL

（请参考官方文档获取 cURL 调用示例）

---

## 响应示例

（请参见通过 URL 下载图像到本地）

---

## 模型选型建议

| 模型 | 特点 | 推荐场景 |
|------|------|----------|
| **qwen-image-edit-max** 系列 | 旗舰级图像编辑模型，具备更稳定、丰富的编辑能力 | 对编辑质量有高要求的场景 |
| **qwen-image-edit-plus** 系列 | 提供强大的通用编辑能力，在文本编辑、工业设计、几何推理及角色一致性方面表现突出 | 通用编辑场景 |
| **qwen-image-edit** | 不支持多图输出、调整输出图像分辨率和提示词智能优化等功能 | **建议替换为 qwen-image-edit-plus 模型** |

> 各地域支持的模型请参见模型列表。

---

## 输入说明

### 输入图像（messages）

`messages` 是一个数组，且必须仅包含一个对象。该对象需包含 `role` 和 `content` 属性。其中 `role` 必须设置为 `user`，`content` 需要同时包含 `image`（1-3张图像）和 `text`（一条编辑指令）。

**输入图片必须满足以下要求：**

- **图片格式：** JPG、JPEG、PNG、BMP、TIFF、WEBP 和 GIF。
  - 输出图像为 PNG 格式，对于 GIF 动图，仅处理其第一帧。
- **图片分辨率：** 为获得最佳效果，建议图像的宽和高均在 384 像素至 3072 像素之间。分辨率过低可能导致生成效果模糊，过高则会增加处理时长。
- **文件大小：** 单张图片文件大小不得超过 10MB。

```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        { "image": "图1的公网URL或Base64数据" },
        { "image": "图2的公网URL或Base64数据" },
        { "image": "图3的公网URL或Base64数据" },
        { "text": "您的编辑指令，例如：'图1中的女生穿着图2中的黑色裙子按图3的姿势坐下'" }
      ]
    }
  ]
}
```

### 图像输入顺序

多图输入时，按照数组顺序定义图像顺序，编辑指令需要与 `content` 中的图像顺序对应（如"图1"、"图2"）。

**示例：**

| 输入图像1 | 输入图像2 | 输出图像 |
|:---------:|:---------:|:--------:|
| image95 | image96 | 5 |

**指令对比：**
- 将图1中女生的衣服替换为图2中女生的衣服
- 将图2中女生的衣服替换为图1中女生的衣服

### 图像传入方式

#### 公网 URL

提供一个公网可访问的图像地址，支持 HTTP 或 HTTPS 协议。本地文件请参见上传文件获取临时 URL。

**示例值：** `https://xxxx/img.png`

#### Base64 编码

将图像文件转换为 Base64 编码字符串，并按格式拼接：`data:{mime_type};base64,{base64_data}`

- `{mime_type}`：图像的媒体类型，需与文件格式对应。
- `{base64_data}`：文件经过 Base64 编码后的字符串。

**示例值：** `data:image/jpeg;base64,GDU7MtCZz...`（示例已截断，仅做演示）

完整示例代码请参见 [Python SDK 调用](#)、[Java SDK 调用](#)。

---

## 更多参数

可以通过以下可选参数调整生成效果：

| 参数 | 说明 | 默认值 | 适用范围 |
|------|------|--------|----------|
| `n` | 指定输出图像数量 | 1 | `qwen-image-edit-max` 和 `qwen-image-edit-plus` 支持 1-6 张；`qwen-image-edit` 仅支持 1 张 |
| `negative_prompt` | 反向提示词，描述不希望在画面中出现的内容，如"模糊"、"多余的手指"等 | - | 全部 |
| `watermark` | 是否在图像右下角添加 "Qwen-Image" 水印 | `false` | 全部 |
| `seed` | 随机数种子，取值范围 `[0, 2147483647]` | 自动生成 | 全部 |

**以下参数仅 `qwen-image-edit-max`、`qwen-image-edit-plus` 系列模型支持：**

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `size` | 设置输出图像的分辨率，格式为 `宽*高`，例如 `"1024*2048"`，宽和高的取值范围均为 `[512, 2048]` 像素。若不设置，输出图像将保持与原图（多图输入时为最后一张图）相似的长宽比，总像素接近 `1024*1024` 分辨率。 | - |
| `prompt_extend` | 是否开启 prompt 智能改写功能 | `true` |

完整参数列表请参考 [千问-图像编辑 API](#)。

---

## 效果概览

### 多图融合

| 输入图像1 | 输入图像2 | 输入图像3 | 输出图像 |
|:---------:|:---------:|:---------:|:--------:|
| image83 | image103 | 1 | 2 |

**指令：** 图1中的女生戴着图2中的项链，左肩挎着图3中的包

### 主体一致性保持

| 输入图像 | 输出图像1 | 输出图像2 | 输出图像3 |
|:--------:|:---------:|:---------:|:---------:|
| image5 | image4 | image6 | image7 |

**指令示例：**
- 修改为蓝底证件照，人物穿上白色衬衫，黑色西装，打着条纹领带
- 人物穿上白色衬衫，灰色西装，打着条纹领带，一只手摸着领带，浅色背景
- 人物穿着粗笔刷字体的"千问图像"的黑色卫衣，依靠在护栏边，阳光照在发丝上，身后是大桥和海

| 输入图像 | 输出图像1 | 输出图像2 |
|:--------:|:---------:|:---------:|
| image12 | image13 | image14 |

**指令：**
- 把这个空调放在客厅，沙发旁边
- 在空调出风口增加雾气，一直到沙发上，并且增加绿叶

| 输入图像 | 输出图像 |
|:--------:|:--------:|
| image15 | - |

**指令：** 在上方增加白色的手写体"自然新风 畅享呼吸"

### 草图创作

| 输入图像 | 输出图像 |
|:--------:|:--------:|
| image42 | image43 |

**指令：** 生成一张图像，符合图1所勾勒出的精致形状，并遵循以下描述：一位年轻的女子在阳光明媚的日子里微笑着，她戴着一副棕色的圆形太阳镜，镜框上有豹纹图案。她的头发被整齐地盘起，耳朵上佩戴着珍珠耳环，脖子上围着一条带有紫色星星图案的深蓝色围巾，穿着一件黑色皮夹克。

| 输入图像 | 输出图像 |
|:--------:|:--------:|
| image44 | - |

**指令：** 生成一张图像，符合图1所勾勒出的精致形状，并遵循以下描述：一位年老的老人朝着镜头微笑，他的脸上布满皱纹，头发在风中凌乱，戴着一副圆框的老花镜。脖子上戴着一条破旧的红色围巾，上面有星星图案。穿着一件棉衣。

### 文创生成

| 输入图像 | 输出图像 |
|:--------:|:--------:|
| 图片 1 | image23 |

**指令：** 让这只熊坐在月亮下（用白色背景上的浅灰弯月轮廓表示），抱着吉他，周围漂浮着小星星和诗句气泡，如"Be Kind"。

| 输入图像 | 输出图像 |
|:--------:|:--------:|
| image22 | image21 |

**指令：** 将这个图案印在一件T恤和一个手提纸袋上。一个女模特正在展示这些物品。这个女生还戴着一顶鸭舌帽，帽子上写着"Be kind"。

| 输入图像 | 输出图像 |
|:--------:|:--------:|
| image | - |

**指令：** 一个超逼真的1/7比例角色模型，设计为商业产品成品，放置在一台带有白色键盘的iMac电脑桌上。模型站在一个干净、圆形的透明亚克力底座上，没有标签或文字。专业的摄影棚灯光凸显了雕刻细节。在背景的iMac屏幕上，展示同一模型的ZBrush建模过程。在模型旁边，放置一个包装盒，前面带有透明窗户，仅显示内部透明塑料壳，其高度略高于模型，尺寸合理以容纳模型。

| 输入图像 | 输出图像 |
|:--------:|:--------:|
| image | image |

**指令：**
- 这只熊穿着宇航服，伸出手指向远方
- 这只熊穿着华丽的舞裙，双臂展开，做出优雅的舞蹈动作
- 这只熊穿着运动服，手里拿着篮球，单腿弯曲

### 根据深度图生成图像

| 输入图像 | 输出图像 |
|:--------:|:--------:|
| image36 | image37 |

**指令：** 生成一张图像，符合图1所勾勒出的深度图，并遵循以下描述：在一条街边的小巷中停放着一辆蓝色的自行车，背景中有几株从石缝中长出来的杂草

| 输入图像 | 输出图像 |
|:--------:|:--------:|
| image38 | - |

**指令：** 生成一张图像，符合图1所勾勒出的深度图，并遵循以下描述：一辆红色的破旧的自行车停在一条泥泞的小路上，背景是茂密的原始森林

### 根据关键点生成图像

| 输入图像 | 输出图像 |
|:--------:|:--------:|
| image40 | image41 |

**指令：** 生成一张图像，符合图1所勾勒出的人体姿态，并遵循以下描述：一位身穿着汉服的中国美女，在雨中撑着油纸伞，背景是苏州园林。

| 输入图像 | 输出图像 |
|:--------:|:--------:|
| image39 | - |

**指令：** 生成一张图像，符合图1所勾勒出的人体姿态，并遵循以下描述：一位男生，站在地铁站台上，他头上戴着一顶棒球帽，穿着T恤和牛仔裤。背后是飞驰而过的列车。

### 文字编辑

| 输入图像 | 输出图像 | 输入图像 | 输出图像 |
|:--------:|:--------:|:--------:|:--------:|
| image | image | image | image |

**指令：**
- 将拼字游戏方块上'HEALTH INSURANCE'替换为'明天会更好'
- 将便条上的短语"Take a Breather"更改为"Relax and Recharge"

| 输入图像 | 输出图像 |
|:--------:|:--------:|
| image53 | image45 |

**指令：** 将"Qwen-Image"换成黑色的滴墨字体

| 输出图像 |
|:--------:|
| image46 |

**指令：** 将"Qwen-Image"换成黑色的手写字体

| 输出图像 |
|:--------:|
| image49 |

**指令：** 将"Qwen-Image"换成黑色的像素字体

| 输出图像 |
|:--------:|
| image54 |

**指令：** 将"Qwen-Image"换成红色

| 输出图像 |
|:--------:|
| image57 |

**指令：** 将"Qwen-Image"换成蓝紫渐变色

| 输出图像 |
|:--------:|
| image59 |

**指令：** 将"Qwen-Image"换成糖果色

| 输出图像 |
|:--------:|
| image63 |

**指令：** 将"Qwen-Image"材质换成金属

| 输出图像 |
|:--------:|
| image64 |

**指令：** 将"Qwen-Image"材质换成云朵

| 输出图像 |
|:--------:|
| image67 |

**指令：** 将"Qwen-Image"材质换成玻璃

### 增删改及替换

| 能力 | 输入图像 | 输出图像 |
|------|:--------:|:--------:|
| **新增元素** | image | image |
| | | **指令：** 在企鹅前方添加一个小型木制标牌，上面写着"Welcome to Penguin Beach"。 |
| **删除元素** | image | image |
| | | **指令：** 删除餐盘上的头发 |
| **替换元素** | image | image |
| | | **指令：** 把桃子变成苹果 |
| **人像修改** | image | image |
| | | **指令：** 让她闭上眼睛 |
| **姿态修改** | image8 | image9 |
| | | **指令：** 她举起双手，手掌朝向镜头，手指张开，做出一个俏皮的姿势 |

### 视角转换

| 输入图像 | 输出图像 | 输入图像 | 输出图像 |
|:--------:|:--------:|:--------:|:--------:|
| image | image | image | image |

**指令：**
- 获得正视视角
- 朝向左侧

| 输入图像 | 输出图像 | 输入图像 | 输出图像 |
|:--------:|:--------:|:--------:|:--------:|
| image | image | image | image |

**指令：**
- 获得后侧视角
- 朝向右侧

### 背景替换

| 输入图像 | 输出图像 |
|:--------:|:--------:|
| image | image |

**指令：** 将背景更改为海滩

| 输入图像 | 输出图像 |
|:--------:|:--------:|
| image | - |

**指令：** 将原图背景替换为真实的现代教室场景，背景中央为一块深绿色或墨黑色的传统黑板，黑板表面用白色粉笔工整地写着中文"千问"

### 老照片处理

| 能力 | 输入图像 | 输出图像 | 能力 | 输入图像 | 输出图像 |
|------|:--------:|:--------:|------|:--------:|:--------:|
| **老照片修复及上色** | image | image | **智能上色** | image31 | image32 |

**指令：**
- 修复老照片，去除划痕，降低噪点，增强细节，高分辨率，画面真实，肤色自然，面部特征清晰，无变形。
- 根据内容智能上色，使图像更生动

---

## 计费与限流

- 模型免费额度和计费单价请参见模型列表与价格。
- 模型限流请参见通义千问（Qwen-Image）。

### 计费说明

- 按成功生成的**图像张数**计费。模型调用失败或处理错误不产生任何费用，也不消耗免费额度。
- 您可开启"免费额度用完即停"功能，以避免免费额度耗尽后产生额外费用。详情请参见免费额度。

---

## API 参考

API 的输入输出参数，请参见以下内容：
千问-图像编辑API参考
更新时间：2026-02-09 10:12:14
复制为 MD 格式
产品详情
我的收藏
千问-图像编辑模型支持多图输入和多图输出，可精确修改图内文字、增删或移动物体、改变主体动作、迁移图片风格及增强画面细节。

快速入口：使用指南 | 技术博客 | 在线体验

模型概览
输入图1
输入图2
输入图3


图1中的女孩穿着图2中的黑色裙子按图3的姿势坐下



模型名称

模型简介

输出图像规格

qwen-image-edit-max

当前与qwen-image-edit-max-2026-01-16能力相同
支持单图编辑和多图融合。

可输出 1-6 张图片。

支持自定义分辨率。

支持提示词智能改写。

格式：PNG
分辨率：

可指定：通过 parameters.size 参数指定输出图像的宽*高（单位：像素）。

默认（不指定时）：总像素数接近 1024*1024，宽高比与输入图（多图输入时为最后一张）相近。

qwen-image-edit-max-2026-01-16

qwen-image-edit-plus

当前与qwen-image-edit-plus-2025-10-30能力相同
qwen-image-edit-plus-2025-12-15

qwen-image-edit-plus-2025-10-30

qwen-image-edit

支持单图编辑和多图融合。

仅支持输出 1 张图片。

不支持自定义分辨率。

格式：PNG

分辨率：不可指定。生成规则同上方的默认规则。

说明
调用前，请查阅各地域支持的模型列表。

前提条件
在调用前，您需要获取API Key，再配置API Key到环境变量。

如需通过SDK进行调用，请安装DashScope SDK。目前，该SDK已支持Python和Java。

重要
北京和新加坡地域拥有独立的 API Key 与请求地址，不可混用，跨地域调用将导致鉴权失败或服务报错。

HTTP调用
北京地域：POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation

新加坡地域：POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation

请求参数
单图编辑多图融合
此处以使用qwen-image-edit-max模型输出2张图片为例。

 
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
--header 'Content-Type: application/json' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--data '{
    "model": "qwen-image-edit-max",
    "input": {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/thtclx/input1.png"
                    },
                    {
                        "image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/iclsnx/input2.png"
                    },
                    {
                        "image": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/gborgw/input3.png"
                    },
                    {
                        "text": "图1中的女生穿着图2中的黑色裙子按图3的姿势坐下"
                    }
                ]
            }
        ]
    },
    "parameters": {
        "n": 2,
        "negative_prompt": " ",
        "prompt_extend": true,
        "watermark": false,
        "size": "1024*1536"
    }
}'
请求头（Headers）
Content-Type string （必选）

请求内容类型。此参数必须设置为application/json。

Authorization string（必选）

请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。

请求体（Request Body）
model string （必选）

模型名称，示例值qwen-image-edit-max。

input object （必选）

输入参数对象，包含以下字段：

属性

messages array （必选）

请求内容数组。当前仅支持单轮对话，因此数组内有且只有一个对象，该对象包含role和content两个属性。

属性

role string （必选）

消息发送者角色，必须设置为user。

content array （必选）

消息内容，包含1-3张图像，格式为 {"image": "..."}；以及单个编辑指令，格式为 {"text": "..."}。

属性

image string （必选）

输入图像的 URL 或 Base64 编码数据。支持传入1-3张图像。

多图输入时，按照数组顺序定义图像顺序，输出图像的比例以最后一张为准。

图像要求：

图像格式：JPG、JPEG、PNG、BMP、TIFF、WEBP和GIF。

输出图像为PNG格式，对于GIF动图，仅处理其第一帧。
图像分辨率：为获得最佳效果，建议图像的宽和高均在384像素至3072像素之间。分辨率过低可能导致生成效果模糊，过高则会增加处理时长。

图像大小：不超过10MB。

支持的输入格式

公网URL：

支持 HTTP 和 HTTPS 协议。

示例值：https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/fpakfo/image36.webp。

临时URL：

支持OSS协议，必须通过上传文件获取临时 URL。

示例值：oss://dashscope-instant/xxx/2024-07-18/xxx/cat.png。

传入 Base64 编码图像后的字符串

示例值：data:image/jpeg;base64,GDU7MtCZz...（示例已截断，仅做演示）

Base64 编码规范请参见通过Base64编码传入图片。

text string （必选）

正向提示词，用于描述期望生成的图像内容、风格和构图。

支持中英文，长度不超过800个字符，每个汉字、字母、数字或符号计为一个字符，超过部分会自动截断。

示例值：图1中的女生穿着图2中的黑色裙子按图3的姿势坐下，保持其服装、发型和表情不变，动作自然流畅。

注意：仅支持传入一个text，不传或传入多个将报错。

parameters object （可选）

控制图像生成的附加参数。

属性

n integer （可选）

输出图像的数量，默认值为1。

对于qwen-image-edit-max、qwen-image-edit-plus系列模型，可选择输出1-6张图片。

对于qwen-image-edit，仅支持输出1张图片。

negative_prompt string （可选）

反向提示词，用来描述不希望在画面中看到的内容，可以对画面进行限制。

支持中英文，长度上限500个字符，每个汉字、字母、数字或符号计为一个字符，超过部分会自动截断。

示例值：低分辨率、错误、最差质量、低质量、残缺、多余的手指、比例不良等。

size string （可选）

设置输出图像的分辨率，格式为宽*高，例如"1024*1536"。宽和高的取值范围均为[512, 2048]像素。

常见比例推荐分辨率

1:1: 1024*1024、1536*1536

2:3: 768*1152、1024*1536

3:2: 1152*768、1536*1024

3:4: 960*1280、1080*1440

4:3: 1280*960、1440*1080

9:16: 720*1280、1080*1920

16:9: 1280*720、1920*1080

21:9: 1344*576、2048*872

输出图像尺寸的规则

指定 size 参数，系统会以 size指定的宽高为目标，将实际输出图像的宽高调整为最接近的16的倍数。例如，设置1033*1032，输出图像尺寸为1040*1024。

若不设置，输出图像将保持与输入图像（多图输入时为最后一张）相似的宽高比，总像素数接近1024*1024。

支持模型：qwen-image-edit-max、qwen-image-edit-plus系列模型。

prompt_extend bool （可选）

是否开启提示词智能改写，默认值为 true。开启后，模型会优化正向提示词（text），对描述较简单的提示词效果提升明显。

支持模型：qwen-image-edit-max、qwen-image-edit-plus系列模型。

watermark bool （可选）

是否在图像右下角添加 "Qwen-Image" 水印。默认值为 false。水印样式如下：

1

seed integer （可选）

随机数种子，取值范围[0,2147483647]。

使用相同的seed参数值可使生成内容保持相对稳定。若不提供，算法将自动使用随机数种子。

注意：模型生成过程具有概率性，即使使用相同的seed，也不能保证每次生成结果完全一致。

响应参数
任务执行成功任务执行异常
任务数据（如任务状态、图像URL等）仅保留24小时，超时后会被自动清除。请您务必及时保存生成的图像。

 
{
    "output": {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "role": "assistant",
                    "content": [
                        {
                            "image": "https://dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com/xxx.png?Expires=xxx"
                        },
                        {
                            "image": "https://dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com/xxx.png?Expires=xxx"
                        }
                    ]
                }
            }
        ]
    },
    "usage": {
        "width": 1536,
        "image_count": 2,
        "height": 1024
    },
    "request_id": "bf37ca26-0abe-98e4-8065-xxxxxx"
}
output object

包含模型生成结果。

属性

choices array

结果选项列表。

属性

finish_reason string

任务停止原因，自然停止时为stop。

message object

模型返回的消息。

属性

role string

消息的角色，固定为assistant。

content array

消息内容，包含生成的图像信息。

属性

image string

生成图像的 URL，格式为PNG。链接有效期为24小时，请及时下载并保存图像。

usage object

本次调用的资源使用情况，仅调用成功时返回。

属性

image_count integer

生成图像的张数。

width integer

生成图像的宽度（像素）。

height integer

生成图像的高度（像素）。

request_id string

请求唯一标识。可用于请求明细溯源和问题排查。

code string

请求失败的错误码。请求成功时不会返回此参数，详情请参见错误信息。

message string

请求失败的详细信息。请求成功时不会返回此参数，详情请参见错误信息。

DashScope SDK调用
SDK 的参数命名与HTTP接口基本一致，参数结构根据语言特性进行封装，完整参数列表请参见千问 API 参考。

Python SDK调用
说明
推荐安装最新版DashScope Python SDK，否则可能运行报错：安装或升级SDK。

不支持异步接口。

请求示例
通过公网URL传入图片通过Base64编码传入图片通过URL下载图像
 
import json
import os
from dashscope import MultiModalConversation
import base64
import mimetypes
import dashscope

# 以下为中国（北京）地域url，若使用新加坡地域的模型，需将url替换为：https://dashscope-intl.aliyuncs.com/api/v1
dashscope.base_http_api_url = 'https://dashscope.aliyuncs.com/api/v1'

# ---用于 Base64 编码 ---
# 格式为 data:{mime_type};base64,{base64_data}
def encode_file(file_path):
    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type or not mime_type.startswith("image/"):
        raise ValueError("不支持或无法识别的图像格式")

    try:
        with open(file_path, "rb") as image_file:
            encoded_string = base64.b64encode(
                image_file.read()).decode('utf-8')
        return f"data:{mime_type};base64,{encoded_string}"
    except IOError as e:
        raise IOError(f"读取文件时出错: {file_path}, 错误: {str(e)}")


# 获取图像的 Base64 编码
# 调用编码函数，请将 "/path/to/your/image.png" 替换为您的本地图片文件路径，否则无法运行
image = encode_file("/path/to/your/image.png")

messages = [
    {
        "role": "user",
        "content": [
            {"image": image},
            {"text": "生成一张符合深度图的图像，遵循以下描述：一辆红色的破旧的自行车停在一条泥泞的小路上，背景是茂密的原始森林"}
        ]
    }
]

# 新加坡和北京地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
# 若没有配置环境变量，请用百炼 API Key 将下行替换为：api_key="sk-xxx"
api_key = os.getenv("DASHSCOPE_API_KEY")

# qwen-image-edit-max、qwen-image-edit-plus系列支持输出1-6张图片，此处以2张为例
response = MultiModalConversation.call(
    api_key=api_key,
    model="qwen-image-edit-max",
    messages=messages,
    stream=False,
    n=2,
    watermark=False,
    negative_prompt=" ",
    prompt_extend=True,
    size="1536*1024",
)

if response.status_code == 200:
    # 如需查看完整响应，请取消下行注释
    # print(json.dumps(response, ensure_ascii=False))
    for i, content in enumerate(response.output.choices[0].message.content):
        print(f"输出图像{i+1}的URL:{content['image']}")
else:
    print(f"HTTP返回码：{response.status_code}")
    print(f"错误码：{response.code}")
    print(f"错误信息：{response.message}")
    print("请参考文档：https://help.aliyun.com/zh/model-studio/error-code")
响应示例
图像链接的有效期为24小时，请及时下载图像。

input_tokens、output_tokens和characters为兼容字段，当前固定为0。
 
{
    "status_code": 200,
    "request_id": "fa41f9f9-3cb6-434d-a95d-4ae6b9xxxxxx",
    "code": "",
    "message": "",
    "output": {
        "text": null,
        "finish_reason": null,
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "role": "assistant",
                    "content": [
                        {
                            "image": "https://dashscope-result-hz.oss-cn-hangzhou.aliyuncs.com/xxx.png?Expires=xxx"
                        },
                        {
                            "image": "https://dashscope-result-hz.oss-cn-hangzhou.aliyuncs.com/xxx.png?Expires=xxx"
                        }
                    ]
                }
            }
        ],
        "audio": null
    },
    "usage": {
        "input_tokens": 0,
        "output_tokens": 0,
        "characters": 0,
        "height": 1536,
        "image_count": 2,
        "width": 1024
    }
}
```