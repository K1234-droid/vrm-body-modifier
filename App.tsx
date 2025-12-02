
import React, { useState, useCallback, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ThreeCanvas from './components/ThreeCanvas';
import { BodyParameters, DEFAULT_PARAMETERS, BoneTransforms, CameraRatio } from './types';
import { loadVRM } from './services/vrmService';
import { VRM } from '@pixiv/three-vrm';
import { createVRMAnimationClip, VRMAnimationLoaderPlugin, VRMLookAtQuaternionProxy } from '@pixiv/three-vrm-animation';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import LanguageSelector, { Language } from './components/LanguageSelector';
import { translations } from './utils/translations';

const App: React.FC = () => {
  const [params, setParams] = useState<BodyParameters>(DEFAULT_PARAMETERS);
  const [vrm, setVrm] = useState<VRM | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [currentPose, setCurrentPose] = useState<'T-Pose' | 'A-Pose' | 'Stand' | 'Custom'>('T-Pose');
  const [poseClip, setPoseClip] = useState<THREE.AnimationClip | null>(null);
  const [customPoseTransforms, setCustomPoseTransforms] = useState<BoneTransforms | null>(null);
  const [isAnimation, setIsAnimation] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoBlink, setAutoBlink] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [isCameraMode, setIsCameraMode] = useState(false);
  const [cameraRatio, setCameraRatio] = useState<CameraRatio>('16:9');
  const [resolutionPreset, setResolutionPreset] = useState<'1K' | '2K' | '4K' | '8K'>('1K');
  const [customResolution, setCustomResolution] = useState({ width: 1080, height: 1920 });
  const [isTransparent, setIsTransparent] = useState(false);
  const [saveTrigger, setSaveTrigger] = useState<{ format: 'png' | 'jpg', timestamp: number } | null>(null);

  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('app_language');
    if (saved === 'id' || saved === 'en') return saved;
    const browserLang = navigator.language || 'en';
    return browserLang.toLowerCase().startsWith('id') ? 'id' : 'en';
  });

  useEffect(() => {
    localStorage.setItem('app_language', language);
  }, [language]);

  const handlePoseClipApplied = useCallback(() => {
    setPoseClip(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && currentPose === 'Custom' && isAnimation) {
        event.preventDefault();
        (document.activeElement as HTMLElement)?.blur();
        setIsPlaying(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPose, isAnimation]);

  const t = translations[language];

  const handleSetCurrentPose = useCallback((pose: 'T-Pose' | 'A-Pose' | 'Stand' | 'Custom') => {
    setCurrentPose(pose);
    if (pose !== 'Custom') {
      setPoseClip(null);
      setCustomPoseTransforms(null);
      setIsAnimation(false);
      setIsPlaying(false);
    }
  }, []);

  const handleParamChange = useCallback((key: keyof BodyParameters, value: number | string) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleReset = useCallback(() => {
    setParams(DEFAULT_PARAMETERS);
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);
    setVrm(null);

    try {
      const loadedVrm = await loadVRM(file);
      setVrm(loadedVrm);
    } catch (err: any) {

      console.error(err);
      if (err.message === 'modification_prohibited') {
        setError('errorModificationProhibited');
      } else {
        setError('errorLoad');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleReupload = () => {
    if (isCameraMode) {
      setIsCameraMode(false);
      return;
    }
    setVrm(null);
    setParams(DEFAULT_PARAMETERS);
    setCurrentPose('T-Pose');
    setPoseClip(null);
    setCustomPoseTransforms(null);
    setIsAnimation(false);
    setIsAnimation(false);
    setIsPlaying(false);
    setAutoBlink(false);
  };

  const handleSave = (format: 'png' | 'jpg') => {
    setIsLoading(true);
    setSaveTrigger({ format, timestamp: Date.now() });
  };

  const handlePoseUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !vrm) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const gltfLoader = new GLTFLoader();
      gltfLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));

      const originalWarn = console.warn;
      console.warn = (...args) => {
        if (typeof args[0] === 'string' && args[0].includes('specVersion of the VRMA is not defined')) {
          return;
        }
        originalWarn.apply(console, args);
      };

      gltfLoader.parse(arrayBuffer, '', (gltf) => {
        console.warn = originalWarn;

        const vrmAnimations = gltf.userData.vrmAnimations;
        if (vrmAnimations && vrmAnimations.length > 0) {
          if (vrm.lookAt) {
            const existingProxy = vrm.scene.children.find(child => (child as any).type === 'VRMLookAtQuaternionProxy');
            if (!existingProxy) {
              const proxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
              proxy.name = 'VRMLookAtQuaternionProxy';
              vrm.scene.add(proxy);
            }
          }

          const clip = createVRMAnimationClip(vrmAnimations[0], vrm);
          if (clip) {
            setPoseClip(clip);
            if (clip.duration > 0) {
              setIsAnimation(true);
              setIsPlaying(true);
            } else {
              setIsAnimation(false);
              setIsPlaying(false);
            }
          }
        }
      }, (error: any) => {
        console.warn = originalWarn;
        console.error('Error parsing VRMA:', error);
      });

    } catch (error) {
      console.error('Error loading pose:', error);
    }
  };

  if (!vrm) {
    return (
      <div className="loading-screen">

        { }
        {isLoading && (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
            <p className="font-semibold animate-pulse text-color-primary">{t.processing}</p>
          </div>
        )}

        <div className="blocker-content blocker-content-compensated">
          <h1 className="blocker-title">{t.title}</h1>
          <p className="blocker-message">
            {t.description}
          </p>

          <div className="relative inline-block">
            <button
              className={`blocker-btn ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={isLoading}
              onClick={(e) => e.preventDefault()}
            >
              {t.selectFile}
            </button>

            <input
              type="file"
              accept=".vrm"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handleFileUpload}
              disabled={isLoading}
              aria-label={t.selectFile}
            />
          </div>

          {error && (
            <div className="mt-8 mx-auto p-3 rounded-lg bg-red-900-30 border border-red-800 text-red-200 text-sm" style={{ maxWidth: '400px' }}>
              {(t as any)[error] || error}
            </div>
          )}

        </div>

        { }
        <div className="version-info">
          <div className="version-text-container">
            <span className="version-text">
              {t.version}: v{import.meta.env.APP_VERSION}
            </span>
          </div>
        </div>

        <div className="absolute bottom-9 right-8 z-20">
          <LanguageSelector
            language={language}
            setLanguage={setLanguage}
            className="force-dark-dropdown"
            dropUp={true}
          />
        </div>

      </div>
    );
  }

  const handleSaveComplete = () => {
    setSaveTrigger(null);
    setIsLoading(false);
  };

  return (
    <div className="app-layout">
      <div className="main-canvas-area">
        {isLoading && (
          <div className="loading-overlay" style={{ zIndex: 9999 }}>
            <div className="loading-spinner"></div>
            <p className="font-semibold animate-pulse text-color-primary">{t.processing}</p>
          </div>
        )}

        { }
        <div className="absolute top-4 left-4 z-20 flex gap-3">
          <button
            onClick={handleReupload}
            className="modal-secondary-btn force-dark-style flex items-center gap-2 shadow-lg"
          >
            {isCameraMode ? t.exitCamera : t.reupload}
          </button>

          {currentPose === 'Custom' && (
            <>
              <button
                className="modal-secondary-btn force-dark-style flex items-center gap-2 shadow-lg"
                onClick={() => document.getElementById('pose-upload-input')?.click()}
              >
                {t.uploadPose}
              </button>
              <input
                id="pose-upload-input"
                type="file"
                accept=".vrma"
                className="hidden"
                onChange={handlePoseUpload}
              />
              {isAnimation && (
                <button
                  className="modal-secondary-btn force-dark-style flex items-center gap-2 shadow-lg"
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  {isPlaying ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                      </svg>
                      Pause
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                      </svg>
                      Play
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>

        { }
        <ThreeCanvas
          vrm={vrm}
          parameters={params}
          isDarkMode={isDarkMode}
          language={language}
          currentPose={currentPose}
          setCurrentPose={handleSetCurrentPose}
          poseClip={poseClip}
          customPoseTransforms={customPoseTransforms}
          setCustomPoseTransforms={setCustomPoseTransforms}
          onPoseClipApplied={handlePoseClipApplied}
          isPlaying={isPlaying}
          autoBlink={autoBlink}
          backgroundImage={backgroundImage}
          setBackgroundImage={setBackgroundImage}
          isCameraMode={isCameraMode}
          setIsCameraMode={setIsCameraMode}
          cameraRatio={cameraRatio}
          resolutionPreset={resolutionPreset}
          customResolution={customResolution}
          isTransparent={isTransparent}
          saveTrigger={saveTrigger}
          onSaveComplete={handleSaveComplete}
        />

        { }
        {!isCameraMode && (
          <div className="helper-box">
            <p className="m-0">{t.controlsHelp}</p>
          </div>
        )}
      </div>

      { }
      <Sidebar
        vrm={vrm}
        params={params}
        onChange={handleParamChange}
        onReset={handleReset}
        isFileLoaded={!!vrm}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        language={language}
        setLanguage={setLanguage}
        autoBlink={autoBlink}
        setAutoBlink={setAutoBlink}
        backgroundImage={backgroundImage}
        setBackgroundImage={setBackgroundImage}
        isCameraMode={isCameraMode}
        cameraRatio={cameraRatio}
        setCameraRatio={setCameraRatio}
        resolutionPreset={resolutionPreset}
        setResolutionPreset={setResolutionPreset}
        customResolution={customResolution}
        setCustomResolution={setCustomResolution}
        isTransparent={isTransparent}
        setIsTransparent={setIsTransparent}
        onSave={handleSave}
      />
    </div>
  );
};

export default App;