import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { BodyParameters, CameraRatio } from '../types';
import { VRM } from '@pixiv/three-vrm';
import LanguageSelector, { Language } from './LanguageSelector';
import { translations, getMetaValueLabel } from '../utils/translations';

interface SidebarProps {
  vrm: VRM | null;
  params: BodyParameters;
  onChange: (key: keyof BodyParameters, value: number | string) => void;
  onReset: (target: 'expression' | 'body') => void;
  isFileLoaded: boolean;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  autoBlink: boolean;
  setAutoBlink: (val: boolean) => void;
  backgroundImage: string | null;
  setBackgroundImage: (image: string | null) => void;
  isCameraMode: boolean;
  cameraRatio: CameraRatio;
  setCameraRatio: (ratio: CameraRatio) => void;
  resolutionPreset: '1K' | '2K' | '4K' | '8K';
  setResolutionPreset: (res: '1K' | '2K' | '4K' | '8K') => void;
  customResolution: { width: number; height: number };
  setCustomResolution: (res: { width: number; height: number }) => void;
  isTransparent: boolean;
  setIsTransparent: (val: boolean) => void;
  onSave: (format: 'png' | 'jpg') => void;
  isOpen?: boolean;
  onClose?: () => void;
}

interface SliderGroupProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

const SliderGroup: React.FC<SliderGroupProps> = ({ title, children, className }) => (
  <div className={`mb-6 ${className || ''}`}>
    <h4 className="sub-judul">{title}</h4>
    <div>
      {children}
    </div>
  </div>
);

interface SliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (val: number) => void;
  className?: string;
}

const Slider: React.FC<SliderProps> = ({ label, value, min = 0.5, max = 2.0, step = 0.01, onChange, className }) => (
  <div className={`flex flex-col gap-2 mb-5 ${className || ''}`}>
    <div className="flex justify-between items-center">
      <span className="modal-label !mb-0">{label}</span>
      <span className="value-badge">
        {value.toFixed(2)}
      </span>
    </div>
    <div className="relative w-full h-6 flex items-center">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={label}
      />
    </div>
  </div>
);

interface SelectProps {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (val: string) => void;
  displayLabel?: string;
  className?: string;
  dropdownClassName?: string;
}

const Select: React.FC<SelectProps> = ({ label, value, options, onChange, displayLabel, className, dropdownClassName }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
        event.stopPropagation();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen]);

  const selectedLabel = displayLabel || options.find(o => o.value === value)?.label || value;

  return (
    <div className={`flex flex-col gap-2 ${className || 'mb-4'}`} ref={containerRef}>
      {!displayLabel && <span className="modal-label !mb-0">{label}</span>}
      <div className="custom-select-container w-full">
        <div
          className={`custom-select ${isOpen ? 'open' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <span>{selectedLabel}</span>
          <span className="select-arrow"></span>
        </div>
        <div className={`custom-select-options ${isOpen ? 'show' : ''} ${dropdownClassName || ''}`}>
          {options.map((opt) => (
            <div
              key={opt.value}
              className={`custom-option font-medium ${value === opt.value ? 'selected' : ''}`}
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const EXPRESSIONS = [
  { label: 'Neutral', value: 'neutral' },
  { label: 'Happy', value: 'happy' },
  { label: 'Angry', value: 'angry' },
  { label: 'Sad', value: 'sad' },
  { label: 'Relaxed', value: 'relaxed' },
  { label: 'Surprised', value: 'surprised' },
  { label: 'aa', value: 'aa' },
  { label: 'ih', value: 'ih' },
  { label: 'ou', value: 'ou' },
  { label: 'ee', value: 'ee' },
  { label: 'oh', value: 'oh' },
  { label: 'Blink', value: 'blink' },
  { label: 'Blink Left', value: 'blinkLeft' },
  { label: 'Blink Right', value: 'blinkRight' },
  { label: 'Look Up', value: 'lookUp' },
  { label: 'Look Down', value: 'lookDown' },
  { label: 'Look Left', value: 'lookLeft' },
  { label: 'Look Right', value: 'lookRight' },
];

type ActiveTab = 'expression' | 'body' | 'display' | 'fileInfo';

const MetaInfoRow: React.FC<{ label: string; value?: string }> = ({ label, value }) => {
  if (!value) return null;
  return (
    <div className="file-info-item">
      <span className="file-info-label select-text">{label}</span>
      <span className="file-info-value select-text">{value}</span>
    </div>
  );
};

const Sidebar: React.FC<SidebarProps> = ({ vrm, params, onChange, onReset, isFileLoaded, isDarkMode, onToggleDarkMode, language, setLanguage, autoBlink, setAutoBlink, backgroundImage, setBackgroundImage, isCameraMode, cameraRatio, setCameraRatio, resolutionPreset, setResolutionPreset, customResolution, setCustomResolution, isTransparent, setIsTransparent, onSave, isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('expression');
  const [showInvalidModal, setShowInvalidModal] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const scrollPositions = React.useRef<Record<ActiveTab, number>>({
    expression: 0,
    body: 0,
    display: 0,
    fileInfo: 0
  });

  const showToast = (message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
  };

  const handleExport = () => {
    let exportData: any = { type: activeTab };
    const timestamp = new Date().toISOString().split('T')[0];
    const meta = vrm?.meta as any;
    const title = meta?.title || meta?.name || 'VRM';
    const filename = `${title}_${timestamp}_${activeTab}.json`;

    if (activeTab === 'expression') {
      const expressionParams: any = {};
      Object.keys(params).forEach(key => {
        if (key.startsWith('exp') || key === 'customExpressions') {
          expressionParams[key] = (params as any)[key];
        }
      });
      exportData.params = expressionParams;
    } else if (activeTab === 'body') {
      const bodyParams: any = {};
      Object.keys(params).forEach(key => {
        if (!key.startsWith('exp') && key !== 'customExpressions') {
          bodyParams[key] = (params as any)[key];
        }
      });
      exportData.params = bodyParams;
    } else {
      return;
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast(t.exportSuccess);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (!json.type || !json.params) throw new Error('Invalid format');

        if (json.type !== activeTab) {
          setShowInvalidModal(true);
          // Small delay to allow render before adding 'show' class for animation
          setTimeout(() => setIsModalVisible(true), 10);
          if (fileInputRef.current) fileInputRef.current.value = '';
          return;
        }

        Object.keys(json.params).forEach(key => {
          onChange(key as any, json.params[key]);
        });

        showToast(t.importSuccess);
      } catch (err) {
        setShowInvalidModal(true);
        setTimeout(() => setIsModalVisible(true), 10);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (scrollContainerRef.current) {
      if (isCameraMode && (activeTab === 'body' || activeTab === 'fileInfo')) return;
      scrollPositions.current[activeTab] = e.currentTarget.scrollTop;
    }
  };

  React.useLayoutEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollPositions.current[activeTab];
    }
  }, [activeTab]);

  if (!isFileLoaded) {
    return null;
  }

  const t = translations[language];

  const [isAnimating, setIsAnimating] = React.useState(false);
  const isFirstRender = React.useRef(true);

  React.useLayoutEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setIsAnimating(true);
    const timer = setTimeout(() => setIsAnimating(false), 300);
    return () => clearTimeout(timer);
  }, [isOpen]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showInvalidModal) {
          closeModal();
          event.stopPropagation();
          return;
        }
        if (isOpen && onClose) {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, showInvalidModal]);

  const closeModal = () => {
    setIsModalVisible(false);
    setTimeout(() => {
      setShowInvalidModal(false);
    }, 200);
  };

  React.useEffect(() => {
    if (isCameraMode && (activeTab === 'body' || activeTab === 'fileInfo')) {
      setActiveTab('expression');
    }
  }, [isCameraMode, activeTab]);



  const getMeta = () => {
    if (!vrm || !vrm.meta) return null;
    const meta = vrm.meta as any;
    const isV1 = meta.metaVersion === '1';

    return {
      title: isV1 ? meta.name : meta.title,
      version: meta.version,
      author: isV1 ? meta.authors?.join(', ') : meta.author,
      contact: meta.contactInformation,
      reference: isV1 ? meta.references?.join(', ') : meta.reference,
      allowedUser: isV1 ? meta.avatarPermission : meta.allowedUserName,
      violent: isV1 ? (meta.allowExcessivelyViolentUsage ? 'Allow' : 'Disallow') : meta.violentUssageName,
      sexual: isV1 ? (meta.allowExcessivelySexualUsage ? 'Allow' : 'Disallow') : meta.sexualUssageName,
      commercial: isV1 ? meta.commercialUsage : meta.commercialUssageName,
      licenseName: isV1 ? 'See Other License' : meta.licenseName,
      otherLicenseUrl: meta.otherLicenseUrl,

      attribution: isV1 ? meta.creditNotation : undefined,
      alterations: isV1 ? meta.modification : undefined,
      politicalReligious: isV1 ? (meta.allowPoliticalOrReligiousUsage ? 'Allow' : 'Disallow') : undefined,
      antisocialHate: isV1 ? (meta.allowAntisocialOrHateUsage ? 'Allow' : 'Disallow') : undefined,
      copyright: isV1 ? meta.copyrightInformation : undefined,
      thirdPartyLicenses: isV1 ? meta.thirdPartyLicenses : undefined,

      otherPermissionUrl: !isV1 ? meta.otherPermissionUrl : undefined,
    };
  };

  const metaData = getMeta();

  return (
    <div className={`sidebar-container ${isOpen ? 'open' : ''} ${isAnimating ? 'animating' : ''}`}>
      { }
      <div className="modal-header">
        <h3>{isCameraMode ? t.cameraMode : t.bodyParams}</h3>
        {isCameraMode ? (
          <div className="flex items-center gap-3">
            <Select
              label={t.ratio}
              displayLabel={t.ratio}
              value={cameraRatio}
              options={[
                { label: '1:1', value: '1:1' },
                { label: '3:2', value: '3:2' },
                { label: '4:3', value: '4:3' },
                { label: '16:9', value: '16:9' },
                { label: t.custom, value: 'Custom' },
              ]}
              onChange={(val) => setCameraRatio(val as CameraRatio)}
              className="mb-0 w-140"
              dropdownClassName="scrollable-dropdown"
            />
            <button onClick={onClose} className="sidebar-close-btn" aria-label="Close Sidebar">&times;</button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <LanguageSelector language={language} setLanguage={setLanguage} />
            <button onClick={onClose} className="sidebar-close-btn" aria-label="Close Sidebar">&times;</button>
          </div>
        )}
      </div>

      { }
      <div className="modal-nav-tabs">
        <button
          className={`nav-tab-btn ${activeTab === 'expression' ? 'active' : ''}`}
          onClick={() => setActiveTab('expression')}
        >
          {t.groups.expression}
        </button>

        {!isCameraMode && (
          <button
            className={`nav-tab-btn ${activeTab === 'body' ? 'active' : ''}`}
            onClick={() => setActiveTab('body')}
          >
            {t.nav.body}
          </button>
        )}

        <button
          className={`nav-tab-btn ${activeTab === 'display' ? 'active' : ''}`}
          onClick={() => setActiveTab('display')}
        >
          {isCameraMode ? t.nav.displayResolution : t.nav.display}
        </button>

        {!isCameraMode && (
          <button
            className={`nav-tab-btn ${activeTab === 'fileInfo' ? 'active' : ''}`}
            onClick={() => setActiveTab('fileInfo')}
          >
            {t.nav.fileInfo}
          </button>
        )}
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="modal-body no-pt custom-scrollbar"
      >

        { }
        {activeTab === 'display' && (
          <div className="tab-content">
            <div className={`mb-4 mt-4 ${!isCameraMode ? 'pb-4' : ''}`}>
              <h4 className="sub-judul">
                {t.canvasView}{isCameraMode ? `: ${cameraRatio === 'Custom' ? t.custom : cameraRatio}` : ''}
              </h4>
              {backgroundImage ? (
                <button
                  onClick={() => setBackgroundImage(null)}
                  className={`modal-save-btn w-full mt-2 ${isCameraMode ? 'mb-1' : 'mb-9'}`}
                >
                  {t.removeBackground}
                </button>
              ) : (
                <div className="switch-container">
                  <label
                    className="switch-label select-none"
                    style={{ cursor: 'default' }}
                    htmlFor="dark-mode-toggle"
                  >
                    {t.darkMode}
                  </label>
                  <label className="switch">
                    <input
                      type="checkbox"
                      id="dark-mode-toggle"
                      checked={isDarkMode}
                      onChange={onToggleDarkMode}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              )}

              {isCameraMode && (
                <>
                  <div className="switch-container mb-3">
                    <label
                      className="switch-label cursor-pointer select-none"
                      onClick={() => setIsTransparent(!isTransparent)}
                    >
                      {t.transparent}
                    </label>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={isTransparent}
                        onChange={(e) => setIsTransparent(e.target.checked)}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>

                  {cameraRatio !== 'Custom' && (
                    <div className="switch-container">
                      <span className="switch-label">{t.resolution}</span>
                      <Select
                        label={t.resolution}
                        displayLabel={resolutionPreset}
                        value={resolutionPreset}
                        options={[
                          { label: '1K (1080p)', value: '1K' },
                          { label: '2K (1440p)', value: '2K' },
                          { label: '4K (2160p)', value: '4K' },
                          { label: '8K (4320p)', value: '8K' },
                        ]}
                        onChange={(val) => setResolutionPreset(val as any)}
                        className="!mb-0 w-140"
                      />
                    </div>
                  )}

                  {cameraRatio === 'Custom' && (
                    <div className="flex gap-3 mt-3 mb-8">
                      <div className="flex flex-col gap-3 w-1-2">
                        <label className="modal-label !mb-0">{t.width}</label>
                        <input
                          type="number"
                          className="w-full camera-input select-text"
                          value={customResolution.width}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setCustomResolution({ ...customResolution, width: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="flex flex-col gap-3 w-1-2">
                        <label className="modal-label !mb-0">{t.height}</label>
                        <input
                          type="number"
                          className="w-full camera-input select-text"
                          value={customResolution.height}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setCustomResolution({ ...customResolution, height: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        { }
        {activeTab === 'expression' && (
          <div className="tab-content">
            <SliderGroup title={t.groups.eyes} className={isCameraMode ? "!mb-0 mt-4" : "mb-6 mt-4"}>
              <div className="switch-container mb-7">
                <label
                  className="switch-label cursor-pointer select-none"
                  onClick={() => setAutoBlink(!autoBlink)}
                >
                  {t.params.autoBlink}
                </label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={autoBlink}
                    onChange={(e) => setAutoBlink(e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
              </div>
              <Slider label={t.params.expNeutral} value={params.expNeutral} min={0} max={1} step={0.01} onChange={(v) => onChange('expNeutral', v)} />
              <Slider label={t.params.expHappy} value={params.expHappy} min={0} max={1} step={0.01} onChange={(v) => onChange('expHappy', v)} />
              <Slider label={t.params.expAngry} value={params.expAngry} min={0} max={1} step={0.01} onChange={(v) => onChange('expAngry', v)} />
              <Slider label={t.params.expSad} value={params.expSad} min={0} max={1} step={0.01} onChange={(v) => onChange('expSad', v)} />
              <Slider label={t.params.expRelaxed} value={params.expRelaxed} min={0} max={1} step={0.01} onChange={(v) => onChange('expRelaxed', v)} />
              <Slider label={t.params.expSurprised} value={params.expSurprised} min={0} max={1} step={0.01} onChange={(v) => onChange('expSurprised', v)} />
              <Slider label={t.params.expAa} value={params.expAa} min={0} max={1} step={0.01} onChange={(v) => onChange('expAa', v)} />
              <Slider label={t.params.expIh} value={params.expIh} min={0} max={1} step={0.01} onChange={(v) => onChange('expIh', v)} />
              <Slider label={t.params.expOu} value={params.expOu} min={0} max={1} step={0.01} onChange={(v) => onChange('expOu', v)} />
              <Slider label={t.params.expEe} value={params.expEe} min={0} max={1} step={0.01} onChange={(v) => onChange('expEe', v)} />
              <Slider label={t.params.expOh} value={params.expOh} min={0} max={1} step={0.01} onChange={(v) => onChange('expOh', v)} />
              <Slider label={t.params.expBlink} value={params.expBlink} min={0} max={1} step={0.01} onChange={(v) => onChange('expBlink', v)} />
              <Slider label={t.params.expBlinkLeft} value={params.expBlinkLeft} min={0} max={1} step={0.01} onChange={(v) => onChange('expBlinkLeft', v)} />
              <Slider label={t.params.expBlinkRight} value={params.expBlinkRight} min={0} max={1} step={0.01} onChange={(v) => onChange('expBlinkRight', v)} />
              <Slider label={t.params.expLookUp} value={params.expLookUp} min={0} max={1} step={0.01} onChange={(v) => onChange('expLookUp', v)} />
              <Slider label={t.params.expLookDown} value={params.expLookDown} min={0} max={1} step={0.01} onChange={(v) => onChange('expLookDown', v)} />
              <Slider label={t.params.expLookLeft} value={params.expLookLeft} min={0} max={1} step={0.01} onChange={(v) => onChange('expLookLeft', v)} />
              <Slider label={t.params.expLookRight} value={params.expLookRight} min={0} max={1} step={0.01} onChange={(v) => onChange('expLookRight', v)} className="!mb-8" />

              {vrm && vrm.expressionManager && vrm.expressionManager.expressions.map((expression) => {
                const name = expression.expressionName;
                const isStandard = EXPRESSIONS.some(e => e.value.toLowerCase() === name.toLowerCase());

                if (!isStandard) {
                  const value = params.customExpressions?.[name] || 0;
                  return (
                    <Slider
                      key={name}
                      label={name}
                      value={value}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(v) => {
                        const newCustomExpressions = { ...params.customExpressions, [name]: v };
                        onChange('customExpressions', newCustomExpressions as any);
                      }}
                    />
                  );
                }
                return null;
              })}
            </SliderGroup>
          </div>
        )}

        { }
        {activeTab === 'body' && !isCameraMode && (
          <div className="tab-content mt-4">
            <SliderGroup title={t.groups.headNeck} className="mt-0">
              <Slider label={t.params.headSize} value={params.headSize} onChange={(v) => onChange('headSize', v)} className="mt-5" />
              <Slider label={t.params.neckWidth} value={params.neckWidth} onChange={(v) => onChange('neckWidth', v)} />
              <Slider label={t.params.neckHeight} value={params.neckHeight} onChange={(v) => onChange('neckHeight', v)} />
            </SliderGroup>

            <SliderGroup title={t.groups.upperBody} className="mt-6">
              <Slider label={t.params.shoulderWidth} value={params.shoulderWidth} onChange={(v) => onChange('shoulderWidth', v)} className="mt-5" />
              <Slider label={t.params.chestSize} value={params.chestSize} onChange={(v) => onChange('chestSize', v)} />
              <Slider label={t.params.stomachSize} value={params.stomachSize} onChange={(v) => onChange('stomachSize', v)} />
              <Slider label={t.params.torsoHeight} value={params.torsoHeight} onChange={(v) => onChange('torsoHeight', v)} />
              <Slider label={t.params.waistWidth} value={params.waistWidth} onChange={(v) => onChange('waistWidth', v)} />
              <Slider label={t.params.hipSize} value={params.hipSize} onChange={(v) => onChange('hipSize', v)} />
            </SliderGroup>

            <SliderGroup title={t.groups.armsHands} className="mt-6">
              <Slider label={t.params.armLength} value={params.armLength} onChange={(v) => onChange('armLength', v)} className="mt-5" />
              <Slider label={t.params.armMuscle} value={params.armMuscle} onChange={(v) => onChange('armMuscle', v)} />
              <Slider label={t.params.forearmSize} value={params.forearmSize} onChange={(v) => onChange('forearmSize', v)} />
              <Slider label={t.params.handSize} value={params.handSize} onChange={(v) => onChange('handSize', v)} />
              <Slider label={t.params.fingerSize} value={params.fingerSize} onChange={(v) => onChange('fingerSize', v)} />
            </SliderGroup>

            <SliderGroup title={t.groups.legs} className="mt-6">
              <Slider label={t.params.legLength} value={params.legLength} onChange={(v) => onChange('legLength', v)} className="mt-5" />
              <Slider label={t.params.thighSize} value={params.thighSize} onChange={(v) => onChange('thighSize', v)} />
              <Slider label={t.params.calfSize} value={params.calfSize} onChange={(v) => onChange('calfSize', v)} />
              <Slider label={t.params.footSize} value={params.footSize} onChange={(v) => onChange('footSize', v)} />
              <Slider label={t.params.toeSize} value={params.toeSize} onChange={(v) => onChange('toeSize', v)} />
            </SliderGroup>
          </div>
        )}

        { }
        {activeTab === 'fileInfo' && !isCameraMode && metaData && (
          <div className="tab-content mt-4">
            { }
            <div className="file-info-section">
              <h4 className="sub-judul mt-0 select-text">{t.fileInfo.metaTitle}</h4>
              <div>
                <MetaInfoRow label={t.fileInfo.title} value={metaData.title} />
                <MetaInfoRow label={t.fileInfo.version} value={metaData.version} />
                <MetaInfoRow label={t.fileInfo.author} value={metaData.author} />
                <MetaInfoRow label={t.fileInfo.contact} value={metaData.contact} />
                <MetaInfoRow label={t.fileInfo.reference} value={metaData.reference} />
              </div>
            </div>

            { }
            <div className="file-info-section">
              <div className="file-info-section:last-child mb-0"></div>
              <h4 className="sub-judul select-text" style={{ marginTop: '2rem' }}>
                {t.fileInfo.licenseTitle}
              </h4>
              <div>
                <MetaInfoRow
                  label={t.fileInfo.allowedUser}
                  value={getMetaValueLabel(metaData.allowedUser, t)}
                />

                <MetaInfoRow
                  label={t.fileInfo.attribution}
                  value={getMetaValueLabel(metaData.attribution, t)}
                />
                <MetaInfoRow
                  label={t.fileInfo.alterations}
                  value={getMetaValueLabel(metaData.alterations, t)}
                />

                <MetaInfoRow
                  label={t.fileInfo.commercialUsage}
                  value={getMetaValueLabel(metaData.commercial, t)}
                />

                <div className="grid grid-cols-2 gap-4">
                  <MetaInfoRow
                    label={t.fileInfo.violentUsage}
                    value={getMetaValueLabel(metaData.violent, t)}
                  />
                  <MetaInfoRow
                    label={t.fileInfo.sexualUsage}
                    value={getMetaValueLabel(metaData.sexual, t)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <MetaInfoRow
                    label={t.fileInfo.politicalReligious}
                    value={getMetaValueLabel(metaData.politicalReligious, t)}
                  />
                  <MetaInfoRow
                    label={t.fileInfo.antisocialHate}
                    value={getMetaValueLabel(metaData.antisocialHate, t)}
                  />
                </div>

                <MetaInfoRow
                  label={t.fileInfo.copyright}
                  value={metaData.copyright}
                />

                <MetaInfoRow
                  label={t.fileInfo.licenseName}
                  value={getMetaValueLabel(metaData.licenseName, t)}
                />

                <MetaInfoRow
                  label={t.fileInfo.thirdPartyLicenses}
                  value={metaData.thirdPartyLicenses}
                />

                {(() => {
                  const normalized = metaData.licenseName?.toLowerCase().replace(/[^a-z0-9]/g, '');
                  const isOther = normalized === 'seeotherlicense' || normalized === 'other';

                  if (metaData.otherLicenseUrl) {
                    return (
                      <div className="file-info-item">
                        <span className="file-info-label select-text">{t.fileInfo.otherLicense}</span>
                        <a
                          href={metaData.otherLicenseUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="file-info-value file-info-link select-text"
                        >
                          {metaData.otherLicenseUrl}
                        </a>
                      </div>
                    );
                  } else if (isOther) {
                    return (
                      <MetaInfoRow
                        label={t.fileInfo.otherLicense}
                        value="-"
                      />
                    );
                  }
                  return null;
                })()}

                { }
                {metaData.otherPermissionUrl && (
                  <div className="file-info-item">
                    <span className="file-info-label select-text">{t.fileInfo.otherPermissionUrl}</span>
                    <a
                      href={metaData.otherPermissionUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="file-info-value file-info-link select-text"
                    >
                      {metaData.otherPermissionUrl}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {(isCameraMode || (activeTab !== 'display' && activeTab !== 'fileInfo')) && (
        <div className="modal-footer-actions">
          {isCameraMode ? (
            <button
              onClick={() => onSave(isTransparent ? 'png' : 'jpg')}
              className="modal-save-btn w-full"
            >
              {isTransparent ? t.saveAsPng : t.saveAsJpg}
            </button>
          ) : (
            <div className="flex gap-3 w-full">
              <input
                type="file"
                accept=".json"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleImport}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="modal-save-btn flex items-center justify-center relative"
                data-tooltip={t.importTooltip}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
              </button>
              <button
                onClick={handleExport}
                className="modal-save-btn flex items-center justify-center relative"
                data-tooltip={t.exportTooltip}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M12 3v13.5m0 0-4.5-4.5M12 16.5l4.5-4.5" />
                </svg>
              </button>
              <button
                onClick={() => onReset(activeTab === 'body' ? 'body' : 'expression')}
                className="modal-save-btn flex-grow"
              >
                {t.resetParams}
              </button>
            </div>
          )}
        </div>
      )}

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
              <p style={{ textAlign: 'center' }}>{t.importFailed}</p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Sidebar;