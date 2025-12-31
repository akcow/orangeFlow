"""Component whitelist for the slimmed-down LangFlow build.

Only components listed here will be exposed in the UI/component index.
"""

COMPONENT_WHITELIST = {
    "DoubaoTTS",
    "DoubaoVideoGenerator",
    "DoubaoImageCreator",
    "TextCreation",
}


def apply_whitelist_filter(components_dict):
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
