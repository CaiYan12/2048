import { defineConfig } from 'vitest/config'

// 本票只跑纯逻辑测试：默认 node 环境，不引入任何 DOM。
// 规则内核（src/game/）零 DOM 依赖是 ADR-0001 的铁律，测试配置必须保持 node，
// 免得日后的「顺手」把 DOM 塞进原本纯净的单测里。
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // 工具链检查，不是验收结论：T02 之前没有任何真实单测，先让 `npm test`
    // 能跑通以证明 vitest 装配正确（P0 零测试通过只代表工具链可运行）。
    // T03 落下第一条真实单测后，这一行必须删掉。
    passWithNoTests: true,
  },
})
