import React, { useState } from 'react';
import { BodyParameters, CameraRatio } from '../types';
import { VRM } from '@pixiv/three-vrm';
import LanguageSelector, { Language } from './LanguageSelector';
import { translations } from '../utils/translations';

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
}

const Select: React.FC<SelectProps> = ({ label, value, options, onChange, displayLabel, className }) => {
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
        <div className={`custom-select-options ${isOpen ? 'show' : ''}`}>
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

type ActiveTab = 'expression' | 'body' | 'display';

const Sidebar: React.FC<SidebarProps> = ({ vrm, params, onChange, onReset, isFileLoaded, isDarkMode, onToggleDarkMode, language, setLanguage, autoBlink, setAutoBlink, backgroundImage, setBackgroundImage, isCameraMode, cameraRatio, setCameraRatio, resolutionPreset, setResolutionPreset, customResolution, setCustomResolution, isTransparent, setIsTransparent, onSave, isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('expression');

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const scrollPositions = React.useRef<Record<ActiveTab, number>>({
    expression: 0,
    body: 0,
    display: 0
  });

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (scrollContainerRef.current) {
      if (isCameraMode && activeTab === 'body') return;
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
      if (event.key === 'Escape' && isOpen && onClose) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  React.useEffect(() => {
    if (isCameraMode && activeTab === 'body') {
      setActiveTab('expression');
    }
  }, [isCameraMode, activeTab]);

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
                    className="switch-label cursor-pointer select-none"
                    onClick={onToggleDarkMode}
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
                          className="w-full camera-input"
                          value={customResolution.width}
                          onChange={(e) => setCustomResolution({ ...customResolution, width: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="flex flex-col gap-3 w-1-2">
                        <label className="modal-label !mb-0">{t.height}</label>
                        <input
                          type="number"
                          className="w-full camera-input"
                          value={customResolution.height}
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
      </div>

      {(isCameraMode || activeTab !== 'display') && (
        <div className="modal-footer-actions">
          {isCameraMode ? (
            <button
              onClick={() => onSave(isTransparent ? 'png' : 'jpg')}
              className="modal-save-btn w-full"
            >
              {isTransparent ? t.saveAsPng : t.saveAsJpg}
            </button>
          ) : (
            <button
              onClick={() => onReset(activeTab === 'body' ? 'body' : 'expression')}
              className="modal-save-btn w-full"
            >
              {t.resetParams}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default Sidebar;