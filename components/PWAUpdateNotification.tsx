import React, { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { translations } from '../utils/translations';
import { Language } from './LanguageSelector';

interface PWAUpdateNotificationProps {
    language: Language;
}

const PWAUpdateNotification: React.FC<PWAUpdateNotificationProps> = ({ language }) => {
    const {
        offlineReady: [offlineReady, setOfflineReady],
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r: ServiceWorkerRegistration | undefined) {
            console.log('SW Registered: ' + r);
        },
        onRegisterError(error: any) {
            console.error('SW registration error', error);
        },
    });

    const close = () => {
        setOfflineReady(false);
        setNeedRefresh(false);
    };

    const t = (translations[language] as any);

    return (
        <div
            className={`toast-notification ${needRefresh ? 'show' : ''}`}
            onClick={() => updateServiceWorker(true)}
        >
            {t.pwaUpdate}
        </div>
    );
};

export default PWAUpdateNotification;
