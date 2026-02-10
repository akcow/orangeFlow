# Pro Camera real images

This folder is served by Vite as static assets (from `src/frontend/public/`).

To show "real device photos" inside the ProCamera wheel picker, place PNG files here:

- Cameras: `src/frontend/public/assets/pro-camera/cameras/`
- Lenses: `src/frontend/public/assets/pro-camera/lenses/`

## Camera filenames (current mapping)

These filenames are referenced by `src/frontend/src/CustomNodes/GenericNode/components/ProCameraLayout.tsx`:

- `cameras/sony-venice.png`
- `cameras/arri-alexa-35.png`
- `cameras/arri-alexa-65.png`
- `cameras/red-v-raptor.png`
- `cameras/panavision-dxl2.png`
- `cameras/arricam-lt.png`
- `cameras/arriflex-435.png`
- `cameras/imax-keighley.png`
- `cameras/imax-film-camera.png`

If an image is missing (404) or fails to load, the UI falls back to the icon.

