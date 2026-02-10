"""Professional camera style controller component.

This component produces a *style prompt* (Data.text) that downstream image/video
generation nodes can merge into their `prompt`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from lfx.custom.custom_component.component import Component
from lfx.inputs.inputs import DropdownInput
from lfx.schema.data import Data
from lfx.template.field.base import Output


@dataclass(frozen=True)
class LookProfile:
    """A compact, prompt-ready profile for a camera/lens look."""

    tags: list[str]
    notes: list[str]

    def to_prompt_lines(self) -> list[str]:
        lines: list[str] = []
        if self.tags:
            lines.append(", ".join(self.tags))
        lines.extend(self.notes)
        return [l.strip() for l in lines if str(l or "").strip()]


# NOTE: This file is also validated through LFX's dynamic component loader which
# executes only selected AST nodes. Avoid `AnnAssign` (e.g. `X: T = ...`) here
# because the loader currently only executes `ast.Assign` at module scope.
CAMERA_PROFILES = {
    # Digital cinema
    "Sony Venice": LookProfile(
        tags=[
            "Sony VENICE look",
            "large format digital cinema",
            "neutral color science",
        ],
        notes=[
            "natural skin tones with neutral bias, accurate white balance, clean shadow separation",
            "smooth, film-leaning highlight roll-off; controlled specular clipping; HDR-friendly",
            "high dynamic range feel: open shadows without a 'phone HDR' look; restrained saturation",
            "modern, clean texture with moderate micro-contrast (not overly crunchy)",
            "low-noise, clean midtones; stable color gradients; grade-friendly and consistent",
        ],
    ),
    "ARRI Alexa 35": LookProfile(
        tags=[
            "ARRI ALEXA 35 look",
            "ARRI color science",
            "cinematic highlight roll-off",
        ],
        notes=[
            "soft, creamy highlights with long roll-off; gentle highlight compression (filmic)",
            "thick, rich midtones; flattering skin tones; natural color separation",
            "organic contrast curve (not harsh); smooth tonal gradients with minimal banding",
            "refined micro-contrast: detailed but not clinical; avoids brittle edge sharpness",
            "naturalistic saturation, pleasing greens and reds; cinematic, production-grade neutrality",
        ],
    ),
    "ARRI Alexa 65": LookProfile(
        tags=[
            "ARRI ALEXA 65 look",
            "large format",
            "premium cinematic",
        ],
        notes=[
            "large-format presence: luxurious depth, gentle perspective, premium tonal separation",
            "soft highlight roll-off; smooth gradients; natural and elegant contrast",
            "big-sensor depth: shallower depth-of-field at equivalent framing; cinematic subject isolation",
            "refined skin tones, subtle texture, premium studio-grade polish (not over-sharpened)",
            "natural color and smooth color transitions; high-end feature-film aesthetic",
        ],
    ),
    "RED V-Raptor": LookProfile(
        tags=[
            "RED V-RAPTOR look",
            "high-detail digital cinema",
            "crisp texture",
        ],
        notes=[
            "very high acutance and resolving power; punchy detail and modern digital clarity",
            "strong micro-contrast and sharper edges; can feel clinical unless softened or warmed",
            "clean textures and pronounced fine detail; emphasizes pores/fabric/production design",
            "modern, high-contrast bite; specular highlights can feel harder without diffusion",
            "best paired with diffusion/softer lighting when aiming for a more filmic feel",
        ],
    ),
    "RED MONSTRO 8K VV": LookProfile(
        tags=[
            "RED MONSTRO 8K VV look",
            "very large format digital",
            "ultra high resolution",
        ],
        notes=[
            "ultra high-resolution, extremely clean detail with strong perceived sharpness",
            "large-format depth with a modern, high-end digital presence",
            "modern contrast and crisp textures; highlights can feel harder without softening",
            "fine detail is very prominent; can read as 'too sharp' if not controlled",
            "use diffusion/halation, softer lighting, and restrained sharpening for a filmic rendering",
        ],
    ),
    "Panavision DXL2": LookProfile(
        tags=[
            "Panavision DXL2 look",
            "large format digital cinema",
            "Panavision color",
        ],
        notes=[
            "rich, cinematic color with a film-leaning contrast curve (premium studio finish)",
            "polished highlight handling; gentle highlight compression; pleasing roll-off",
            "slightly softened, 'Panavised' rendering: cinematic tonality with controlled saturation",
            "elegant skin tones; refined micro-contrast; avoids brittle digital edges",
            "high-end commercial / feature vibe: clean, premium, and grade-friendly",
        ],
    ),
    "Canon C700 FF": LookProfile(
        tags=[
            "Canon C700 FF look",
            "full-frame digital cinema",
            "Canon color",
        ],
        notes=[
            "pleasant Canon color: warm, natural skin tones with gentle saturation",
            "friendly, slightly softer rendering vs ultra-crisp digital cameras",
            "natural highlight roll-off; restrained contrast; smooth skin texture",
            "documentary-to-commercial neutral: realistic color without harshness",
            "clean, practical cinematic image that grades well and stays believable",
        ],
    ),
    "Blackmagic URSA Mini Pro 12K": LookProfile(
        tags=[
            "Blackmagic URSA 12K look",
            "high-resolution digital",
            "clean modern image",
        ],
        notes=[
            "high detail with a smoother, grade-friendly tonality (less clinical than some ultra-sharp looks)",
            "clean modern image; balanced micro-contrast; crisp but not harsh",
            "good highlight behavior when graded; flexible, post-friendly rendering",
            "fine detail is present without extreme edge bite; naturalistic texture",
            "well-suited for heavy grading while keeping a cinematic, non-overprocessed feel",
        ],
    ),
    # Film / hybrid
    "Arricam LT": LookProfile(
        tags=[
            "35mm film look",
            "ARRICAM LT",
            "photochemical texture",
        ],
        notes=[
            "visible 35mm film grain, organic texture, gentle halation / highlight bloom",
            "filmic contrast curve with smooth toe/shoulder; natural photochemical roll-off",
            "slightly softer perceived sharpness; edges feel less digital and more organic",
            "subtle gate/film response: tiny weave/instability can be implied (very subtle)",
            "warm, nostalgic cinematic feel; pairs well with practical lights and soft diffusion",
        ],
    ),
    "ArriFlex 435": LookProfile(
        tags=[
            "35mm film look",
            "Arriflex 435",
            "high-speed film camera",
        ],
        notes=[
            "35mm film grain and organic texture; gentle halation; soft highlight edges",
            "filmic contrast curve with natural roll-off; analog highlight bloom",
            "high-speed 35mm film energy: crisp motion cadence while remaining organic (not digital)",
            "slightly softer perceived sharpness vs digital; pleasing, cinematic motion texture",
            "ideal for action / sports / dynamic movement with an unmistakable film character",
        ],
    ),
    "IMAX Keighley": LookProfile(
        tags=[
            "IMAX 70mm film look",
            "large format film",
            "ultra high fidelity",
        ],
        notes=[
            "huge-format clarity with organic film texture; very fine, subtle large-format grain",
            "deep tonal range; naturalistic color; epic scale presence and spatial realism",
            "high fidelity without brittle edges: sharp but not 'digital oversharpened'",
            "implied large-format lensing: grand sense of space, weight, and dimensionality",
            "best for monumental landscapes, epic establishing shots, and immersive spectacle",
        ],
    ),
    "IMAX Film Camera": LookProfile(
        tags=[
            "IMAX 70mm film look",
            "large format film camera",
            "ultra high fidelity",
        ],
        notes=[
            "huge-format clarity with organic film texture; very fine, subtle large-format grain",
            "deep tonal range; naturalistic color; epic scale presence and spatial realism",
            "high fidelity without brittle edges: sharp but not 'digital oversharpened'",
            "implied large-format film response: gentle highlight bloom and natural roll-off",
            "best for monumental landscapes, epic establishing shots, and immersive spectacle",
        ],
    ),
}

LENS_PROFILES = {
    # Modern primes
    "Zeiss Ultra Prime": LookProfile(
        tags=["Zeiss Ultra Prime", "modern prime", "high contrast"],
        notes=[
            "crisp rendering with strong micro-contrast; clean edges and high perceived sharpness",
            "neutral-to-cooler tone; minimal aberrations; precise geometry and straight lines",
            "controlled flare; consistent sharpness across the frame; modern clean look",
            "clear separation and definition; commercial-ready clarity (less 'romantic' softness)",
        ],
    ),
    "ARRI Signature Prime": LookProfile(
        tags=["ARRI Signature Prime", "large format prime", "smooth bokeh"],
        notes=[
            "gentle contrast and refined micro-contrast; premium, modern cinematic neutrality",
            "creamy out-of-focus falloff; smooth bokeh; elegant focus transition",
            "soft highlight transitions; flattering skin; refined large-format glass feel",
            "clean but not clinical; high-end feature / premium commercial rendering",
        ],
    ),
    "Leica Summicron-C": LookProfile(
        tags=["Leica Summicron-C", "cinema prime", "clean premium"],
        notes=[
            "high resolving power with elegant micro-contrast (crisp but refined)",
            "natural warmth; refined bokeh; premium clarity without harsh edges",
            "clean flares; controlled aberrations; smooth skin texture reproduction",
            "high-end, 'luxury' clarity: detailed yet gentle, cinematic and sophisticated",
        ],
    ),
    "Tokina Cinema Vista-C / Vista-P": LookProfile(
        tags=["Tokina Vista cinema prime", "large image circle", "clean"],
        notes=[
            "modern sharpness and neutral color; smooth focus roll-off; consistent rendering",
            "controlled flares; stable contrast; large-format friendly image circle",
            "even field and predictable behavior; clean, contemporary cinema glass",
            "high detail without extreme character; excellent for VFX plates and commercials",
        ],
    ),
    # Vintage / character
    "Canon K-35": LookProfile(
        tags=["Canon K-35", "vintage cinema prime", "warm"],
        notes=[
            "lower contrast with gentle softness; blooming highlights; vintage warmth",
            "warm skin tones; creamy halation; classic 70s/80s character",
            "flare-prone with warm veiling flare; softer blacks; nostalgic texture",
            "romantic roll-off and a slightly hazy glow in highlights (especially wide open)",
        ],
    ),
    "Cooke S4": LookProfile(
        tags=["Cooke S4", "Cooke Look", "warm soft contrast"],
        notes=[
            "pleasing warmth and the classic Cooke Look; flattering skin rendition",
            "gentle roll-off with soft micro-contrast; natural, classic cinematic feel",
            "round, gentle bokeh; friendly highlight handling; narrative-friendly look",
            "balanced character: not overly vintage, not overly clinical",
        ],
    ),
    "Cooke Panchro": LookProfile(
        tags=["Cooke Speed Panchro", "vintage", "soft"],
        notes=[
            "dreamy low contrast, soft corners, subtle halation",
            "classic vintage glow, gentle resolution, romantic texture",
            "lower resolving power, gentle falloff toward corners, nostalgic softness",
            "reduced micro-contrast and gentle highlight bloom; great for period/nostalgia",
        ],
    ),
    "Cooke SF 1.8x": LookProfile(
        tags=["Cooke SF 1.8x anamorphic", "special flare", "1.8x squeeze"],
        notes=[
            "Cooke warmth with anamorphic character: oval bokeh, horizontal flares",
            "special flare behavior, gentle contrast, cinematic widescreen feel",
            "anamorphic traits: oval bokeh, horizontal streak flares, slight distortion; 2.39:1 framing vibe",
            "1.8x squeeze: slightly subtler anamorphic geometry while keeping the widescreen signature",
        ],
    ),
    "Helios": LookProfile(
        tags=["Helios vintage lens", "swirly bokeh", "character"],
        notes=[
            "swirly/rotational bokeh, low contrast, flare-prone highlights",
            "dreamy, imperfect vintage rendering with edge aberrations",
            "strong character rendering; imperfect sharpness; vintage flare haze",
            "expressive, stylized look (not clean/clinical); ideal for dream/nostalgia sequences",
        ],
    ),
    # Anamorphic families (prompt as anamorphic traits)
    "Panavision C-series": LookProfile(
        tags=["Panavision C-series anamorphic", "2x anamorphic", "vintage"],
        notes=[
            "classic anamorphic character: horizontal flares, oval bokeh, subtle distortion",
            "vintage anamorphic softness, breathing, organic imperfections",
            "pronounced anamorphic personality: streak flares, oval bokeh, slight mumps/warp; classic widescreen feel",
            "great for night city lights, neon, and classic cinema scope aesthetics",
        ],
    ),
    "Panavision Primo": LookProfile(
        tags=["Panavision Primo", "clean cinema glass", "controlled"],
        notes=[
            "clean, consistent sharpness with controlled flare",
            "modern studio-grade look, neutral tone, dependable contrast",
            "high consistency and coverage; clean edges; reliable modern Panavision rendering",
            "balanced: still cinematic, but more controlled and predictable than vintage sets",
        ],
    ),
    "Hawk Class-X": LookProfile(
        tags=["Hawk Class-X anamorphic", "2x anamorphic", "modern"],
        notes=[
            "modern 2x anamorphic clarity; controlled distortion; signature but cleaner flares",
            "oval bokeh; cinematic widescreen feel; refined sharpness and contrast",
            "cleaner than vintage anamorphics; more controllable edges and breathing",
            "excellent for action / big-scale productions needing consistent anamorphic behavior",
        ],
    ),
    "Angenieux Optimo Ultra Compact": LookProfile(
        tags=["Angenieux Optimo zoom", "cinema zoom", "softened clarity"],
        notes=[
            "slightly softer than primes; cinematic zoom character; gentle contrast",
            "natural color; subtle breathing / zoom feel; practical production look",
            "zoom traits: slight breathing, gentle edge falloff; production-friendly realism",
            "great for documentary-style coverage and dynamic camera movement while staying cinematic",
        ],
    ),
}

FOCAL_PROFILES = {
    "8mm": LookProfile(
        tags=["ultra wide", "8mm"],
        notes=[
            "extreme perspective exaggeration, dramatic scale, intense sense of space",
            "strong edge stretch/distortion and foreground enlargement; highly immersive framing",
            "very close camera-to-subject distances feel dynamic; backgrounds feel far away",
            "use for stylized architecture, POV energy, large environments, and dramatic movement",
        ],
    ),
    "14mm": LookProfile(
        tags=["ultra wide", "14mm"],
        notes=[
            "strong perspective exaggeration, dramatic scale, deep sense of space",
            "potential edge stretch/distortion; dynamic, immersive framing",
            "great for epic establishing shots, interiors, and scenes that need scale",
            "watch facial distortion close-up; keep faces near center for a cleaner look",
        ],
    ),
    "24mm": LookProfile(
        tags=["wide angle", "24mm"],
        notes=[
            "environment-forward composition, mild perspective expansion",
            "good for dynamic handheld/stage-like depth; slightly more distortion than 35mm",
            "keeps context and space while still usable for people; energetic but not extreme",
        ],
    ),
    "35mm": LookProfile(
        tags=["classic wide-normal", "35mm"],
        notes=[
            "natural perspective with subtle depth, versatile cinematic framing",
            "balanced environment + subject; common narrative focal length",
            "often reads as 'cinematic default' for handheld and dialogue coverage with context",
        ],
    ),
    "50mm": LookProfile(
        tags=["normal", "50mm"],
        notes=[
            "natural perspective, strong subject isolation potential at wide apertures",
            "clean geometry, timeless portrait/coverage look",
            "neutral, intimate framing; less distortion; great for dialogue and portraits",
        ],
    ),
    "75mm": LookProfile(
        tags=["short telephoto", "75mm"],
        notes=[
            "pleasant compression, flattering faces, tighter framing with softer background separation",
            "reduces background clutter; good for close-ups and elegant portrait coverage",
        ],
    ),
    "125mm": LookProfile(
        tags=["telephoto", "125mm"],
        notes=[
            "strong compression, background flattening, intense subject isolation",
            "shallow depth-of-field at wide apertures; cinematic voyeur/portrait vibe",
            "excellent for isolating a subject in busy locations; distant perspective feels stacked",
        ],
    ),
}

APERTURE_PROFILES = {
    "f/1.4": LookProfile(
        tags=["wide open", "f/1.4"],
        notes=[
            "very shallow depth of field, creamy bokeh, strong subject separation",
            "more aberrations/glow on vintage glass; dreamy highlight bloom",
            "background melts away; focus is critical; edges can soften depending on lens",
        ],
    ),
    "f/4": LookProfile(
        tags=["mid aperture", "f/4"],
        notes=[
            "balanced depth of field, sharper across frame, controlled bokeh",
            "cleaner contrast, fewer aberrations, practical cinematic coverage",
            "a safe narrative default: readable environments with still-pleasant separation",
        ],
    ),
    "f/11": LookProfile(
        tags=["stopped down", "f/11"],
        notes=[
            "deep depth of field, crisp environment detail, minimal background blur",
            "more geometric sharpness; can emphasize texture and production design",
            "everything reads sharp; highlights get tighter; great for landscapes and architecture",
        ],
    ),
}


def _safe_get_profile(mapping: dict[str, LookProfile], key: str, fallback_label: str) -> LookProfile:
    if key in mapping:
        return mapping[key]
    return LookProfile(tags=[fallback_label], notes=[])


class ProCamera(Component):
    display_name = "专业摄像机"
    description = "选择摄影机/镜头/焦段/光圈，并输出可用于图片/视频创作的成像风格提示词。"
    icon = "Camera"
    name = "ProCamera"
    category = "advanced"

    CAMERA_OPTIONS = list(CAMERA_PROFILES.keys())
    LENS_OPTIONS = list(LENS_PROFILES.keys())
    FOCAL_OPTIONS = list(FOCAL_PROFILES.keys())
    APERTURE_OPTIONS = list(APERTURE_PROFILES.keys())

    inputs = [
        DropdownInput(
            name="camera",
            display_name="摄影机",
            options=CAMERA_OPTIONS,
            value="Sony Venice",
            required=True,
        ),
        DropdownInput(
            name="lens",
            display_name="镜头",
            options=LENS_OPTIONS,
            value="ARRI Signature Prime",
            required=True,
        ),
        DropdownInput(
            name="focal_length",
            display_name="焦段",
            options=FOCAL_OPTIONS,
            value="35mm",
            required=True,
        ),
        DropdownInput(
            name="aperture",
            display_name="光圈",
            options=APERTURE_OPTIONS,
            value="f/4",
            required=True,
        ),
    ]

    outputs = [
        Output(
            name="style_prompt",
            display_name="成像风格提示词",
            method="emit_style_prompt",
            types=["Data"],
        )
    ]

    def emit_style_prompt(self) -> Data:
        camera = str(getattr(self, "camera", "") or "").strip()
        lens = str(getattr(self, "lens", "") or "").strip()
        focal = str(getattr(self, "focal_length", "") or "").strip()
        aperture = str(getattr(self, "aperture", "") or "").strip()

        # Backward compatibility for previously saved flows.
        legacy_camera_map = {
            "ARRICAM LT / Arriflex 435": "Arricam LT",
            "IMAX Film /Keighley": "IMAX Keighley",
        }
        legacy_focal_map = {
            "8-14mm": "14mm",
        }
        camera = legacy_camera_map.get(camera, camera)
        focal = legacy_focal_map.get(focal, focal)

        camera_profile = _safe_get_profile(CAMERA_PROFILES, camera, f"{camera} look")
        lens_profile = _safe_get_profile(LENS_PROFILES, lens, f"{lens} look")
        focal_profile = _safe_get_profile(FOCAL_PROFILES, focal, f"{focal} field of view")
        aperture_profile = _safe_get_profile(APERTURE_PROFILES, aperture, f"{aperture} depth of field")

        # Prompt strategy:
        # - Lead with explicit gear tags (helps many models).
        # - Follow with perceptual descriptors (helps "look" reproduction).
        # - Keep it subject-agnostic so it can be safely appended to user prompts.
        gear_line = f"Shot on {camera}, {lens}, {focal}, {aperture}."
        gear_line_zh = f"摄影机：{camera}；镜头：{lens}；焦段：{focal}；光圈：{aperture}。"

        # Compact "look" paragraph (English-first tends to be most reliable across models).
        look_lines: list[str] = []
        look_lines.append("Cinematography / imaging look:")
        look_lines.extend([f"- {line}" for line in camera_profile.to_prompt_lines()])
        look_lines.extend([f"- {line}" for line in lens_profile.to_prompt_lines()])
        look_lines.extend([f"- {line}" for line in focal_profile.to_prompt_lines()])
        look_lines.extend([f"- {line}" for line in aperture_profile.to_prompt_lines()])

        # A few stabilizers to keep the model from drifting into "phone/CGI" look.
        stabilizers = [
            "high-end cinematic image, naturalistic color grading, pleasing skin tones",
            "filmic highlight roll-off, smooth tonal gradients, controlled sharpening",
            "subtle, natural texture (optionally subtle film grain), gentle halation when appropriate",
            "avoid phone-camera look, avoid CGI/plastic textures, avoid overprocessed HDR halos",
        ]

        text = "\n".join(
            [
                gear_line,
                gear_line_zh,
                "",
                *look_lines,
                "",
                "Quality stabilizers:",
                *[f"- {s}" for s in stabilizers],
            ]
        ).strip()

        self.status = "OK"
        return Data(
            data={
                "text": text,
                "camera": camera,
                "lens": lens,
                "focal_length": focal,
                "aperture": aperture,
                "profiles": {
                    "camera": camera_profile.to_prompt_lines(),
                    "lens": lens_profile.to_prompt_lines(),
                    "focal_length": focal_profile.to_prompt_lines(),
                    "aperture": aperture_profile.to_prompt_lines(),
                },
            },
            text_key="text",
        )
