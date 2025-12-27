# Seedance 模型 Video Generation API 调用教程
Seedance 模型具备出色的语义理解能力，可根据用户输入的文本、图片等内容，快速生成优质的视频片段。通过这篇教程，您可学习到如何调用 Video Generation API 生成视频。

## 说明
方舟平台的新用户？获取 API Key 及 开通模型等准备工作，请参见 快速入门。

## 效果预览
| 场景 | 输入 | 输出 |
| ---- | ---- | ---- |
| **有声视频生成**<br>仅 Seedance 1.5 pro 支持 | - | 输出音画一体的高质量视频，支持环境音、动作音、合成音、乐器音、背景音乐及人声等。<br><br>示例：<br>一辆地铁轰隆隆驶过，书页和女孩的头发飞扬，镜头开始环绕着女孩360度旋转，周围的背景从地铁站渐渐转变为一个中世纪的教堂，西式幻想风格的音乐渐入。夹在女孩书中的几页信纸随风飞扬，在女孩的周身打着旋，随风而动的纸张降落时，女孩身处的环境已经彻底变成中世纪教堂的模样<br><br>镜头围绕人物推镜头拉近，特写人物面部，她正在用京剧唱腔唱“月移花影，疑是玉人来”，唱词充满情感，唱腔充满传统京剧特有的韵味与技巧，完美体现了花旦角色的内心世界 |
| **多参考图生视频** | 上传多张参考图片 | 模型将依据这些图片的特征和风格，生成与之匹配的动态视频画面。<br><br>示例：<br>[图1]戴着眼镜穿着蓝色T恤的男生和[图2]的柯基小狗，坐在[图3]的草坪上，视频卡通风格 |
| **首尾帧生视频** | 输入首尾关键帧 | 智能生成过渡画面，形成连贯流畅的视频内容。<br><br>示例：360度环绕运镜 |

## 快速开始
视频生成是一个**异步过程**：
1.  成功调用 `POST /contents/generations/tasks` 接口后，API 将返回一个任务 ID。
2.  您可以轮询 `GET /contents/generations/tasks/{id}` 接口，直到任务状态变为 `succeeded`；或者使用 Webhook 自动接收视频生成任务的状态变化。
3.  任务完成后，您可在 `content.video_url` 字段处，下载最终生成的 MP4 文件。

## 创建视频生成任务
通过 `POST /contents/generations/tasks` 创建视频生成任务。

### Curl
```bash
curl https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
  -d '{
    "model": "doubao-seedance-1-5-pro-251215",
    "content": [
        {
            "type": "text",
            "text": "女孩抱着狐狸，女孩睁开眼，温柔地看向镜头，狐狸友善地抱着，镜头缓缓拉出，女孩的头发被风吹动，可以听到风声  --ratio adaptive  --dur 5"
        },
        {
            "type": "image_url",
            "image_url": {
                "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/i2v_foxrgirl.png"
            }
        }
    ],
    "generate_audio":true
}'
```

### Python
```python
import os
from volcenginesdkarkruntime import Ark

# Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
client = Ark(api_key=os.environ.get("ARK_API_KEY"))

if __name__ == "__main__":
    print("----- create request -----")
    resp = client.content_generation.tasks.create(
        model="doubao-seedance-1-0-pro-250528", # Replace with Model ID
        content=[
            {
                "text": (
                    "女孩抱着狐狸，女孩睁开眼，温柔地看向镜头，狐狸友善地抱着，镜头缓缓拉出，女孩的头发被风吹动  --ratio adaptive  --dur 5"
                ),
                "type": "text"
            },
            {
                "image_url": {
                    "url": (
                        "https://ark-project.tos-cn-beijing.volces.com/doc_image/i2v_foxrgirl.png"
                    )
                },
                "type": "image_url"
            }
        ]
    )

print(resp)
```

### Java
```java
package com.ark.sample;

import com.volcengine.ark.runtime.model.content.generation.*;
import com.volcengine.ark.runtime.model.content.generation.CreateContentGenerationTaskRequest.Content;
import com.volcengine.ark.runtime.service.ArkService;
import okhttp3.ConnectionPool;
import okhttp3.Dispatcher;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

public class Sample {

static String apiKey = System.getenv("ARK_API_KEY");

static ConnectionPool connectionPool = new ConnectionPool(5, 1, TimeUnit.SECONDS);
    static Dispatcher dispatcher = new Dispatcher();
    static ArkService service =
            ArkService.builder()
                    .dispatcher(dispatcher)
                    .connectionPool(connectionPool)
                    .apiKey(apiKey)
                    .build();

public static void main(String[] args) throws JsonProcessingException {

List<Content> contentForReqList = new ArrayList<>();
        Content elementForContentForReqList0 = new Content();
        elementForContentForReqList0.setType("text");
        elementForContentForReqList0.setText("女孩抱着狐狸，女孩睁开眼，温柔地看向镜头，狐狸友善地抱着，镜头缓缓拉出，女孩的头发被风吹动  --ratio adaptive  --dur 5");
        ImageUrl imageUrlForElementForContentForReqList1 = new ImageUrl();
        imageUrlForElementForContentForReqList1.setUrl("https://ark-project.tos-cn-beijing.volces.com/doc_image/i2v_foxrgirl.png");
        Content elementForContentForReqList1 = new Content();
        elementForContentForReqList1.setType("image_url");
        elementForContentForReqList1.setImageUrl(imageUrlForElementForContentForReqList1);
        contentForReqList.add(elementForContentForReqList0);
        contentForReqList.add(elementForContentForReqList1);

CreateContentGenerationTaskRequest req =
                CreateContentGenerationTaskRequest.builder()
                        .model("doubao-seedance-1-0-pro-250528") // Replace with Model ID
                        .content(contentForReqList)
                        .build();

service.createContentGenerationTask(req).toString();

// shutdown service after all requests is finished
        service.shutdownExecutor();
    }
}
```

### Go
```go
package main

import (
    "context"
    "fmt"
    "os"

"github.com/volcengine/volcengine-go-sdk/service/arkruntime"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model"
    "github.com/volcengine/volcengine-go-sdk/volcengine"
)

func main() {
        client := arkruntime.NewClientWithApiKey(os.Getenv("ARK_API_KEY"))
        ctx := context.Background()

req := model.CreateContentGenerationTaskRequest{
                Model: "doubao-seedance-1-0-pro-250528", // Replace with Model ID
                Content: []*model.CreateContentGenerationContentItem{
                        &model.CreateContentGenerationContentItem{
                                Type: "text",
                                Text: volcengine.String("女孩抱着狐狸，女孩睁开眼，温柔地看向镜头，狐狸友善地抱着，镜头缓缓拉出，女孩的头发被风吹动"),
                        },
                        &model.CreateContentGenerationContentItem{
                                Type: "image_url",
                                ImageURL: &model.ImageURL{
                                        URL: "https://ark-project.tos-cn-beijing.volces.com/doc_image/i2v_foxrgirl.png",
                                },
                        },
                },
        }

resp, err := client.CreateContentGenerationTask(ctx, req)
        if err != nil {
                fmt.Printf("create content generation error: %v\n", err)
                return
        }
        fmt.Printf("Task Created with ID: %s\n", resp.ID)
}
```

### 请求成功返回
```python
{
  "id": "cgt-2025******-****"
}
```

## 查询视频生成任务
利用创建视频生成任务时返回的 ID ，您可以查询视频生成任务的详细状态与结果。此接口会返回任务的当前状态（如 `queued` 、`running` 、 `succeeded` 等）以及生成的视频相关信息（如视频下载链接、分辨率、时长等）。

> **说明**
> 因模型、API负载和视频输出规格的不同，视频生成的过程可能耗时较长。为高效管理这一过程，您可以通过轮询 API 接口（详见 基础使用 和 进阶使用 部分的 SDK 示例）来请求状态更新，或通过 使用 Webhook 通知 接收通知。

### Curl
```bash
# Replace cgt-2025**** with the ID acquired from "Create Video Generation Task".

curl https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/cgt-2025**** \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ARK_API_KEY" \
```

### Python
```python
import os
from volcenginesdkarkruntime import Ark

client = Ark(api_key=os.environ.get("ARK_API_KEY"))

if __name__ == "__main__":
    resp = client.content_generation.tasks.get(
        task_id="cgt-2025****",
    )
    print(resp)
```

### Java
```java
package com.ark.sample;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.volcengine.ark.runtime.model.content.generation.GetContentGenerationTaskRequest;
import com.volcengine.ark.runtime.service.ArkService;
import java.util.concurrent.TimeUnit;
import okhttp3.ConnectionPool;
import okhttp3.Dispatcher;

public class Sample {

static String apiKey = System.getenv("ARK_API_KEY");

static ConnectionPool connectionPool = new ConnectionPool(5, 1, TimeUnit.SECONDS);
    static Dispatcher dispatcher = new Dispatcher();
    static ArkService service =
            ArkService.builder()
                    .dispatcher(dispatcher)
                    .connectionPool(connectionPool)
                    .apiKey(apiKey)
                    .build();

public static void main(String[] args) throws JsonProcessingException {
        String taskId = "cgt-2025****";

GetContentGenerationTaskRequest req = GetContentGenerationTaskRequest.builder()
                .taskId(taskId)
                .build();

service.getContentGenerationTask(req).toString();
        System.out.println(service.getContentGenerationTask(req));

service.shutdownExecutor();
    }
}
```

### Go
```go
package main

import (
        "context"
        "fmt"
        "os"

"github.com/volcengine/volcengine-go-sdk/service/arkruntime"
        "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model"
)

func main() {
        client := arkruntime.NewClientWithApiKey(os.Getenv("ARK_API_KEY"))
        ctx := context.Background()

req := model.GetContentGenerationTaskRequest{
                ID: "cgt-2025****", 
        }
        resp, err := client.GetContentGenerationTask(ctx, req)
        if err != nil {
                fmt.Printf("get content generation task error: %v\n", err)
                return
        }
        fmt.Printf("%+v\n", resp)
}
```

### 任务成功返回
当任务状态变为 `succeeded` 后，您可在 `content.video_url` 字段处，下载最终生成的视频文件。
```json
{
    "id": "cgt-2025****",
    "model": "doubao-seedance-1-0-pro-250528",
    "status": "succeeded", 
    "content": {
        // Video download URL (file format is MP4)
        "video_url": "https://ark-content-generation-cn-beijing.tos-cn-beijing.volces.com/****"
    },
    "usage": {
        "completion_tokens": 246840,
        "total_tokens": 246840
    },
    "created_at": 1765510475,
    "updated_at": 1765510559,
    "seed": 58944,
    "resolution": "1080p",
    "ratio": "16:9",
    "duration": 5,
    "framespersecond": 24,
    "service_tier": "default",
    "execution_expires_after": 172800
}
```

## 模型选择
| 选型需求 | 推荐模型 |
| ---- | ---- |
| 追求最高生成品质与原生音画同步 | Seedance 1.5 pro |
| 更注重成本与生成速度，不要求极限品质 | Seedance 1.0 pro fast |
| 基于多张参考图生成视频 | Seedance 1.0 lite |

### 模型详细参数表
| 模型 ID（Model ID） | 模型能力 | 输出视频格式 | 限流 | 免费额度（token） |
| ---- | ---- | ---- | ---- | ---- |
| doubao-seedance-1-5-pro-251215<br>（音画同生） | 支持有声视频<br>图生视频-首尾帧<br>图生视频-首帧<br>文生视频 | 分辨率: 480p、720p<br>帧率: 24 fps<br>时长: 4~12 秒<br>视频格式: mp4 | default:<br>RPM 600<br>并发数 10<br>flex:<br>TPD 5000亿 | default: 200万<br>flex: 无 |
| doubao-seedance-1-0-pro-250528 | 图生视频-首尾帧<br>图生视频-首帧<br>文生视频 | 分辨率: 480p、720p、1080p<br>帧率: 24 fps<br>时长: 2~12 秒<br>视频格式: mp4 | default:<br>RPM 600<br>并发数 10<br>flex:<br>TPD 5000亿 | default: 200万<br>flex: 无 |
| doubao-seedance-1-0-pro-fast-251015 | 图生视频-首帧<br>文生视频 | - | default:<br>RPM 600<br>并发数 10<br>flex:<br>TPD 5000亿 | default: 200万<br>flex: 无 |
| doubao-seedance-1-0-lite-t2v-250428 | 文生视频 | - | default<br>RPM 300<br>并发数 5<br>flex<br>TPD 2500亿 | default: 200万<br>flex: 无 |
| doubao-seedance-1-0-lite-i2v-250428 | 图生视频-参考图<br>图生视频-首尾帧<br>图生视频-首帧 | - | default<br>RPM 300<br>并发数 5<br>flex<br>TPD 2500亿 | default: 200万<br>flex: 无 |

## 基础使用
### 文生视频
根据用户输入的提示词生成视频，结果具有较大的随机性，可以用于激发创作灵感。

| 提示词 | 输出 |
| ---- | ---- |
| 写实风格，晴朗的蓝天之下，一大片白色的雏菊花田，镜头逐渐拉近，最终定格在一朵雏菊花的特写上，花瓣上有几颗晶莹的露珠 | 符合提示词描述的动态视频 |

#### Python
```python
import os
import time  
# Install SDK:  pip install 'volcengine-python-sdk[ark]'
from volcenginesdkarkruntime import Ark 

# Make sure that you have stored the API Key in the environment variable ARK_API_KEY
# Initialize the Ark client to read your API Key from an environment variable
client = Ark(
    # This is the default path. You can configure it based on the service location
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    # Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
    api_key=os.environ.get("ARK_API_KEY"),
)

if __name__ == "__main__":
    print("----- create request -----")
    create_result = client.content_generation.tasks.create(
        model="doubao-seedance-1-0-pro-250528", # Replace with Model ID 
        content=[
            {
                # Combination of text prompt and parameters
                "type": "text",
                "text": "写实风格，晴朗的蓝天之下，一大片白色的雏菊花田，镜头逐渐拉近，最终定格在一朵雏菊花的特写上，花瓣上有几颗晶莹的露珠"
            }
        ]
    )
    print(create_result)

# Polling query section
    print("----- polling task status -----")
    task_id = create_result.id
    while True:
        get_result = client.content_generation.tasks.get(task_id=task_id)
        status = get_result.status
        if status == "succeeded":
            print("----- task succeeded -----")
            print(get_result)
            break
        elif status == "failed":
            print("----- task failed -----")
            print(f"Error: {get_result.error}")
            break
        else:
            print(f"Current status: {status}, Retrying after 10 seconds...")
            time.sleep(10)
```

#### Java & Go
（代码内容与原文一致，此处省略，可参考上文对应模块）

### 图生视频-基于首帧含音频
通过指定视频的首帧图片，模型能够基于该图片生成与之相关且画面连贯的视频内容。

| 提示词 | 首帧 | 输出 |
| ---- | ---- | ---- |
| 女孩抱着狐狸，女孩睁开眼，温柔地看向镜头，狐狸友善地抱着，镜头缓缓拉出，女孩的头发被风吹动，可以听到风声 --ratio adaptive --dur 5 | 图片 URL：<br>https://ark-project.tos-cn-beijing.volces.com/doc_image/i2v_foxrgirl.png | 符合提示词与首帧风格的有声视频 |

#### Python
```python
import os
import time  
# Install SDK:  pip install 'volcengine-python-sdk[ark]'
from volcenginesdkarkruntime import Ark 

# Make sure that you have stored the API Key in the environment variable ARK_API_KEY
# Initialize the Ark client to read your API Key from an environment variable
client = Ark(
    # This is the default path. You can configure it based on the service location
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    # Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
    api_key=os.environ.get("ARK_API_KEY"),
)

if __name__ == "__main__":
    print("----- create request -----")
    create_result = client.content_generation.tasks.create(
        model="doubao-seedance-1-0-pro-250528", # Replace with Model ID
        content=[
            {
                # Combination of text prompt and parameters
                "type": "text",
                "text": "女孩抱着狐狸，女孩睁开眼，温柔地看向镜头，狐狸友善地抱着，镜头缓缓拉出，女孩的头发被风吹动  --ratio adaptive  --dur 5"  
            },
            {
                # The URL of the first frame image
                "type": "image_url",
                "image_url": {
                    "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/i2v_foxrgirl.png"
                }
            }
        ]
    )
    print(create_result)

# Polling query section
    print("----- polling task status -----")
    task_id = create_result.id
    while True:
        get_result = client.content_generation.tasks.get(task_id=task_id)
        status = get_result.status
        if status == "succeeded":
            print("----- task succeeded -----")
            print(get_result)
            break
        elif status == "failed":
            print("----- task failed -----")
            print(f"Error: {get_result.error}")
            break
        else:
            print(f"Current status: {status}, Retrying after 10 seconds...")
            time.sleep(10)
```

#### Java & Go & Curl
（代码内容与原文一致，此处省略，可参考上文对应模块）

### 图生视频-基于首尾帧含音频
通过指定视频的起始和结束图片，模型即可生成流畅衔接首、尾帧的视频，实现画面间自然、连贯的过渡效果。

| 提示词 | 首帧 | 尾帧 | 输出 |
| ---- | ---- | ---- | ---- |
| 图中女孩对着镜头说“茄子”，360度环绕运镜 | 首帧 URL：<br>https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_first_frame.jpeg | 尾帧 URL：<br>https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_last_frame.jpeg | 衔接首尾帧的360度环绕运镜视频 |

#### Python
```python
import os
import time  
# Install SDK:  pip install 'volcengine-python-sdk[ark]'
from volcenginesdkarkruntime import Ark 

# Make sure that you have stored the API Key in the environment variable ARK_API_KEY
# Initialize the Ark client to read your API Key from an environment variable
client = Ark(
    # This is the default path. You can configure it based on the service location
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    # Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
    api_key=os.environ.get("ARK_API_KEY"),
)  

if __name__ == "__main__": 
    print("----- create request -----") 
    create_result = client.content_generation.tasks.create( 
        model="doubao-seedance-1-0-pro-250528", # Replace with Model ID
        content=[ 
            { 
                # Combination of text prompt and parameters
                "type": "text", 
                "text": "360度环绕运镜"
            }, 
            { 
                # The URL of the first frame image
                "type": "image_url", 
                "image_url": { 
                    "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_first_frame.jpeg"
                },
                "role": "first_frame"
            }, 
            { 
                # The URL of the last frame image  
                "type": "image_url", 
                "image_url": { 
                    "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_last_frame.jpeg"
                },
                "role": "last_frame"  
            } 
        ] 
    ) 
    print(create_result) 

# Polling query section 
    print("----- polling task status -----") 
    task_id = create_result.id 
    while True: 
        get_result = client.content_generation.tasks.get(task_id=task_id) 
        status = get_result.status 
        if status == "succeeded": 
            print("----- task succeeded -----") 
            print(get_result) 
            break 
        elif status == "failed": 
            print("----- task failed -----") 
            print(f"Error: {get_result.error}") 
            break 
        else: 
            print(f"Current status: {status}, Retrying after 10 seconds...") 
            time.sleep(10)
```

#### Java & Go & Curl
（代码内容与原文一致，此处省略，可参考上文对应模块）

### 图生视频-基于参考图
模型能精准提取参考图片（支持输入1-4张）中各类对象的关键特征，并依据这些特征在视频生成过程中高度还原对象的形态、色彩和纹理等细节，确保生成的视频与参考图的视觉风格一致。

| 提示词 | 参考图1 | 参考图2 | 参考图3 | 输出 |
| ---- | ---- | ---- | ---- | ---- |
| [图1]戴着眼镜穿着蓝色T恤的男生和[图2]的柯基小狗，坐在[图3]的草坪上，视频卡通风格 | 参考图1 URL<br>https://ark-project.tos-cn-beijing.volces.com/doc_image/seelite_ref_1.png | 参考图2 URL<br>https://ark-project.tos-cn-beijing.volces.com/doc_image/seelite_ref_2.png | 参考图3 URL<br>https://ark-project.tos-cn-beijing.volces.com/doc_image/seelite_ref_3.png | 卡通风格视频，还原参考图中人物、小狗、草坪特征 |

#### Python
```python
import os
import time  
# Install SDK:  pip install 'volcengine-python-sdk[ark]'
from volcenginesdkarkruntime import Ark 

# Make sure that you have stored the API Key in the environment variable ARK_API_KEY
# Initialize the Ark client to read your API Key from an environment variable
client = Ark(
    # This is the default path. You can configure it based on the service location
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    # Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
    api_key=os.environ.get("ARK_API_KEY"),
)

if __name__ == "__main__": 
    print("----- create request -----") 
    try:
        create_result = client.content_generation.tasks.create( 
            model="doubao-seedance-1-0-lite-i2v-250428",  # Replace with Model ID 
            content=[ 
                { 
                    # Combination of text prompt and parameters 
                    "type": "text", 
                    "text": "[图1]戴着眼镜穿着蓝色T恤的男生和[图2]的柯基小狗，坐在[图3]的草坪上，视频卡通风格" 
                },
                { 
                    # The URL of the first reference image  
                    # 1-4 reference images need to be provided
                    "type": "image_url", 
                    "image_url": { 
                        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/seelite_ref_1.png"
                    },
                    "role": "reference_image"  
                },
                { 
                    # The URL of the second reference image  
                    "type": "image_url", 
                    "image_url": { 
                        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/seelite_ref_2.png" 
                    },
                    "role": "reference_image"  
                },
                { 
                    # The URL of the third reference image  
                    "type": "image_url", 
                    "image_url": { 
                        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/seelite_ref_3.png" 
                    },
                    "role": "reference_image"  
                } 
            ] 
        ) 
        print(create_result) 

# Polling query section 
        print("----- polling task status -----") 
        task_id = create_result.id 
        while True: 
            get_result = client.content_generation.tasks.get(task_id=task_id) 
            status = get_result.status 
            if status == "succeeded": 
                print("----- task succeeded -----") 
                print(get_result) 
                break 
            elif status == "failed": 
                print("----- task failed -----") 
                print(f"Error: {get_result.error}") 
                break 
            else: 
                print(f"Current status: {status}, Retrying after 10 seconds...") 
                time.sleep(10)
    except Exception as e:
        print(f"An error occurred: {e}")
```

#### Java & Go
（代码内容与原文一致，此处省略，可参考上文对应模块）

## 管理视频任务
### 查询视频生成任务列表
该接口支持传入条件筛选参数，以查询符合条件的视频生成任务列表。

#### Python
```python
import os
from volcenginesdkarkruntime import Ark

client = Ark(api_key=os.environ.get("ARK_API_KEY"))

if __name__ == "__main__":
    resp = client.content_generation.tasks.list(
        page_size=3,
        status="succeeded",
    )
    print(resp)
```

#### Java & Go & Curl
（代码内容与原文一致，此处省略，可参考上文对应模块）

### 删除或取消视频生成任务
取消排队中的视频生成任务，或者删除视频生成任务记录。

#### Python
```python
import os
from volcenginesdkarkruntime import Ark

client = Ark(api_key=os.environ.get("ARK_API_KEY"))

if __name__ == "__main__":
    try:
        client.content_generation.tasks.delete(
            task_id="cgt-2025****",
        )
    except Exception as e:
        print(f"failed to delete task: {e}")
```

#### Java & Go & Curl
（代码内容与原文一致，此处省略，可参考上文对应模块）

## 设置视频输出规格
通过在文本提示词后追加 `--[parameters]` 的方式，可控制视频输出的规格，包括宽高比、帧率、分辨率等。

### 参数示例
```json
"content": [
        {
            "type": "text",
            "text": "小猫对着镜头打哈欠。 --rs 720p --rt 16:9 --dur 5 --fps 24 --wm true --seed 11 --cf false"
        }
 ]
```

### 各模型支持的参数详情
| 参数 | 说明 | doubao-seedance-1-5-pro | doubao-seedance-1-0-pro<br>doubao-seedance-1-0-pro-fast | doubao-seedance-1-0-lite-t2v<br>doubao-seedance-1-0-lite-i2v |
| ---- | ---- | ---- | ---- | ---- |
| resolution<br>（分辨率） | 视频清晰度 | 480p、720p | 480p、720p、1080p | 480p、720p、1080p<br>（参考图场景不支持1080p） |
| ratio<br>（宽高比） | 视频画面比例 | 16:9、4:3、1:1、3:4、9:16、21:9、adaptive<br><br>480p 像素值示例：<br>16:9：864×496<br>720p 像素值示例：<br>16:9：1280×720 | 16:9、4:3、1:1、3:4、9:16、21:9、adaptive<br><br>480p 像素值示例：<br>16:9：864×480<br>720p 像素值示例：<br>16:9：1248×704<br>1080p 像素值示例：<br>16:9：1920×1088 | 16:9、4:3、1:1、3:4、9:16、21:9、adaptive<br>（参考图场景不支持adaptive）<br><br>480p 像素值示例：<br>16:9：864×480<br>720p 像素值示例：<br>16:9：1248×704<br>1080p 像素值示例（参考图场景不支持）：<br>16:9：1920×1088 |
| duration<br>（时长） | 视频长度（秒） | 4~12 秒 | 2~12 秒 | 2~12 秒 |
| frames<br>（帧数） | 视频总帧数 | 支持 [29, 289] 区间内所有满足 25 + 4n 格式的整数值，其中 n 为正整数 | 支持 [29, 289] 区间内所有满足 25 + 4n 格式的整数值，其中 n 为正整数 | - |
| framespersecond<br>（帧率） | 每秒帧数 | 24 | 24 | 24 |
| seed<br>（种子整数） | 控制生成结果一致性 | 支持 | 支持 | 支持 |
| camerafixed<br>（是否固定摄像头） | 控制镜头是否固定 | 参考图场景不支持 | 支持 | 支持 |
| watermark<br>（是否包含水印） | 视频是否带水印 | 支持 | 支持 | 支持 |

## 提示词建议
1.  提示词公式：`主体 + 运动， 背景 + 运动，镜头 + 运动 ...`
2.  用简洁准确的自然语言写出你想要的效果。
3.  如果有较为明确的效果预期，建议先用生图模型生成符合预期的图片，再用图生视频进行视频片段的生成。
4.  文生视频会有较大的结果随机性，可以用于激发创作灵感
5.  图生视频时请尽量上传高清高质量的图片，上传图片的质量对图生视频影响较大。
6.  当生成的视频不符合预期时，建议修改提示词，将抽象描述换成具象描述，并注意删除不重要的部分，将重要内容前置。
7.  更多提示词的使用技巧请参见 Seedance-1.0-pro&pro-fast 提示词指南、 Seedance-1.0-lite 提示词指南。

## 进阶使用
### 使用 Webhook 通知
通过 `callback_url` 参数可以指定一个回调通知地址，当视频生成任务的状态发生变化时，方舟会向该地址发送一条 POST 请求，方便您及时获取任务最新情况。 请求内容结构与查询任务API的返回体一致。

#### 回调数据示例
```json
{
  "id": "cgt-2025****",
  "model": "doubao-seedance-1-0-pro-250528",
  "status": "running", # Possible status values: queued, running, succeeded, failed, expired
  "created_at": 1765434920,
  "updated_at": 1765434920,
  "service_tier": "default",
  "execution_expires_after": 172800
}
```

#### Python Web Server 示例
```python
# Building a Simple Web Server with Python Flask for Webhook Notification Processing

from flask import Flask, request, jsonify
import sqlite3
import logging
from datetime import datetime
import os

# === Basic Configuration ===
app = Flask(__name__)
# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.FileHandler('webhook.log'), logging.StreamHandler()]
)
# Database path
DB_PATH = 'video_tasks.db'

# === Database Initialization ===
def init_db():
    """Automatically create task table on first run, aligning fields with callback parameters"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Create table: task_id as primary key for idempotent updates
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS video_generation_tasks (
        task_id TEXT PRIMARY KEY,
        model TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        service_tier TEXT NOT NULL,
        execution_expires_after INTEGER NOT NULL,
        last_callback_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    conn.commit()
    conn.close()
    logging.info("Database initialized, table created/exists")

# === Core Webhook Interface ===
@app.route('/webhook/callback', methods=['POST'])
def video_task_callback():
    """Core interface for receiving Ark callback"""
    try:
        # 1. Parse callback request body (JSON format)
        callback_data = request.get_json()
        if not callback_data:
            logging.error("Callback request body empty or non-JSON format")
            return jsonify({"code": 400, "msg": "Invalid JSON data"}), 400

# 2. Validate required fields
        required_fields = ['id', 'model', 'status', 'created_at', 'updated_at', 'service_tier', 'execution_expires_after']
        for field in required_fields:
            if field not in callback_data:
                logging.error(f"Callback data missing required field: {field}, data: {callback_data}")
                return jsonify({"code": 400, "msg": f"Missing field: {field}"}), 400

# 3. Extract key information and log
        task_id = callback_data['id']
        status = callback_data['status']
        model = callback_data['model']
        logging.info(f"Received task callback | Task ID: {task_id} | Status: {status} | Model: {model}")
        print(f"[{datetime.now()}] Task {task_id} status updated to: {status}")  # Console output

# 4. Database operation
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
        INSERT OR REPLACE INTO video_generation_tasks (
            task_id, model, status, created_at, updated_at, service_tier, execution_expires_after
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            task_id,
            model,
            status,
            callback_data['created_at'],
            callback_data['updated_at'],
            callback_data['service_tier'],
            callback_data['execution_expires_after']
        ))
        conn.commit()
        conn.close()
        logging.info(f"Task {task_id} database update successful")

# 5. Return 200 response
        return jsonify({"code": 200, "msg": "Callback received successfully", "task_id": task_id}), 200

except Exception as e:
        # Catch all exceptions to avoid returning 5xx
        logging.error(f"Callback processing failed: {str(e)}", exc_info=True)
        return jsonify({"code": 200, "msg": "Callback received successfully (internal processing exception)"}), 200

# === Helper Interface (Optional, for querying task status) ===
@app.route('/tasks/<task_id>', methods=['GET'])
def get_task_status(task_id):
    """Query latest status of specified task"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM video_generation_tasks WHERE task_id = ?', (task_id,))
    task = cursor.fetchone()
    conn.close()
    if not task:
        return jsonify({"code": 404, "msg": "Task not found"}), 404
    # Map field names for response
    fields = ['task_id', 'model', 'status', 'created_at', 'updated_at', 'service_tier', 'execution_expires_after', 'last_callback_at']
    task_dict = dict(zip(fields, task))
    return jsonify({"code": 200, "data": task_dict}), 200

# === Service Startup ===
if __name__ == '__main__':
    # Initialize database
    init_db()
    # Start Flask service (bind to 0.0.0.0 for public access, port customizable)
    # Test environment: debug=True; Production environment should disable debug and use gunicorn
    app.run(host='0.0.0.0', port=8080, debug=False)
```

### 离线推理
针对推理时延敏感度低（例如小时级响应）的场景，建议将 `service_tier` 设为 `flex`，一键切换至离线推理模式——价格仅为在线推理的 50%，显著降低业务成本。
> **注意**
> 根据业务场景设置合适的超时时间，超过该时间后任务将自动终止。

#### Python
```python
import os
import time  
# Install SDK:  pip install 'volcengine-python-sdk[ark]'
from volcenginesdkarkruntime import Ark 

# Make sure that you have stored the API Key in the environment variable ARK_API_KEY
# Initialize the Ark client to read your API Key from an environment variable
client = Ark(
    # This is the default path. You can configure it based on the service location
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    # Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
    api_key=os.environ.get("ARK_API_KEY"),
)

if __name__ == "__main__":
    print("----- create request -----")
    create_result = client.content_generation.tasks.create(
        model="doubao-seedance-1-0-pro-250528", # Replace with Model ID
        content=[
            {
                # Combination of text prompt and parameters
                "type": "text",
                "text": "女孩抱着狐狸，女孩睁开眼，温柔地看向镜头，狐狸友善地抱着，镜头缓缓拉出，女孩的头发被风吹动  --ratio adaptive  --dur 5"  
            },
            {
                # The URL of the first frame image
                "type": "image_url",
                "image_url": {
                    "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/i2v_foxrgirl.png" 
                }
            }
        ],
        service_tier="flex",
        execution_expires_after=172800,
    )
    print(create_result)

# Polling query section
    print("----- polling task status -----")
    task_id = create_result.id
    while True:
        get_result = client.content_generation.tasks.get(task_id=task_id)
        status = get_result.status
        if status == "succeeded":
            print("----- task succeeded -----")
            print(get_result)
            break
        elif status == "failed":
            print("----- task failed -----")
            print(f"Error: {get_result.error}")
            break
        else:
            print(f"Current status: {status}, Retrying after 60 seconds...")
            time.sleep(60)
```

#### Java & Go
（代码内容与原文一致，此处省略，可参考上文对应模块）

### 生成多个连续视频
使用前一个生成视频的尾帧，作为后一个视频任务的首帧，循环生成多个连续的视频。
后续您可以自行使用 FFmpeg 等工具，将生成的多个短视频拼接成一个完整长视频。

| 输出1提示词 | 输出2提示词 | 输出3提示词 |
| ---- | ---- | ---- |
| 女孩抱着狐狸，女孩睁开眼，温柔地看向镜头，狐狸友善地抱着，镜头缓缓拉出，女孩的头发被风吹动 | 女孩和狐狸在草地上奔跑，阳光明媚，女孩的笑容灿烂，狐狸欢快地跳跃 | 女孩和狐狸坐在树下休息，女孩轻轻抚摸狐狸的毛发，狐狸温顺地趴在女孩腿上 |

#### Python
```python
import os
import time  
# Install SDK:  pip install 'volcengine-python-sdk[ark]'
from volcenginesdkarkruntime import Ark 

# Make sure that you have stored the API Key in the environment variable ARK_API_KEY
# Initialize the Ark client to read your API Key from an environment variable
client = Ark(
    # This is the default path. You can configure it based on the service location
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    # Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
    api_key=os.environ.get("ARK_API_KEY"),
)

def generate_video_with_last_frame(prompt, initial_image_url=None):
    """
    Generate video and return video URL and last frame URL
    Parameters:
    prompt: Text prompt for video generation
    initial_image_url: Initial image URL (optional) 
    Returns:
    video_url: Generated video URL
    last_frame_url: URL of the last frame of the video
    """
    print(f"----- Generating video: {prompt} -----")

# Build content list
    content = [{
        "text": prompt,
        "type": "text"
    }]

# If initial image is provided, add to content
    if initial_image_url:
        content.append({
            "image_url": {
                "url": initial_image_url
            },
            "type": "image_url"
        })

# Create video generation task
    create_result = client.content_generation.tasks.create(
        model="doubao-seedance-1-0-pro-250528", # Replace with Model ID
        content=content,
        return_last_frame=True
    )

# Poll to check task status
    task_id = create_result.id
    while True:
        get_result = client.content_generation.tasks.get(task_id=task_id)
        status = get_result.status

if get_result.status == "succeeded":
            print("Video generation succeeded")
            try:
                if hasattr(get_result, 'content') and hasattr(get_result.content, 'video_url') and hasattr(get_result.content, 'last_frame_url'):
                    return get_result.content.video_url, get_result.content.last_frame_url
                print("Failed to obtain video URL or last frame URL")
                return None, None
            except Exception as e:
                print(f"Error occurred while obtaining video URL and last frame URL: {e}")
                return None, None
        elif status == "failed":
            print(f"----- Video generation failed -----")
            print(f"Error: {get_result.error}")
            return None, None
        else:
            print(f"Current status: {status}, retrying in 10 seconds...")
            time.sleep(10)

if __name__ == "__main__":
    # Define 3 video prompts
    prompts = [
        "女孩抱着狐狸，女孩睁开眼，温柔地看向镜头，狐狸友善地抱着，镜头缓缓拉出，女孩的头发被风吹动  --ratio adaptive  --dur 5",
        "女孩和狐狸在草地上奔跑，阳光明媚，女孩的笑容灿烂，狐狸欢快地跳跃  --ratio adaptive  --dur 5",
        "女孩和狐狸坐在树下休息，女孩轻轻抚摸狐狸的毛发，狐狸温顺地趴在女孩腿上  --ratio adaptive  --dur 5"
    ]

# Store generated video URLs
    video_urls = []

# Initial image URL
    initial_image_url = "https://ark-project.tos-cn-beijing.volces.com/doc_image/i2v_foxrgirl.png"

# Generate 3 short videos
    for i, prompt in enumerate(prompts):
        print(f"Generating video {i+1}")
        video_url, last_frame_url = generate_video_with_last_frame(prompt, initial_image_url)

if video_url and last_frame_url:
            video_urls.append(video_url)
            print(f"Video {i+1} URL: {video_url}")
            # Use the last frame of the current video as the first frame of the next video
            initial_image_url = last_frame_url
        else:
            print(f"Video {i+1} generation failed, exiting program")
            exit(1)

print("All videos generated successfully!")
    print("Generated video URL list:")
    for i, url in enumerate(video_urls):
        print(f"Video {i+1}: {url}")
```

## 使用限制
### 保存时间
任务数据（如任务状态、视频URL等）仅保留24小时，超时后会被自动清除。请您务必及时保存生成的视频。

### 限流说明
| 推理模式 | 限流类型 | 说明 |
| ---- | ---- | ---- |
| default（在线推理） | RPM 限流 | 账号下同模型（区分模型版本）每分钟允许创建的任务数量上限。若超过该限制，创建视频生成任务时会报错。 |
| | 并发数限制 | 账号下同模型（区分模型版本）同一时刻在处理中的任务数量上限。超过此限制的任务将进入队列等待处理。 |
| flex（离线推理） | TPD 限流 | 账号在一天内对同一模型（区分模型版本）的总调用 token 上限。超过此限制的调用请求将被拒绝。 |
> **说明**
> 不同模型的限制值不同，详见**模型选择**模块的参数表。

### 图片裁剪规则
Seedance 系列模型的图生视频场景，支持设置生成视频的宽高比。当选择的视频宽高与您上传的图片宽高比不一致时，方舟会对您的图片进行**居中裁剪**。

#### 裁剪规则
1.  **输入参数定义**
    - 原始图片宽度记为`W`（单位：像素），高度记为`H`（单位：像素）。
    - 目标比例记为`A:B`（例如，21:9），目标比例比值 `Ratio_目标 = A/B`。
    - 原始图片比例比值 `Ratio_原始 = W/H`。
2.  **裁剪基准判定**
    - 若 `Ratio_原始 < Ratio_目标`（原始图片偏竖高）：以宽度为基准裁剪，宽度保留原始值，高度按目标比例计算。
    - 若 `Ratio_原始 > Ratio_目标`（原始图片偏横宽）：以高度为基准裁剪，高度保留原始值，宽度按目标比例计算。
    - 若 `Ratio_原始 = Ratio_目标`：无需裁剪，直接使用全图。
3.  **裁剪尺寸计算**
    - **以宽度为基准**
        - 裁剪宽度 `Crop_W = W`
        - 裁剪高度 `Crop_H = (B/A) × W`
        - 裁剪起始坐标：X=0，Y=(H−Crop_H)/2（垂直居中）
    - **以高度为基准**
        - 裁剪高度 `Crop_H = H`
        - 裁剪宽度 `Crop_W = (A/B) × H`
        - 裁剪起始坐标：X=(W−Crop_W)/2（水平居中），Y=0
4.  **裁剪结果**
    最终裁剪出的图片尺寸为`Crop_W×Crop_H`，比例严格为`A:B`，且完全位于原始图片内部，无黑边。

#### 裁剪示例
以 Seedance 1.0 Pro 首帧图生视频功能为例，同一首帧图片在不同宽高比设置下的裁剪效果：
| 输入首帧图片 | 指定宽高比 | 生成视频结果 |
| ---- | ---- | ---- |
| 原始图片 | 16:9 | 对应裁剪后的16:9比例视频 |
| | 21:9 | 对应裁剪后的21:9比例视频 |
| | 4:3 | 对应裁剪后的4:3比例视频 |
| | 1:1 | 对应裁剪后的1:1比例视频 |
| | 3:4 | 对应裁剪后的3:4比例视频 |
| | 9:16 | 对应裁剪后的9:16比例视频 |
