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

### 接入指导
1. 多镜头叙事
bash
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
2. 自动配音
bash
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
3. 传入音频文件
bash
运行
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
仅 wan2.5 及以上版本模型支持此功能。如需为视频指定背景音乐或配音，可通过 input.audio_url 参数传入自定义音频的 URL。

### 步骤1：创建任务获取任务ID
北京地域：POST https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis

新加坡地域：POST https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis

#### 说明
创建成功后，使用接口返回的 task_id 查询结果，task_id 有效期为 24 小时。请勿重复创建任务，轮询获取即可。

新手指引请参见Postman。

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