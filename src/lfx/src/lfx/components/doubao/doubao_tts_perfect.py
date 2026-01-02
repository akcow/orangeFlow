"""Qwen3 TTS (DashScope) component for LangFlow/LFX."""

from __future__ import annotations

import base64
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import requests
from dotenv import load_dotenv

from lfx.components.doubao.shared_credentials import resolve_credentials
from lfx.custom.custom_component.component import Component
from lfx.inputs.inputs import BoolInput, DropdownInput, MessageTextInput, MultilineInput, SecretStrInput, StrInput
from lfx.schema.data import Data
from lfx.template.field.base import Output

load_dotenv()

LANGS_COMMON = "中文、英语、法语、德语、俄语、意大利语、西班牙语、葡萄牙语、日语、韩语"
LANGS_SHANGHAI = "中文（上海话）、英语、法语、德语、俄语、意大利语、西班牙语、葡萄牙语、日语、韩语"
LANGS_BEIJING = "中文（北京话）、英语、法语、德语、俄语、意大利语、西班牙语、葡萄牙语、日语、韩语"
LANGS_NANJING = "中文（南京话）、英语、法语、德语、俄语、意大利语、西班牙语、葡萄牙语、日语、韩语"
LANGS_SHAANXI = "中文（陕西话）、英语、法语、德语、俄语、意大利语、西班牙语、葡萄牙语、日语、韩语"
LANGS_MINNAN = "中文（闽南语）、英语、法语、德语、俄语、意大利语、西班牙语、葡萄牙语、日语、韩语"
LANGS_TIANJIN = "中文（天津话）、英语、法语、德语、俄语、意大利语、西班牙语、葡萄牙语、日语、韩语"
LANGS_SICHUAN = "中文（四川话）、英语、法语、德语、俄语、意大利语、西班牙语、葡萄牙语、日语、韩语"
LANGS_CANTONESE = "中文（粤语）、英语、法语、德语、俄语、意大利语、西班牙语、葡萄牙语、日语、韩语"

# From `语音合成接入.md` table column “音色效果”.
VOICE_EFFECTS = {
    "芊悦": "阳光积极、亲切自然小姐姐",
    "苏瑶": "温柔小姐姐",
    "晨煦": "标准普通话，带部分北方口音。阳光、温暖、活力、朝气",
    "千雪": "二次元虚拟女友",
    "茉兔": "撒娇搞怪，逗你开心",
    "十三": "拽拽的、可爱的小暴躁",
    "月白": "率性帅气的月白",
    "四月": "知性与温柔的碰撞",
    "凯": "耳朵的一场SPA",
    "不吃鱼": "不会翘舌音的设计师",
    "萌宝": "喝酒不打醉拳的小萝莉",
    "詹妮弗": "品牌级、电影质感般美语女声",
    "甜茶": "节奏拉满，戏感炸裂，真实与张力共舞",
    "卡捷琳娜": "御姐音色，韵律回味十足",
    "艾登": "精通厨艺的美语大男孩",
    "沧明子": "沉稳睿智的老者，沧桑如松却心明如镜",
    "乖小妹": "温顺如春水，乖巧如初雪",
    "沙小弥": "聪明伶俐的小大人，童真未泯却早慧如禅",
    "燕铮莺": "声音洪亮，吐字清晰，人物鲜活，听得人热血沸腾",
    "田叔": "一口独特的沙哑烟嗓，一开口便道尽了千军万马与江湖豪情",
    "萌小姬": "“萌属性”爆棚的小萝莉",
    "阿闻": "平直的基线语调，字正腔圆的咬字发音，这就是最专业的新闻主持人",
    "墨讲师": "既保持学科严谨性，又通过叙事技巧将复杂知识转化为可消化的认知模块",
    "徐大爷": "被岁月和旱烟浸泡过的质朴嗓音，不疾不徐地摇开了满村的奇闻异事",
    "邻家妹妹": "糯米糍一样又软又黏的嗓音，那一声声拉长了的“哥哥”，甜得能把人的骨头都叫酥了",
    "诡婆婆": "她的低语像一把生锈的钥匙，缓慢转动你内心最深处的幽暗角落",
    "小婉": "温和舒缓的声线，助你更快地进入睡眠",
    "顽屁小孩": "调皮捣蛋却充满童真的他来了",
    "少女阿月": "平时是甜到发腻的迷糊少女音，但在喊出“代表月亮消灭你”时，瞬间充满不容置疑的爱与正义",
    "博德加": "热情的西班牙大叔",
    "索尼莎": "热情开朗的拉美大姐",
    "阿列克": "一开口，是战斗民族的冷，也是毛呢大衣下的暖",
    "多尔切": "慵懒的意大利大叔",
    "素熙": "温柔开朗，情绪丰富的韩国欧尼",
    "小野杏": "鬼灵精怪的青梅竹马",
    "莱恩": "理性是底色，叛逆藏在细节里——穿西装也听后朋克的德国青年",
    "埃米尔安": "浪漫的法国大哥哥",
    "安德雷": "声音磁性，自然舒服、沉稳男生",
    "拉迪奥·戈尔": "足球诗人Rádio Gol！今天我要用名字为你们解说足球",
    "上海-阿珍": "风风火火的沪上阿姐",
    "北京-晓东": "北京胡同里长大的少年",
    "南京-老李": "耐心的瑜伽老师",
    "陕西-秦川": "面宽话短，心实声沉——老陕的味道",
    "闽南-阿杰": "诙谐直爽、市井活泼的台湾哥仔形象",
    "天津-李彼得": "天津相声，专业捧哏",
    "四川-晴儿": "甜到你心里的川妹子",
    "四川-程川": "一个跳脱市井的四川成都男子",
    "粤语-阿强": "幽默风趣的阿强，在线陪聊",
    "粤语-阿清": "甜美的港妹闺蜜",
}

VOICE_CATALOG = [
    {"display_name": "芊悦", "voice": "Cherry", "description": "", "languages": LANGS_COMMON},
    {"display_name": "苏瑶", "voice": "Serena", "description": "", "languages": LANGS_COMMON},
    {"display_name": "晨煦", "voice": "Ethan", "description": "", "languages": LANGS_COMMON},
    {"display_name": "千雪", "voice": "Chelsie", "description": "", "languages": LANGS_COMMON},
    {"display_name": "茉兔", "voice": "Momo", "description": "", "languages": LANGS_COMMON},
    {"display_name": "十三", "voice": "Vivian", "description": "", "languages": LANGS_COMMON},
    {"display_name": "月白", "voice": "Moon", "description": "", "languages": LANGS_COMMON},
    {"display_name": "四月", "voice": "Maia", "description": "", "languages": LANGS_COMMON},
    {"display_name": "凯", "voice": "Kai", "description": "", "languages": LANGS_COMMON},
    {"display_name": "不吃鱼", "voice": "Nofish", "description": "", "languages": LANGS_COMMON},
    {"display_name": "萌宝", "voice": "Bella", "description": "", "languages": LANGS_COMMON},
    {"display_name": "詹妮弗", "voice": "Jennifer", "description": "", "languages": LANGS_COMMON},
    {"display_name": "甜茶", "voice": "Ryan", "description": "", "languages": LANGS_COMMON},
    {"display_name": "卡捷琳娜", "voice": "Katerina", "description": "", "languages": LANGS_COMMON},
    {"display_name": "艾登", "voice": "Aiden", "description": "", "languages": LANGS_COMMON},
    {"display_name": "沧明子", "voice": "Eldric Sage", "description": "", "languages": LANGS_COMMON},
    {"display_name": "乖小妹", "voice": "Mia", "description": "", "languages": LANGS_COMMON},
    {"display_name": "沙小弥", "voice": "Mochi", "description": "", "languages": LANGS_COMMON},
    {
        "display_name": "燕铮莺",
        "voice": "Bellona",
        "description": "金戈铁马入梦来，字正腔圆间尽显千面人声的江湖",
        "languages": LANGS_COMMON,
    },
    {"display_name": "田叔", "voice": "Vincent", "description": "", "languages": LANGS_COMMON},
    {"display_name": "萌小姬", "voice": "Bunny", "description": "", "languages": LANGS_COMMON},
    {"display_name": "阿闻", "voice": "Neil", "description": "", "languages": LANGS_COMMON},
    {"display_name": "墨讲师", "voice": "Elias", "description": "", "languages": LANGS_COMMON},
    {"display_name": "徐大爷", "voice": "Arthur", "description": "", "languages": LANGS_COMMON},
    {"display_name": "邻家妹妹", "voice": "Nini", "description": "", "languages": LANGS_COMMON},
    {
        "display_name": "诡婆婆",
        "voice": "Ebona",
        "description": "那里藏着所有你不敢承认的童年阴影与未知恐惧",
        "languages": LANGS_COMMON,
    },
    {"display_name": "小婉", "voice": "Seren", "description": "晚安，好梦", "languages": LANGS_COMMON},
    {"display_name": "顽屁小孩", "voice": "Pip", "description": "这是你记忆中的小新吗", "languages": LANGS_COMMON},
    {"display_name": "少女阿月", "voice": "Stella", "description": "", "languages": LANGS_COMMON},
    {"display_name": "博德加", "voice": "Bodega", "description": "", "languages": LANGS_COMMON},
    {"display_name": "索尼莎", "voice": "Sonrisa", "description": "", "languages": LANGS_COMMON},
    {"display_name": "阿列克", "voice": "Alek", "description": "", "languages": LANGS_COMMON},
    {"display_name": "多尔切", "voice": "Dolce", "description": "", "languages": LANGS_COMMON},
    {"display_name": "素熙", "voice": "Sohee", "description": "", "languages": LANGS_COMMON},
    {"display_name": "小野杏", "voice": "Ono Anna", "description": "", "languages": LANGS_COMMON},
    {"display_name": "莱恩", "voice": "Lenn", "description": "", "languages": LANGS_COMMON},
    {"display_name": "埃米尔安", "voice": "Emilien", "description": "", "languages": LANGS_COMMON},
    {"display_name": "安德雷", "voice": "Andre", "description": "", "languages": LANGS_COMMON},
    {"display_name": "拉迪奥·戈尔", "voice": "Radio Gol", "description": "", "languages": LANGS_COMMON},
    {"display_name": "上海-阿珍", "voice": "Jada", "description": "", "languages": LANGS_SHANGHAI},
    {"display_name": "北京-晓东", "voice": "Dylan", "description": "", "languages": LANGS_BEIJING},
    {"display_name": "南京-老李", "voice": "Li", "description": "", "languages": LANGS_NANJING},
    {"display_name": "陕西-秦川", "voice": "Marcus", "description": "", "languages": LANGS_SHAANXI},
    {"display_name": "闽南-阿杰", "voice": "Roy", "description": "", "languages": LANGS_MINNAN},
    {"display_name": "天津-李彼得", "voice": "Peter", "description": "", "languages": LANGS_TIANJIN},
    {"display_name": "四川-晴儿", "voice": "Sunny", "description": "", "languages": LANGS_SICHUAN},
    {"display_name": "四川-程川", "voice": "Eric", "description": "", "languages": LANGS_SICHUAN},
    {"display_name": "粤语-阿强", "voice": "Rocky", "description": "", "languages": LANGS_CANTONESE},
    {"display_name": "粤语-阿清", "voice": "Kiki", "description": "", "languages": LANGS_CANTONESE},
]

VOICE_OPTIONS = [v["display_name"] for v in VOICE_CATALOG]
VOICE_MAPPING = {v["display_name"]: v["voice"] for v in VOICE_CATALOG}
VOICE_OPTIONS_METADATA = [
    {
        "voice_effect": (VOICE_EFFECTS.get(voice.get("display_name", ""), "-") or "-").strip() or "-",
        "description": (voice.get("description") or "-").strip() or "-",
        "voice": voice.get("voice", ""),
        "languages": voice.get("languages", ""),
    }
    for voice in VOICE_CATALOG
]


class DoubaoTTS(Component):
    display_name = "音频合成"
    description = ""
    icon = "DoubaoTTS"
    name = "DoubaoTTS"

    MODEL_NAME = "qwen3-tts-flash-2025-11-27"
    DEFAULT_BASE_HTTP_API_URL = "https://dashscope.aliyuncs.com/api/v1"

    VOICE_OPTIONS = VOICE_OPTIONS
    VOICE_MAPPING = VOICE_MAPPING
    VOICE_OPTIONS_METADATA = VOICE_OPTIONS_METADATA

    inputs = [
        StrInput(
            name="base_http_api_url",
            display_name="DashScope Base URL",
            value=DEFAULT_BASE_HTTP_API_URL,
            advanced=True,
            info="默认北京地域；新加坡地域可替换为 https://dashscope-intl.aliyuncs.com/api/v1",
        ),
        SecretStrInput(
            name="api_key",
            display_name="DashScope API Key",
            required=False,
            value="",
            placeholder="留空时读取 .env 或环境变量中的 DASHSCOPE_API_KEY",
        ),
        DropdownInput(
            name="voice_type",
            display_name="音色",
            options=VOICE_OPTIONS,
            options_metadata=VOICE_OPTIONS_METADATA,
            value=VOICE_OPTIONS[0] if VOICE_OPTIONS else "",
        ),
        MultilineInput(
            name="text",
            display_name="合成文本",
            required=True,
            value="",
            placeholder="请输入要合成的文本（支持换行）",
            info="支持与上游 Data 联动。",
            input_types=["Data"],
        ),
        BoolInput(
            name="save_audio",
            display_name="保存音频文件",
            value=False,
            required=False,
            info="是否将生成的音频保存到本地文件",
        ),
        MessageTextInput(
            name="filename",
            display_name="文件名前缀",
            required=False,
            value="output",
            placeholder="不包含扩展名，例如 qwen_tts_result",
            info="仅在启用保存时生效",
        ),
    ]

    outputs = [
        Output(
            name="audio",
            display_name="语音合成结果",
            method="synthesize_speech",
            types=["Data"],
        )
    ]

    def synthesize_speech(self) -> Data:
        text = self._merge_text(getattr(self, "text", None))
        if not text:
            return self._error("合成文本为空")

        creds = resolve_credentials(
            component_app_id=None,
            component_access_token=None,
            component_api_key=getattr(self, "api_key", None),
            provider="dashscope_tts",
            env_api_key_var="DASHSCOPE_API_KEY",
        )
        api_key = (creds.api_key or "").strip()
        if not api_key:
            return self._error("DashScope API key not found. Please set DASHSCOPE_API_KEY or fill it in the node.")

        base_http_api_url = (getattr(self, "base_http_api_url", "") or "").strip() or self.DEFAULT_BASE_HTTP_API_URL
        voice_display_name = (getattr(self, "voice_type", "") or "").strip()
        voice = self.VOICE_MAPPING.get(voice_display_name, voice_display_name)

        try:
            import dashscope  # type: ignore
        except Exception as exc:  # noqa: BLE001
            return self._error(f"Missing dependency 'dashscope'. Please install dashscope>=1.24.6. ({exc})")

        try:
            dashscope.base_http_api_url = base_http_api_url
            self.status = f"Calling DashScope Qwen-TTS ({self.MODEL_NAME})..."
            response = dashscope.MultiModalConversation.call(
                model=self.MODEL_NAME,
                api_key=api_key,
                text=text,
                voice=voice,
                language_type="Auto",
                stream=False,
            )
        except Exception as exc:  # noqa: BLE001
            return self._error(f"DashScope call failed: {exc}")

        audio_url = self._safe_get(response, ["output", "audio", "url"]) or self._safe_get(
            response, ["output", "audio_url"]
        )
        if not audio_url:
            return self._error(f"DashScope response did not contain audio url. response={response!r}")

        try:
            audio_resp = requests.get(str(audio_url), timeout=60)
            audio_resp.raise_for_status()
            audio_bytes = audio_resp.content
        except Exception as exc:  # noqa: BLE001
            return self._error(f"Failed to download audio from url: {exc}")

        encoding = "wav"
        sample_rate = 24000
        file_path = None
        if bool(getattr(self, "save_audio", False)):
            try:
                filename = (getattr(self, "filename", "") or "output").strip() or "output"
                file_path = f"{filename}.{encoding}"
                with open(file_path, "wb") as file_handle:
                    file_handle.write(audio_bytes)
            except OSError as exc:
                return self._error(f"Audio synthesized but failed to save: {exc}")

        audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
        generated_at = datetime.now(timezone.utc).isoformat()
        self.status = f"Audio synthesized ({encoding}, {sample_rate}Hz)"

        return Data(
            data={
                "audio_base64": audio_base64,
                "audio_type": encoding,
                "sample_rate": sample_rate,
                "duration": 0.0,
                "duration_ms": 0,
                "text": text,
                "model": self.MODEL_NAME,
                "voice_display_name": voice_display_name,
                "voice": voice,
                "language_type": "Auto",
                "file_path": file_path,
                "audio_size": len(audio_bytes),
                "provider": "dashscope",
                "doubao_preview": {
                    "token": f"{self.name}-{uuid4().hex[:8]}",
                    "kind": "audio",
                    "available": True,
                    "generated_at": generated_at,
                    "payload": {
                        "audio_base64": audio_base64,
                        "audio_type": encoding,
                        "sample_rate": sample_rate,
                    },
                },
            },
            type="audio",
        )

    @staticmethod
    def _merge_text(text_source: Any | None) -> str:
        if text_source is None:
            return ""
        if isinstance(text_source, str):
            return text_source.strip()
        if isinstance(text_source, Data):
            value = text_source.data.get("text") or text_source.data.get("value") or text_source.data.get("content")
            return str(value).strip() if value is not None else ""
        if isinstance(text_source, dict):
            value = text_source.get("text") or text_source.get("value") or text_source.get("content")
            return str(value).strip() if value is not None else ""
        return str(text_source).strip()

    @staticmethod
    def _safe_get(obj: Any, keys: list[str]) -> Any:
        cur: Any = obj
        for key in keys:
            if cur is None:
                return None
            if isinstance(cur, dict):
                cur = cur.get(key)
                continue
            cur = getattr(cur, key, None)
        return cur

    @staticmethod
    def _error(message: str) -> Data:
        generated_at = datetime.now(timezone.utc).isoformat()
        suggestion = ""
        lowered = message.lower()
        if "connect" in lowered or "connection" in lowered or "timeout" in lowered:
            suggestion = "（网络连接错误：请检查能否访问 DashScope 地址，或是否需要配置 HTTP_PROXY/HTTPS_PROXY）"
        if "api key" in lowered or "api_key" in lowered or "401" in lowered:
            suggestion = "（请检查 DASHSCOPE_API_KEY 是否正确，以及地域是否匹配）"
        return Data(
            data={
                "error": f"{message}{suggestion}",
                "doubao_preview": {
                    "token": f"error-{uuid4().hex[:8]}",
                    "kind": "audio",
                    "available": False,
                    "generated_at": generated_at,
                    "payload": None,
                    "error": f"{message}{suggestion}",
                },
            },
            type="error",
        )
