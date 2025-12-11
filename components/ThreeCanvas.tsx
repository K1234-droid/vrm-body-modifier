import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { VRM, VRMHumanBoneName, VRMExpressionPresetName } from '@pixiv/three-vrm';
import { applyBodyParameters, updateRootPosition } from '../services/vrmService';
import { BodyParameters, BoneTransforms, CameraRatio } from '../types';
import { translations } from '../utils/translations';
import { Language } from './LanguageSelector';

interface ThreeCanvasProps {
  vrm: VRM | null;
  parameters: BodyParameters;
  isDarkMode: boolean;
  language: Language;
  currentPose: PoseType;
  setCurrentPose: (pose: PoseType) => void;
  poseClip: THREE.AnimationClip | null;
  customPoseTransforms: BoneTransforms | null;
  setCustomPoseTransforms: (transforms: BoneTransforms | null) => void;
  onPoseClipApplied: () => void;
  isPlaying: boolean;
  autoBlink: boolean;
  backgroundImage: string | null;
  setBackgroundImage: (image: string | null) => void;
  isCameraMode: boolean;
  setIsCameraMode: (val: boolean) => void;
  cameraRatio: CameraRatio;
  resolutionPreset: '1K' | '2K' | '4K' | '8K';
  customResolution: { width: number; height: number };
  isTransparent: boolean;
  saveTrigger: { format: 'png' | 'jpg', timestamp: number } | null;
  onSaveComplete: () => void;
  onToggleSidebar: () => void;
}

type PoseType = 'T-Pose' | 'A-Pose' | 'Stand' | 'Custom';

const ThreeCanvas: React.FC<ThreeCanvasProps> = ({
  vrm,
  parameters,
  isDarkMode,
  language,
  currentPose,
  setCurrentPose,
  poseClip,
  customPoseTransforms,
  setCustomPoseTransforms,
  onPoseClipApplied,
  isPlaying,
  autoBlink,
  backgroundImage,
  setBackgroundImage,
  isCameraMode,
  setIsCameraMode,
  cameraRatio,
  resolutionPreset,
  customResolution,
  isTransparent,
  saveTrigger,
  onSaveComplete,
  onToggleSidebar
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(0);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const transformControlsTranslateRef = useRef<TransformControls | null>(null);
  const boneHelpersRef = useRef<THREE.Mesh[]>([]);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDarkModeRef = useRef(isDarkMode);
  const isPlayingRef = useRef(isPlaying);
  const currentPoseRef = useRef(currentPose);
  const isCameraModeRef = useRef(isCameraMode);
  const cameraRatioRef = useRef(cameraRatio);
  const resolutionPresetRef = useRef(resolutionPreset);
  const customResolutionRef = useRef(customResolution);

  useEffect(() => {
    isCameraModeRef.current = isCameraMode;
    cameraRatioRef.current = cameraRatio;
    resolutionPresetRef.current = resolutionPreset;
    customResolutionRef.current = customResolution;
  }, [isCameraMode, cameraRatio, resolutionPreset, customResolution]);

  useEffect(() => {
    currentPoseRef.current = currentPose;
  }, [currentPose]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (isPlaying) {
      setEyeMenu(null);
      if (transformControlsRef.current) {
        transformControlsRef.current.detach();
      }
      selectedBoneRef.current = null;
      isControllingBothEyesRef.current = false;
    }
  }, [isPlaying]);

  const stabilizationFramesRef = useRef<number>(0);
  const vrmRef = useRef<VRM | null>(null);

  const proxyRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const gazeTargetRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const selectedBoneRef = useRef<THREE.Object3D | null>(null);
  const isDraggingRef = useRef(false);

  const [eyeMenu, setEyeMenu] = useState<{ visible: boolean; x: number; y: number; bone?: THREE.Object3D } | null>(null);
  const isControllingBothEyesRef = useRef(false);

  const [showGazeController, setShowGazeController] = useState(false);
  const [lookAtCamera, setLookAtCamera] = useState(false);
  const lookAtCameraRef = useRef(false);
  const [gazePosition, setGazePosition] = useState({ x: 0, y: 0 });
  const gazePositionRef = useRef({ x: 0, y: 0 });

  const autoBlinkRef = useRef(autoBlink);
  const parametersRef = useRef(parameters);
  const nextBlinkTimeRef = useRef(Date.now() + 2000);
  const blinkStateRef = useRef<'idle' | 'closing' | 'opening'>('idle');
  const blinkStartTimeRef = useRef(0);

  useEffect(() => {
    autoBlinkRef.current = autoBlink;
    if (!autoBlink && vrmRef.current && vrmRef.current.expressionManager) {
      const baseBlink = parametersRef.current.expBlink || 0;
      vrmRef.current.expressionManager.setValue(VRMExpressionPresetName.Blink, baseBlink);
      vrmRef.current.expressionManager.update();
      blinkStateRef.current = 'idle';
    }
  }, [autoBlink]);

  useEffect(() => {
    parametersRef.current = parameters;
  }, [parameters]);

  const syncGazeWithCamera = useCallback(() => {
    if (!vrmRef.current || !cameraRef.current) return;

    const normalizedHead = vrmRef.current.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Head);
    const leftEye = vrmRef.current.humanoid?.getRawBoneNode(VRMHumanBoneName.LeftEye);
    const rightEye = vrmRef.current.humanoid?.getRawBoneNode(VRMHumanBoneName.RightEye);

    if (normalizedHead) {
      const tempVec = new THREE.Vector3();
      const tempQuat = new THREE.Quaternion();
      let originPos = new THREE.Vector3();

      if (leftEye && rightEye) {
        const leftPos = leftEye.getWorldPosition(tempVec.clone());
        const rightPos = rightEye.getWorldPosition(tempVec.clone());
        originPos.addVectors(leftPos, rightPos).multiplyScalar(0.5);
      } else {
        const head = vrmRef.current.humanoid?.getRawBoneNode(VRMHumanBoneName.Head);
        if (head) {
          originPos = head.getWorldPosition(tempVec.clone());
          originPos.y += 0.1;
        }
      }

      const cameraPos = cameraRef.current.position.clone();
      const vCam = new THREE.Vector3().subVectors(cameraPos, originPos);

      const headQuat = normalizedHead.getWorldQuaternion(tempQuat);
      vCam.applyQuaternion(headQuat.invert());

      const isVrm1 = vrmRef.current.meta?.metaVersion === '1';
      const D = 5.0;
      const S = 20.0;
      const vx = vCam.x;
      const vy = vCam.y;
      const vz = vCam.z;

      const forwardZ = isVrm1 ? vz : -vz;

      const thetaX = Math.atan2(vx, forwardZ);
      const thetaY = Math.atan2(vy, forwardZ);

      const maxAngle = Math.atan(S / D);

      let x = 0;
      let y = 0;

      if (Math.abs(thetaX) >= maxAngle) {
        x = Math.sign(thetaX);
      } else {
        x = Math.tan(thetaX) * (D / S);
      }

      if (!isVrm1) {
        x = -x;
      }

      if (Math.abs(thetaY) >= maxAngle) {
        y = Math.sign(thetaY);
      } else {
        y = Math.tan(thetaY) * (D / S);
      }

      x = Math.max(-1, Math.min(1, x));
      y = Math.max(-1, Math.min(1, y));

      setGazePosition({ x, y });
      gazePositionRef.current = { x, y };
    }
  }, []);

  useEffect(() => {
    lookAtCameraRef.current = lookAtCamera;
    if (!lookAtCamera) {
      syncGazeWithCamera();
    }
  }, [lookAtCamera, syncGazeWithCamera]);

  const [isPoseDropdownOpen, setIsPoseDropdownOpen] = useState(false);
  const [showBoneHelpers, setShowBoneHelpers] = useState(true);

  const t = translations[language];

  const POSES: { label: string; value: PoseType }[] = [
    { label: t.poses.tPose, value: 'T-Pose' },
    { label: t.poses.aPose, value: 'A-Pose' },
    { label: t.poses.stand, value: 'Stand' },
    { label: t.poses.custom, value: 'Custom' },
  ];



  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPoseDropdownOpen(false);
        setEyeMenu(null);
        if (transformControlsRef.current) {
          transformControlsRef.current.detach();
          selectedBoneRef.current = null;
          isControllingBothEyesRef.current = false;
        }
        if (transformControlsTranslateRef.current) {
          transformControlsTranslateRef.current.detach();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleResize = useCallback(() => {
    if (!mountRef.current || !cameraRef.current || !rendererRef.current || !sceneRef.current) return;

    let w = mountRef.current.clientWidth;
    let h = mountRef.current.clientHeight;

    const isCameraMode = isCameraModeRef.current;
    const cameraRatio = cameraRatioRef.current;
    const resolutionPreset = resolutionPresetRef.current;
    const customResolution = customResolutionRef.current;

    if (isCameraMode) {
      let targetRatio = 16 / 9;
      if (cameraRatio === '1:1') targetRatio = 1;
      if (cameraRatio === '3:2') targetRatio = 3 / 2;
      if (cameraRatio === '4:3') targetRatio = 4 / 3;
      if (cameraRatio === '16:9') targetRatio = 16 / 9;
      if (cameraRatio === 'Custom') {
        targetRatio = customResolution.width / customResolution.height;
      }

      const containerW = mountRef.current.parentElement?.clientWidth || w;
      const containerH = mountRef.current.parentElement?.clientHeight || h;

      let displayW, displayH;
      if (containerW / containerH > targetRatio) {
        displayH = containerH;
        displayW = displayH * targetRatio;
      } else {
        displayW = containerW;
        displayH = displayW / targetRatio;
      }

      rendererRef.current.domElement.style.position = 'absolute';
      rendererRef.current.domElement.style.left = `${(containerW - displayW) / 2}px`;
      rendererRef.current.domElement.style.top = `${(containerH - displayH) / 2}px`;
      rendererRef.current.domElement.style.width = `${displayW}px`;
      rendererRef.current.domElement.style.height = `${displayH}px`;

      let renderW, renderH;
      if (cameraRatio === 'Custom') {
        renderW = customResolution.width;
        renderH = customResolution.height;
      } else {
        let baseHeight = 1080;
        if (resolutionPreset === '2K') baseHeight = 1440;
        if (resolutionPreset === '4K') baseHeight = 2160;
        if (resolutionPreset === '8K') baseHeight = 4320;

        renderH = baseHeight;
        renderW = Math.round(renderH * targetRatio);
      }

      rendererRef.current.setPixelRatio(1);
      rendererRef.current.setSize(displayW, displayH, false);

      cameraRef.current.aspect = displayW / displayH;
      cameraRef.current.updateProjectionMatrix();

      if (sceneRef.current.background instanceof THREE.Texture && sceneRef.current.background.image) {
        const img = sceneRef.current.background.image;
        const canvasAspect = displayW / displayH;
        const imageAspect = img.width / img.height;
        const factor = imageAspect / canvasAspect;

        sceneRef.current.background.offset.x = factor > 1 ? (1 - 1 / factor) / 2 : 0;
        sceneRef.current.background.offset.y = factor > 1 ? 0 : (1 - factor) / 2;

        sceneRef.current.background.repeat.x = factor > 1 ? 1 / factor : 1;
        sceneRef.current.background.repeat.y = factor > 1 ? 1 : factor;
      }

    } else {
      rendererRef.current.domElement.style.position = 'absolute';
      rendererRef.current.domElement.style.left = '0';
      rendererRef.current.domElement.style.top = '0';
      rendererRef.current.domElement.style.width = '100%';
      rendererRef.current.domElement.style.height = '100%';

      rendererRef.current.setPixelRatio(window.devicePixelRatio);
      rendererRef.current.setSize(w, h, false);

      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();

      if (sceneRef.current.background instanceof THREE.Texture && sceneRef.current.background.image) {
        const img = sceneRef.current.background.image;
        const canvasAspect = w / h;
        const imageAspect = img.width / img.height;
        const factor = imageAspect / canvasAspect;

        sceneRef.current.background.offset.x = factor > 1 ? (1 - 1 / factor) / 2 : 0;
        sceneRef.current.background.offset.y = factor > 1 ? 0 : (1 - factor) / 2;

        sceneRef.current.background.repeat.x = factor > 1 ? 1 / factor : 1;
        sceneRef.current.background.repeat.y = factor > 1 ? 1 : factor;
      }
    }

    rendererRef.current.render(sceneRef.current, cameraRef.current);
  }, []);

  useEffect(() => {
    isDarkModeRef.current = isDarkMode;
    if (sceneRef.current) {
      if (isCameraMode && isTransparent) {
        if (!isDarkMode) {
          sceneRef.current.background = new THREE.Color('#E0E0E0');
        } else {
          sceneRef.current.background = null;
        }
      } else if (backgroundImage) {
        const loader = new THREE.TextureLoader();
        loader.load(backgroundImage, (texture) => {
          if (sceneRef.current) {
            texture.colorSpace = THREE.SRGBColorSpace;
            sceneRef.current.background = texture;

            if (mountRef.current) {
              handleResize();
            }
          }
        });
      } else {
        const bgColor = isDarkMode ? '#121212' : '#E0E0E0';
        sceneRef.current.background = new THREE.Color(bgColor);
      }

      const oldGrid = sceneRef.current.getObjectByName('GridHelper');
      if (oldGrid) sceneRef.current.remove(oldGrid);

      if (!isCameraMode) {
        const gridColor1 = isDarkMode ? 0x444444 : 0x888888;
        const gridColor2 = isDarkMode ? 0x222222 : 0xcccccc;
        const newGrid = new THREE.GridHelper(10, 10, gridColor1, gridColor2);
        newGrid.name = 'GridHelper';
        sceneRef.current.add(newGrid);
      }
    }
  }, [isDarkMode, backgroundImage, isCameraMode, isTransparent, handleResize]);

  useEffect(() => {
    if (!mountRef.current) return;

    while (mountRef.current.firstChild) {
      mountRef.current.removeChild(mountRef.current.firstChild);
    }

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    const bgColor = isDarkModeRef.current ? '#121212' : '#E0E0E0';
    const gridColor1 = isDarkModeRef.current ? 0x444444 : 0x888888;
    const gridColor2 = isDarkModeRef.current ? 0x222222 : 0xcccccc;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bgColor);
    sceneRef.current = scene;
    scene.add(gazeTargetRef.current);

    scene.add(proxyRef.current);

    const gridHelper = new THREE.GridHelper(10, 10, gridColor1, gridColor2);
    gridHelper.name = 'GridHelper';
    scene.add(gridHelper);

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 200.0);
    camera.position.set(0, 1.2, 3.5);
    cameraRef.current = camera;

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x222222, 1.2);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(1, 1, 1).normalize();
    scene.add(directionalLight);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.target.set(0, 1.0, 0);
    controlsRef.current = controls;

    const clock = new THREE.Clock();
    const tempVec = new THREE.Vector3();
    const tempQuat = new THREE.Quaternion();

    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.05);

      if (mixerRef.current) {
        mixerRef.current.timeScale = isPlayingRef.current ? 1.0 : 0.0;
        mixerRef.current.update(delta);
      }

      if (transformControlsRef.current) {
        transformControlsRef.current.getHelper().visible = !isPlayingRef.current && selectedBoneRef.current !== null;
        transformControlsRef.current.enabled = !isPlayingRef.current;
      }

      if (transformControlsTranslateRef.current) {
        const isHips = selectedBoneRef.current?.userData?.boneName === 'hips';
        transformControlsTranslateRef.current.getHelper().visible = !isPlayingRef.current && selectedBoneRef.current !== null && isHips;
        transformControlsTranslateRef.current.enabled = !isPlayingRef.current && isHips;
      }

      if (vrmRef.current) {
        if (autoBlinkRef.current && vrmRef.current.expressionManager) {
          const now = Date.now();
          let blinkWeight = 0;

          if (blinkStateRef.current === 'idle') {
            if (now >= nextBlinkTimeRef.current) {
              blinkStateRef.current = 'closing';
              blinkStartTimeRef.current = now;
            }
          } else if (blinkStateRef.current === 'closing') {
            const progress = (now - blinkStartTimeRef.current) / 100;
            if (progress >= 1) {
              blinkStateRef.current = 'opening';
              blinkStartTimeRef.current = now;
              blinkWeight = 1;
            } else {
              blinkWeight = progress;
            }
          } else if (blinkStateRef.current === 'opening') {
            const progress = (now - blinkStartTimeRef.current) / 150;
            if (progress >= 1) {
              blinkStateRef.current = 'idle';
              nextBlinkTimeRef.current = now + Math.random() * 3000 + 2000;
              blinkWeight = 0;
            } else {
              blinkWeight = 1 - progress;
            }
          }

          const baseBlink = parametersRef.current.expBlink || 0;
          const finalBlink = Math.max(baseBlink, blinkWeight);

          vrmRef.current.expressionManager.setValue(VRMExpressionPresetName.Blink, finalBlink);
        }

        if (stabilizationFramesRef.current > 0) {
          if (vrmRef.current.springBoneManager) {
            vrmRef.current.springBoneManager.reset();
            vrmRef.current.update(0);
          }
          stabilizationFramesRef.current -= 1;
        } else {
          vrmRef.current.update(isPlayingRef.current ? delta : 0);
        }

        updateRootPosition(vrmRef.current, parametersRef.current);
      }

      if (selectedBoneRef.current && proxyRef.current) {
        if (isDraggingRef.current) {
          const bone = selectedBoneRef.current;
          const parent = bone.parent;
          if (parent) {
            const parentQuat = parent.getWorldQuaternion(tempQuat.clone());
            bone.quaternion.copy(parentQuat.invert().multiply(proxyRef.current.quaternion));

            if (bone.userData.boneName === 'hips') {
              const parentWorldMatrix = parent.matrixWorld.clone();
              const parentWorldMatrixInverse = parentWorldMatrix.invert();
              const localPos = proxyRef.current.position.clone().applyMatrix4(parentWorldMatrixInverse);
              bone.position.copy(localPos);
            }

            bone.updateMatrixWorld();
          }
        } else {
          const bone = selectedBoneRef.current;
          proxyRef.current.position.copy(bone.getWorldPosition(tempVec));
          proxyRef.current.quaternion.copy(bone.getWorldQuaternion(tempQuat));
        }
      }

      if (vrmRef.current && currentPoseRef.current === 'Custom') {
        if (lookAtCameraRef.current && cameraRef.current) {
          const lookAtTarget = vrmRef.current.lookAt;
          if (lookAtTarget) {
            lookAtTarget.target = cameraRef.current;
          }
        } else {
          const head = vrmRef.current.humanoid?.getRawBoneNode(VRMHumanBoneName.Head);
          const normalizedHead = vrmRef.current.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Head);
          const leftEye = vrmRef.current.humanoid?.getRawBoneNode(VRMHumanBoneName.LeftEye);
          const rightEye = vrmRef.current.humanoid?.getRawBoneNode(VRMHumanBoneName.RightEye);

          if (head && normalizedHead) {
            let originPos = new THREE.Vector3();

            if (leftEye && rightEye) {
              const leftPos = leftEye.getWorldPosition(tempVec.clone());
              const rightPos = rightEye.getWorldPosition(tempVec.clone());
              originPos.addVectors(leftPos, rightPos).multiplyScalar(0.5);
            } else {
              originPos = head.getWorldPosition(tempVec.clone());
              originPos.y += 0.1;
            }

            const headQuat = normalizedHead.getWorldQuaternion(tempQuat.clone());
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat);
            const right = new THREE.Vector3(-1, 0, 0).applyQuaternion(headQuat);
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(headQuat);

            const sensitivity = 20.0;
            const isVrm1 = vrmRef.current.meta?.metaVersion === '1';
            const distance = isVrm1 ? -5.0 : 5.0;

            const targetPos = originPos.clone()
              .add(forward.multiplyScalar(distance))
              .add(right.multiplyScalar(gazePositionRef.current.x * sensitivity * (isVrm1 ? -1 : 1)))
              .add(up.multiplyScalar(gazePositionRef.current.y * sensitivity));

            gazeTargetRef.current.position.copy(targetPos);
            gazeTargetRef.current.updateMatrixWorld();

            const lookAtTarget = vrmRef.current.lookAt;
            if (lookAtTarget) {
              lookAtTarget.target = gazeTargetRef.current;
            }
          }
        }
      }

      if (boneHelpersRef.current.length > 0) {
        boneHelpersRef.current.forEach((helper) => {
          if (helper.userData.boneNode) {
            helper.position.copy(helper.userData.boneNode.getWorldPosition(tempVec));
          }
        });
      }

      if (transformControlsRef.current && transformControlsRef.current.object) {
        const helper = transformControlsRef.current.getHelper();
        if (helper) {
          helper.updateMatrixWorld(true);
        }
      }

      if (transformControlsTranslateRef.current && transformControlsTranslateRef.current.object) {
        const helper = transformControlsTranslateRef.current.getHelper();
        if (helper) {
          helper.updateMatrixWorld(true);
          helper.traverse((child) => {
            if (['XY', 'YZ', 'XZ', 'XYZ', 'XY_PICKER', 'YZ_PICKER', 'XZ_PICKER', 'XYZ_PICKER'].includes(child.name)) {
              child.visible = false;
              child.scale.set(0, 0, 0);
              (child as any).raycast = () => { };
              if ((child as THREE.Mesh).material) {
                const mat = (child as THREE.Mesh).material as THREE.Material;
                mat.opacity = 0;
                mat.transparent = true;
                mat.visible = false;
              }
            } else if (['X', 'Y', 'Z', 'X_PICKER', 'Y_PICKER', 'Z_PICKER'].includes(child.name)) {
              const obj = child as THREE.Mesh | THREE.Line;
              if (obj.geometry && obj.geometry.attributes.position) {
                const positions = obj.geometry.attributes.position;
                const offset = 0.25;
                const axisName = child.name.split('_')[0];

                for (let i = 0; i < positions.count; i++) {
                  if (axisName === 'X') {
                    if (positions.getX(i) < offset && positions.getX(i) > -0.1) positions.setX(i, offset);
                  } else if (axisName === 'Y') {
                    if (positions.getY(i) < offset && positions.getY(i) > -0.1) positions.setY(i, offset);
                  } else if (axisName === 'Z') {
                    if (positions.getZ(i) < offset && positions.getZ(i) > -0.1) positions.setZ(i, offset);
                  }
                }
                positions.needsUpdate = true;
              }
            }
          });
        }
      }

      if (controls) controls.update();
      renderer.render(scene, camera);
      requestRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(requestRef.current);
      renderer.forceContextLoss();
      renderer.dispose();
      if (mountRef.current && renderer.domElement) {
        if (mountRef.current.contains(renderer.domElement)) {
          mountRef.current.removeChild(renderer.domElement);
        }
      }
      rendererRef.current = null;
    };
  }, []);



  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(() => handleResize());
    });
    if (mountRef.current?.parentElement) {
      resizeObserver.observe(mountRef.current.parentElement);
    }
    if (mountRef.current) {
      resizeObserver.observe(mountRef.current);
    }

    setTimeout(handleResize, 50);

    return () => {
      resizeObserver.disconnect();
    };
  }, [handleResize]);

  useEffect(() => {
    handleResize();
  }, [isCameraMode, cameraRatio, resolutionPreset, customResolution, handleResize]);

  useEffect(() => {
    if (saveTrigger && rendererRef.current && sceneRef.current && cameraRef.current) {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;

      setTimeout(() => {
        if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;

        let targetW, targetH;
        const ratio = cameraRatioRef.current;
        const preset = resolutionPresetRef.current;
        const custom = customResolutionRef.current;

        let targetRatio = 16 / 9;
        if (ratio === '1:1') targetRatio = 1;
        if (ratio === '3:2') targetRatio = 3 / 2;
        if (ratio === '4:3') targetRatio = 4 / 3;
        if (ratio === '16:9') targetRatio = 16 / 9;
        if (ratio === 'Custom') {
          targetRatio = custom.width / custom.height;
        }

        if (ratio === 'Custom') {
          targetW = custom.width;
          targetH = custom.height;
        } else {
          let baseHeight = 1080;
          if (preset === '2K') baseHeight = 1440;
          if (preset === '4K') baseHeight = 2160;
          if (preset === '8K') baseHeight = 4320;

          targetH = baseHeight;
          targetW = Math.round(targetH * targetRatio);
        }

        renderer.setSize(targetW, targetH, false);
        camera.aspect = targetW / targetH;
        camera.updateProjectionMatrix();

        if (scene.background instanceof THREE.Texture && scene.background.image) {
          const img = scene.background.image;
          const canvasAspect = targetW / targetH;
          const imageAspect = img.width / img.height;
          const factor = imageAspect / canvasAspect;

          scene.background.offset.x = factor > 1 ? (1 - 1 / factor) / 2 : 0;
          scene.background.offset.y = factor > 1 ? 0 : (1 - factor) / 2;

          scene.background.repeat.x = factor > 1 ? 1 / factor : 1;
          scene.background.repeat.y = factor > 1 ? 1 : factor;
        }

        const originalBackground = scene.background;
        if (isTransparent) {
          scene.background = null;
        }

        renderer.render(scene, camera);

        if (isTransparent) {
          scene.background = originalBackground;
        }

        const link = document.createElement('a');
        link.download = `vrm-pose-${Date.now()}.${saveTrigger.format}`;
        link.href = renderer.domElement.toDataURL(`image/${saveTrigger.format}`);
        link.click();

        handleResize();

        onSaveComplete();
      }, 500);
    }
  }, [saveTrigger, onSaveComplete, handleResize]);

  const applyExpressions = (model: VRM, params: BodyParameters) => {
    if (!model.expressionManager) return;

    const setWeight = (presetName: string, value: number) => {
      let targetName = presetName;
      const expression = model.expressionManager!.expressions.find(e => e.expressionName === presetName);

      if (!expression) {
        const found = model.expressionManager!.expressions.find(e => e.expressionName.toLowerCase() === presetName.toLowerCase());
        if (found) {
          targetName = found.expressionName;
        }
      }

      model.expressionManager!.setValue(targetName, value);
    };

    setWeight(VRMExpressionPresetName.Neutral, params.expNeutral);
    setWeight(VRMExpressionPresetName.Happy, params.expHappy);
    setWeight(VRMExpressionPresetName.Angry, params.expAngry);
    setWeight(VRMExpressionPresetName.Sad, params.expSad);
    setWeight(VRMExpressionPresetName.Relaxed, params.expRelaxed);
    setWeight(VRMExpressionPresetName.Surprised, params.expSurprised);
    setWeight(VRMExpressionPresetName.Aa, params.expAa);
    setWeight(VRMExpressionPresetName.Ih, params.expIh);
    setWeight(VRMExpressionPresetName.Ou, params.expOu);
    setWeight(VRMExpressionPresetName.Ee, params.expEe);
    setWeight(VRMExpressionPresetName.Oh, params.expOh);
    setWeight(VRMExpressionPresetName.Blink, params.expBlink);
    setWeight(VRMExpressionPresetName.BlinkLeft, params.expBlinkLeft);
    setWeight(VRMExpressionPresetName.BlinkRight, params.expBlinkRight);
    setWeight(VRMExpressionPresetName.LookUp, params.expLookUp);
    setWeight(VRMExpressionPresetName.LookDown, params.expLookDown);
    setWeight(VRMExpressionPresetName.LookLeft, params.expLookLeft);
    setWeight(VRMExpressionPresetName.LookRight, params.expLookRight);

    if (params.customExpressions) {
      Object.entries(params.customExpressions).forEach(([name, value]) => {
        setWeight(name, value);
      });
    }

    model.expressionManager.update();
  };

  const applyPose = (pose: PoseType, model: VRM) => {
    if (!model.humanoid) return;
    if (pose === 'Custom') return;

    const resetRot = (bone: VRMHumanBoneName) => {
      const node = model.humanoid?.getNormalizedBoneNode(bone);
      if (node) {
        node.rotation.set(0, 0, 0);
        if (bone === 'hips') {
          node.position.x = 0;
          const rawNode = model.humanoid?.getRawBoneNode(bone);
          if (rawNode) {
            node.position.y = rawNode.position.y;
            node.position.z = rawNode.position.z;
          }
        }
      }
    };
    const setRot = (bone: VRMHumanBoneName, x: number, y: number, z: number) => {
      const node = model.humanoid?.getNormalizedBoneNode(bone);
      if (node) node.rotation.set(x, y, z);
    };

    Object.values(VRMHumanBoneName).forEach(resetRot);

    if (pose === 'A-Pose') {
      const isVrm1 = model.meta?.metaVersion === '1';
      const armRotation = isVrm1 ? -0.8 : 0.8;
      setRot(VRMHumanBoneName.LeftUpperArm, 0, 0, armRotation);
      setRot(VRMHumanBoneName.RightUpperArm, 0, 0, -armRotation);
    } else if (pose === 'Stand') {
      const isVrm1 = model.meta?.metaVersion === '1';
      const armRotation = isVrm1 ? -1.4 : 1.4;
      setRot(VRMHumanBoneName.LeftUpperArm, 0, 0, armRotation);
      setRot(VRMHumanBoneName.RightUpperArm, 0, 0, -armRotation);
    }
  };


  const lastUpdateRef = useRef<number>(0);
  const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdateRef = useRef<{ vrm: VRM, params: BodyParameters, pose: PoseType } | null>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (vrmRef.current && vrmRef.current !== vrm) {
      scene.remove(vrmRef.current.scene);
    }

    if (vrm) {
      vrmRef.current = vrm;
      if (!scene.getObjectByProperty('uuid', vrm.scene.uuid)) {
        scene.add(vrm.scene);
      }

      const performUpdate = () => {
        applyBodyParameters(vrm, parameters);
        applyPose(currentPose, vrm);
        applyExpressions(vrm, parameters);

        if (!isPlaying) {
          if (vrm.springBoneManager) {
            vrm.springBoneManager.reset();
            vrm.update(0);
          }
          stabilizationFramesRef.current = 30;
        }
        lastUpdateRef.current = Date.now();
        pendingUpdateRef.current = null;
      };

      const now = Date.now();
      const timeSinceLastUpdate = now - lastUpdateRef.current;
      const throttleDelay = 33;

      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
        throttleTimeoutRef.current = null;
      }

      if (timeSinceLastUpdate >= throttleDelay) {
        performUpdate();
      } else {
        pendingUpdateRef.current = { vrm, params: parameters, pose: currentPose };
        throttleTimeoutRef.current = setTimeout(() => {
          if (pendingUpdateRef.current) {
            performUpdate();
          }
        }, throttleDelay - timeSinceLastUpdate);
      }
    }
  }, [vrm, parameters, currentPose]);

  useEffect(() => {
    return () => {
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
      }
    };
  }, []);

  const saveCustomPose = useCallback(() => {
    if (!vrmRef.current || !vrmRef.current.humanoid) return;

    const transforms: BoneTransforms = {};
    const humanoid = vrmRef.current.humanoid;

    Object.values(VRMHumanBoneName).forEach((boneName) => {
      const node = humanoid.getNormalizedBoneNode(boneName);
      if (node) {
        transforms[boneName] = {
          rotation: {
            x: node.quaternion.x,
            y: node.quaternion.y,
            z: node.quaternion.z,
            w: node.quaternion.w
          }
        };

        if (boneName === 'hips') {
          transforms[boneName].position = {
            x: node.position.x,
            y: node.position.y,
            z: node.position.z
          };
        }
      }
    });

    setCustomPoseTransforms(transforms);
  }, [setCustomPoseTransforms]);

  const restoreCustomPose = useCallback(() => {
    if (!vrmRef.current || !vrmRef.current.humanoid || !customPoseTransforms) return;

    const humanoid = vrmRef.current.humanoid;

    Object.entries(customPoseTransforms).forEach(([boneName, transform]) => {
      const node = humanoid.getNormalizedBoneNode(boneName as VRMHumanBoneName);
      if (node) {
        const t = transform as { rotation: { x: number, y: number, z: number, w: number }, position?: { x: number, y: number, z: number } };
        node.quaternion.set(
          t.rotation.x,
          t.rotation.y,
          t.rotation.z,
          t.rotation.w
        );

        if (boneName === 'hips' && t.position) {
          node.position.set(
            t.position.x,
            t.position.y,
            t.position.z
          );
        }
      }
    });
  }, [customPoseTransforms]);

  useEffect(() => {
    if (vrmRef.current && poseClip) {
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current.uncacheRoot(mixerRef.current.getRoot());
      }

      const mixer = new THREE.AnimationMixer(vrmRef.current.scene);
      const action = mixer.clipAction(poseClip);

      if (poseClip.duration > 0) {
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
        action.play();
        mixerRef.current = mixer;
      } else {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        mixer.update(0);

        saveCustomPose();

        mixer.stopAllAction();
        mixer.uncacheRoot(mixer.getRoot());
        mixerRef.current = null;

        onPoseClipApplied();
      }
    } else if (!poseClip && mixerRef.current) {
      mixerRef.current.stopAllAction();
      mixerRef.current.uncacheRoot(mixerRef.current.getRoot());
      mixerRef.current = null;
    }
  }, [poseClip, saveCustomPose, onPoseClipApplied]);

  const prevPoseRef = useRef(currentPose);

  useEffect(() => {
    if (!vrmRef.current) return;

    if (currentPose === 'Custom') {
      if (customPoseTransforms) {
        restoreCustomPose();
      }
    } else {
      applyPose(currentPose, vrmRef.current);
    }

    prevPoseRef.current = currentPose;
  }, [currentPose, saveCustomPose, restoreCustomPose, customPoseTransforms]);

  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const controls = controlsRef.current;

    if (!scene || !camera || !renderer || !controls || !vrmRef.current) return;

    const cleanupCustomMode = () => {
      if (transformControlsRef.current) {
        transformControlsRef.current.detach();
        transformControlsRef.current.dispose();
        scene.remove(transformControlsRef.current.getHelper());
        transformControlsRef.current = null;
        selectedBoneRef.current = null;
      }

      if (transformControlsTranslateRef.current) {
        transformControlsTranslateRef.current.detach();
        transformControlsTranslateRef.current.dispose();
        scene.remove(transformControlsTranslateRef.current.getHelper());
        transformControlsTranslateRef.current = null;
      }

      boneHelpersRef.current.forEach(helper => {
        scene.remove(helper);
        if (helper.geometry) helper.geometry.dispose();
        if (helper.material instanceof THREE.Material) helper.material.dispose();
      });
      boneHelpersRef.current = [];

      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
    };


    const handlePointerDown = (event: PointerEvent) => {
      if (isCameraModeRef.current) return;
      if (currentPose !== 'Custom') return;
      if (isPlayingRef.current) return;
      if (isDraggingRef.current) return;
      if (transformControlsRef.current && (transformControlsRef.current as any).axis !== null) return;
      if (transformControlsTranslateRef.current && (transformControlsTranslateRef.current as any).axis !== null) return;

      setEyeMenu(null);

      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      const intersects = raycasterRef.current.intersectObjects(boneHelpersRef.current);

      if (intersects.length > 0) {
        const selectedBone = intersects[0].object.userData.normalizedNode;
        const boneName = intersects[0].object.userData.boneName;
        const isEye = boneName.includes('Eye');

        if (isEye) {
          setShowGazeController(true);
          setEyeMenu(null);
          return;
        }

        if (transformControlsRef.current && selectedBone) {
          selectedBoneRef.current = selectedBone;
          isControllingBothEyesRef.current = false;

          proxyRef.current.position.copy(selectedBone.getWorldPosition(new THREE.Vector3()));
          proxyRef.current.quaternion.copy(selectedBone.getWorldQuaternion(new THREE.Quaternion()));
          proxyRef.current.scale.set(1, 1, 1);

          transformControlsRef.current.attach(proxyRef.current);

          if (boneName === 'hips' && transformControlsTranslateRef.current) {
            transformControlsTranslateRef.current.attach(proxyRef.current);
          } else if (transformControlsTranslateRef.current) {
            transformControlsTranslateRef.current.detach();
          }
        }
      } else {
      }
    };

    if (currentPose === 'Custom') {
      setGazePosition({ x: 0, y: 0 });
      gazePositionRef.current = { x: 0, y: 0 };

      if (vrmRef.current?.lookAt) {
        vrmRef.current.lookAt.autoUpdate = true;
      }

      const transformControls = new TransformControls(camera, renderer.domElement);
      transformControls.setMode('rotate');
      transformControls.setSpace('local');
      transformControls.setSize(0.8);
      transformControls.addEventListener('dragging-changed', function (event) {
        controls.enabled = !event.value;
        isDraggingRef.current = event.value as boolean;
      });
      scene.add(transformControls.getHelper());
      transformControlsRef.current = transformControls;

      const transformControlsTranslate = new TransformControls(camera, renderer.domElement);
      transformControlsTranslate.setMode('translate');
      transformControlsTranslate.setSpace('local');
      transformControlsTranslate.setSize(2.5);
      transformControlsTranslate.addEventListener('dragging-changed', function (event) {
        controls.enabled = !event.value;
        isDraggingRef.current = event.value as boolean;
      });
      scene.add(transformControlsTranslate.getHelper());

      setTimeout(() => {
        const gizmo = transformControlsTranslate.getHelper();
        gizmo.traverse((child) => {
          if (['XY', 'YZ', 'XZ', 'XYZ', 'XY_PICKER', 'YZ_PICKER', 'XZ_PICKER', 'XYZ_PICKER'].includes(child.name)) {
            child.visible = false;
          }
        });
      }, 100);

      transformControlsTranslateRef.current = transformControlsTranslate;

      if (vrmRef.current && vrmRef.current.humanoid) {
        const boneNames = Object.values(VRMHumanBoneName);
        const sphereGeometry = new THREE.SphereGeometry(0.02, 8, 8);
        const smallSphereGeometry = new THREE.SphereGeometry(0.004, 8, 8);
        const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false, depthWrite: false });

        boneNames.forEach((boneName) => {
          const rawNode = vrmRef.current?.humanoid?.getRawBoneNode(boneName);
          const normalizedNode = vrmRef.current?.humanoid?.getNormalizedBoneNode(boneName);

          if (rawNode && normalizedNode) {
            const isFinger = boneName.includes('Thumb') || boneName.includes('Index') || boneName.includes('Middle') || boneName.includes('Ring') || boneName.includes('Little');
            const isEye = boneName.includes('Eye');
            const geometry = (isFinger || isEye) ? smallSphereGeometry : sphereGeometry;
            const helper = new THREE.Mesh(geometry, sphereMaterial);

            scene.add(helper);
            helper.userData.boneNode = rawNode;
            helper.userData.normalizedNode = normalizedNode;
            helper.userData.boneName = boneName;
            normalizedNode.userData.boneName = boneName;

            helper.position.copy(rawNode.getWorldPosition(new THREE.Vector3()));

            helper.renderOrder = 999;

            boneHelpersRef.current.push(helper);
          }
        });
      }

      renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    } else {
      if (vrmRef.current?.lookAt) {
        vrmRef.current.lookAt.target = undefined;
        vrmRef.current.lookAt.autoUpdate = true;
      }
      setLookAtCamera(false);
      cleanupCustomMode();
      setShowGazeController(false);
    }

    return cleanupCustomMode;
  }, [currentPose, vrm]);

  useEffect(() => {
    boneHelpersRef.current.forEach(helper => {

      if (helper.material instanceof THREE.Material) {
        helper.material.visible = showBoneHelpers && !isPlaying && !isCameraModeRef.current;
      }
    });
  }, [showBoneHelpers, currentPose, isPlaying, isCameraMode]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    isCameraModeRef.current = isCameraMode;

    if (transformControlsRef.current) {
      const helper = transformControlsRef.current.getHelper();
      if (isCameraMode) {
        transformControlsRef.current.detach();
        transformControlsRef.current.enabled = false;
        scene.remove(helper);
        selectedBoneRef.current = null;
      } else {
        transformControlsRef.current.enabled = true;
        scene.add(helper);
      }
    }

    if (transformControlsTranslateRef.current) {
      const helper = transformControlsTranslateRef.current.getHelper();
      if (isCameraMode) {
        transformControlsTranslateRef.current.detach();
        transformControlsTranslateRef.current.enabled = false;
        scene.remove(helper);
      } else {
        transformControlsTranslateRef.current.enabled = true;
        scene.add(helper);
      }
    }
  }, [isCameraMode]);



  const handleEyeControl = (action: 'lookAtCamera' | 'gazeController') => {
    if (action === 'lookAtCamera') {
      setLookAtCamera(!lookAtCamera);
    } else if (action === 'gazeController') {
      setShowGazeController(true);
      setEyeMenu(null);
    }
  };

  const handleGazeDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const clampedX = Math.max(-1, Math.min(1, x));
    const clampedY = Math.max(-1, Math.min(1, y));

    setGazePosition({ x: clampedX, y: clampedY });
    gazePositionRef.current = { x: clampedX, y: clampedY };
  };

  const resetCamera = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 1.2, 3.5);
      controlsRef.current.target.set(0, 1.0, 0);
      controlsRef.current.update();
    }
  };

  const setCameraView = (axis: 'x' | 'y' | 'z') => {
    if (!cameraRef.current || !controlsRef.current) return;

    const target = controlsRef.current.target.clone();
    const currentPos = cameraRef.current.position;
    const dist = currentPos.distanceTo(target);

    let pos = new THREE.Vector3();

    if (axis === 'x') {
      pos.set(target.x + dist, target.y, target.z);
    }
    if (axis === 'y') {
      pos.set(target.x, target.y + dist, target.z + 0.01);
    }
    if (axis === 'z') {
      pos.set(target.x, target.y, target.z + dist);
    }

    cameraRef.current.position.copy(pos);
    cameraRef.current.lookAt(target);
    controlsRef.current.update();
  };

  return (
    <div className={`full-absolute bg-transparent ${isPoseDropdownOpen ? 'pose-dropdown-open' : ''}`}>
      <div ref={mountRef} className="full-absolute" />

      {eyeMenu && eyeMenu.visible && !isPlaying && !isCameraMode && (
        <div
          className="custom-select-container force-dark-dropdown eye-menu-container"
          style={{
            left: eyeMenu.x,
            top: eyeMenu.y,
          }}
        >
          <div className="custom-select-options show" style={{ position: 'static', border: '1px solid #444' }}>
            <div className="custom-option" onClick={() => handleEyeControl('lookAtCamera')}>
              <input type="checkbox" checked={lookAtCamera} readOnly className="mr-2" />
              {t.eyeControl.lookAtCamera}
            </div>
            <div className="custom-option" onClick={() => handleEyeControl('gazeController')}>
              {t.eyeControl.gazeController}
            </div>
          </div>
        </div>
      )}

      {showGazeController && !isPlaying && !isCameraMode && (
        <div className="absolute custom-gaze-position left-4 gaze-controller-styled-menu p-4 z-50 text-white w-64">
          <div className="flex justify-between items-center mb-0">
            <h3 className="sub-judul sub-judul-nomargin">{t.eyeControl.gazeController}</h3>
            <button onClick={() => setShowGazeController(false)} className="gaze-controller-close-btn" aria-label="Close Gaze Controller">&times;</button>
          </div>

          <div className={`mb-0 gaze-controller-switch-group ${lookAtCamera ? 'no-bottom-margin' : ''}`}>
            <div className="switch-container">
              <label
                className="switch-label cursor-pointer select-none"
                onClick={() => setLookAtCamera(!lookAtCamera)}
              >
                {t.eyeControl.lookAtCamera}
              </label>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={lookAtCamera}
                  onChange={(e) => setLookAtCamera(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>

          {!lookAtCamera && (
            <div
              className="relative w-full aspect-square bg-white gaze-grid-border custom-gaze-grid-radius cursor-crosshair overflow-hidden"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                handleGazeDrag(e);
              }}
              onPointerMove={(e) => {
                if (e.buttons === 1) handleGazeDrag(e);
              }}
              onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
            >
              { }
              <div className="absolute top-1-2 left-0 w-full h-0.5 bg-gaze-dark -translate-y-1-2"></div>
              <div className="absolute top-0 left-1-2 w-0.5 h-full bg-gaze-dark -translate-x-1-2"></div>

              { }
              <div
                className="absolute w-4 h-4 bg-gaze-dark rounded-full -translate-1-2 pointer-events-none"
                style={{
                  left: `${(gazePosition.x + 1) * 50}%`,
                  top: `${(-gazePosition.y + 1) * 50}%`
                }}
              />
            </div>
          )}
        </div>
      )}

      {vrm && (
        <>
          { }
          <div className="absolute top-4 right-4 z-50 flex gap-3">
            <div
              className="custom-select-container w-140 force-dark-dropdown-pose"
              tabIndex={-1}
              onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsPoseDropdownOpen(false); }}
            >
              <div className={`custom-select shadow-lg ${isPoseDropdownOpen ? 'open' : ''}`} onClick={() => { setIsPoseDropdownOpen(!isPoseDropdownOpen); setEyeMenu(null); }} tabIndex={0}>
                <span>{POSES.find(p => p.value === currentPose)?.label}</span>
                <span className="select-arrow"></span>
              </div>
              <div className={`custom-select-options ${isPoseDropdownOpen ? 'show' : ''}`}>
                {POSES.map((pose) => (
                  <div key={pose.value} className={`custom-option ${currentPose === pose.value ? 'selected' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); setCurrentPose(pose.value); setIsPoseDropdownOpen(false); }}>
                    {pose.label}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={onToggleSidebar}
              className="sidebar-toggle-btn force-dark-style shadow-lg"
              aria-label="Open Sidebar"
            >
              ☰
            </button>
          </div>

          { }
          <div className="gizmo-container">
            { }
            {!isCameraMode && (
              <button
                onClick={() => setIsCameraMode(true)}
                className="gizmo-btn group"
                data-tooltip={t.camera}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                </svg>
              </button>
            )}

            <button onClick={resetCamera} className="gizmo-btn group" data-tooltip={t.resetCamera}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
            {currentPose === 'Custom' && !isPlaying && !isCameraMode && (
              <button
                onClick={() => setShowBoneHelpers(!showBoneHelpers)}
                className="gizmo-btn group"
                data-tooltip={t.toggleHelpers}
              >
                {showBoneHelpers ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 opacity-50">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                )}
              </button>
            )}

            <div className="flex flex-col items-center gap-1">
              <button onClick={() => setCameraView('y')} className="gizmo-btn gizmo-btn-lg gizmo-btn-primary">Y</button>
              <div className="flex gap-2 relative">
                <div className="absolute right-full mr-3 top-1-2 -translate-y-1-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="gizmo-btn group"
                    data-tooltip={t.image}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                    </svg>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          if (event.target?.result) {
                            setBackgroundImage(event.target.result as string);
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                      e.target.value = '';
                    }}
                  />
                </div>
                <button onClick={() => setCameraView('x')} className="gizmo-btn gizmo-btn-lg">X</button>
                <button onClick={() => setCameraView('z')} className="gizmo-btn gizmo-btn-lg">Z</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ThreeCanvas;