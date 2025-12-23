"""LangFlow精简版白名单模块"""

# 精确的8个核心节点白名单
COMPONENT_WHITELIST = {
    # 4个原生I/O节点
    "TextInput",
    "ChatInput",
    "TextOutput",
    "ChatOutput",

    # 4个豆包AI节点
    "DoubaoTTS",
    "DoubaoVideoGenerator",
    "DoubaoImageCreator",
    "TextCreation",
}

def apply_whitelist_filter(components_dict):
    """应用白名单过滤"""
    if not components_dict:
        return components_dict

    filtered_dict = {}
    for category, components in components_dict.items():
        filtered_components = {}
        for name, data in components.items():
            if name in COMPONENT_WHITELIST:
                filtered_components[name] = data
        if filtered_components:
            filtered_dict[category] = filtered_components

    return filtered_dict
