<img width="1920" height="1080" alt="VRM Body Modifier" src="https://github.com/user-attachments/assets/2af0925a-91c8-4680-9cf4-1bda42eedd34" />

# VRM Body Modifier
This application is a web-based tool designed to load, modify, and animate VRM 3D avatars directly in your browser.

## Main Features
* **VRM Model Loading**: Easily load `.vrm` files via drag-and-drop or file selection.
* **Body Parameters**:
  * Adjust physical attributes such as Leg Length, Foot Size, and more.
  * Real-time visual updates on the 3D model.
* **Pose & Animation System**:
  * **Preset Poses**: Switch between T-Pose, A-Pose, and Stand.
  * **Custom Pose**: Manually adjust bone rotations and positions using interactive Gizmos.
  * **Animation Support**: Upload and play `.vrma` animation files.
  * **Playback Controls**: Play and pause animations (Spacebar shortcut supported).
* **Facial Expressions**:
  * Standard expressions like Happy, Angry, Sad, Relaxed, etc.
  * **Custom Expressions**: Automatically detects and supports custom expressions embedded in the VRM file.
  * **Blending**: Use sliders to blend multiple expressions simultaneously.
* **Eye Controls**:
  * **Look at Camera**: Toggle gaze tracking to follow the camera.
  * **Auto Blink**: Enable realistic automatic blinking.
  * **Gaze Controller**: Manually direct the avatar's gaze.
* **Multilingual Support**: Supports Indonesian and English. Language preference is saved automatically.
* **Interface**:
  * **Dark Mode**: Sleek dark-themed UI for comfortable viewing.
  * **Responsive Design**: Sidebar controls and 3D canvas.
* **Data Management**:
  * **Reupload**: Quickly reset and load a new model.
  * **Upload Pose**: Import custom animations for your avatar.

## How to Run the Project
1. Ensure you have **Node.js** installed.
2. Open a terminal in the project directory.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
5. Open your browser and navigate to the local server address (usually `http://localhost:3000`).

## Requirements
* **Node.js**: Required for package management and running the dev server.
* **Web Browser**: A modern browser with WebGL support (Chrome, Edge, Firefox, etc.).

**For testing, please click the following link: [https://vrm-body-modifier.vercel.app/](https://vrm-body-modifier.vercel.app/) (for a better experience, this page currently supports desktop and laptop versions only.).**

## Additional Notes
* **Three.js** - The core 3D library used for rendering.
* **@pixiv/three-vrm** - Official library for handling VRM files.
* **React** - The JavaScript library for building the user interface.
* **Vite** - Next Generation Frontend Tooling.
* **Heroicons** - For the icons on this website.

Best regards,
**K1234**

## Compliance & Disclaimer

### Compliance with VRoid Studio Guidelines
This application is designed specifically as a runtime visualization utility. It operates entirely within the browser's temporary memory (RAM) and does not have any feature to export, save, or re-process the 3D model into a new file.

This architecture is strictly aligned with:
* https://vroid.com/en/studio/guidelines (Specifically regarding the prohibition of creating "Avatar Creation Tools").
* https://policies.pixiv.net/en.html (Regarding prohibited acts and intellectual property).

Any modifications made within this tool are purely visual and temporary, vanishing immediately once the browser session is closed.

### Disclaimer
Users are fully responsible for ensuring that modifications made to the avatar (such as body proportion changes or animations) do not violate the "Personality Rights" or specific licenses of the loaded avatar. The application developer is not responsible for user-generated screenshots or video recordings that may infringe on third-party copyright.

### Fork and Modification Policy
This project is Open Source, but the original developer **expressly prohibits** the addition of export features to this code in public forks. The "No Export" architecture is a key compliance feature.

> **Warning**: If you fork this repository and add features to save/export VRM files, you are fully legally responsible for altering the function of this application into an "Avatar Creation Tool" which may violate Pixiv Inc.'s Terms of Service.

The original developer disclaims all legal liability arising from such third-party modifications.

### License Enforcement
*   **Automatic Blocking**: This application respects VRM license terms. Models with **"No Derivative Works" (ND)** are **automatically blocked** and cannot be loaded.

### Legal Notice
This project is an independent open-source tool created by **K1234** and is not affiliated, endorsed, or sponsored by Pixiv Inc. or the VRoid Project. "VRoid" and "VRM" are trademarks of their respective owners.

## License
This project is licensed under the **MIT License**. See the [LICENSE.md](LICENSE.md) file for details.
