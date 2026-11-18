# ExhibitX — 3D & Markerless AR Museum Tour (Zero Location Tracking)

A classical web museum inspired by [`SamkitJain1812/ExhibitX-AR-Based-Museum-Tour`](https://github.com/SamkitJain1812/ExhibitX-AR-Based-Museum-Tour), rebuilt with **zero location tracking**, an **interactive 3D & Live Camera AR Studio**, a **live model picker to choose which 3D monument appears in AR**, and an **expanded open-source Indian monuments collection**.

## Highlights
- **Zero Location Tracking:** No GPS, no `navigator.geolocation`, no location permissions — ever.
- **Choose Any Model in 3D & AR:** Switch live across **16 bundled `.glb` 3D monuments** (filterable by India, Egypt, Rome, or All).
- **Three Viewing Modes:**
  1. **Interactive 3D Studio** (`<model-viewer>` WebGL orbit, zoom, auto-spin, lighting themes, snapshot capture, audio docent narration).
  2. **Live Camera AR Mode (Markerless):** Uses camera-only video overlay (`getUserMedia({ video })`) behind a transparent 3D stage with live size/height sliders, camera flip, and snapshot download.
  3. **Native Surface AR:** One-tap WebXR / Android Scene Viewer / iOS Quick Look placement on any floor/table surface without GPS.
- **All ExhibitX Assets + Open-Source Indian Monuments:**
  - **India Wing (8):** Taj Mahal, Qutub Minar, Red Fort, Konark Sun Temple *(from ExhibitX)* + **India Gate, Great Stupa at Sanchi, Charminar, Gateway of India** *(open-source architectural `.glb` models)*.
  - **Egypt Wing (4):** Great Pyramid of Giza, Great Sphinx, Luxor Temple, Abu Simbel *(from ExhibitX)*.
  - **Rome Wing (4):** The Colosseum, The Pantheon *(from ExhibitX)* + **Roman Forum, Arch of Constantine** *(open-source architectural `.glb` models)*.

## Run Locally
Double-click `start.bat` or run:
```bash
python -m http.server 8080
```
Then open `http://localhost:8080` in your browser.
