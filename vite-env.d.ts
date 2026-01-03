/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
    readonly APP_VERSION: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
