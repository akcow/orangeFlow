# 视频生成
视频生成 API 提供了创建、查询和删除视频生成任务的接口。

## 创建视频
根据给定的提示生成视频响应。

```
POST /v1/videos
```

### Authorizations
| 参数 | 类型 | 位置 | 必填 | 说明 |
| ---- | ---- | ---- | ---- | ---- |
| Authorization | string | header | 是 | 身份验证标头格式为 Bearer <API_KEY>，其中 <API_KEY> 是您的API令牌。 |

### Headers
| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| Content-Type | string | 是 | multipart/form-data 或 application/json |

### Body
支持 multipart/form-data 和 application/json 格式。

#### Sora 模型
| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| model | string | 是 | 模型名称。可选值：sora-2、sora-2-pro |
| prompt | string | 是 | 视频生成的提示词描述。例如："一只可爱的小猫在阳光下玩耍" |
| callback_url | string | 否 | 任务完成后的回调通知URL |
| seconds | string | 否 | 视频生成时长。逆向渠道 sora-2：10/15，sora-2-pro：10/15/25；官转渠道 sora-2：4/8/12 |
| size | string | 否 | 视频生成尺寸。可选值：720x1280、1280x720、1024x1792、1792x1024 |
| input_reference | binary | 否 | 输入参考图片 |

#### 其他模型
**提示**

其他模型实际调用时可选择使用 application/json 格式。

| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| model | string | 是 | 模型名称。例如：kling_video、luma_video、runway_video 等 |
| prompt | string | 是 | 视频生成的提示词描述 |
| callback_url | string | 否 | 任务完成后的回调通知URL |
| metadata | object | 否 | 其他参数，可将官方的参数完整放进这个对象中（会覆盖外层同名参数） |

### Response
#### 200 - 成功响应
| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | string | 任务ID |
| object | string | 对象类型 |
| created_at | integer | 创建时间 |
| status | string | 任务状态 |

### 请求示例
#### cURL (Sora)
```bash
curl --request POST \
  --url https://cdn.12ai.org/v1/videos \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: multipart/form-data' \
  --form 'model=sora-2' \
  --form 'prompt=一只可爱的小猫在阳光下玩耍' \
  --form 'seconds=10' \
  --form 'size=1280x720'
```

#### cURL (其他模型)
```bash
curl --request POST \
  --url https://cdn.12ai.org/v1/videos \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data '{
  "model": "kling_video",
  "prompt": "美丽的日落场景",
  "callback_url": "https://example.com/notify"
}'
```

### 响应示例
```json
{
  "id": "task_1234567890",
  "object": "video",
  "created_at": 1759938772,
  "status": "queued"
}
```

## 查询视频
查询视频生成任务状态。

```
GET /v1/videos/{id}
```

### Authorizations
| 参数 | 类型 | 位置 | 必填 | 说明 |
| ---- | ---- | ---- | ---- | ---- |
| Authorization | string | header | 是 | 身份验证标头格式为 Bearer <API_KEY>，其中 <API_KEY> 是您的API令牌。 |

### Path Parameters
| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| id | string | 是 | 任务ID |

### Response
#### 200 - 成功响应
| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| id | string | 任务ID |
| object | string | 对象类型 |
| created_at | integer | 创建时间 |
| status | string | 任务状态。可选值：queued、in_progress、completed、failed |
| model | string | 模型名称 |
| progress | integer | 进度（0-100） |
| video_url | string | 视频URL（任务完成后返回） |

### 请求示例
```bash
curl --request GET \
  --url https://cdn.12ai.org/v1/videos/task_1234567890 \
  --header 'Authorization: Bearer <token>'
```

### 响应示例
```json
{
  "id": "task_1234567890",
  "object": "video",
  "created_at": 1759938772,
  "status": "completed",
  "model": "sora-2",
  "progress": 100,
  "video_url": "https://example.com/video.mp4"
}
```

## 删除视频
删除视频生成任务。

```
DELETE /v1/videos/{id}
```

### Authorizations
| 参数 | 类型 | 位置 | 必填 | 说明 |
| ---- | ---- | ---- | ---- | ---- |
| Authorization | string | header | 是 | 身份验证标头格式为 Bearer <API_KEY>，其中 <API_KEY> 是您的API令牌。 |

### Path Parameters
| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| id | string | 是 | 任务ID |

### Response
#### 200 - 成功响应
| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| message | string | 消息 |
| success | boolean | 是否成功 |

#### 400 - 任务不存在
| 参数 | 类型 | 说明 |
| ---- | ---- | ---- |
| error.message | string | 错误消息 |

### 请求示例
```bash
curl --request DELETE \
  --url https://cdn.12ai.org/v1/videos/task_1234567890 \
  --header 'Authorization: Bearer <token>'
```

### 响应示例
**成功**
```json
{
  "message": "Task deleted successfully",
  "success": true
}
```

**失败**
```json
{
  "error": {
    "message": "Invalid request, Task not found"
  }
}
```