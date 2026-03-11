# 通义万相-文生视频API参考
更新时间：2025-12-26 22:47:41

## 产品详情
我的收藏

通义万相文生视频模型基于文本提示词，生成一段流畅的视频。支持的能力包括：

基础能力：支持选择视频时长（5/10/15秒）、指定视频分辨率（480P/720P/1080P）、智能改写prompt、添加水印。

音频能力：支持自动配音，或传入自定义音频文件，实现音画同步。（wan2.5、wan2.6支持）

多镜头叙事：支持生成包含多个镜头的视频，在镜头切换的同时保持主体一致。（仅wan2.6支持）

快速入口：在线体验（北京｜新加坡）｜ 通义万相官网

## 说明
通义万相官网的功能与API支持的能力可能存在差异。本文档以API的实际能力为准，并会随功能更新及时同步。

## 模型概览
输入提示词 → 输出视频（wan2.6，多镜头视频）

一幅史诗级可爱的场景。一只小巧可爱的卡通小猫将军，身穿细节精致的金色盔甲，头戴一个稍大的头盔，勇敢地站在悬崖上。他骑着一匹虽小但英勇的战马，说：“青海长云暗雪山，孤城遥望玉门关。黄沙百战穿金甲，不破楼兰终不还”。悬崖下方，一支由老鼠组成的、数量庞大、无穷无尽的军队正带着临时制作的武器向前冲锋。这是一个戏剧性的、大规模的战斗场景，灵感来自中国古代的战争史诗。远处的雪山上空，天空乌云密布。整体氛围是“可爱”与“霸气”的搞笑和史诗般的融合。

| 模型名称（model） | 模型简介 | 输出视频规格 |
| --- | --- | --- |
| wan2.6-t2v（推荐） | 万相2.6（有声视频）<br>新增多镜头叙事能力 | 支持音频能力：支持自动配音，或传入自定义音频文件<br>分辨率档位：720P、1080P<br>视频时长：5秒、10秒、15秒<br>固定规格：30fps、MP4 (H.264编码) |
| wan2.5-t2v-preview（推荐） | 万相2.5 preview（有声视频）<br>新增音频能力：支持自动配音，或传入自定义音频文件 | 分辨率档位：480P、720P、1080P<br>视频时长：5秒、10秒<br>固定规格：30fps、MP4 (H.264编码) |
| wan2.2-t2v-plus | 万相2.2专业版（无声视频）<br>较2.1模型稳定性与成功率提升，速度提升50% | 分辨率档位：480P、1080P<br>视频时长：5秒<br>固定规格：30fps、MP4 (H.264编码) |
| wanx2.1-t2v-turbo | 万相2.1极速版（无声视频） | 分辨率档位：480P、720P<br>视频时长：5秒<br>固定规格：30fps、MP4 (H.264编码) |
| wanx2.1-t2v-plus | 万相2.1专业版（无声视频） | 分辨率档位：720P<br>视频时长：5秒<br>固定规格：30fps、MP4 (H.264编码) |

### 重要
调用前，请查阅各地域支持的模型列表与价格。

## 前提条件
在调用前，先获取与配置 API Key，再配置API Key到环境变量。如需通过SDK进行调用，请安装DashScope SDK。

### 重要
北京和新加坡地域拥有独立的 API Key 与请求地址，不可混用，跨地域调用将导致鉴权失败或服务报错。

## HTTP调用
由于文生视频任务耗时较长（通常为1-5分钟），API采用异步调用。整个流程包含 “创建任务 -> 轮询获取” 两个核心步骤，具体如下：

具体耗时受限于排队任务数和服务执行情况，请在获取结果时耐心等待。

### 步骤1：创建任务获取任务ID
北京地域：POST https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis

新加坡地域：POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis

#### 说明
创建成功后，使用接口返回的 task_id 查询结果，task_id 有效期为 24 小时。请勿重复创建任务，轮询获取即可。

新手指引请参见Postman。

### 接入指导
1. 多镜头叙事
```bash
运行
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \
    -H 'X-DashScope-Async: enable' \
    -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
    "model": "wan2.6-t2v",
    "input": {
        "prompt": "一幅史诗级可爱的场景。一只小巧可爱的卡通小猫将军，身穿细节精致的金色盔甲，头戴一个稍大的头盔，勇敢地站在悬崖上。他骑着一匹虽小但英勇的战马，说：”青海长云暗雪山，孤城遥望玉门关。黄沙百战穿金甲，不破楼兰终不还。“。悬崖下方，一支由老鼠组成的、数量庞大、无穷无尽的军队正带着临时制作的武器向前冲锋。这是一个戏剧性的、大规模的战斗场景，灵感来自中国古代的战争史诗。远处的雪山上空，天空乌云密布。整体氛围是“可爱”与“霸气”的搞笑和史诗般的融合。",
        "audio_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250923/hbiayh/%E4%BB%8E%E5%86%9B%E8%A1%8C.mp3"
    },
    "parameters": {
        "size": "1280*720",
        "prompt_extend": true,
        "duration": 10,
        "shot_type":"multi"
    }
}'
仅 wan2.6-t2v 模型支持生成多镜头视频。可通过设置 "prompt_extend": true 和 "shot_type":"multi" 启用。
```

2. 自动配音
```bash
运行
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \
    -H 'X-DashScope-Async: enable' \
    -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
    "model": "wan2.5-t2v-preview",
    "input": {
        "prompt": "一幅史诗级可爱的场景。一只小巧可爱的卡通小猫将军，身穿细节精致的金色盔甲，头戴一个稍大的头盔，勇敢地站在悬崖上。他骑着一匹虽小但英勇的战马，说：”青海长云暗雪山，孤城遥望玉门关。黄沙百战穿金甲，不破楼兰终不还。“。悬崖下方，一支由老鼠组成的、数量庞大、无穷无尽的军队正带着临时制作的武器向前冲锋。这是一个戏剧性的、大规模的战斗场景，灵感来自中国古代的战争史诗。远处的雪山上空，天空乌云密布。整体氛围是“可爱”与“霸气”的搞笑和史诗般的融合。"
    },
    "parameters": {
        "size": "832*480",
        "prompt_extend": true,
        "duration": 10
    }
}'
仅 wan2.5 及以上版本模型支持此功能。若不提供 input.audio_url ，模型将根据视频内容自动生成匹配的背景音乐或音效。
```

3. 传入音频文件

```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \
    -H 'X-DashScope-Async: enable' \
    -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
    "model": "wan2.5-t2v-preview",
    "input": {
        "prompt": "一幅史诗级可爱的场景。一只小巧可爱的卡通小猫将军，身穿细节精致的金色盔甲，头戴一个稍大的头盔，勇敢地站在悬崖上。他骑着一匹虽小但英勇的战马，说：”青海长云暗雪山，孤城遥望玉门关。黄沙百战穿金甲，不破楼兰终不还。“。悬崖下方，一支由老鼠组成的、数量庞大、无穷无尽的军队正带着临时制作的武器向前冲锋。这是一个戏剧性的、大规模的战斗场景，灵感来自中国古代的战争史诗。远处的雪山上空，天空乌云密布。整体氛围是“可爱”与“霸气”的搞笑和史诗般的融合。",
        "audio_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250923/hbiayh/%E4%BB%8E%E5%86%9B%E8%A1%8C.mp3"
    },
    "parameters": {
        "size": "832*480",
        "prompt_extend": true,
        "duration": 10
    }
}'
```
仅 wan2.5 及以上版本模型支持此功能。如需为视频指定背景音乐或配音，可通过 input.audio_url 参数传入自定义音频的 URL。

#### 请求参数
#### 请求头（Headers）
- Content-Type string （必选）：请求内容类型。此参数必须设置为application/json。
- Authorization string（必选）：请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。
- X-DashScope-Async string （必选）：异步处理配置参数。HTTP请求只支持异步，必须设置为enable。

##### 重要
缺少此请求头将报错：“current user api does not support synchronous calls”。

#### 请求体（Request Body）
- model string （必选）：模型名称。模型列表与价格详见模型价格。示例值：wan2.5-t2v-preview。
- input object （必选）：输入的基本信息，如提示词等。
  - 属性：
    - prompt string （必选）：文本提示词。用来描述生成视频中期望包含的元素和视觉特点。支持中英文，每个汉字/字母占一个字符，超过部分会自动截断。长度限制因模型版本而异：
      - wan2.6-t2v：长度不超过1500个字符。
      - wan2.5-t2v-preview：长度不超过1500个字符。
      - wan2.2及以下版本模型：长度不超过800个字符。
      示例值：一只小猫在月光下奔跑。
      提示词的使用技巧请参见文生视频/图生视频Prompt指南。
    - negative_prompt string （可选）：反向提示词，用来描述不希望在视频画面中看到的内容，可以对视频画面进行限制。支持中英文，长度不超过500个字符，超过部分会自动截断。示例值：低分辨率、错误、最差质量、低质量、残缺、多余的手指、比例不良等。
    - audio_url string （可选）：支持模型：wan2.6-t2v、 wan2.5-t2v-preview。音频文件URL，模型将使用该音频生成视频。使用方法参见设置音频参数。支持 HTTP 或 HTTPS 协议。本地文件可通过上传文件获取临时URL。
      - 音频限制：
        - 格式：wav、mp3。
        - 时长：3～30s。
        - 文件大小：不超过15MB。
      - 超限处理：若音频长度超过 duration 值（5秒或10秒），自动截取前5秒或10秒，其余部分丢弃。若音频长度不足视频时长，超出音频长度部分为无声视频。例如，音频为3秒，视频时长为5秒，输出视频前3秒有声，后2秒无声。
      示例值：https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/xxx.mp3。
- parameters object （可选）：图像处理参数。如设置视频分辨率、开启prompt智能改写、添加水印等。
  - 属性：
    - size string （可选）：
      ##### 重要
      size直接影响费用，费用 = 单价（基于分辨率）× 时长（秒）。同一模型：1080P > 720P > 480P，请在调用前确认模型价格。
      size必须设置为具体数值（如 1280*720），而不是 1:1或480P。
      指定生成的视频分辨率，格式为宽*高。该参数的默认值和可用枚举值依赖于 model 参数，规则如下：
      - wan2.6-t2v：默认值为 1920*1080（1080P）。可选分辨率：720P、1080P对应的所有分辨率。
      - wan2.5-t2v-preview：默认值为 1920*1080（1080P）。可选分辨率：480P、720P、1080P对应的所有分辨率。
      - wan2.2-t2v-plus：默认值为 1920*1080（1080P）。可选分辨率：480P、1080P对应的所有分辨率。
      - wanx2.1-t2v-turbo ：默认值为 1280*720（720P）。可选分辨率：480P、720P 对应的所有分辨率。
      - wanx2.1-t2v-plus：默认值为1280*720（720P）。可选分辨率：720P 对应的所有分辨率。
      480P档位：可选的视频分辨率及其对应的视频宽高比为：
      - 832*480：16:9。
      - 480*832：9:16。
      - 624*624：1:1。
      720P档位：可选的视频分辨率及其对应的视频宽高比为：
      - 1280*720：16:9。
      - 720*1280：9:16。
      - 960*960：1:1。
      - 1088*832：4:3。
      - 832*1088：3:4。
      1080P档位：可选的视频分辨率及其对应的视频宽高比为：
      - 1920*1080： 16:9。
      - 1080*1920： 9:16。
      - 1440*1440： 1:1。
      - 1632*1248： 4:3。
      - 1248*1632： 3:4。
    - duration integer （可选）：
      ##### 重要
      duration直接影响费用。费用 = 单价（基于分辨率）× 时长（秒），请在调用前确认模型价格。
      生成视频的时长，单位为秒。该参数的取值依赖于 model参数：
      - wan2.6-t2v：可选值为5、10、15。默认值为5。
      - wan2.5-t2v-preview：可选值为5、10。默认值为5。
      - wan2.2-t2v-plus：固定为5秒，且不支持修改。
      - wanx2.1-t2v-plus：固定为5秒，且不支持修改。
      - wanx2.1-t2v-turbo：固定为5秒，且不支持修改。
      示例值：5。
    - prompt_extend boolean （可选）：是否开启prompt智能改写。开启后使用大模型对输入prompt进行智能改写。对于较短的prompt生成效果提升明显，但会增加耗时。
      - true：默认值，开启智能改写。
      - false：不开启智能改写。
      示例值：true。
    - shot_type string （可选）：支持模型：wan2.6-t2v。指定生成视频的镜头类型，即视频是由一个连续镜头还是多个切换镜头组成。
      - 生效条件：仅当"prompt_extend": true 时生效。
      - 参数优先级：shot_type > prompt。例如，若 shot_type设置为"single"，即使 prompt 中包含“生成多镜头视频”，模型仍会输出单镜头视频。
      - 可选值：
        - single：默认值，输出单镜头视频。
        - multi：输出多镜头视频。
      示例值：single。
      说明：当希望严格控制视频的叙事结构（如产品展示用单镜头、故事短片用多镜头），可通过此参数指定。
    - watermark boolean （可选）：是否添加水印标识，水印位于视频右下角，文案固定为“AI生成”。
      - false：默认值，不添加水印。
      - true：添加水印。
      示例值：false。
    - seed integer （可选）：随机数种子，取值范围为[0, 2147483647]。未指定时，系统自动生成随机种子。若需提升生成结果的可复现性，建议固定seed值。请注意，由于模型生成具有概率性，即使使用相同 seed，也不能保证每次生成结果完全一致。示例值：12345。

### 响应参数
#### 成功响应
请保存 task_id，用于查询任务状态与结果。

```json
{
    "output": {
        "task_status": "PENDING",
        "task_id": "0385dc79-5ff8-4d82-bcb6-xxxxxx"
    },
    "request_id": "4909100c-7b5a-9f92-bfe5-xxxxxx"
}
```

- output object：任务输出信息。
  - 属性：
    - task_id string：任务ID。查询有效期24小时。
    - task_status string：任务状态。
      - 枚举值：
        - PENDING：任务排队中
        - RUNNING：任务处理中
        - SUCCEEDED：任务执行成功
        - FAILED：任务执行失败
        - CANCELED：任务已取消
        - UNKNOWN：任务不存在或状态未知
- request_id string：请求唯一标识。可用于请求明细溯源和问题排查。
- code string：请求失败的错误码。请求成功时不会返回此参数，详情请参见错误信息。
- message string：请求失败的详细信息。请求成功时不会返回此参数，详情请参见错误信息。

#### 异常响应
（无具体示例，详情请参见错误信息）

### 步骤2：根据任务ID查询结果
北京地域：GET https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}

新加坡地域：GET https://dashscope-intl.aliyuncs.com/api/v1/tasks/{task_id}

#### 说明
- 轮询建议：视频生成过程约需数分钟，建议采用轮询机制，并设置合理的查询间隔（如 15 秒）来获取结果。
- 任务状态流转：PENDING（排队中）→ RUNNING（处理中）→ SUCCEEDED（成功）/ FAILED（失败）。
- 结果链接：任务成功后返回视频链接，有效期为 24 小时。建议在获取链接后立即下载并转存至永久存储（如阿里云 OSS）。
- task_id 有效期：24小时，超时后将无法查询结果，接口将返回任务状态为UNKNOWN。
- QPS 限制：查询接口默认QPS为20。如需更高频查询或事件通知，建议配置异步任务回调。
- 更多操作：如需批量查询、取消任务等操作，请参见管理异步任务。

#### 请求参数
查询任务结果：请将86ecf553-d340-4e21-xxxxxxxxx替换为真实的task_id。

```curl
curl -X GET https://dashscope.aliyuncs.com/api/v1/tasks/86ecf553-d340-4e21-xxxxxxxxx \
--header "Authorization: Bearer $DASHSCOPE_API_KEY"
```

#### 请求头（Headers）
- Authorization string（必选）：请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。

#### URL路径参数（Path parameters）
- task_id string（必选）：任务ID。

#### 响应参数
##### 任务执行成功
视频URL仅保留24小时，超时后会被自动清除，请及时保存生成的视频。

```json
{
    "request_id": "caa62a12-8841-41a6-8af2-xxxxxx",
    "output": {
        "task_id": "eff1443c-ccab-4676-aad3-xxxxxx",
        "task_status": "SUCCEEDED",
        "submit_time": "2025-09-29 14:18:52.331",
        "scheduled_time": "2025-09-29 14:18:59.290",
        "end_time": "2025-09-29 14:23:39.407",
        "orig_prompt": "一幅史诗级可爱的场景。一只小巧可爱的卡通小猫将军，身穿细节精致的金色盔甲，头戴一个稍大的头盔，勇敢地站在悬崖上。他骑着一匹虽小但英勇的战马，说：”青海长云暗雪山，孤城遥望玉门关。黄沙百战穿金甲，不破楼兰终不还。“。悬崖下方，一支由老鼠组成的、数量庞大、无穷无尽的军队正带着临时制作的武器向前冲锋。这是一个戏剧性的、大规模的战斗场景，灵感来自中国古代的战争史诗。远处的雪山上空，天空乌云密布。整体氛围是“可爱”与“霸气”的搞笑和史诗般的融合。",
        "video_url": "https://dashscope-result-sh.oss-accelerate.aliyuncs.com/xxx.mp4?Expires=xxx"
    },
    "usage": {
        "duration": 10,
        "size": "1280*720",
        "input_video_duration": 0,
        "output_video_duration": 10,
        "video_count": 1,
        "SR": 720
    }
}
```

- output object：任务输出信息。
  - 属性：
    - task_id string（必选）：任务ID。
    - task_status string：任务状态。
      - 枚举值：
        - PENDING：任务排队中
        - RUNNING：任务处理中
        - SUCCEEDED：任务执行成功
        - FAILED：任务执行失败
        - CANCELED：任务已取消
        - UNKNOWN：任务不存在或状态未知
    - submit_time string：任务提交时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。
    - scheduled_time string：任务执行时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。
    - end_time string：任务完成时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。
    - video_url string：视频URL。仅在 task_status 为 SUCCEEDED 时返回。链接有效期24小时，可通过此URL下载视频。视频格式为MP4（H.264 编码）。
    - orig_prompt string：原始输入的prompt，对应请求参数prompt。
    - actual_prompt string：当 prompt_extend=true 时，系统会对输入 prompt 进行智能改写，此字段返回实际用于生成的优化后 prompt。若 prompt_extend=false，该字段不会返回。注意：wan2.6 模型无论 prompt_extend 取值如何，均不返回此字段。
    - code string：请求失败的错误码。请求成功时不会返回此参数，详情请参见错误信息。
    - message string：请求失败的详细信息。请求成功时不会返回此参数，详情请参见错误信息。
- usage object：输出信息统计。只对成功的结果计数。
  - 属性：
    - video_duration integer：仅在使用 wan2.5 及以下版本模型时返回，用于计费。生成视频的时长，单位秒。枚举值为5、10。
    - duration float：仅在使用 wan2.6 模型时返回，用于计费。表示总的视频时长，且duration=input_video_duration+output_video_duration。
    - input_video_duration integer：仅在使用 wan2.6 模型时返回。固定为0。
    - output_video_duration integer：仅在使用 wan2.6 模型时返回。输出视频的时长，单位秒。其值等同于input.duration的值。
    - SR integer：仅在使用 wan2.6 模型时返回。生成视频的分辨率档位。示例值：720。
    - size string：仅在使用 wan2.6 模型时返回。生成视频的分辨率。格式为“宽*高”，示例值：1920*1080。
    - video_ratio string：仅 wan2.5 及以下版本模型时返回。生成视频的分辨率。格式为“宽*高”，示例值：832*480。
    - video_count integer：生成视频的数量。固定为1。
- request_id string：请求唯一标识。可用于请求明细溯源和问题排查。

##### 任务执行失败
（无具体示例，详情请参见错误信息）

##### 任务查询过期
（无具体示例，接口返回任务状态为UNKNOWN）

## DashScope SDK调用
SDK 的参数命名与HTTP接口基本一致，参数结构根据语言特性进行封装。

由于文生视频任务耗时较长（通常为1-5分钟），SDK 在底层封装了 HTTP 异步调用流程，支持同步、异步两种调用方式。

具体耗时受限于排队任务数和服务执行情况，请在获取结果时耐心等待。

### Python SDK调用
#### 重要
wan2.6-t2v模型暂不支持SDK调用。

请确保 DashScope Python SDK 版本不低于 1.25.2，再运行以下代码。

若版本过低，可能会触发 “url error, please check url!” 等错误。请参考安装SDK进行更新。

##### 同步调用
###### 请求示例
```python
from http import HTTPStatus
from dashscope import VideoSynthesis
import dashscope
import os

# 以下为北京地域url，若使用新加坡地域的模型，需将url替换为：https://dashscope-intl.aliyuncs.com/api/v1
dashscope.base_http_api_url = 'https://dashscope.aliyuncs.com/api/v1'

# 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
# 新加坡和北京地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
api_key = os.getenv("DASHSCOPE_API_KEY")

def sample_sync_call_t2v():
    # call sync api, will return the result
    print('please wait...')
    rsp = VideoSynthesis.call(api_key=api_key,
                              model='wan2.5-t2v-preview',
                              prompt='一幅史诗级可爱的场景。一只小巧可爱的卡通小猫将军，身穿细节精致的金色盔甲，头戴一个稍大的头盔，勇敢地站在悬崖上。他骑着一匹虽小但英勇的战马，说：”青海长云暗雪山，孤城遥望玉门关。黄沙百战穿金甲，不破楼兰终不还。“。悬崖下方，一支由老鼠组成的、数量庞大、无穷无尽的军队正带着临时制作的武器向前冲锋。这是一个戏剧性的、大规模的战斗场景，灵感来自中国古代的战争史诗。远处的雪山上空，天空乌云密布。整体氛围是“可爱”与“霸气”的搞笑和史诗般的融合。',
                              audio_url='https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250923/hbiayh/%E4%BB%8E%E5%86%9B%E8%A1%8C.mp3',
                              size='832*480',
                              duration=10,
                              negative_prompt="",
                              prompt_extend=True,
                              watermark=False,
                              seed=12345)
    print(rsp)
    if rsp.status_code == HTTPStatus.OK:
        print(rsp.output.video_url)
    else:
        print('Failed, status_code: %s, code: %s, message: %s' %
              (rsp.status_code, rsp.code, rsp.message))


if __name__ == '__main__':
    sample_sync_call_t2v()
```

###### 响应示例
video_url 有效期24小时，请及时下载视频。

```json
{
    "status_code": 200,
    "request_id": "167f3beb-3dd0-47fe-a83c-xxxxxx",
    "code": null,
    "message": "",
    "output": {
        "task_id": "5b65411f-d946-4e29-859e-xxxxxx",
        "task_status": "SUCCEEDED",
        "video_url": "https://dashscope-result-bj.oss-accelerate.aliyuncs.com/xxx.mp4?Expires=xxx",
        "submit_time": "2025-10-23 11:47:23.879",
        "scheduled_time": "2025-10-23 11:47:34.351",
        "end_time": "2025-10-23 11:52:35.323",
        "orig_prompt": "一幅史诗级可爱的场景。一只小巧可爱的卡通小猫将军，身穿细节精致的金色盔甲，头戴一个稍大的头盔，勇敢地站在悬崖上。他骑着一匹虽小但英勇的战马，说：”青海长云暗雪山，孤城遥望玉门关。黄沙百战穿金甲，不破楼兰终不还。“。悬崖下方，一支由老鼠组成的、数量庞大、无穷无尽的军队正带着临时制作的武器向前冲锋。这是一个戏剧性的、大规模的战斗场景，灵感来自中国古代的战争史诗。远处的雪山上空，天空乌云密布。整体氛围是“可爱”与“霸气”的搞笑和史诗般的融合。",
        "actual_prompt": "中全景，柔光，暖色调，中心构图。画面背景为一幅史诗级可爱的场景。一只小巧可爱的卡通小猫将军，身穿细节精致的金色盔甲，头戴一个稍大的头盔，勇敢地站在悬崖上。他骑着一匹虽小但英勇的战马，说：“青海长云暗雪山，孤城遥望玉门关。黄沙百战穿金甲，不破楼兰终不还。” 悬崖下方，一支由老鼠组成的、数量庞大、无穷无尽的军队正带着临时制作的武器向前冲锋。这是一个戏剧性的、大规模的战斗场景，灵感来自中国古代的战争史诗。远处的雪山上空，天空乌云密布。整体氛围是“可爱”与“霸气”的搞笑和史诗般的融合。小猫将军的声音清晰有力，嘴部动作与说话内容完美同步。背景中可以看到风吹动树叶，增添动感。"
    },
    "usage": {
        "video_count": 1,
        "video_duration": 10,
        "video_ratio": "832*480"
    }
}
```

##### 异步调用
（无具体示例，参考同步调用修改即可）

### Java SDK调用
#### 重要
wan2.6-t2v模型暂不支持SDK调用。

请确保 DashScope Java SDK 版本不低于 2.22.2，再运行以下代码。

若版本过低，可能会触发 “url error, please check url!” 等错误。请参考安装SDK进行更新。

##### 同步调用
###### 请求示例
```java
// Copyright (c) Alibaba, Inc. and its affiliates.

import com.alibaba.dashscope.aigc.videosynthesis.VideoSynthesis;
import com.alibaba.dashscope.aigc.videosynthesis.VideoSynthesisParam;
import com.alibaba.dashscope.aigc.videosynthesis.VideoSynthesisResult;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.InputRequiredException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.utils.JsonUtils;
import com.alibaba.dashscope.utils.Constants;
import java.util.HashMap;
import java.util.Map;

public class Text2Video {

    static {
        // 以下为北京地域url，若使用新加坡地域的模型，需将url替换为：https://dashscope-intl.aliyuncs.com/api/v1
        Constants.baseHttpApiUrl = "https://dashscope.aliyuncs.com/api/v1";
    }

    // 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
    // 新加坡和北京地域的API Key不同。获取API Key：https://www.alibabacloud.com/help/zh/model-studio/get-api-key
    public static String apiKey = System.getenv("DASHSCOPE_API_KEY");

    /**
     * Create a video compositing task and wait for the task to complete.
     */
    public static void text2Video() throws ApiException, NoApiKeyException, InputRequiredException {
        VideoSynthesis vs = new VideoSynthesis();
        Map<String, Object> parameters = new HashMap<>();
        parameters.put("prompt_extend", true);
        parameters.put("watermark", false);
        parameters.put("seed", 12345);

        VideoSynthesisParam param =
                VideoSynthesisParam.builder()
                        .apiKey(apiKey)
                        .model("wan2.5-t2v-preview")
                        .prompt("一幅史诗级可爱的场景。一只小巧可爱的卡通小猫将军，身穿细节精致的金色盔甲，头戴一个稍大的头盔，勇敢地站在悬崖上。他骑着一匹虽小但英勇的战马，说：”青海长云暗雪山，孤城遥望玉门关。黄沙百战穿金甲，不破楼兰终不还。“。悬崖下方，一支由老鼠组成的、数量庞大、无穷无尽的军队正带着临时制作的武器向前冲锋。这是一个戏剧性的、大规模的战斗场景，灵感来自中国古代的战争史诗。远处的雪山上空，天空乌云密布。整体氛围是“可爱”与“霸气”的搞笑和史诗般的融合。")
                        .audioUrl("https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250923/hbiayh/%E4%BB%8E%E5%86%9B%E8%A1%8C.mp3")
                        .negativePrompt("")
                        .size("832*480")
                        .duration(10)
                        .parameters(parameters)
                        .build();
        System.out.println("please wait...");
        VideoSynthesisResult result = vs.call(param);
        System.out.println(JsonUtils.toJson(result));
    }

    public static void main(String[] args) {
        try {
            text2Video();
        } catch (ApiException | NoApiKeyException | InputRequiredException e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
```

###### 响应示例
video_url 有效期24小时，请及时下载视频。

```json
{
    "request_id": "4e9aab26-c50b-4ea7-b2c0-xxxxxx",
    "output": {
        "task_id": "9e0fc846-ee92-42ac-af42-xxxxxx",
        "task_status": "SUCCEEDED",
        "video_url": "https://dashscope-result-sh.oss-accelerate.aliyuncs.com/xxx.mp4?Expires=xxx"
    },
    "usage": {
        "video_count": 1,
        "video_duration": 10,
        "video_ratio": "832*480"
    }
}
```

##### 异步调用
（无具体示例，参考同步调用修改即可）

## 使用限制
1. 数据时效：任务task_id和 视频url均只保留 24 小时，过期后将无法查询或下载。
2. 音频支持：wan2.5及以上版本默认生成有声视频（支持自动配音或传入自定义音频）。wan2.2 及以下版本仅支持生成无声视频，如有需要，可通过语音合成生成音频。
3. 内容审核：输入内容和输出视频均会经过内容安全审核，包含违规内容的请求将报错“IPInfringementSuspect”或“DataInspectionFailed”，具体参见错误信息。
4. 网络访问配置：视频链接存储于阿里云 OSS，如果业务系统因安全策略无法访问外部OSS链接，请将以下 OSS 域名加入网络访问白名单。

```
# OSS域名列表
dashscope-result-bj.oss-cn-beijing.aliyuncs.com
dashscope-result-hz.oss-cn-hangzhou.aliyuncs.com
dashscope-result-sh.oss-cn-shanghai.aliyuncs.com
dashscope-result-wlcb.oss-cn-wulanchabu.aliyuncs.com
dashscope-result-zjk.oss-cn-zhangjiakou.aliyuncs.com
dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com
dashscope-result-hy.oss-cn-heyuan.aliyuncs.com
dashscope-result-cd.oss-cn-chengdu.aliyuncs.com
dashscope-result-gz.oss-cn-guangzhou.aliyuncs.com
dashscope-result-wlcb-acdr-1.oss-cn-wulanchabu-acdr-1.aliyuncs.com
```

## 关键参数说明
### 设置音频参数
支持的模型：wan2.6-t2v，wan2.5-t2v-preview。

音频设置：wan2.5及以上版本默认生成有声视频，音频行为由是否传入 input.audio_url 决定，支持以下两种模式：
1. 自动配音：当不传入 audio_url 时，模型将根据提示词和画面内容，自动生成匹配的背景音频或音乐。
2. 使用自定义音频：当传入 audio_url 时，模型将使用您提供的音频文件生成视频，视频画面会与音频内容对齐（如口型、节奏等）。

## 计费与限流
模型免费额度和计费单价请参见模型列表与价格。

模型限流请参见通义万相系列。

计费说明：
1. 按成功生成的 视频秒数 计费。仅当查询结果接口返回task_status为SUCCEEDED 并成功生成视频后，才会计费。
2. 模型调用失败或处理错误不产生任何费用，也不消耗免费额度。
3. 文生视频还支持节省计划，抵扣顺序为 免费额度 > 节省计划 > 按量付费。

## 错误码
如果模型调用失败并返回报错信息，请参见错误信息进行解决。

## 常见问题
Q: 如何查看模型调用量？

A: 模型调用完一小时后，请在模型观测页面，查看模型的调用次数、成功率等指标。如何查看模型调用记录？

Q: 如何将临时的视频链接转为永久链接？

A: 不能直接转换该链接。正确的做法是：后端服务获取到url后，通过代码下载该视频文件，然后将其上传到永久对象存储服务（如阿里云 OSS），生成一个新的、永久访问链接。


# 通义万相-图生视频API参考
更新时间：2025-12-26 22:47:55
产品详情
我的收藏
通义万相-图生视频模型根据首帧图像和文本提示词，生成一段流畅的视频。支持的能力包括：

- 基础能力：支持选择视频时长（ 3/4/5/10/15秒）、指定视频分辨率（480P/720P/1080P）、智能改写prompt、添加水印。
- 音频能力：支持自动配音，或传入自定义音频文件，实现音画同步。（wan2.5、wan2.6支持）
- 多镜头叙事：支持生成包含多个镜头的视频，在镜头切换时保持主体一致性。（仅wan2.6支持）
- 视频特效：部分模型内置“魔法悬浮”、“气球膨胀”等特效模板，可直接调用。

快速入口：在线体验（北京｜新加坡）｜ 通义万相官网 ｜ 视频特效列表

## 说明
通义万相官网的功能与API支持的能力可能存在差异。本文档以API的实际能力为准，并会随功能更新及时同步。

## 模型概览
输入首帧图像和音频

输出视频（wan2.6，多镜头视频）

rap-转换自-png

输入音频：

输入提示词：一幅都市奇幻艺术的场景。一个充满动感的涂鸦艺术角色。一个由喷漆所画成的少年，正从一面混凝土墙上活过来。他一边用极快的语速演唱一首英文rap，一边摆着一个经典的、充满活力的说唱歌手姿势。场景设定在夜晚一个充满都市感的铁路桥下。灯光来自一盏孤零零的街灯，营造出电影般的氛围，充满高能量和惊人的细节。视频的音频部分完全由他的rap构成，没有其他对话或杂音。

| 模型名称（model） | 模型简介 | 输出视频规格 |
| --- | --- | --- |
| wan2.6-i2v 推荐 | 万相2.6（有声视频）<br>新增多镜头叙事能力<br>支持音频能力：支持自动配音，或传入自定义音频文件 | 分辨率档位：720P、1080P<br>视频时长：5秒、10秒、15秒<br>固定规格：30fps、MP4 (H.264编码) |
| wan2.5-i2v-preview 推荐 | 万相2.5 preview（有声视频）<br>新增音频能力：支持自动配音，或传入自定义音频文件 | 分辨率档位：480P、720P、1080P<br>视频时长：5秒，10秒<br>固定规格：30fps、MP4 (H.264编码) |
| wan2.2-i2v-flash | 万相2.2极速版（无声视频）<br>较2.1模型速度提升50% | 分辨率档位：480P、720P、1080P<br>视频时长：5秒<br>固定规格：30fps、MP4 (H.264编码) |
| wan2.2-i2v-plus | 万相2.2专业版（无声视频）<br>较2.1模型稳定性与成功率全面提升 | 分辨率档位：480P、1080P<br>视频时长：5秒<br>固定规格：30fps、MP4 (H.264编码) |
| wanx2.1-i2v-plus | 万相2.1专业版（无声视频） | 分辨率档位：720P<br>视频时长：5秒<br>固定规格：30fps、MP4 (H.264编码) |
| wanx2.1-i2v-turbo | 万相2.1极速版（无声视频） | 分辨率档位：480P、720P<br>视频时长：3、4、5秒<br>固定规格：30fps、MP4 (H.264编码) |

### 说明
调用前，请查阅各地域支持的模型列表与价格。

## 前提条件
在调用前，先获取与配置 API Key，再配置API Key到环境变量。如需通过SDK进行调用，请安装DashScope SDK。

### 重要
北京和新加坡地域拥有独立的 API Key 与请求地址，不可混用，跨地域调用将导致鉴权失败或服务报错。

## HTTP调用
由于图生视频任务耗时较长（通常为1-5分钟），API采用异步调用。整个流程包含 “创建任务 -> 轮询获取” 两个核心步骤，具体如下：

具体耗时受限于排队任务数和服务执行情况，请在获取结果时耐心等待。

### 步骤1：创建任务获取任务ID
北京地域：POST https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis

新加坡地域：POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis

#### 说明
创建成功后，使用接口返回的 task_id 查询结果，task_id 有效期为 24 小时。请勿重复创建任务，轮询获取即可。

新手指引请参见Postman。

#### 请求参数
多镜头叙事自动配音传入音频文件生成无声视频使用Base64使用视频特效使用反向提示词
仅 wan2.5 及以上版本模型支持此功能。

如需为视频指定背景音乐或配音，可通过 input.audio_url 参数传入自定义音频的 URL。

### 接入示例
多镜头叙事
仅 wan2.6-i2v模型支持生成多镜头视频。

可通过设置"prompt_extend": true和"shot_type":"multi"启用。
 ```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \
    -H 'X-DashScope-Async: enable' \
    -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
    "model": "wan2.6-i2v",
    "input": {
        "prompt": "一幅都市奇幻艺术的场景。一个充满动感的涂鸦艺术角色。一个由喷漆所画成的少年，正从一面混凝土墙上活过来。他一边用极快的语速演唱一首英文rap，一边摆着一个经典的、充满活力的说唱歌手姿势。场景设定在夜晚一个充满都市感的铁路桥下。灯光来自一盏孤零零的街灯，营造出电影般的氛围，充满高能量和惊人的细节。视频的音频部分完全由他的rap构成，没有其他对话或杂音。",
        "img_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/wpimhv/rap.png",
        "audio_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/ozwpvi/rap.mp3"
    },
    "parameters": {
        "resolution": "720P",
        "prompt_extend": true,
        "duration": 10,
        "shot_type":"multi"
    }
}'
```

自动配音
仅 wan2.5 及以上版本模型支持此功能。

若不提供 input.audio_url ，模型将根据视频内容自动生成匹配的背景音乐或音效。
```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \
    -H 'X-DashScope-Async: enable' \
    -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
    "model": "wan2.5-i2v-preview",
    "input": {
        "prompt": "一幅都市奇幻艺术的场景。一个充满动感的涂鸦艺术角色。一个由喷漆所画成的少年，正从一面混凝土墙上活过来。他一边用极快的语速演唱一首英文rap，一边摆着一个经典的、充满活力的说唱歌手姿势。场景设定在夜晚一个充满都市感的铁路桥下。灯光来自一盏孤零零的街灯，营造出电影般的氛围，充满高能量和惊人的细节。视频的音频部分完全由他的rap构成，没有其他对话或杂音。",
        "img_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/wpimhv/rap.png"
    },
    "parameters": {
        "resolution": "480P",
        "prompt_extend": true,
        "duration": 10
    }
}'
```

传入音频文件
仅 wan2.5 及以上版本模型支持此功能。

如需为视频指定背景音乐或配音，可通过 input.audio_url 参数传入自定义音频的 URL。
```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \
    -H 'X-DashScope-Async: enable' \
    -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
    "model": "wan2.5-i2v-preview",
    "input": {
        "prompt": "一幅都市奇幻艺术的场景。一个充满动感的涂鸦艺术角色。一个由喷漆所画成的少年，正从一面混凝土墙上活过来。他一边用极快的语速演唱一首英文rap，一边摆着一个经典的、充满活力的说唱歌手姿势。场景设定在夜晚一个充满都市感的铁路桥下。灯光来自一盏孤零零的街灯，营造出电影般的氛围，充满高能量和惊人的细节。视频的音频部分完全由他的rap构成，没有其他对话或杂音。",
        "img_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/wpimhv/rap.png",
        "audio_url": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/ozwpvi/rap.mp3"
    },
    "parameters": {
        "resolution": "480P",
        "prompt_extend": true,
        "duration": 10
    }
}'
```

##### 请求头（Headers）
- Content-Type string （必选）：请求内容类型。此参数必须设置为application/json。
- Authorization string（必选）：请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。
- X-DashScope-Async string （必选）：异步处理配置参数。HTTP请求只支持异步，必须设置为enable。

###### 重要
缺少此请求头将报错：“current user api does not support synchronous calls”。

##### 请求体（Request Body）
- model string （必选）：模型名称。示例值：wan2.5-i2v-preview。模型列表与价格详见模型价格。
- input object （必选）：输入的基本信息，如提示词等。

###### 属性
- prompt string （可选）：文本提示词。用来描述生成图像中期望包含的元素和视觉特点。
  支持中英文，每个汉字/字母占一个字符，超过部分会自动截断。长度限制因模型版本而异：
  - wan2.6-i2v：长度不超过1500个字符。
  - wan2.5-i2v-preview：长度不超过1500个字符。
  - wan2.2及以下版本模型：长度不超过800个字符。
  当使用视频特效参数（即template不为空）时，prompt参数无效，无需填写。
  示例值：一只小猫在草地上奔跑。
  提示词使用技巧详见文生视频/图生视频Prompt指南。
- negative_prompt string （可选）：反向提示词，用来描述不希望在视频画面中看到的内容，可以对视频画面进行限制。
  支持中英文，长度不超过500个字符，超过部分会自动截断。
  示例值：低分辨率、错误、最差质量、低质量、残缺、多余的手指、比例不良等。
- img_url string （必选）：首帧图像的URL或 Base64 编码数据。
  图像限制：
  - 图像格式：JPEG、JPG、PNG（不支持透明通道）、BMP、WEBP。
  - 图像分辨率：图像的宽度和高度范围为[360, 2000]，单位为像素。
  - 文件大小：不超过10MB。
  输入图像说明：
  - 使用公网可访问URL：支持 HTTP 或 HTTPS 协议。本地文件可通过上传文件获取临时URL。示例值：https://cdn.translate.alibaba.com/r/wanx-demo-1.png。
  - 传入 Base64 编码图像后的字符串：数据格式：data:{MIME_type};base64,{base64_data}。示例值：data:image/png;base64,GDU7MtCZzEbTbmRZ......（编码字符串过长，仅展示片段）。
  更多内容请参见输入图像。
- audio_url string （可选）：支持模型：wan2.6-i2v、 wan2.5-i2v-preview。
  音频文件的 URL，模型将使用该音频生成视频。使用方式参见音频设置。
  支持 HTTP 或 HTTPS 协议。本地文件可通过上传文件获取临时URL。
  音频限制：
  - 格式：wav、mp3。
  - 时长：3～30s。
  - 文件大小：不超过15MB。
  超限处理：若音频长度超过 duration 值（5秒或10秒），自动截取前5秒或10秒，其余部分丢弃。若音频长度不足视频时长，超出音频长度部分为无声视频。例如，音频为3秒，视频时长为5秒，输出视频前3秒有声，后2秒无声。
  示例值：https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/ozwpvi/rap.mp3。
- template string （可选）：视频特效模板的名称。若未填写，表示不使用任何视频特效。
  不同模型支持不同的特效模板。调用前请查阅视频特效列表，以免调用失败。
  示例值：flying，表示使用“魔法悬浮”特效。
- parameters object （可选）：视频处理参数，如设置视频分辨率、设置视频时长、开启prompt智能改写、添加水印等。

###### 属性
- resolution string （可选）
  **重要**：resolution直接影响费用，同一模型：1080P > 720P > 480P，请在调用前确认模型价格。
  指定生成的视频分辨率档位，用于调整视频的清晰度（总像素）。模型根据选择的分辨率档位，自动缩放至相近总像素，视频宽高比将尽量与输入图像 img_url 的宽高比保持一致，更多说明详见常见问题。
  此参数的默认值和可用枚举值依赖于 model 参数，规则如下：
  - wan2.6-i2v ：可选值：720P、1080P。默认值为1080P。
  - wan2.5-i2v-preview ：可选值：480P、720P、1080P。默认值为1080P。
  - wan2.2-i2v-flash：可选值：480P、720P、1080P。默认值为720P。
  - wan2.2-i2v-plus：可选值：480P、1080P。默认值为1080P。
  - wanx2.1-i2v-turbo：可选值：480P、720P。默认值为720P。
  - wanx2.1-i2v-plus：可选值：720P。默认值为720P。
  示例值：1080P。
- duration integer （可选）
  **重要**：duration直接影响费用，按秒计费，时间越长费用越高，请在调用前确认模型价格。
  生成视频的时长，单位为秒。该参数的取值依赖于 model参数：
  - wan2.6-i2v：可选值为5、10、15。默认值为5。
  - wan2.5-i2v-preview：可选值为5、10。默认值为5。
  - wan2.2-i2v-plus：固定为5秒，且不支持修改。
  - wan2.2-i2v-flash：固定为5秒，且不支持修改。
  - wanx2.1-i2v-plus：固定为5秒，且不支持修改。
  - wanx2.1-i2v-turbo：可选值为3、4或5。默认值为5。
  示例值：5。
- prompt_extend boolean （可选）：是否开启prompt智能改写。开启后使用大模型对输入prompt进行智能改写。对于较短的prompt生成效果提升明显，但会增加耗时。
  - true：默认值，开启智能改写。
  - false：不开启智能改写。
  示例值：true。
- shot_type string （可选）：支持模型：wan2.6-i2v。
  指定生成视频的镜头类型，即视频是由一个连续镜头还是多个切换镜头组成。
  生效条件：仅当"prompt_extend": true 时生效。
  参数优先级：shot_type > prompt。例如，若 shot_type设置为"single"，即使 prompt 中包含“生成多镜头视频”，模型仍会输出单镜头视频。
  可选值：
  - single：默认值，输出单镜头视频
  - multi：输出多镜头视频。
  示例值：single。
  说明：当希望严格控制视频的叙事结构（如产品展示用单镜头、故事短片用多镜头），可通过此参数指定。
- watermark boolean （可选）：是否添加水印标识，水印位于视频右下角，文案固定为“AI生成”。
  - false：默认值，不添加水印。
  - true：添加水印。
  示例值：false。
- seed integer （可选）：随机数种子，取值范围为[0, 2147483647]。
  未指定时，系统自动生成随机种子。若需提升生成结果的可复现性，建议固定seed值。
  请注意，由于模型生成具有概率性，即使使用相同 seed，也不能保证每次生成结果完全一致。
  示例值：12345。

#### 响应参数
成功响应异常响应
请保存 task_id，用于查询任务状态与结果。

```json
{
    "output": {
        "task_status": "PENDING",
        "task_id": "0385dc79-5ff8-4d82-bcb6-xxxxxx"
    },
    "request_id": "4909100c-7b5a-9f92-bfe5-xxxxxx"
}
```

- output object：任务输出信息。
  属性：
  - task_id string：任务ID。查询有效期24小时。
  - task_status string：任务状态。
    枚举值：
    - PENDING：任务排队中
    - RUNNING：任务处理中
    - SUCCEEDED：任务执行成功
    - FAILED：任务执行失败
    - CANCELED：任务已取消
    - UNKNOWN：任务不存在或状态未知
  - request_id string：请求唯一标识。可用于请求明细溯源和问题排查。
  - code string：请求失败的错误码。请求成功时不会返回此参数，详情请参见错误信息。
  - message string：请求失败的详细信息。请求成功时不会返回此参数，详情请参见错误信息。

### 步骤2：根据任务ID查询结果
GET https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}

#### 说明
轮询建议：视频生成过程约需数分钟，建议采用轮询机制，并设置合理的查询间隔（如 15 秒）来获取结果。

任务状态流转：PENDING（排队中）→ RUNNING（处理中）→ SUCCEEDED（成功）/ FAILED（失败）。

结果链接：任务成功后返回视频链接，有效期为 24 小时。建议在获取链接后立即下载并转存至永久存储（如阿里云 OSS）。

task_id 有效期：24小时，超时后将无法查询结果，接口将返回任务状态为UNKNOWN。

QPS 限制：查询接口默认QPS为20。如需更高频查询或事件通知，建议配置异步任务回调。

更多操作：如需批量查询、取消任务等操作，请参见管理异步任务。

#### 请求参数
查询任务结果
请将86ecf553-d340-4e21-xxxxxxxxx替换为真实的task_id。

```bash
curl -X GET https://dashscope.aliyuncs.com/api/v1/tasks/86ecf553-d340-4e21-xxxxxxxxx \
--header "Authorization: Bearer $DASHSCOPE_API_KEY"
```

##### 请求头（Headers）
- Authorization string（必选）：请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。

##### URL路径参数（Path parameters）
- task_id string（必选）：任务ID。

#### 响应参数
任务执行成功任务执行失败任务查询过期
视频URL仅保留24小时，超时后会被自动清除，请及时保存生成的视频。

```json
{
    "request_id": "2ca1c497-f9e0-449d-9a3f-xxxxxx",
    "output": {
        "task_id": "af6efbc0-4bef-4194-8246-xxxxxx",
        "task_status": "SUCCEEDED",
        "submit_time": "2025-09-25 11:07:28.590",
        "scheduled_time": "2025-09-25 11:07:35.349",
        "end_time": "2025-09-25 11:17:11.650",
        "orig_prompt": "一幅都市奇幻艺术的场景。一个充满动感的涂鸦艺术角色。一个由喷漆所画成的少年，正从一面混凝土墙上活过来。他一边用极快的语速演唱一首英文rap，一边摆着一个经典的、充满活力的说唱歌手姿势。场景设定在夜晚一个充满都市感的铁路桥下。灯光来自一盏孤零零的街灯，营造出电影般的氛围，充满高能量和惊人的细节。视频的音频部分完全由他的rap构成，没有其他对话或杂音。",
        "video_url": "https://dashscope-result-sh.oss-cn-shanghai.aliyuncs.com/xxx.mp4?Expires=xxx"
    },
    "usage": {
        "duration": 10,
        "input_video_duration": 0,
        "output_video_duration": 10,
        "video_count": 1,
        "SR": 720
    }
}
```

- output object：任务输出信息。
  属性：
  - task_id string：任务ID。查询有效期24小时。
  - task_status string：任务状态。
    枚举值：
    - PENDING：任务排队中
    - RUNNING：任务处理中
    - SUCCEEDED：任务执行成功
    - FAILED：任务执行失败
    - CANCELED：任务已取消
    - UNKNOWN：任务不存在或状态未知
    轮询过程中的状态流转：
    PENDING（排队中） → RUNNING（处理中）→ SUCCEEDED（成功）/ FAILED（失败）。
    初次查询状态通常为 PENDING（排队中）或 RUNNING（处理中）。
    当状态变为 SUCCEEDED 时，响应中将包含生成的视频url。
    若状态为 FAILED，请检查错误信息并重试。
  - submit_time string：任务提交时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。
  - scheduled_time string：任务执行时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。
  - end_time string：任务完成时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。
  - video_url string：视频URL。仅在 task_status 为 SUCCEEDED 时返回。
    链接有效期24小时，可通过此URL下载视频。视频格式为MP4（H.264 编码）。
  - orig_prompt string：原始输入的prompt，对应请求参数prompt。
  - actual_prompt string：当 prompt_extend=true 时，系统会对输入 prompt 进行智能改写，此字段返回实际用于生成的优化后 prompt。
    若 prompt_extend=false，该字段不会返回。
    注意：wan2.6 模型无论 prompt_extend 取值如何，均不返回此字段。
  - code string：请求失败的错误码。请求成功时不会返回此参数，详情请参见错误信息。
  - message string：请求失败的详细信息。请求成功时不会返回此参数，详情请参见错误信息。
- usage object：输出信息统计，只对成功的结果计数。
  属性：
  - wan2.6模型返回参数
    - input_video_duration integer：输入的视频的时长，单位秒。当前不支持传入视频，因此固定为0。
    - output_video_duration integer：仅在使用 wan2.6 模型时返回。输出视频的时长，单位秒。其值等同于input.duration的值。
    - duration integer：总的视频时长，用于计费。计费公式：duration=input_video_duration+output_video_duration。
    - SR integer：仅在使用 wan2.6 模型时返回。生成视频的分辨率档位。示例值：720。
    - video_count integer：生成视频的数量。固定为1。
  - wan2.2和wan2.5模型返回参数
  - wan2.1模型返回参数
- request_id string：请求唯一标识。可用于请求明细溯源和问题排查。

## DashScope SDK调用
SDK 的参数命名与HTTP接口基本一致，参数结构根据语言特性进行封装。

由于图生视频任务耗时较长（通常为1-5分钟），SDK 在底层封装了 HTTP 异步调用流程，支持同步、异步两种调用方式。

具体耗时受限于排队任务数和服务执行情况，请在获取结果时耐心等待。

### Python SDK调用
Python SDK 支持三种图像输入方式：公网 URL、Base64 编码字符串、本地文件路径（绝对/相对），任选其一即可，具体参见输入图像。

**重要**：wan2.6-i2v暂不支持SDK调用。

请确保 DashScope Python SDK 版本不低于 1.25.2，再运行以下代码。

若版本过低，可能会触发 “url error, please check url!” 等错误。请参考安装SDK进行更新。

#### 示例代码
同步调用异步调用
同步调用会阻塞等待，直到视频生成完成并返回结果。本示例展示三种图像输入方式：公网URL、Base64编码、本地文件路径。

##### 请求示例
```python
import base64
import os
from http import HTTPStatus
from dashscope import VideoSynthesis
import mimetypes
import dashscope

# 以下为北京地域url，若使用新加坡地域的模型，需将url替换为：https://dashscope-intl.aliyuncs.com/api/v1
dashscope.base_http_api_url = 'https://dashscope.aliyuncs.com/api/v1'

# 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
# 新加坡和北京地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
api_key = os.getenv("DASHSCOPE_API_KEY")

# --- 辅助函数：用于 Base64 编码 ---
# 格式为 data:{MIME_type};base64,{base64_data}
def encode_file(file_path):
    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type or not mime_type.startswith("image/"):
        raise ValueError("不支持或无法识别的图像格式")
    with open(file_path, "rb") as image_file:
        encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
    return f"data:{mime_type};base64,{encoded_string}"

"""
图像输入方式说明：
以下提供了三种图片输入方式，三选一即可

1. 使用公网URL - 适合已有公开可访问的图片
2. 使用本地文件 - 适合本地开发测试
3. 使用Base64编码 - 适合私有图片或需要加密传输的场景
"""

# 【方式一】使用公网可访问的图片URL
# 示例：使用一个公开的图片URL
img_url = "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/wpimhv/rap.png"

# 【方式二】使用本地文件（支持绝对路径和相对路径）
# 格式要求：file:// + 文件路径
# 示例（绝对路径）：
# img_url = "file://" + "/path/to/your/img.png"    # Linux/macOS
# img_url = "file://" + "/C:/path/to/your/img.png"  # Windows
# 示例（相对路径）：
# img_url = "file://" + "./img.png"                # 相对当前执行文件的路径

# 【方式三】使用Base64编码的图片
# img_url = encode_file("./img.png")

# 设置音频audio url
audio_url = "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/ozwpvi/rap.mp3"

def sample_call_i2v():
    # 同步调用，直接返回结果
    print('please wait...')
    rsp = VideoSynthesis.call(api_key=api_key,
                              model='wan2.5-i2v-preview',
                              prompt='一幅都市奇幻艺术的场景。一个充满动感的涂鸦艺术角色。一个由喷漆所画成的少年，正从一面混凝土墙上活过来。他一边用极快的语速演唱一首英文rap，一边摆着一个经典的、充满活力的说唱歌手姿势。场景设定在夜晚一个充满都市感的铁路桥下。灯光来自一盏孤零零的街灯，营造出电影般的氛围，充满高能量和惊人的细节。视频的音频部分完全由他的rap构成，没有其他对话或杂音。',
                              img_url=img_url,
                              audio_url=audio_url,
                              resolution="480P",
                              duration=10,
                              prompt_extend=True,
                              watermark=False,
                              negative_prompt="",
                              seed=12345)
    print(rsp)
    if rsp.status_code == HTTPStatus.OK:
        print("video_url:", rsp.output.video_url)
    else:
        print('Failed, status_code: %s, code: %s, message: %s' %
              (rsp.status_code, rsp.code, rsp.message))


if __name__ == '__main__':
    sample_call_i2v()
```

##### 响应示例
video_url 有效期24小时，请及时下载视频。

```json
{
    "status_code": 200,
    "request_id": "55194b9a-d281-4565-8ef6-xxxxxx",
    "code": null,
    "message": "",
    "output": {
        "task_id": "e2bb35a2-0218-4969-8c0d-xxxxxx",
        "task_status": "SUCCEEDED",
        "video_url": "https://dashscope-result-sh.oss-cn-shanghai.aliyuncs.com/xxx.mp4?Expires=xxx",
        "submit_time": "2025-10-28 13:45:48.620",
        "scheduled_time": "2025-10-28 13:45:57.378",
        "end_time": "2025-10-28 13:48:05.361",
        "orig_prompt": "一幅都市奇幻艺术的场景。一个充满动感的涂鸦艺术角色。一个由喷漆所画成的少年，正从一面混凝土墙上活过来。他一边用极快的语速演唱一首英文rap，一边摆着一个经典的、充满活力的说唱歌手姿势。场景设定在夜晚一个充满都市感的铁路桥下。灯光来自一盏孤零零的街灯，营造出电影般的氛围，充满高能量和惊人的细节。视频的音频部分完全由他的rap构成，没有其他对话或杂音。",
        "actual_prompt": "一位由喷漆构成的少年从混凝土墙中浮现，站定后开始演唱英文rap，嘴巴开合，头部随节奏晃动，眼神专注。他右手竖起大拇指，左手叉腰，身体在原地进行节奏性律动。背景为铁路桥下夜间环境，一盏街灯照明。音频为他的rap演唱，内容为：'Skyscrapers loom, shadows kiss the pavement. Dreams stack high, but the soul's in the basement. Pocket full of lint, chasing gold like it's sacred. Every breath a gamble, the odds never patient.'"
    },
    "usage": {
        "video_count": 1,
        "video_duration": 0,
        "video_ratio": "",
        "duration": 10,
        "SR": 480
    }
}
```

### Java SDK调用
Java SDK 支持三种图像输入方式：公网 URL、Base64 编码字符串、本地文件路径（绝对路径），任选其一即可，具体参见输入图像。

**重要**：wan2.6-i2v暂不支持SDK调用。

请确保 DashScope Java SDK 版本不低于 2.22.2，再运行以下代码。

若版本过低，可能会触发 “url error, please check url!” 等错误。请参考安装SDK进行更新。

#### 示例代码
同步调用异步调用
同步调用会阻塞等待，直到视频生成完成并返回结果。本示例展示三种图像输入方式：公网URL、Base64编码、本地文件路径。

##### 请求示例
```java
// Copyright (c) Alibaba, Inc. and its affiliates.

import com.alibaba.dashscope.aigc.videosynthesis.VideoSynthesis;
import com.alibaba.dashscope.aigc.videosynthesis.VideoSynthesisParam;
import com.alibaba.dashscope.aigc.videosynthesis.VideoSynthesisResult;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.InputRequiredException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.utils.JsonUtils;
import com.alibaba.dashscope.utils.Constants;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
 
public class Image2Video {

    static {
        // 以下为北京地域url，若使用新加坡地域的模型，需将url替换为：https://dashscope-intl.aliyuncs.com/api/v1
        Constants.baseHttpApiUrl = "https://dashscope.aliyuncs.com/api/v1";
    }

    // 若没有配置环境变量，请用百炼API Key将下行替换为：apiKey="sk-xxx"
    // 新加坡和北京地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
    static String apiKey = System.getenv("DASHSCOPE_API_KEY");
    
    /**
     * 图像输入方式说明：三选一即可
     *
     * 1. 使用公网URL - 适合已有公开可访问的图片
     * 2. 使用本地文件 - 适合本地开发测试
     * 3. 使用Base64编码 - 适合私有图片或需要加密传输的场景
     */

    //【方式一】公网URL
    static String imgUrl = "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/wpimhv/rap.png";

    //【方式二】本地文件路径（file://+绝对路径）
    // static String imgUrl = "file://" + "/your/path/to/img.png";    // Linux/macOS
    // static String imgUrl = "file://" + "/C:/your/path/to/img.png";  // Windows

    //【方式三】Base64编码
    // static String imgUrl = Image2Video.encodeFile("/your/path/to/img.png");
    
    // 设置音频audio url
    static String audioUrl = "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250925/ozwpvi/rap.mp3";

    public static void image2video() throws ApiException, NoApiKeyException, InputRequiredException {
        // 设置parameters参数
        Map<String, Object> parameters = new HashMap<>();
        parameters.put("prompt_extend", true);
        parameters.put("watermark", false);
        parameters.put("seed", 12345);

        VideoSynthesis vs = new VideoSynthesis();
        VideoSynthesisParam param =
                VideoSynthesisParam.builder()
                        .apiKey(apiKey)
                        .model("wan2.5-i2v-preview")
                        .prompt("一幅都市奇幻艺术的场景。一个充满动感的涂鸦艺术角色。一个由喷漆所画成的少年，正从一面混凝土墙上活过来。他一边用极快的语速演唱一首英文rap，一边摆着一个经典的、充满活力的说唱歌手姿势。场景设定在夜晚一个充满都市感的铁路桥下。灯光来自一盏孤零零的街灯，营造出电影般的氛围，充满高能量和惊人的细节。视频的音频部分完全由他的rap构成，没有其他对话或杂音。")
                        .imgUrl(imgUrl)
                        .audioUrl(audioUrl)
                        .duration(10)
                        .parameters(parameters)
                        .resolution("480P")
                        .negativePrompt("")
                        .build();
        System.out.println("please wait...");
        VideoSynthesisResult result = vs.call(param);
        System.out.println(JsonUtils.toJson(result));
    }
    
     /**
     * 将文件编码为Base64字符串
     * @param filePath 文件路径
     * @return Base64字符串，格式为 data:{MIME_type};base64,{base64_data}
     */
    public static String encodeFile(String filePath) {
        Path path = Paths.get(filePath);
        if (!Files.exists(path)) {
            throw new IllegalArgumentException("文件不存在: " + filePath);
        }
        // 检测MIME类型
        String mimeType = null;
        try {
            mimeType = Files.probeContentType(path);
        } catch (IOException e) {
            throw new IllegalArgumentException("无法检测文件类型: " + filePath);
        }
        if (mimeType == null || !mimeType.startsWith("image/")) {
            throw new IllegalArgumentException("不支持或无法识别的图像格式");
        }
        // 读取文件内容并编码
        byte[] fileBytes = null;
        try{
            fileBytes = Files.readAllBytes(path);
        } catch (IOException e) {
            throw new IllegalArgumentException("无法读取文件内容: " + filePath);
        }
    
        String encodedString = Base64.getEncoder().encodeToString(fileBytes);
        return "data:" + mimeType + ";base64," + encodedString;
    }
    

    public static void main(String[] args) {
        try {
            image2video();
        } catch (ApiException | NoApiKeyException | InputRequiredException e) {
            System.out.println(e.getMessage());
        }
        System.exit(0);
    }
}
```

##### 响应示例
video_url 有效期24小时，请及时下载视频。

```json
{
    "request_id": "f1bfb531-6e13-4e17-8e93-xxxxxx",
    "output": {
        "task_id": "9ddebba6-f784-4f55-b845-xxxxxx",
        "task_status": "SUCCEEDED",
        "video_url": "https://dashscope-result-sh.oss-cn-shanghai.aliyuncs.com/xxx.mp4?Expires=xxx"
    },
    "usage": {
        "video_count": 1
    }
}
```

## 使用限制
- 数据时效：任务task_id和 视频url均只保留 24 小时，过期后将无法查询或下载。
- 音频支持：wan2.5及以上版本默认生成有声视频（支持自动配音或传入自定义音频）。wan2.2 及以下版本仅支持生成无声视频，如有需要，可通过语音合成生成音频。
- 内容审核：输入的内容（如prompt、图像）、输出视频均会经过内容安全审核，含违规内容将返回 “IPInfringementSuspect”或“DataInspectionFailed”错误，详见参见错误信息。
- 网络访问配置：视频链接存储于阿里云 OSS，如果业务系统因安全策略无法访问外部OSS链接，请将以下 OSS 域名加入网络访问白名单。

```
# OSS域名列表
dashscope-result-bj.oss-cn-beijing.aliyuncs.com
dashscope-result-hz.oss-cn-hangzhou.aliyuncs.com
dashscope-result-sh.oss-cn-shanghai.aliyuncs.com
dashscope-result-wlcb.oss-cn-wulanchabu.aliyuncs.com
dashscope-result-zjk.oss-cn-zhangjiakou.aliyuncs.com
dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com
dashscope-result-hy.oss-cn-heyuan.aliyuncs.com
dashscope-result-cd.oss-cn-chengdu.aliyuncs.com
dashscope-result-gz.oss-cn-guangzhou.aliyuncs.com
dashscope-result-wlcb-acdr-1.oss-cn-wulanchabu-acdr-1.aliyuncs.com
```

## 关键参数说明
### 输入图像
输入图像 img_url 参数支持以下三种方式传入：

方式一：公网URL方式二：Base 64编码方式三：本地文件路径（仅限 SDK）
一个公网可直接访问的地址，支持 HTTP/HTTPS。本地文件可通过上传文件获取临时URL。

示例值：https://example.com/images/cat.png。

### 音频设置
支持的模型：wan2.6-i2v、wan2.5-i2v-preview。

音频设置：wan2.5及以上版本默认生成有声视频，音频行为由是否传入 input.audio_url 决定，支持以下两种模式：

- 自动配音：当不传入 audio_url 时，模型将根据提示词和画面内容，自动生成匹配的背景音频或音乐。
- 使用自定义音频：当传入 audio_url 时，模型将使用您提供的音频文件生成视频，视频画面会与音频内容对齐（如口型、节奏等）。

## 计费与限流
模型免费额度和计费单价请参见模型列表与价格。

模型限流请参见通义万相系列。

计费说明：

- 按成功生成的 视频秒数 计费。仅当查询结果接口返回task_status为SUCCEEDED 并成功生成视频后，才会计费。
- 模型调用失败或处理错误不产生任何费用，也不消耗免费额度。
- 图生视频还支持节省计划，抵扣顺序为 免费额度 > 节省计划 > 按量付费。

## 错误码
如果模型调用失败并返回报错信息，请参见错误信息进行解决。

## 常见问题
视频FAQ快速入口：常见问题。

Q：如何生成特定宽高比（如3:4）的视频？
A： 输出视频的宽高比由输入首帧图像（img_url）决定，但无法保证精确比例（如严格3:4）。

工作原理：模型以输入图像的宽高比为基准，然后根据 resolution 参数（如 480P / 720P / 1080P）将其适配到模型支持的合法分辨率。由于输出分辨率需满足技术要求（长和宽必须能被 16 整除），最终输出的宽高比可能存在微小偏差（例如从 0.75 调整为 0.739），属于正常现象。

示例：输入图像750×1000（宽高比 3:4 = 0.75），并设置 resolution = "720P"（目标总像素约 92 万），实际输出816×1104（宽高比 ≈ 0.739，总像素约90万）。

请注意，resolution 参数主要用于控制视频清晰度（总像素量），最终视频宽高比仍以输入图像为基础，仅做必要微调。

最佳实践：若需严格符合目标宽高比，请使用与目标比例一致的输入图像，并对输出视频进行后处理裁剪或填充。例如，使用视频编辑工具将输出视频裁剪至目标比例，或添加黑边、模糊背景进行填充适配

# 通义万相-首尾帧生视频API参考
更新时间：2025-11-26 13:55:50
产品详情
我的收藏
通义万相首尾帧生视频模型基于首帧图像、尾帧图像和文本提示词，生成一段平滑过渡的视频。支持的能力包括：

基础能力：视频时长固定（5秒）、指定视频分辨率（480P/720P/1080P）、智能改写prompt、添加水印。

特效模板：仅输入首帧图片，并选择一个特效模板，即可生成具有特定动态效果的视频。

快速入口：通义万相官网在线体验 ｜ 视频特效列表

说明
通义万相官网的功能与API支持的能力可能存在差异。本文档以API的实际能力为准，并会随功能更新及时同步。

## 模型概览
| 模型功能 | 输入示例 | 输出视频 |
| ---- | ---- | ---- |
| 首尾帧生视频 | 首帧图片<br>尾帧图片<br>提示词：写实风格，一只黑色小猫好奇地看向天空，镜头从平视逐渐上升，最后俯拍它的好奇的眼神。 | 首尾帧生视频 |
| 视频特效 | 无<br>无<br>使用“唐韵翩然”特效，template设置为“hanfu-1” | 首尾帧生视频-视频特效-demo |

| 模型名称（model） | 模型简介 | 输出视频规格 |
| ---- | ---- | ---- |
| wan2.2-kf2v-flash 推荐 | 万相2.2极速版（无声视频）<br>较2.1模型速度提升50%，稳定性与成功率全面提升 | 分辨率档位：480P、720P、1080P<br>视频时长：5秒<br>固定规格：30fps、MP4（H.264编码） |
| wanx2.1-kf2v-plus | 万相2.1专业版（无声视频）<br>复杂运动，物理规律还原，画面细腻 | 分辨率档位：720P<br>视频时长：5秒<br>固定规格：30fps、MP4（H.264编码） |

说明
调用前，请查阅各地域支持的模型列表与价格。

## 前提条件
在调用前，需要获取API Key，再配置API Key到环境变量。如果通过SDK进行调用，请安装DashScope SDK。目前，该SDK已支持Python和Java。

重要
北京和新加坡地域拥有独立的 API Key 与请求地址，不可混用，跨地域调用将导致鉴权失败或服务报错。

## HTTP调用
由于图生视频任务耗时较长（通常为1-5分钟），API采用异步调用。整个流程包含 “创建任务 -> 轮询获取” 两个核心步骤，具体如下：

具体耗时受限于排队任务数和服务执行情况，请在获取结果时耐心等待。

### 步骤1：创建任务获取任务ID
北京地域：`POST https://dashscope.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis`

新加坡地域：`POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis`

说明
创建成功后，使用接口返回的 task_id 查询结果，task_id 有效期为 24 小时。请勿重复创建任务，轮询获取即可。

新手指引请参见Postman。

#### 请求参数
首尾帧生视频使用Base64使用视频特效使用反向提示词
根据首帧、尾帧和prompt生成视频。

```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis' \
    -H 'X-DashScope-Async: enable' \
    -H "Authorization: Bearer $DASHSCOPE_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
    "model": "wan2.2-kf2v-flash",
    "input": {
        "first_frame_url": "https://wanx.alicdn.com/material/20250318/first_frame.png",
        "last_frame_url": "https://wanx.alicdn.com/material/20250318/last_frame.png",
        "prompt": "写实风格，一只黑色小猫好奇地看向天空，镜头从平视逐渐上升，最后俯拍它的好奇的眼神。"
    },
    "parameters": {
        "resolution": "480P",
        "prompt_extend": true
    }
}'
```

##### 请求头（Headers）
| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| Content-Type | string | 必选，请求内容类型。此参数必须设置为application/json。 |
| Authorization | string | 必选，请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。 |
| X-DashScope-Async | string | 必选，异步处理配置参数。HTTP请求只支持异步，必须设置为enable。 |

重要
缺少此请求头将报错：“current user api does not support synchronous calls”。

##### 请求体（Request Body）
| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| model | string | 必选，模型名称。示例值：wan2.2-kf2v-flash。详情参见模型列表与价格。 |
| input | object | 必选，输入的基本信息，如提示词等。 |
| parameters | object | 可选，视频处理参数。 |

###### input 子属性
| 属性 | 类型 | 说明 |
| ---- | ---- | ---- |
| prompt | string | 可选，文本提示词。支持中英文，长度不超过800个字符，每个汉字/字母占一个字符，超过部分会自动截断。如果首尾帧的主体和场景变化较大，建议描写变化过程，例如运镜过程（镜头向左移动）、或者主体运动过程（人向前奔跑）。示例值：一只黑色小猫好奇地看向天空，镜头从平视逐渐上升，最后俯拍它的好奇的眼神。提示词的使用技巧请参见文生视频/图生视频Prompt指南。 |
| negative_prompt | string | 可选，反向提示词，用来描述不希望在视频画面中看到的内容，可以对视频画面进行限制。支持中英文，长度不超过500个字符，超过部分会自动截断。示例值：低分辨率、错误、最差质量、低质量、残缺、多余的手指、比例不良等。 |
| first_frame_url | string | 必选，首帧图像的URL或 Base64 编码数据。输出视频的宽高比将以此图像为基准。<br>图像限制：<br>1. 图像格式：JPEG、JPG、PNG（不支持透明通道）、BMP、WEBP。<br>2. 图像分辨率：图像的宽度和高度范围为[360, 2000]，单位为像素。<br>3. 文件大小：不超过10MB。<br>输入图像说明：<br>- 使用公网可访问URL：支持 HTTP 或 HTTPS 协议。本地文件可通过上传文件获取临时URL。示例值：https://wanx.alicdn.com/material/20250318/first_frame.png。<br>- 传入 Base64 编码图像后的字符串：数据格式：data:{MIME_type};base64,{base64_data}。示例值：data:image/png;base64,GDU7MtCZzEbTbmRZ......。具体参见输入图像。 |
| last_frame_url | string | 可选，尾帧图像的URL或 Base64 编码数据。<br>图像限制：<br>1. 图像格式：JPEG、JPG、PNG（不支持透明通道）、BMP、WEBP。<br>2. 图像分辨率：图像的宽度和高度范围为[360, 2000]，单位为像素。尾帧图像分辨率可与首帧不同，无需强制对齐。<br>3. 文件大小：不超过10MB。<br>输入图像说明：<br>- 使用公网可访问URL：支持 HTTP 或 HTTPS 协议。本地文件可通过上传文件获取临时URL。示例值：https://wanx.alicdn.com/material/20250318/last_frame.png。<br>- 使用 Base64 编码图像文件：数据格式：data:{MIME_type};base64,{base64_data}。示例值：data:image/png;base64,VBORw0KGgoAAAANSUh......。（编码字符串过长，仅展示片段）具体参见输入图像。 |
| template | string | 可选，视频特效模板的名称。使用此参数时，仅需传入 first_frame_url。不同模型支持不同的特效模板。调用前请查阅视频特效列表，以免调用失败。示例值：hufu-1，表示使用“唐韵翩然”特效。 |

###### parameters 子属性
| 属性 | 类型 | 说明 |
| ---- | ---- | ---- |
| resolution | string | 可选，重要：resolution直接影响费用，同一模型：1080P > 720P > 480P，调用前请确认模型价格。生成的视频分辨率档位。仅用于调整视频的清晰度（总像素），不改变视频的宽高比，视频宽高比将与首帧图像 first_frame_url 的宽高比保持一致。此参数的默认值和可用枚举值依赖于 model 参数，规则如下：<br>- wan2.2-kf2v-flash：可选值：480P、720P、1080P。默认值为720P。<br>- wanx2.1-kf2v-plus：可选值：720P。默认值为720P。<br>示例值：720P。 |
| duration | integer | 可选，重要：duration直接影响费用，按秒计费，调用前请确认模型价格。视频生成时长，单位为秒。当前参数值固定为5，且不支持修改。模型将始终生成5秒时长的视频。 |
| prompt_extend | bool | 可选，是否开启prompt智能改写。开启后使用大模型对输入prompt进行智能改写。对于较短的prompt生成效果提升明显，但会增加耗时。true：默认值，开启智能改写。false：不开启智能改写。示例值：true。 |
| watermark | bool | 可选，是否添加水印标识，水印位于图片右下角，文案为“AI生成”。false：默认值，不添加水印。true：添加水印。示例值：false。 |
| seed | integer | 可选，随机数种子。取值范围是[0, 2147483647]。未指定时，系统自动生成随机种子。若需提升生成结果的可复现性，建议固定seed值。请注意，由于模型生成具有概率性，即使使用相同 seed，也不能保证每次生成结果完全一致。示例值：12345。 |

#### 响应参数
成功响应异常响应
请保存 task_id，用于查询任务状态与结果。

```json
{
    "output": {
        "task_status": "PENDING",
        "task_id": "0385dc79-5ff8-4d82-bcb6-xxxxxx"
    },
    "request_id": "4909100c-7b5a-9f92-bfe5-xxxxxx"
}
```

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| output | object | 任务输出信息。 |
| request_id | string | 请求唯一标识。可用于请求明细溯源和问题排查。 |
| code | string | 请求失败的错误码。请求成功时不会返回此参数，详情请参见错误信息。 |
| message | string | 请求失败的详细信息。请求成功时不会返回此参数，详情请参见错误信息。 |

###### output 子属性
| 属性 | 类型 | 说明 |
| ---- | ---- | ---- |
| task_id | string | 任务ID。查询有效期24小时。 |
| task_status | string | 任务状态。枚举值：<br>- PENDING：任务排队中<br>- RUNNING：任务处理中<br>- SUCCEEDED：任务执行成功<br>- FAILED：任务执行失败<br>- CANCELED：任务已取消<br>- UNKNOWN：任务不存在或状态未知 |

### 步骤2：根据任务ID查询结果
北京地域：`GET https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}`

新加坡地域：`GET https://dashscope-intl.aliyuncs.com/api/v1/tasks/{task_id}`

说明
轮询建议：视频生成过程约需数分钟，建议采用轮询机制，并设置合理的查询间隔（如 15 秒）来获取结果。

任务状态流转：PENDING（排队中）→ RUNNING（处理中）→ SUCCEEDED（成功）/ FAILED（失败）。

结果链接：任务成功后返回视频链接，有效期为 24 小时。建议在获取链接后立即下载并转存至永久存储（如阿里云 OSS）。

task_id 有效期：24小时，超时后将无法查询结果，接口将返回任务状态为UNKNOWN。

QPS 限制：查询接口默认QPS为20。如需更高频查询或事件通知，建议配置异步任务回调。

更多操作：如需批量查询、取消任务等操作，请参见管理异步任务。

#### 请求参数
查询任务结果
请将86ecf553-d340-4e21-xxxxxxxxx替换为真实的task_id。

```bash
curl -X GET https://dashscope.aliyuncs.com/api/v1/tasks/86ecf553-d340-4e21-xxxxxxxxx \
--header "Authorization: Bearer $DASHSCOPE_API_KEY"
```

##### 请求头（Headers）
| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| Authorization | string | 必选，请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。 |

##### URL路径参数（Path parameters）
| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| task_id | string | 必选，任务ID。 |

#### 响应参数
任务执行成功任务执行失败任务查询过期
视频URL仅保留24小时，超时后会被自动清除，请及时保存生成的视频。

```json
{
    "request_id": "ec016349-6b14-9ad6-8009-xxxxxx",
    "output": {
        "task_id": "3f21a745-9f4b-4588-b643-xxxxxx",
        "task_status": "SUCCEEDED",
        "submit_time": "2025-04-18 10:36:58.394",
        "scheduled_time": "2025-04-18 10:37:13.802",
        "end_time": "2025-04-18 10:45:23.004",
        "video_url": "https://dashscope-result-wlcb.oss-cn-wulanchabu.aliyuncs.com/xxx.mp4?xxxxx",
        "orig_prompt": "写实风格，一只黑色小猫好奇地看向天空，镜头从平视逐渐上升，最后俯拍它的好奇的眼神。",
        "actual_prompt": "写实风格，一只黑色小猫好奇地看向天空，镜头从平视逐渐上升，最后俯拍它的好奇的眼神。小猫的黄色眼睛明亮有神，毛发光滑，胡须清晰可见。背景是简单的浅色墙面，突显小猫的黑色身影。近景特写，强调小猫的表情变化和眼神细节。"
    },
    "usage": {
        "video_duration": 5,
        "video_count": 1,
        "SR": 480
    }
}
```

| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| request_id | string | 请求唯一标识。可用于请求明细溯源和问题排查。 |
| output | object | 任务输出信息。 |
| usage | object | 输出信息统计。只对成功的结果计数。 |

###### output 子属性
| 属性 | 类型 | 说明 |
| ---- | ---- | ---- |
| task_id | string | 任务ID。查询有效期24小时。 |
| task_status | string | 任务状态。枚举值：<br>- PENDING：任务排队中<br>- RUNNING：任务处理中<br>- SUCCEEDED：任务执行成功<br>- FAILED：任务执行失败<br>- CANCELED：任务已取消<br>- UNKNOWN：任务不存在或状态未知<br>轮询过程中的状态流转：<br>PENDING（排队中） → RUNNING（处理中）→ SUCCEEDED（成功）/ FAILED（失败）。<br>初次查询状态通常为 PENDING（排队中）或 RUNNING（处理中）。<br>当状态变为 SUCCEEDED 时，响应中将包含生成的视频url。<br>若状态为 FAILED，请检查错误信息并重试。 |
| submit_time | string | 任务提交时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。 |
| scheduled_time | string | 任务执行时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。 |
| end_time | string | 任务完成时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。 |
| video_url | string | 视频URL。仅在 task_status 为 SUCCEEDED 时返回。链接有效期24小时，可通过此URL下载视频。视频格式为MP4（H.264 编码）。 |
| orig_prompt | string | 原始输入的prompt，对应请求参数prompt。 |
| actual_prompt | string | 开启 prompt 智能改写后，返回实际使用的优化后 prompt。若未开启该功能，则不返回此字段。 |
| code | string | 请求失败的错误码。请求成功时不会返回此参数，详情请参见错误信息。 |
| message | string | 请求失败的详细信息。请求成功时不会返回此参数，详情请参见错误信息。 |

###### usage 子属性
| 属性 | 类型 | 说明 |
| ---- | ---- | ---- |
| video_duration | integer | 生成视频的时长，单位秒。枚举值为5。计费公式：费用 = 视频秒数 × 单价。 |
| video_count | integer | 生成视频的数量。固定为1。 |
| video_ratio | string | 当前仅当2.1模型返回该值。生成视频的比例，固定为standard。 |
| SR | integer | 当前仅当2.2模型返回该值。生成视频的分辨率档位，枚举值为480、720、1080。 |

## DashScope SDK调用
SDK 的参数命名与HTTP接口基本一致，参数结构根据语言特性进行封装。

由于图生视频任务耗时较长（通常为1-5分钟），SDK 在底层封装了 HTTP 异步调用流程，支持同步、异步两种调用方式。

具体耗时受限于排队任务数和服务执行情况，请在获取结果时耐心等待。

### Python SDK调用
Python SDK 支持三种图像输入方式：公网 URL、Base64 编码字符串、本地文件路径（绝对/相对），任选其一即可，具体参见输入图像。

说明
推荐安装最新版DashScope Python SDK，否则可能运行报错：安装或升级SDK。

#### 示例代码
同步调用异步调用
本示例展示三种图像输入方式：公网URL、Base64编码、本地文件路径。

##### 请求示例
```python
import base64
import os
from http import HTTPStatus
from dashscope import VideoSynthesis
import mimetypes
import dashscope

# 以下为北京地域url，若使用新加坡地域的模型，需将url替换为：https://dashscope-intl.aliyuncs.com/api/v1
dashscope.base_http_api_url = 'https://dashscope.aliyuncs.com/api/v1'


"""
环境要求：
    dashscope python SDK >= 1.23.8
安装/升级SDK:
    pip install -U dashscope
"""

# 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
# 新加坡和北京地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
api_key = os.getenv("DASHSCOPE_API_KEY")

# --- 辅助函数：用于 Base64 编码 ---
# 格式为 data:{MIME_type};base64,{base64_data}
def encode_file(file_path):
    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type or not mime_type.startswith("image/"):
        raise ValueError("不支持或无法识别的图像格式")
    with open(file_path, "rb") as image_file:
        encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
    return f"data:{mime_type};base64,{encoded_string}"

"""
图像输入方式说明：
以下提供了三种图片输入方式，三选一即可

1. 使用公网URL - 适合已有公开可访问的图片
2. 使用本地文件 - 适合本地开发测试
3. 使用Base64编码 - 适合私有图片或需要加密传输的场景
"""

# 【方式一】使用公网图片 URL
first_frame_url = "https://wanx.alicdn.com/material/20250318/first_frame.png"
last_frame_url = "https://wanx.alicdn.com/material/20250318/last_frame.png"

# 【方式二】使用本地文件（支持绝对路径和相对路径）
# 格式要求：file:// + 文件路径
# 示例（绝对路径）：
# first_frame_url = "file://" + "/path/to/your/first_frame.png"  # Linux/macOS
# last_frame_url = "file://" + "C:/path/to/your/last_frame.png"  # Windows
# 示例（相对路径）：
# first_frame_url = "file://" + "./first_frame.png"              # 以实际路径为准
# last_frame_url = "file://" + "./last_frame.png"                # 以实际路径为准

# 【方式三】使用Base64编码的图片
# first_frame_url = encode_file("./first_frame.png")            # 以实际路径为准
# last_frame_url = encode_file("./last_frame.png")              # 以实际路径为准

def sample_sync_call_kf2v():
    print('please wait...')
    rsp = VideoSynthesis.call(api_key=api_key,
                              model="wan2.2-kf2v-flash",
                              prompt="写实风格，一只黑色小猫好奇地看向天空，镜头从平视逐渐上升，最后俯拍它的好奇的眼神。",
                              first_frame_url=first_frame_url,
                              last_frame_url=last_frame_url,
                              resolution="720P",
                              prompt_extend=True)
    print(rsp)
    if rsp.status_code == HTTPStatus.OK:
        print(rsp.output.video_url)
    else:
        print('Failed, status_code: %s, code: %s, message: %s' %
              (rsp.status_code, rsp.code, rsp.message))


if __name__ == '__main__':
    sample_sync_call_kf2v()
```

##### 响应示例
video_url 有效期24小时，请及时下载视频。
```json
{
    "status_code": 200,
    "request_id": "efa545b3-f95c-9e3a-a3b6-xxxxxx",
    "code": null,
    "message": "",
    "output": {
        "task_id": "721164c6-8619-4a35-a6d9-xxxxxx",
        "task_status": "SUCCEEDED",
        "video_url": "https://dashscope-result-sh.oss-cn-shanghai.aliyuncs.com/xxx.mp4?xxxxx",
        "submit_time": "2025-02-12 11:03:30.701",
        "scheduled_time": "2025-02-12 11:06:05.378",
        "end_time": "2025-02-12 11:12:18.853",
        "orig_prompt": "写实风格，一只黑色小猫好奇地看向天空，镜头从平视逐渐上升，最后俯拍它的好奇的眼神。",
        "actual_prompt": "写实风格，一只黑色小猫好奇地看向天空，镜头从平视逐渐上升，最后俯拍它的好奇的眼神。小猫毛发乌黑光亮，眼睛大而明亮，瞳孔呈金黄色。它抬头仰望，耳朵竖立，显得格外专注。镜头上移后，小猫转头直视镜头，眼神中充满好奇与警觉。背景简洁，突出小猫的细节特征。近景特写，自然光线柔和。"
    },
    "usage": {
        "video_count": 1,
        "video_duration": 5,
        "video_ratio": "standard"
    }
}
```

### Java SDK调用
Java SDK 支持三种图像输入方式：公网 URL、Base64 编码字符串、本地文件路径（绝对路径），任选其一即可，具体参见输入图像。

说明
推荐安装最新版DashScope Java SDK，否则可能运行报错：安装或升级SDK。

#### 示例代码
同步调用异步调用
本示例展示同步调用方式，并支持三种图像输入方式：公网URL、Base64编码、本地文件路径。

##### 请求示例
```java
// Copyright (c) Alibaba, Inc. and its affiliates.

import com.alibaba.dashscope.aigc.videosynthesis.VideoSynthesis;
import com.alibaba.dashscope.aigc.videosynthesis.VideoSynthesisParam;
import com.alibaba.dashscope.aigc.videosynthesis.VideoSynthesisResult;
import com.alibaba.dashscope.exception.ApiException;
import com.alibaba.dashscope.exception.InputRequiredException;
import com.alibaba.dashscope.exception.NoApiKeyException;
import com.alibaba.dashscope.utils.Constants;
import com.alibaba.dashscope.utils.JsonUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

/**
 * 环境要求
 *      dashscope java SDK >= 2.20.9
 * 更新maven依赖:
 *      https://mvnrepository.com/artifact/com.alibaba/dashscope-sdk-java
 */
public class Kf2vSync {

    static {
        // 以下为北京地域url，若使用新加坡地域的模型，需将url替换为：https://dashscope-intl.aliyuncs.com/api/v1
        Constants.baseHttpApiUrl = "https://dashscope.aliyuncs.com/api/v1";
    }

    // 若没有配置环境变量，请用百炼API Key将下行替换为：apiKey="sk-xxx"
    // 新加坡和北京地域的API Key不同。获取API Key：https://help.aliyun.com/zh/model-studio/get-api-key
    static String apiKey = System.getenv("DASHSCOPE_API_KEY");

    /**
     * 图像输入方式说明：三选一即可
     *
     * 1. 使用公网URL - 适合已有公开可访问的图片
     * 2. 使用本地文件 - 适合本地开发测试
     * 3. 使用Base64编码 - 适合私有图片或需要加密传输的场景
     */

    //【方式一】公网URL
    static String firstFrameUrl = "https://wanx.alicdn.com/material/20250318/first_frame.png";
    static String lastFrameUrl = "https://wanx.alicdn.com/material/20250318/last_frame.png";

    //【方式二】本地文件路径（file://+绝对路径 or file:///+绝对路径）
    // static String firstFrameUrl = "file://" + "/your/path/to/first_frame.png";   // Linux/macOS
    // static String lastFrameUrl = "file:///" + "C:/path/to/your/img.png";        // Windows

    //【方式三】Base64编码
    // static String firstFrameUrl = Kf2vSync.encodeFile("/your/path/to/first_frame.png");
    // static String lastFrameUrl = Kf2vSync.encodeFile("/your/path/to/last_frame.png");


    public static void syncCall() {

        Map<String, Object> parameters = new HashMap<>();
        parameters.put("prompt_extend", true);
        parameters.put("resolution", "720P");

        VideoSynthesis videoSynthesis = new VideoSynthesis();
        VideoSynthesisParam param =
                VideoSynthesisParam.builder()
                        .apiKey(apiKey)
                        .model("wan2.2-kf2v-flash")
                        .prompt("写实风格，一只黑色小猫好奇地看向天空，镜头从平视逐渐上升，最后俯拍它的好奇的眼神。")
                        .firstFrameUrl(firstFrameUrl)
                        .lastFrameUrl(lastFrameUrl)
                        .parameters(parameters)
                        .build();
        VideoSynthesisResult result = null;
        try {
            System.out.println("---sync call, please wait a moment----");
            result = videoSynthesis.call(param);
        } catch (ApiException | NoApiKeyException e){
            throw new RuntimeException(e.getMessage());
        } catch (InputRequiredException e) {
            throw new RuntimeException(e);
        }
        System.out.println(JsonUtils.toJson(result));
    }

    /**
     * 将文件编码为Base64字符串
     * @param filePath 文件路径
     * @return Base64字符串，格式为 data:{MIME_type};base64,{base64_data}
     */
    public static String encodeFile(String filePath) {
        Path path = Paths.get(filePath);
        if (!Files.exists(path)) {
            throw new IllegalArgumentException("文件不存在: " + filePath);
        }
        // 检测MIME类型
        String mimeType = null;
        try {
            mimeType = Files.probeContentType(path);
        } catch (IOException e) {
            throw new IllegalArgumentException("无法检测文件类型: " + filePath);
        }
        if (mimeType == null || !mimeType.startsWith("image/")) {
            throw new IllegalArgumentException("不支持或无法识别的图像格式");
        }
        // 读取文件内容并编码
        byte[] fileBytes = null;
        try{
            fileBytes = Files.readAllBytes(path);
        } catch (IOException e) {
            throw new IllegalArgumentException("无法读取文件内容: " + filePath);
        }

        String encodedString = Base64.getEncoder().encodeToString(fileBytes);
        return "data:" + mimeType + ";base64," + encodedString;
    }

    public static void main(String[] args) {
        syncCall();
    }
}
```

##### 响应示例
video_url 有效期24小时，请及时下载视频。
```json
{
    "request_id": "e6bb4517-c073-9c10-b748-dedb8c11bb41",
    "output": {
        "task_id": "984784fe-83c1-4fc4-88c7-52c2c1fa92a2",
        "task_status": "SUCCEEDED",
        "video_url": "https://dashscope-result-wlcb-acdr-1.oss-cn-wulanchabu-acdr-1.aliyuncs.com/xxx.mp4?xxxxx"
    },
    "usage": {
        "video_count": 1,
        "video_duration": 5,
        "video_ratio": "standard"
    }
}
```

## 使用限制
1.  数据时效：任务task_id和视频url均只保留 24 小时，过期后将无法查询或下载。
2.  音频支持：当前仅支持生成无声视频，不支持音频输出。如有需要，可通过语音合成生成音频。
3.  内容审核：输入prompt 和图像、输出视频均会经过内容安全审核，含违规内容将返回 “IPInfringementSuspect”或“DataInspectionFailed”错误，详情请参见错误信息。
4.  网络访问配置：视频链接存储于阿里云 OSS，如果业务系统因安全策略无法访问外部OSS链接，请将以下 OSS 域名加入网络访问白名单。
    ```
    # OSS域名列表
    dashscope-result-bj.oss-cn-beijing.aliyuncs.com
    dashscope-result-hz.oss-cn-hangzhou.aliyuncs.com
    dashscope-result-sh.oss-cn-shanghai.aliyuncs.com
    dashscope-result-wlcb.oss-cn-wulanchabu.aliyuncs.com
    dashscope-result-zjk.oss-cn-zhangjiakou.aliyuncs.com
    dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com
    dashscope-result-hy.oss-cn-heyuan.aliyuncs.com
    dashscope-result-cd.oss-cn-chengdu.aliyuncs.com
    dashscope-result-gz.oss-cn-guangzhou.aliyuncs.com
    dashscope-result-wlcb-acdr-1.oss-cn-wulanchabu-acdr-1.aliyuncs.com
    ```

## 关键参数说明
### 输入图像
输入图像first_frame_url和last_frame_url参数均支持以下方式传入：
1.  方式一：公网URL
    一个公网可直接访问的地址，支持 HTTP/HTTPS。本地文件可通过上传文件获取临时URL。示例值：https://example.com/images/cat.png。
2.  方式二：Base 64编码
3.  方式三：本地文件路径（仅限 SDK）


# 通义万相-参考生视频-API参考
万相-参考生视频模型支持**多模态输入**（文本/图像/视频），可将人或物体作为主角，生成单角色表演或多角色互动视频。模型还支持智能分镜，生成多镜头视频。

**相关文档**：[使用指南](https://help.aliyun.com/zh/model-studio/video-to-video-guide)

## 适用范围

为确保调用成功，请务必保证模型、Endpoint URL 和 API Key 均属于**同一地域**。跨地域调用将会失败。

-   [**选择模型**](https://help.aliyun.com/zh/model-studio/video-to-video-guide#06f39eafa2dwt)：确认模型所属的地域。
    
-   **选择 URL**：选择对应的地域 Endpoint URL，支持HTTP URL。
    
-   **配置 API Key**：选择地域并[获取API Key](https://help.aliyun.com/zh/model-studio/get-api-key)，再[配置API Key到环境变量](https://help.aliyun.com/zh/model-studio/configure-api-key-through-environment-variables)。
    

**说明**

本文的示例代码适用于**北京地域**。

## HTTP调用

由于参考生视频任务耗时较长（通常为1-5分钟），API采用异步调用。整个流程包含 **“创建任务 -> 轮询获取”** 两个核心步骤，具体如下：

### 步骤1：创建任务获取任务ID

## **北京**

`POST https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis`

## **新加坡**

`POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis`

## **弗吉尼亚**

`POST https://dashscope-us.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis`

**说明**

-   创建成功后，使用接口返回的 `task_id` 查询结果，task\_id 有效期为 24 小时。**请勿重复创建任务**，轮询获取即可。
    
-   新手指引请参见[Postman](https://help.aliyun.com/zh/model-studio/first-call-to-image-and-video-api)。
    

| #### 请求参数 | ## 多角色互动（参考图像和视频） 通过`reference_urls`传入图像和视频URL。同时设置`shot_type`为`multi`，生成多镜头视频。 ``` curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \\ -H 'X-DashScope-Async: enable' \\ -H "Authorization: Bearer $DASHSCOPE_API_KEY" \\ -H 'Content-Type: application/json' \\ -d '{ "model": "wan2.6-r2v-flash", "input": { "prompt": "Character2 坐在靠窗的椅子上，手持 character3，在 character4 旁演奏一首舒缓的美国乡村民谣。Character1 对Character2开口说道：“听起来不错”", "reference_urls": [ "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20260129/hfugmr/wan-r2v-role1.mp4", "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20260129/qigswt/wan-r2v-role2.mp4", "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20260129/qpzxps/wan-r2v-object4.png", "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20260129/wfjikw/wan-r2v-backgroud5.png" ] }, "parameters": { "size": "1280*720", "duration": 10, "audio": true, "shot_type": "multi", "watermark": true } }' ``` ## 多角色互动（参考视频） 通过`reference_urls`传入多个视频URL。同时设置`shot_type`为`multi`，生成多镜头视频。 ``` curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \\ -H 'X-DashScope-Async: enable' \\ -H "Authorization: Bearer $DASHSCOPE_API_KEY" \\ -H 'Content-Type: application/json' \\ -d '{ "model": "wan2.6-r2v", "input": { "prompt": "character1对character2说: “I’ll rely on you tomorrow morning!” character2 回答: “You can count on me!”", "reference_urls": [ "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20251217/dlrrly/%E5%B0%8F%E5%A5%B3%E5%AD%A91%E8%8B%B1%E6%96%872.mp4", "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20251217/fkxknn/%E9%93%83%E9%93%83.mp4" ] }, "parameters": { "size": "1280*720", "duration": 10, "shot_type": "multi" } }' ``` ## 单角色扮演 通过`reference_urls`传入单个视频URL。同时设置`shot_type`为`multi`，生成多镜头视频。 ``` curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \\ -H 'X-DashScope-Async: enable' \\ -H "Authorization: Bearer $DASHSCOPE_API_KEY" \\ -H 'Content-Type: application/json' \\ -d '{ "model": "wan2.6-r2v", "input": { "prompt": "character1一边喝奶茶，一边随着音乐即兴跳舞。", "reference_urls":["https://cdn.wanx.aliyuncs.com/static/demo-wan26/vace.mp4"] }, "parameters": { "size": "1280*720", "duration": 5, "shot_type":"multi" } }' ``` ## 生成无声视频 仅支持`wan2.6-r2v-flash`生成无声视频。 当生成无声视频时，**必须显式设置** `parameters.audio = false`。 ``` curl --location 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' \\ -H 'X-DashScope-Async: enable' \\ -H "Authorization: Bearer $DASHSCOPE_API_KEY" \\ -H 'Content-Type: application/json' \\ -d '{ "model": "wan2.6-r2v-flash", "input": { "prompt": "character1一边喝奶茶，一边随着音乐即兴跳舞。", "reference_urls":["https://cdn.wanx.aliyuncs.com/static/demo-wan26/vace.mp4"] }, "parameters": { "size": "1280*720", "duration": 5, "audio": false, "shot_type":"multi" } }' ``` |
| --- | --- |
| ##### 请求头（Headers） |
| **Content-Type** `*string*` **（必选）** 请求内容类型。此参数必须设置为`application/json`。 |
| **Authorization** `*string*`**（必选）** 请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。 |
| **X-DashScope-Async** `*string*` **（必选）** 异步处理配置参数。HTTP请求只支持异步，**必须设置为**`**enable**`。 **重要** 缺少此请求头将报错：“current user api does not support synchronous calls”。 |
| ##### 请求体（Request Body） |
| **model** `*string*` **（必选）** 模型名称。模型列表与价格详见[模型价格](https://help.aliyun.com/zh/model-studio/model-pricing#5c3d28ad8a4x8)。 示例值：wan2.6-r2v-flash。 |
| **input** `*object*` **（必选）** 输入的基本信息，如提示词等。 **属性** **prompt** `*string*` **（必选）** 文本提示词。用来描述生成视频中期望包含的元素和视觉特点。 支持中英文，每个汉字、字母、标点占一个字符，超过部分会自动截断。 - wan2.6-r2v-flash：长度不超过1500个字符。 - wan2.6-r2v：长度不超过1500个字符。 角色引用说明：通过“**character1、character2**”这类标识引用参考角色，每个参考（视频或图像）仅包含单一角色。模型仅通过此方式识别参考中的角色。 示例值：character1在沙发上开心地看电影。 提示词的使用技巧请参见[文生视频/图生视频Prompt指南](https://help.aliyun.com/zh/model-studio/text-to-video-prompt)。 **negative\\_prompt** `*string*` （可选） 反向提示词，用来描述不希望在视频画面中出现的内容，可以对视频画面进行限制。 支持中英文，长度不超过500个字符，超过部分会自动截断。 示例值：低分辨率、错误、最差质量、低质量、残缺、多余的手指、比例不良等。 **reference\\_urls** `*array[string]*` **（必选）** **重要** reference\\_urls直接影响费用，计费规则请参见[计费与限流](https://help.aliyun.com/zh/model-studio/video-to-video-guide#6f5774ce5fqie)。 上传的参考文件 URL 数组，支持传入视频和图像。用于提取角色形象与音色（如有），以生成符合参考特征的视频。 - 每个 URL 可指向 **一张图像** 或 **一段视频**： - 图像数量：0～5。 - 视频数量：0～3。 - 总数限制：图像 + 视频 ≤ 5。 - 传入多个参考文件时，按照数组顺序定义角色的顺序。即第 1 个 URL 对应 character1，第 2 个对应 character2，以此类推。 - 每个参考文件仅包含一个主体角色。例如 character1 为小女孩，character2 为闹钟。 支持输入的格式： 1. 公网URL: - 支持 HTTP 或 HTTPS 协议。 - 示例值：https://cdn.translate.alibaba.com/xxx.png。 2. 临时URL： - 支持OSS协议，必须通过[上传文件获取临时 URL](https://help.aliyun.com/zh/model-studio/get-temporary-file-url)。 - 示例值：oss://dashscope-instant/xxx/xxx.png。 参考视频要求： - 格式：MP4、MOV。 - 时长：1s～30s。 - 视频大小：不超过100MB。 参考图像要求： - 格式：JPEG、JPG、PNG（不支持透明通道）、BMP、WEBP。 - 分辨率：宽高均需在 \\[240, 5000\\]像素之间。 - 图像大小：不超过10MB。 示例值：\\["https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/xxx.mp4", "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/xxx.jpg"\\]。 **已废弃字段** **reference\\_video\\_urls** `*array[string]*` **重要** 推荐使用`reference_urls`替代`reference_video_urls`。 上传的参考视频文件 URL 数组。用于提取角色形象与音色（如有），以生成符合参考特征的视频。 - 最多支持 **3 个视频**。 - 传入多个视频时，按照数组顺序定义视频角色的顺序。即第 1 个 URL 对应 character1，第 2 个对应 character2，以此类推。 - 每个参考视频仅包含一个角色（如 character1 为小女孩，character2 为闹钟）。 - URL支持 HTTP 或 HTTPS 协议。本地文件可通过[上传文件获取临时URL](https://help.aliyun.com/zh/model-studio/get-temporary-file-url)。 单个视频要求： - 格式：MP4、MOV。 - 时长：2～30s。 - 文件大小：视频不超过100MB。 示例值：\\["https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/xxx.mp4"\\]。 |
| **parameters** `*object*` （可选） 图像处理参数。如设置视频分辨率、开启prompt智能改写、添加水印等。 **属性** **size** `*string*` （可选） **重要** - size直接影响费用，费用 = 单价（基于分辨率）× 时长（秒）。同一模型：1080P > 720P ，请在调用前确认[模型价格](https://help.aliyun.com/zh/model-studio/model-pricing#5c3d28ad8a4x8)。 - size必须设置为具体数值（如 `1280*720`），而不是 1:1或720P。 指定生成的视频分辨率，格式为`**宽*高**`。该参数的默认值和可用枚举值依赖于 model 参数，规则如下： - wan2.6-r2v-flash：默认值为 `1920*1080`（1080P）。可选分辨率：720P、1080P对应的所有分辨率。 - wan2.6-r2v：默认值为 `1920*1080`（1080P）。可选分辨率：720P、1080P对应的所有分辨率。 720P档位：可选的视频分辨率及其对应的视频宽高比为： - `1280*720`：16:9。 - `720*1280`：9:16。 - `960*960`：1:1。 - `1088*832`：4:3。 - `832*1088`：3:4。 1080P档位：可选的视频分辨率及其对应的视频宽高比为： - `1920*1080`： 16:9。 - `1080*1920`： 9:16。 - `1440*1440`： 1:1。 - `1632*1248`： 4:3。 - `1248*1632`： 3:4。 **duration** `*integer*` （可选） **重要** duration直接影响费用。费用 = 单价（基于分辨率）× 时长（秒），请在调用前确认[模型价格](https://help.aliyun.com/zh/model-studio/model-pricing#5c3d28ad8a4x8)。 生成视频的时长，单位为秒。 - wan2.6-r2v-flash：取值为\\[2, 10\\]之间的整数。默认值为5。 - wan2.6-r2v：取值为\\[2, 10\\]之间的整数。默认值为5。 示例值：5。 **shot\\_type** `*string*` （可选） 指定生成视频的镜头类型，即视频是由一个连续镜头还是多个切换镜头组成。 参数优先级：`shot_type > prompt`。例如，若 shot\\_type设置为"single"，即使 prompt 中包含“生成多镜头视频”，模型仍会输出单镜头视频。 可选值： - single：默认值，输出单镜头视频 - multi：输出多镜头视频。 示例值：single。 **说明** 当希望严格控制视频的叙事结构（如产品展示用单镜头、故事短片用多镜头），可通过此参数指定。 **audio** `*boolean*` （可选） **重要** audio直接影响费用，有声视频与无声视频价格不同，请在调用前确认[模型价格](https://help.aliyun.com/zh/model-studio/model-pricing#5c3d28ad8a4x8)。 **支持模型：wan2.6-r2v-flash。** 是否生成有声视频。 可选值： - true：默认值，输出有声视频。 - false：输出无声视频。 示例值：true。 **watermark** `*boolean*` （可选） 是否添加水印标识，水印位于视频右下角，文案固定为“AI生成”。 - false：默认值，不添加水印。 - true：添加水印。 示例值：false。 **seed** `*integer*` （可选） 随机数种子，取值范围为`[0, 2147483647]`。 未指定时，系统自动生成随机种子。若需提升生成结果的可复现性，建议固定seed值。 请注意，由于模型生成具有概率性，即使使用相同 seed，也不能保证每次生成结果完全一致。 示例值：12345。 |

| #### 响应参数 | ### 成功响应 请保存 task\\_id，用于查询任务状态与结果。 ``` { "output": { "task_status": "PENDING", "task_id": "0385dc79-5ff8-4d82-bcb6-xxxxxx" }, "request_id": "4909100c-7b5a-9f92-bfe5-xxxxxx" } ``` ### 异常响应 创建任务失败，请参见[错误信息](https://help.aliyun.com/zh/model-studio/error-code)进行解决。 ``` { "code": "InvalidApiKey", "message": "No API-key provided.", "request_id": "7438d53d-6eb8-4596-8835-xxxxxx" } ``` |
| --- | --- |
| **output** `*object*` 任务输出信息。 **属性** **task\\_id** `*string*` 任务ID。查询有效期24小时。 **task\\_status** `*string*` 任务状态。 **枚举值** - PENDING：任务排队中 - RUNNING：任务处理中 - SUCCEEDED：任务执行成功 - FAILED：任务执行失败 - CANCELED：任务已取消 - UNKNOWN：任务不存在或状态未知 |
| **request\\_id** `*string*` 请求唯一标识。可用于请求明细溯源和问题排查。 |
| **code** `*string*` 请求失败的错误码。请求成功时不会返回此参数，详情请参见[错误信息](https://help.aliyun.com/zh/model-studio/error-code)。 |     |
| **message** `*string*` 请求失败的详细信息。请求成功时不会返回此参数，详情请参见[错误信息](https://help.aliyun.com/zh/model-studio/error-code)。 |     |

### 步骤2：根据任务ID查询结果

## **北京**

`GET https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}`

## **新加坡**

`GET https://dashscope-intl.aliyuncs.com/api/v1/tasks/{task_id}`

## **弗吉尼亚**

`GET https://dashscope-us.aliyuncs.com/api/v1/tasks/{task_id}`

**说明**

-   **轮询建议**：视频生成过程约需数分钟，建议采用**轮询**机制，并设置合理的查询间隔（如 15 秒）来获取结果。
    
-   **任务状态流转**：PENDING（排队中）→ RUNNING（处理中）→ SUCCEEDED（成功）/ FAILED（失败）。
    
-   **结果链接**：任务成功后返回视频链接，有效期为 **24 小时**。建议在获取链接后立即下载并转存至永久存储（如[阿里云 OSS](https://help.aliyun.com/zh/oss/user-guide/what-is-oss)）。
    
-   **task\_id 有效期**：**24小时**，超时后将无法查询结果，接口将返回任务状态为`UNKNOWN`。
    
-   **RPS 限制**：查询接口默认RPS为20。如需更高频查询或事件通知，建议[配置异步任务回调](https://help.aliyun.com/zh/model-studio/async-task-api)。
    
-   **更多操作**：如需批量查询、取消任务等操作，请参见[管理异步任务](https://help.aliyun.com/zh/model-studio/manage-asynchronous-tasks#f26499d72adsl)。
    

| #### 请求参数 | ## 查询任务结果 将`{task_id}`完整替换为上一步接口返回的`task_id`的值。`task_id`查询有效期为24小时。 ``` curl -X GET https://dashscope.aliyuncs.com/api/v1/tasks/{task_id} \\ --header "Authorization: Bearer $DASHSCOPE_API_KEY" ``` |
| --- | --- |
| ##### **请求头（Headers）** |
| **Authorization** `*string*`**（必选）** 请求身份认证。接口使用阿里云百炼API-Key进行身份认证。示例值：Bearer sk-xxxx。 |
| ##### **URL路径参数（Path parameters）** |
| **task\\_id** `*string*`**（必选）** 任务ID。 |

| #### **响应参数** | #### **任务执行成功** 视频URL仅保留24小时，超时后会被自动清除，请及时保存生成的视频。 ``` { "request_id": "caa62a12-8841-41a6-8af2-xxxxxx", "output": { "task_id": "eff1443c-ccab-4676-aad3-xxxxxx", "task_status": "SUCCEEDED", "submit_time": "2025-12-16 00:25:59.869", "scheduled_time": "2025-12-16 00:25:59.900", "end_time": "2025-12-16 00:30:35.396", "orig_prompt": "character1在沙发上开心的看电影", "video_url": "https://dashscope-result-sh.oss-accelerate.aliyuncs.com/xxx.mp4?Expires=xxx" }, "usage": { "duration": 10.0, "size": "1280*720", "input_video_duration": 5, "output_video_duration": 5, "video_count": 1, "SR": 720 } } ``` ## 任务执行失败 若任务执行失败，task\\_status将置为 FAILED，并提供错误码和信息。请参见[错误信息](https://help.aliyun.com/zh/model-studio/error-code)进行解决。 ``` { "request_id": "e5d70b02-ebd3-98ce-9fe8-759d7d7b107d", "output": { "task_id": "86ecf553-d340-4e21-af6e-a0c6a421c010", "task_status": "FAILED", "code": "InvalidParameter", "message": "The size is not match xxxxxx" } } ``` ## 任务查询过期 task\\_id查询有效期为 24 小时，超时后将无法查询，返回以下报错信息。 ``` { "request_id": "a4de7c32-7057-9f82-8581-xxxxxx", "output": { "task_id": "502a00b1-19d9-4839-a82f-xxxxxx", "task_status": "UNKNOWN" } } ``` |
| --- | --- |
| **output** `*object*` 任务输出信息。 **属性** **task\\_id** `*string*`**（必选）** 任务ID。 **task\\_status** `*string*` 任务状态。 **枚举值** - PENDING：任务排队中 - RUNNING：任务处理中 - SUCCEEDED：任务执行成功 - FAILED：任务执行失败 - CANCELED：任务已取消 - UNKNOWN：任务不存在或状态未知 **submit\\_time** `*string*` 任务提交时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。 **scheduled\\_time** `*string*` 任务执行时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。 **end\\_time** `*string*` 任务完成时间。格式为 YYYY-MM-DD HH:mm:ss.SSS。 **video\\_url** `*string*` 视频URL。仅在 task\\_status 为 SUCCEEDED 时返回。 链接有效期24小时，可通过此URL下载视频。视频格式为MP4（H.264 编码）。 **orig\\_prompt** `*string*` 原始输入的prompt，对应请求参数`prompt`。 **code** `*string*` 请求失败的错误码。请求成功时不会返回此参数，详情请参见[错误信息](https://help.aliyun.com/zh/model-studio/error-code)。 **message** `*string*` 请求失败的详细信息。请求成功时不会返回此参数，详情请参见[错误信息](https://help.aliyun.com/zh/model-studio/error-code)。 |
| **usage** `*object*` 输出信息统计。只对成功的结果计数。 **属性** **input\\_video\\_duration** `*integer*` 输入的参考视频的时长，单位秒。 **output\\_video\\_duration** `*integer*` 输出视频的时长，单位秒。 **duration** `*float*` 总视频时长。计费按duration时长计算。 计算公式：`duration = input_video_duration + output_video_duration`。 **SR** `*integer*` 生成视频的分辨率档位。示例值：720。 **size**`*string*` 生成视频的分辨率。格式为“宽\\*高*”*，示例值：1280\\*720。 **video\\_count** `*integer*` 生成视频的数量。固定为1。 |     |
| **request\\_id** `*string*` 请求唯一标识。可用于请求明细溯源和问题排查。 |     |

## **使用限制**

-   **数据时效**：任务`task_id`和 视频`video_url`均只保留 24 小时，过期后将无法查询或下载。
    
-   **内容审核**：输入的 prompt 和输出的视频均会经过内容安全审核，包含违规内容的请求将报错“IPInfringementSuspect”或“DataInspectionFailed”，具体参见[错误信息](https://help.aliyun.com/zh/model-studio/error-code)。
    

## **错误码**

如果模型调用失败并返回报错信息，请参见[错误信息](https://help.aliyun.com/zh/model-studio/error-code)进行解决。

## **常见问题**

#### **Q：如何获取视频存储的访问域名白名单？**

A： 模型生成的视频存储于阿里云OSS，API将返回一个临时的公网URL。**若需要对该下载地址进行防火墙白名单配置**，请注意：由于底层存储会根据业务情况进行动态变更，为避免过期信息影响访问，文档不提供固定的OSS域名白名单。如有安全管控需求，请联系客户经理获取最新OSS域名列表。