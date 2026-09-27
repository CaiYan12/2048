import { defineConfig } from 'vitest/config'

// 本票只跑纯逻辑测试：默认 node 环境，不引入任何 DOM。
// 规则内核（src/game/）零 DOM 依赖是 ADR-0001 的铁律，测试配置必须保持 node，
// 免得日后的「顺手」把 DOM 塞进原本纯净的单测里。
//
// T03 起有真实单测了，passWithNoTests 随之撤掉：`npm test` 现在会为一条
// 坏掉的测试真的失败，这才是 CI 上那道闸门本来的样子。
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
