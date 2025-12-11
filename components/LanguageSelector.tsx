import React, { useState, useRef, useEffect } from 'react';

export type Language = 'id' | 'en';

interface LanguageSelectorProps {
    language: Language;
    setLanguage: (lang: Language) => void;
    className?: string;
    dropUp?: boolean;
}

const LANGUAGES: { label: string; value: Language }[] = [
    { label: 'Indonesia', value: 'id' },
    { label: 'English', value: 'en' },
];

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ language, setLanguage, className = '', dropUp = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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

    const currentLabel = language === 'id' ? 'Bahasa' : 'Language';

    return (
        <div
            className={`custom-select-container min-w-140 ${className}`}
            ref={dropdownRef}
        >
            <div
                className={`custom-select shadow-lg ${isOpen ? 'open' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                tabIndex={0}
            >
                <span>{currentLabel}</span>
                <span className="select-arrow"></span>
            </div>
            <div className={`custom-select-options ${dropUp ? 'drop-up' : ''} ${isOpen ? 'show' : ''}`}>
                {LANGUAGES.map((lang) => (
                    <div
                        key={lang.value}
                        className={`custom-option ${language === lang.value ? 'selected' : ''}`}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            setLanguage(lang.value);
                            setIsOpen(false);
                        }}
                    >
                        {lang.label}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default LanguageSelector;
