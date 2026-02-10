from __future__ import annotations

from lfx.components.advanced.pro_camera import ProCamera


def test_pro_camera_emits_style_prompt_text():
    component = ProCamera(
        camera="Sony Venice",
        lens="Zeiss Ultra Prime",
        focal_length="35mm",
        aperture="f/4",
    )
    out = component.emit_style_prompt()

    text = out.get_text()
    assert "Shot on Sony Venice, Zeiss Ultra Prime, 35mm, f/4." in text
    assert "Cinematography / imaging look:" in text
    assert "Zeiss Ultra Prime" in text
    assert "35mm" in text
    assert "f/4" in text

