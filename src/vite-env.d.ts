/// <reference types="vite/client" />

// Vite 客户端类型：让 `import './x.css'` 这类副作用导入在 tsc 下也有声明
// （TS 7 的 TS2882）。同时带上 import.meta.env 等 Vite 注入物的类型。
