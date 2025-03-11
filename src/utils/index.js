// In Vite, import.meta.env provides environment variables
export const NODE_ENV = import.meta.env.MODE || 'development';
export const isProd = NODE_ENV === 'production';
export const isDev = NODE_ENV === 'development';
export const isTest = NODE_ENV === 'test';