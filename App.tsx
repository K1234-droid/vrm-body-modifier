
import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import Sidebar from './components/Sidebar';
import ThreeCanvas from './components/ThreeCanvas';
import { BodyParameters, DEFAULT_PARAMETERS, BoneTransforms, CameraRatio } from './types';
import { loadVRM } from './services/vrmService';
import { VRM } from '@pixiv/three-vrm';
import { createVRMAnimationClip, VRMAnimationLoaderPlugin, VRMLookAtQuaternionProxy } from '@pixiv/three-vrm-animation';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import LanguageSelector, { Language } from './components/LanguageSelector';
import { translations, getMetaValueLabel } from './utils/translations';
import PWAUpdateNotification from './components/PWAUpdateNotification';
import { HistoryManager } from './utils/history';

const App: React.FC = () => {
  const [params, setParams] = useState<BodyParameters>(DEFAULT_PARAMETERS);
  const [vrm, setVrm] = useState<VRM | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<{ version: string, value: string } | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('isDarkMode');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [currentPose, setCurrentPose] = useState<'T-Pose' | 'A-Pose' | 'Stand' | 'Custom'>('T-Pose');
  const [poseClip, setPoseClip] = useState<THREE.AnimationClip | null>(null);
  const [customPoseTransforms, setCustomPoseTransforms] = useState<BoneTransforms | null>(null);
  const [isAnimation, setIsAnimation] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoBlink, setAutoBlink] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [isCameraMode, setIsCameraMode] = useState(false);
  const [cameraRatio, setCameraRatio] = useState<CameraRatio>(() => {
    return (localStorage.getItem('cameraRatio') as CameraRatio) || '16:9';
  });
  const [resolutionPreset, setResolutionPreset] = useState<'1K' | '2K' | '4K' | '8K'>(() => {
    return (localStorage.getItem('resolutionPreset') as '1K' | '2K' | '4K' | '8K') || '1K';
  });
  const [customResolution, setCustomResolution] = useState(() => {
    const saved = localStorage.getItem('customResolution');
    return saved ? JSON.parse(saved) : { width: 1080, height: 1920 };
  });
  const [isTransparent, setIsTransparent] = useState(() => {
    const saved = localStorage.getItem('isTransparent');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [saveTrigger, setSaveTrigger] = useState<{ format: 'png' | 'jpg', timestamp: number } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragText, setDragText] = useState('');
  const [showInvalidModal, setShowInvalidModal] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [invalidModalMessage, setInvalidModalMessage] = useState('');
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });
  const historyRef = useRef(new HistoryManager<BodyParameters>());
  const isInternalUpdate = useRef(false);
  const lastInteractionTime = useRef(0);
  const lastPushedState = useRef<BodyParameters>(DEFAULT_PARAMETERS);
  const lastParameterGroup = useRef<'expression' | 'body' | null>(null);
  const realtimeParamsRef = useRef<BodyParameters>(params);

  const showToast = (message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
  };

  const closeModal = useCallback(() => {
    setIsModalVisible(false);
    setTimeout(() => {
      setShowInvalidModal(false);
    }, 200);
  }, []);

  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showInvalidModal) {
        closeModal();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    };

    if (showInvalidModal) {
      window.addEventListener('keydown', handleEscKey, true);
    }

    return () => {
      window.removeEventListener('keydown', handleEscKey, true);
    };
  }, [showInvalidModal, closeModal]);

  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('app_language');
    if (saved === 'id' || saved === 'en') return saved;
    const browserLang = navigator.language || 'en';
    return browserLang.toLowerCase().startsWith('id') ? 'id' : 'en';
  });

  useEffect(() => {
    localStorage.setItem('app_language', language);
  }, [language]);

  const t = translations[language];

  useEffect(() => {
    localStorage.setItem('isDarkMode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('isTransparent', JSON.stringify(isTransparent));
  }, [isTransparent]);

  useEffect(() => {
    localStorage.setItem('cameraRatio', cameraRatio);
  }, [cameraRatio]);

  useEffect(() => {
    localStorage.setItem('resolutionPreset', resolutionPreset);
  }, [resolutionPreset]);

  useEffect(() => {
    localStorage.setItem('customResolution', JSON.stringify(customResolution));
  }, [customResolution]);

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

      if (event.ctrlKey && event.key === 'a') {
        const target = event.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          event.preventDefault();
        }
      }

      if (event.ctrlKey && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault();
        handleUndo();
      }
      if (event.ctrlKey && (event.key === 'y' || event.key === 'Y')) {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPose, isAnimation]);

  const isWebGL2Available = () => {
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
    } catch (e) {
      return false;
    }
  };

  useEffect(() => {
    if (!isWebGL2Available()) {
      setInvalidModalMessage(t.errorWebGL);
      setShowInvalidModal(true);
      setTimeout(() => setIsModalVisible(true), 10);
    }
  }, [t.errorWebGL]);

  useEffect(() => {
    realtimeParamsRef.current = params;
  }, [params]);

  const handleSetCurrentPose = useCallback((pose: 'T-Pose' | 'A-Pose' | 'Stand' | 'Custom') => {
    setCurrentPose(pose);
    if (pose !== 'Custom') {
      setPoseClip(null);
      setCustomPoseTransforms(null);
      setIsAnimation(false);
      setIsPlaying(false);
    }
  }, []);
  const pushHistory = useCallback(() => {
    historyRef.current.push(realtimeParamsRef.current);
    lastPushedState.current = realtimeParamsRef.current;
    lastInteractionTime.current = 0;
    lastParameterGroup.current = null;
  }, []);

  const handleParamChange = useCallback((key: keyof BodyParameters, value: number | string) => {
    const now = Date.now();
    const group: 'expression' | 'body' = (key.startsWith('exp') || key === 'customExpressions') ? 'expression' : 'body';

    if (now - lastInteractionTime.current > 500 || (lastParameterGroup.current && lastParameterGroup.current !== group)) {
      pushHistory();
    }
    lastInteractionTime.current = now;
    lastParameterGroup.current = group;

    const nextParams = { ...realtimeParamsRef.current, [key]: value };
    realtimeParamsRef.current = nextParams;
    setParams(nextParams);
  }, [pushHistory]);

  const handleUndo = useCallback(() => {
    const result = historyRef.current.undo(realtimeParamsRef.current);
    if (result) {
      isInternalUpdate.current = true;
      realtimeParamsRef.current = result.state;
      setParams(result.state);
      lastPushedState.current = result.state;
      lastInteractionTime.current = 0;
    }
  }, []);

  const handleRedo = useCallback(() => {
    const result = historyRef.current.redo(realtimeParamsRef.current);
    if (result) {
      isInternalUpdate.current = true;
      realtimeParamsRef.current = result.state;
      setParams(result.state);
      lastPushedState.current = result.state;
      lastInteractionTime.current = 0;
    }
  }, []);

  const handleReset = useCallback((target: 'expression' | 'body') => {
    pushHistory();

    const nextParams = { ...realtimeParamsRef.current };
    const keys = Object.keys(DEFAULT_PARAMETERS) as Array<keyof BodyParameters>;

    keys.forEach((key) => {
      const isExpressionParam = key.startsWith('exp') || key === 'customExpressions';

      if (target === 'expression') {
        if (isExpressionParam) {
          nextParams[key] = DEFAULT_PARAMETERS[key] as any;
        }
      } else if (target === 'body') {
        if (!isExpressionParam) {
          nextParams[key] = DEFAULT_PARAMETERS[key] as any;
        }
      }
    });

    realtimeParamsRef.current = nextParams;
    setParams(nextParams);

    if (target === 'expression') {
      setAutoBlink(false);
    }
  }, [pushHistory]);

  const resetAppState = useCallback(() => {
    setParams(DEFAULT_PARAMETERS);
    realtimeParamsRef.current = DEFAULT_PARAMETERS;
    setCurrentPose('T-Pose');
    setPoseClip(null);
    setCustomPoseTransforms(null);
    setIsAnimation(false);
    setIsPlaying(false);
    setAutoBlink(false);
    setIsCameraMode(false);
    historyRef.current.clear();
    lastPushedState.current = DEFAULT_PARAMETERS;
    lastInteractionTime.current = 0;
    lastParameterGroup.current = null;
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const target = event.target;
    const file = target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const processFile = async (file: File) => {
    if (!vrm) {
      if (!file.name.toLowerCase().endsWith('.vrm')) {
        setInvalidModalMessage(t.errorOnlyVRM);
        setShowInvalidModal(true);
        setTimeout(() => setIsModalVisible(true), 10);
        return;
      }
      await loadVRMFile(file);
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'vrm') {
      resetAppState();
      setIsLoading(true);
      await loadVRMFile(file);
    } else if (ext === 'vrma') {
      await handlePoseFile(file);
    } else if (ext === 'json') {
      await handleJsonFile(file);
    } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext || '')) {
      await handleImageFile(file);
    } else {
      setInvalidModalMessage(t.errorInvalidFileType);
      setShowInvalidModal(true);
      setTimeout(() => setIsModalVisible(true), 10);
    }
  };

  const loadVRMFile = async (file: File) => {
    setIsLoading(true);
    setError(null);
    setErrorDetail(null);
    setVrm(null);

    try {
      const loadedVrm = await loadVRM(file);
      setVrm(loadedVrm);
      setVrm(loadedVrm);
      if (vrm) {
      }
    } catch (err: any) {
      if (err.message !== 'modification_prohibited') {
        console.error(err);
      }
      if (err.message === 'modification_prohibited') {
        setError('errorModificationProhibited');
        setErrorDetail(err.detail);
      } else {
        setError('errorLoad');
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setIsLoading(false);
    }
  };

  const handlePoseFile = async (file: File) => {
    if (!vrm) return;
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
            setCurrentPose('Custom');
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
        setInvalidModalMessage(t.importFailed);
        setShowInvalidModal(true);
        setTimeout(() => setIsModalVisible(true), 10);
      });
    } catch (error) {
      console.error('Error loading pose:', error);
      setInvalidModalMessage(t.importFailed);
      setShowInvalidModal(true);
      setTimeout(() => setIsModalVisible(true), 10);
    }
  };

  const handleJsonFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (!json.type || !json.params) throw new Error('Invalid format');

        pushHistory();

        const nextParams = { ...realtimeParamsRef.current };
        Object.keys(json.params).forEach(key => {
          let value = json.params[key];

          if (json.type === 'expression') {
            if (key === 'customExpressions' && typeof value === 'object' && value !== null) {
              const clampedCustom: Record<string, number> = {};
              Object.keys(value).forEach(k => {
                let val = (value as any)[k];
                if (typeof val === 'number') {
                  if (val < 0.00) val = 0.00;
                  if (val > 1.00) val = 1.00;
                  clampedCustom[k] = val;
                }
              });
              (nextParams as any)[key] = clampedCustom;
              return;
            }

            if (typeof value === 'number') {
              if (value < 0.00) value = 0.00;
              if (value > 1.00) value = 1.00;
            }
          } else if (json.type === 'body') {
            if (typeof value === 'number') {
              if (value < 0.50) value = 0.50;
              if (value > 2.00) value = 2.00;
            }
          }

          (nextParams as any)[key] = value;
        });

        realtimeParamsRef.current = nextParams;
        setParams(nextParams);
        showToast(t.importSuccess);
      } catch (err) {
        setInvalidModalMessage(t.importFailed);
        setShowInvalidModal(true);
        setTimeout(() => setIsModalVisible(true), 10);
      }
    };
    reader.readAsText(file);
  };

  const handleImageFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === 'string') {
        setBackgroundImage(e.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleVRMLoaded = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleReupload = () => {
    if (isCameraMode) {
      setIsCameraMode(false);
      return;
    }
    setVrm(null);
    resetAppState();
  };

  const handleSave = (format: 'png' | 'jpg') => {
    setIsLoading(true);
    setSaveTrigger({ format, timestamp: Date.now() });
  };

  const handlePoseUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !vrm) return;
    await handlePoseFile(file);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (showInvalidModal) return;

    setIsDragging(true);

    if (!vrm) {
      setDragText(t.dropVRM);
    } else {
      setDragText(t.dropFile);
    }
  }, [vrm, t, showInvalidModal]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (showInvalidModal) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFile(file);
    }
  }, [vrm, t, showInvalidModal]);

  if (!vrm) {
    return (
      <div
        className="loading-screen h-full"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        { }
        {isDragging && (
          <div
            className="modal-content drag-over"
            data-drop-text={dragText}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 99999,
              backgroundColor: 'transparent',
              pointerEvents: 'none',
              borderRadius: 0
            }}
          />
        )}

        { }
        {isLoading && (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
            <p className="mt-9 font-semibold animate-pulse text-color-primary">{t.processing}</p>
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
              ref={fileInputRef}
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
              {(() => {
                if (error === 'errorModificationProhibited' && errorDetail) {
                  if (errorDetail.version === '1') {
                    return t.errorModificationProhibited;
                  }
                  const label = getMetaValueLabel(errorDetail.value, t);
                  return (
                    <>
                      {t.errorModificationProhibited}
                      <div className="mt-1">
                        {t.fileInfo.licenseName}: {label}
                      </div>
                    </>
                  );
                }
                return (t as any)[error] || error;
              })()}
            </div>
          )}

        </div>

        { }
        <div className="version-info">
          <div className="version-text-container">
            <span className="version-text version-label-text">
              {t.version}:&nbsp;
            </span>
            <span className="version-text">
              v{import.meta.env.APP_VERSION}
            </span>
          </div>
        </div>

        <div className="absolute bottom-9 right-8 z-20">
          <LanguageSelector
            language={language}
            setLanguage={setLanguage}
            className="force-dark-dropdown arrow-reversed"
            dropUp={true}
          />
        </div>

        <PWAUpdateNotification language={language} />

        {showInvalidModal && ReactDOM.createPortal(
          <div className={`modal-overlay ${isModalVisible ? 'show' : ''}`}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{t.attention}</h3>
                <button className="close-btn" onClick={closeModal}>&times;</button>
              </div>
              <div className="modal-body">
                <p style={{ textAlign: 'center' }}>{invalidModalMessage}</p>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }

  const handleSaveComplete = () => {
    setSaveTrigger(null);
    setIsLoading(false);
  };

  return (
    <div
      className="app-layout"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      { }
      {isDragging && (
        <div
          className="modal-content drag-over"
          data-drop-text={dragText}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 99999,
            backgroundColor: 'transparent',
            pointerEvents: 'none',
            borderRadius: 0
          }}
        />
      )}
      <div className="main-canvas-area">
        {isLoading && (
          <div
            className="loading-overlay"
            style={{
              zIndex: 9999,
              position: isCameraMode ? 'absolute' : 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
            }}
          >
            <div className="loading-spinner"></div>
            <p className="mt-9 font-semibold animate-pulse text-color-primary">{t.processing}</p>
          </div>
        )}

        { }
        <div className="absolute top-4 left-4 z-20 flex gap-3 top-left-controls">
          <button
            onClick={handleReupload}
            className="modal-secondary-btn force-dark-style flex items-center gap-2 shadow-lg"
          >
            {isCameraMode ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 btn-icon-responsive">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 btn-icon-responsive">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            )}
            <span className="btn-text">{isCameraMode ? t.exitCamera : t.reupload}</span>
          </button>

          {currentPose === 'Custom' && (
            <>
              <button
                className="modal-secondary-btn force-dark-style flex items-center gap-2 shadow-lg"
                onClick={() => document.getElementById('pose-upload-input')?.click()}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 btn-icon-responsive">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
                <span className="btn-text">{t.uploadPose}</span>
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
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                      </svg>
                      <span className="btn-text">Pause</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                      </svg>
                      <span className="btn-text">Play</span>
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
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onVRMLoaded={handleVRMLoaded}
          onWebGLError={() => {
            setInvalidModalMessage(t.errorWebGL);
            setShowInvalidModal(true);
            setTimeout(() => setIsModalVisible(true), 10);
          }}
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
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        undo={handleUndo}
        redo={handleRedo}
        canUndo={historyRef.current.canUndo}
        canRedo={historyRef.current.canRedo}
        pushHistory={pushHistory}
      />

      {ReactDOM.createPortal(
        <div className={`toast-notification ${toast.visible ? 'show' : ''}`} onClick={() => setToast(prev => ({ ...prev, visible: false }))}>
          {toast.message}
        </div>,
        document.body
      )}

      {showInvalidModal && ReactDOM.createPortal(
        <div className={`modal-overlay ${isModalVisible ? 'show' : ''}`}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t.attention}</h3>
              <button className="close-btn" onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ textAlign: 'center' }}>{invalidModalMessage}</p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default App;