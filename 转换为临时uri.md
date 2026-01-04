# 上传本地文件获取临时URL
更新时间：2025-10-15 13:49:52
产品详情
我的收藏
在调用多模态、图像、视频或音频模型时，通常需要传入文件的 URL。为此，阿里云百炼提供了免费临时存储空间，您可将本地文件上传至该空间并获得 URL（有效期为 48 小时）。

## 使用限制
- 文件与模型绑定：文件上传时必须指定模型名称，且该模型须与后续调用的模型一致，不同模型无法共享文件。此外，不同模型对文件大小有不同限制，超出限制将导致上传失败。
- 文件与主账号绑定：文件上传与模型调用所使用的 API Key 必须属于同一个阿里云主账号，且上传的文件仅限该主账号及其对应模型使用，无法被其他主账号或其他模型共享。
- 文件有效期限制：文件上传后有效期48小时，超时后文件将被自动清理，请确保在有效期内完成模型调用。
- 文件使用限制：文件一旦上传，不可查询、修改或下载，仅能通过URL参数在模型调用时使用。
- 文件上传限流：文件上传凭证接口的调用限流按照“阿里云主账号+模型”维度为100QPS，超出限流将导致请求失败。

### 重要
临时 URL 有效期48小时，过期后无法使用，请勿用于生产环境。

文件上传凭证接口限流为 100 QPS 且不支持扩容，请勿用于生产环境、高并发及压测场景。

生产环境建议使用阿里云OSS 等稳定存储，确保文件长期可用并规避限流问题。

## 使用方式
### 步骤一：上传文件（图片/视频/音频），获取以 oss://为前缀的临时 URL。
### 步骤二：使用临时 URL，调用模型。

当通过 HTTP 方式（如 curl 或 Postman）调用模型时，必须在请求头中添加 ：X-DashScope-OssResourceResolve: enable。如果使用的是官方DashScope SDK，可以忽略此步骤，SDK 会自动添加。

### 步骤一：获取临时URL
方式一：通过代码上传文件方式二：通过命令行工具上传文件
本文提供 Python 和 Java 示例代码，简化上传文件操作。您只需指定模型和待上传的文件，即可获取临时URL。

#### 前提条件
在调用前，您需要获取API Key，再配置API Key到环境变量。

#### 示例代码
PythonJava
##### 环境配置
推荐使用Python 3.8及以上版本。

请安装必要的依赖包。

```bash
pip install -U requests
```

##### 输入参数
- api_key：阿里云百炼API KEY。
- model_name：指定文件将要用于哪个模型，如qwen-vl-plus。
- file_path：待上传的本地文件路径（图片、视频等）。

```python
import os
import requests
from pathlib import Path
from datetime import datetime, timedelta

def get_upload_policy(api_key, model_name):
    """获取文件上传凭证"""
    url = "https://dashscope.aliyuncs.com/api/v1/uploads"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    params = {
        "action": "getPolicy",
        "model": model_name
    }
    
    response = requests.get(url, headers=headers, params=params)
    if response.status_code != 200:
        raise Exception(f"Failed to get upload policy: {response.text}")
    
    return response.json()['data']

def upload_file_to_oss(policy_data, file_path):
    """将文件上传到临时存储OSS"""
    file_name = Path(file_path).name
    key = f"{policy_data['upload_dir']}/{file_name}"
    
    with open(file_path, 'rb') as file:
        files = {
            'OSSAccessKeyId': (None, policy_data['oss_access_key_id']),
            'Signature': (None, policy_data['signature']),
            'policy': (None, policy_data['policy']),
            'x-oss-object-acl': (None, policy_data['x_oss_object_acl']),
            'x-oss-forbid-overwrite': (None, policy_data['x_oss_forbid_overwrite']),
            'key': (None, key),
            'success_action_status': (None, '200'),
            'file': (file_name, file)
        }
        
        response = requests.post(policy_data['upload_host'], files=files)
        if response.status_code != 200:
            raise Exception(f"Failed to upload file: {response.text}")
    
    return f"oss://{key}"

def upload_file_and_get_url(api_key, model_name, file_path):
    """上传文件并获取URL"""
    # 1. 获取上传凭证，上传凭证接口有限流，超出限流将导致请求失败
    policy_data = get_upload_policy(api_key, model_name) 
    # 2. 上传文件到OSS
    oss_url = upload_file_to_oss(policy_data, file_path)
    
    return oss_url

# 使用示例
if __name__ == "__main__":
    # 从环境变量中获取API Key 或者 在代码中设置 api_key = "your_api_key"
    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        raise Exception("请设置DASHSCOPE_API_KEY环境变量")
        
    # 设置model名称
    model_name="qwen-vl-plus"

    # 待上传的文件路径
    file_path = "/tmp/cat.png"  # 替换为实际文件路径
    
    try:
        public_url = upload_file_and_get_url(api_key, model_name, file_path)
        expire_time = datetime.now() + timedelta(hours=48)
        print(f"文件上传成功，有效期为48小时，过期时间: {expire_time.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"临时URL: {public_url}")
        print("使用该URL时请参考文档的步骤二，否则可能出错。")

    except Exception as e:
        print(f"Error: {str(e)}")
```

##### 输出示例
```
文件上传成功，有效期为48小时，过期时间: 2024-07-18 17:36:15
临时URL: oss://dashscope-instant/xxx/2024-07-18/xxx/cat.png
使用该URL时请参考文档的步骤二，否则可能出错。
```

### 步骤二：使用临时URL进行模型调用
#### 使用限制
- 文件格式：临时URL须通过上述方式生成，且以 oss://为前缀的URL字符串。
- 文件未过期：文件URL仍在上传后的48小时有效期内。
- 模型一致：模型调用所使用的模型必须与文件上传时指定的模型完全一致。
- 账号一致：模型调用的API KEY必须与文件上传时使用的API KEY同属一个阿里云主账号。

#### 前提条件
在调用前，您需要开通模型服务并获取API Key，再配置API Key到环境变量。

#### 方式一：通过HTTP调用
通过curl、Postman或任何其他HTTP客户端直接调用API，则必须遵循以下规则：

##### 重要
使用临时URL，必须在请求的Header中添加参数：X-DashScope-OssResourceResolve: enable。

若缺失此Header，系统将无法解析oss://链接，请求将失败，报错信息请参考错误码。

请求示例响应示例上传的本地图片示例
本示例为调用 qwen-vl-plus 模型识别图片内容。

说明
请将 oss://...替换为真实的临时 URL，否则请求将失败。

```bash
curl -X POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions \
-H "Authorization: Bearer $DASHSCOPE_API_KEY" \
-H 'Content-Type: application/json' \
-H 'X-DashScope-OssResourceResolve: enable' \
-d '{
  "model": "qwen-vl-plus",
  "messages": [{
      "role": "user",
      "content": 
      [{"type": "text","text": "这是什么"},
       {"type": "image_url","image_url": {"url": "oss://dashscope-instant/xxx/2024-07-18/xxxx/cat.png"}}]
    }]
}'
```

#### 方式二：通过DashScope SDK调用
您也可以使用阿里云百炼提供的 Python 或 Java SDK。

直接传入 URL：调用模型 SDK 时，直接将以oss://为前缀的URL字符串作为文件参数传入。

无需关心 Header：SDK 会自动添加必需的请求头，无需额外操作。

注意：并非所有模型都支持 SDK 调用，请以模型 API 文档为准。

不支持 OpenAI SDK。
PythonJava
##### 前提条件
请安装DashScope Python SDK，且DashScope Python SDK版本号 >=1.24.0。

##### 示例代码
本示例为调用 qwen-vl-plus 模型识别图片内容。此代码示例仅适用于 qwen-vl 和 omni 系列模型。

请求示例响应示例
说明
请将 image 参数中的 oss://...替换为真实的临时 URL，否则请求将失败。

```python
import os
import dashscope

messages = [
    {
        "role": "system",
        "content": [{"text": "You are a helpful assistant."}]
    },
    {
        "role": "user",
        "content": [
            {"image": "oss://dashscope-instant/xxx/2024-07-18/xxxx/cat.png"},
            {"text": "这是什么"}]
    }]

# 若没有配置环境变量，请用百炼API Key将下行替换为：api_key="sk-xxx"
api_key = os.getenv('DASHSCOPE_API_KEY')

response = dashscope.MultiModalConversation.call(
    api_key=api_key,
    model='qwen-vl-plus',
    messages=messages
)

print(response)
```

## 附接口说明
在上述获取临时URL的两种方式中，代码调用和命令行工具已集成以下三个步骤，简化文件上传操作。以下是各步骤的接口说明。

### 步骤1：获取文件上传凭证
#### 前提条件
您需要已获取API Key并配置API Key到环境变量。

#### 请求接口
```
GET https://dashscope.aliyuncs.com/api/v1/uploads
```

##### 重要
文件上传凭证接口限流为 100 QPS（按“阿里云主账号+模型”维度），且临时存储不可扩容。生产环境或高并发场景请使用阿里云OSS等存储服务。

#### 入参描述
| 传参方式 | 字段 | 类型 | 必选 | 描述 | 示例值 |
| --- | --- | --- | --- | --- | --- |
| Header | Content-Type | string | 是 | 请求类型：application/json 。 | application/json |
| Header | Authorization | string | 是 | 阿里云百炼API Key，例如：Bearer sk-xxx。 | Bearer sk-xxx |
| Params | action | string | 是 | 操作类型，当前场景为getPolicy。 | getPolicy |
| Params | model | string | 是 | 需要调用的模型名称。 | qwen-vl-plus |

#### 出参描述
| 字段 | 类型 | 描述 | 示例值 |
| --- | --- | --- | --- |
| request_id | string | 本次请求的系统唯一码。 | 7574ee8f-...-11c33ab46e51 |
| data | object | - | - |
| data.policy | string | 上传凭证。 | eyJl...1ZSJ9XX0= |
| data.signature | string | 上传凭证的签名。 | g5K...d40= |
| data.upload_dir | string | 上传文件的目录。 | dashscope-instant/xxx/2024-07-18/xxxx |
| data.upload_host | string | 上传的host地址。 | https://dashscope-file-xxx.oss-cn-beijing.aliyuncs.com |
| data.expire_in_seconds | string | 凭证有效期（单位：秒）。<br>说明<br>过期后，重新调用本接口获取新的凭证。 | 300 |
| data.max_file_size_mb | string | 本次允许上传的最大文件的大小（单位：MB）。<br>该值与需要访问的模型相关。 | 100 |
| data.capacity_limit_mb | string | 同一个主账号每天上传容量限制（单位：MB）。 | 999999999 |
| data.oss_access_key_id | string | 用于上传的access key。 | LTAxxx |
| data.x_oss_object_acl | string | 上传文件的访问权限，private表示私有。 | private |
| data.x_oss_forbid_overwrite | string | 文件同名时是否可以覆盖，true表示不可覆盖。 | true |

#### 请求示例
```bash
curl --location 'https://dashscope.aliyuncs.com/api/v1/uploads?action=getPolicy&model=qwen-vl-plus' \
--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
--header 'Content-Type: application/json'
```

说明
若未配置阿里云百炼API Key到环境变量，请将$DASHSCOPE_API_KEY替换为实际API Key，例如：--header "Authorization: Bearer sk-xxx"。

#### 响应示例
```json
{
    "request_id": "52f4383a-c67d-9f8c-xxxxxx",
    "data": {
        "policy": "eyJl...1ZSJ=",
        "signature": "eWy...=",
        "upload_dir": "dashscope-instant/xxx/2024-07-18/xxx",
        "upload_host": "https://dashscope-file-xxx.oss-cn-beijing.aliyuncs.com",
        "expire_in_seconds": 300,
        "max_file_size_mb": 100,
        "capacity_limit_mb": 999999999,
        "oss_access_key_id": "LTA...",
        "x_oss_object_acl": "private",
        "x_oss_forbid_overwrite": "true"
    }
}
```

### 步骤2：上传文件至临时存储空间
#### 前提条件
- 已获取文件上传凭证。
- 确保文件上传凭证在有效期内，若凭证过期，请重新调用步骤1的接口获取新的凭证。

查看文件上传凭证有效期：步骤1的输出参数data.expire_in_seconds为凭证有效期，单位为秒。

#### 请求接口
```
POST {data.upload_host}
```

说明
请将{data.upload_host}替换为步骤1的输出参数data.upload_host对应的值。

#### 入参描述
| 传参方式 | 字段 | 类型 | 必选 | 描述 | 示例值 |
| --- | --- | --- | --- | --- | --- |
| Header | Content-Type | string | 否 | 提交表单必须为multipart/form-data。<br>在提交表单时，Content-Type会以multipart/form-data;boundary=xxxxxx的形式展示。<br>boundary 是自动生成的随机字符串，无需手动指定。若使用 SDK 拼接表单，SDK 也会自动生成该随机值。 | multipart/form-data; boundary=9431149156168 |
| form-data | OSSAccessKeyId | text | 是 | 文件上传凭证接口的输出参数 data.oss_access_key_id 的值。 | LTAm5xxx |
| form-data | policy | text | 是 | 文件上传凭证接口的输出参数 data.policy 的值。 | g5K...d40= |
| form-data | Signature | text | 是 | 文件上传凭证接口的输出参数 data.signature 的值。 | Sm/tv7DcZuTZftFVvt5yOoSETsc= |
| form-data | key | text | 是 | 文件上传凭证接口的输出参数 data.upload_dir 的值拼接上/文件名。<br>例如，upload_dir 为 dashscope-instant/xxx/2024-07-18/xxx，需要上传的文件名为 cat.png，拼接后的完整路径为：<br>dashscope-instant/xxx/2024-07-18/xxx/cat.png |  |
| form-data | x-oss-object-acl | text | 是 | 文件上传凭证接口的输出参数 data.x_oss_object_acl 的值。 | private |
| form-data | x-oss-forbid-overwrite | text | 是 | 文件上传凭证接口的输出参数中data.x_oss_forbid_overwrite 的值。 | true |
| form-data | success_action_status | text | 否 | 通常取值为 200，上传完成后接口返回 HTTP code 200，表示操作成功。 | 200 |
| form-data | file | text | 是 | 文件或文本内容。<br>说明<br>一次只支持上传一个文件。<br>file必须为最后一个表单域，除file以外的其他表单域并无顺序要求。<br>例如，待上传文件cat.png在Linux系统中的存储路径为/tmp，则此处应为file=@"/tmp/cat.png"。 |  |

#### 出参描述
调用成功时，本接口无任何参数输出。

#### 请求示例
```bash
curl --location 'https://dashscope-file-xxx.oss-cn-beijing.aliyuncs.com' \
--form 'OSSAccessKeyId="LTAm5xxx"' \
--form 'Signature="Sm/tv7DcZuTZftFVvt5yOoSETsc="' \
--form 'policy="eyJleHBpcmF0aW9 ... ... ... dHJ1ZSJ9XX0="' \
--form 'x-oss-object-acl="private"' \
--form 'x-oss-forbid-overwrite="true"' \
--form 'key="dashscope-instant/xxx/2024-07-18/xxx/cat.png"' \
--form 'success_action_status="200"' \
--form 'file=@"/tmp/cat.png"'
```

### 步骤3：生成文件URL
文件URL拼接逻辑：oss:// + key （步骤2的入参key）。该URL有效期为 48 小时。

```
oss://dashscope-instant/xxx/2024-07-18/xxxx/cat.png
```

## 错误码
如果接口调用失败并返回报错信息，请参见错误信息进行解决。

本文的API还有特定状态码，具体如下所示。

| HTTP状态码 | 接口错误码（code） | 接口错误信息（message） | 含义说明 |
| --- | --- | --- | --- |
| 400 | invalid_parameter_error | InternalError.Algo.InvalidParameter: The provided URL does not appear to be valid. Ensure it is correctly formatted. | 无效URL，请检查URL是否填写正确。<br>若使用临时文件URL，需确保请求的 Header 中添加了参数 X-DashScope-OssResourceResolve: enable。 |
| 400 | InvalidParameter.DataInspection | The media format is not supported or incorrect for the data inspection. | 可能的原因有：<br>请求Header 缺少必要参数，请设置 X-DashScope-OssResourceResolve: enable。<br>上传的图片格式不符合模型要求，更多信息请参见错误信息。 |
| 403 | AccessDenied | Invalid according to Policy: Policy expired. | 文件上传凭证已经过期。<br>请重新调用文件上传凭证接口生成新凭证。 |
| 429 | Throttling.RateQuota | Requests rate limit exceeded, please try again later. | 调用频次触发限流。<br>文件上传凭证接口限流为 100 QPS（按阿里云主账号 + 模型维度）。触发限流后，建议降低请求频率，或迁移至 OSS 等自有存储服务以规避限制。 |

## 常见问题
### 文件上传与模型调用使用的API KEY可以不一样吗？
文件存储和访问权限基于阿里云主账号管理，API Key 仅为主账号的访问凭证。

因此，同一阿里云主账号下的不同 API Key 可正常使用，不同主账号的 API Key因账号隔离，模型调用无法跨账号读取文件。

请确保文件上传与模型调用使用的 API Key 属于同一阿里云主账号。