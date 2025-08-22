declare module 'eslint-plugin-react/configs/jsx-runtime.js';
declare module 'eslint-plugin-react/configs/recommended.js';
declare module 'eslint-plugin-react-hooks';

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
