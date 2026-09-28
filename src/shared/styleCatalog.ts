/**
 * 风格目录（纯数据，ADR-0006）
 *
 * 这是风格身份的**唯一来源**：稳定 id、显示名、显示顺序（数组顺序即顺序，不另设 order 字段）。
 * 本文件刻意零 import——不碰 React / CSS / DOM / 渲染层。风格自己的 config.ts 是要
 * `import './tokens.css'` 的，所以「校验一个存下来的风格 id」这件事不能经过注册表，
 * 否则持久化层就被绑回了渲染层（ADR-0006 第 1、4 条）。用一张不依赖任何东西的表解决它。
 *
 * id 是**持久化身份**：改 label、调顺序都不改 id；要让某个 id 退休或改指向，必须另写
 * 一次存储迁移，直接删会静默让已有的 settings / session / records 失效（ADR-0006 第 6 条）。
 *
 * SC-01 只做「目录 + 派生 StyleId」这一步：THEMES 显式注册表仍驱动应用，自动装载
 * `themes/<id>/` 文件夹留给 SC-03，持久化校验改用目录留给 SC-02。
 */
export const STYLE_CATALOG = [
  { id: 'classic', label: 'Classic' },
  { id: 'material', label: 'Material' },
  { id: 'claude', label: 'Claude' },
] as const

/** 风格 id 的编译期联合：从目录派生，不再维护第二份手写联合（ADR-0006 第 1 条） */
export type StyleId = (typeof STYLE_CATALOG)[number]['id']
