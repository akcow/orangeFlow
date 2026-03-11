from lfx.template.utils import get_file_path_value


def test_get_file_path_value_preserves_nested_storage_paths():
    assert get_file_path_value("flow-1/images/output.png") == "flow-1/images/output.png"


def test_get_file_path_value_normalizes_public_inline_urls_with_nested_paths():
    value = "/api/v1/files/public-inline/flow-2/video/renders/final.mp4?token=test"
    assert get_file_path_value(value) == "flow-2/video/renders/final.mp4"
