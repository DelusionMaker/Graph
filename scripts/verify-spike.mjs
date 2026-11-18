import { chromium } from 'playwright'

const url = process.env.SPIKE_URL ?? 'http://127.0.0.1:5173'
const TOLERANCE = 2
const NATIVE_COVERAGE_LIMIT = 20 // 百分比：节点移出画布前后的像素差异

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))

const checks = []
const check = (name, ok, detail) => {
  checks.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} (${detail})`)
}

/** 直接改 DragAndScale，模拟平移 + 缩放（与用户滚轮/拖拽走同一份视口状态） */
const setView = async (scale, ox, oy) => {
  await page.evaluate(
    ({ scale, ox, oy }) => {
      const canvas = document.querySelector('canvas.litegraph-canvas').data
      canvas.ds.scale = scale
      canvas.ds.offset = [ox, oy]
      canvas.ds.onChanged?.()
      canvas.setDirty(true, true)
    },
    { scale, ox, oy },
  )
  // 等 rAF 把视口写进 React store 并完成一次 commit
  await page.waitForTimeout(150)
}

const readSection = (title) => page.locator('section').filter({ hasText: title }).innerText()

const measureAlignment = async () => {
  await page.getByRole('button', { name: '测量偏差' }).click()
  const text = await readSection('③ 几何对齐')
  return {
    port: Number(text.match(/端口最大偏差\s+([\d.]+)\s+px/)?.[1] ?? Infinity),
    box: Number(text.match(/节点框最大偏差\s+([\d.]+)\s+px/)?.[1] ?? Infinity),
  }
}

const measureNativeDrawing = async () => {
  await page.getByRole('button', { name: '检测原生绘制' }).click()
  const text = await readSection('① 隐藏原生节点绘制')
  return {
    coverage: Number(text.match(/区域像素差异\s+([\d.]+)%/)?.[1] ?? NaN),
    sampled: Number(text.match(/采样\s+(\d+)\s+个节点/)?.[1] ?? 0),
  }
}

try {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('.spike-port')

  // 三档缩放 + 不同平移量，覆盖规划要求的 0.2x–3x 全范围
  const views = [
    { label: '0.2x', scale: 0.2, ox: 40, oy: 30 },
    { label: '1x', scale: 1, ox: 90, oy: 60 },
    { label: '3x', scale: 3, ox: -47, oy: -93 },
  ]

  for (const v of views) {
    await setView(v.scale, v.ox, v.oy)

    const { port, box } = await measureAlignment()
    check(`${v.label} 平移后端口偏差 < 2px`, port < TOLERANCE, `${port}px`)
    check(`${v.label} 平移后节点框偏差 < 2px`, box < TOLERANCE, `${box}px`)

    const native = await measureNativeDrawing()
    check(
      `${v.label} 原生节点绘制已隐藏`,
      native.sampled > 0 && native.coverage < NATIVE_COVERAGE_LIMIT,
      native.sampled ? `区域差异 ${native.coverage}% / 采样 ${native.sampled} 个节点` : '未采样到节点',
    )
  }

  // 反证：临时恢复 LiteGraph 原生 drawNode，判据必须报警，否则说明检测在空转
  await setView(1, 0, 0)
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas.litegraph-canvas').data
    canvas.__spikeDrawNode = canvas.drawNode
    canvas.drawNode = Object.getPrototypeOf(canvas).drawNode
    canvas.setDirty(true, true)
  })
  await page.waitForTimeout(150)
  const negative = await measureNativeDrawing()
  check(
    '反证：恢复原生绘制时判据报警',
    negative.sampled > 0 && negative.coverage >= NATIVE_COVERAGE_LIMIT,
    `区域差异 ${negative.coverage}%`,
  )
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas.litegraph-canvas').data
    canvas.drawNode = canvas.__spikeDrawNode
    delete canvas.__spikeDrawNode
    canvas.setDirty(true, true)
  })
  await page.waitForTimeout(150)

  // 连线：在 1x 视口下从输出端口拖到输入端口
  await setView(1, 0, 0)
  const ports = await page.locator('.spike-port').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return {
        node: el.dataset.nodeId,
        dir: el.dataset.direction,
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
      }
    }),
  )
  const out = ports.find((p) => p.dir === 'out')
  const into = ports.find((p) => p.dir === 'in' && p.node !== out?.node)
  if (!out || !into) throw new Error('未找到测试端口')

  await page.mouse.move(out.x, out.y)
  await page.mouse.down()
  await page.mouse.move(into.x, into.y, { steps: 20 })
  await page.mouse.up()
  await page.waitForTimeout(200)

  const graphLinks = await page.evaluate(
    () => document.querySelector('canvas.litegraph-canvas').data.graph.links.size,
  )
  const panelLinks = await page.evaluate(() => {
    const li = [...document.querySelectorAll('.stats li')].find((n) => n.textContent.includes('连线数'))
    return Number(li?.textContent.match(/\d+/)?.[0] ?? -1)
  })

  check('端口拖拽生成连线', graphLinks === 1, `${graphLinks} 条`)
  check('React 面板同步连线状态', panelLinks === 1, `${panelLinks} 条`)

  // 真实滚轮缩放（走 LiteGraph 自己的 ds.changeScale）：渲染出来的连线端点必须仍贴在 React 端口上。
  // 这一条直接读 canvas 像素，避免"测量公式和渲染公式犯同一个错误"。
  await page.mouse.move(760, 420)
  await page.mouse.wheel(0, -120)
  await page.waitForTimeout(150)
  await page.mouse.wheel(0, -120)
  await page.waitForTimeout(350)

  const linkHit = await page.evaluate(() => {
    const canvas = document.querySelector('canvas.litegraph-canvas').data
    const el = canvas.canvas
    const ctx = el.getContext('2d')
    const rect = el.getBoundingClientRect()
    const dpr = el.width / rect.width
    const target = canvas.graph.nodes.find((n) => n.inputs?.length)
    const [gx, gy] = target.getInputPos(0)
    const [cx, cy] = canvas.ds.convertOffsetToCanvas([gx, gy])

    const radius = 30
    const img = ctx.getImageData(
      Math.round((cx - radius) * dpr),
      Math.round((cy - radius) * dpr),
      Math.round(radius * 2 * dpr),
      Math.round(radius * 2 * dpr),
    )
    let dist = Infinity
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4
        const brightness = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3
        if (brightness < 120) continue
        const px = cx - radius + (x + 0.5) / dpr
        const py = cy - radius + (y + 0.5) / dpr
        dist = Math.min(dist, Math.hypot(px - cx, py - cy))
      }
    }
    return { dist, scale: canvas.ds.scale }
  })
  check(
    '滚轮缩放后连线端点贴合端口 < 3px',
    linkHit.dist < 3,
    `${linkHit.dist.toFixed(2)}px @ ${linkHit.scale.toFixed(2)}x`,
  )
  await setView(1, 0, 0)

  // 拖动节点：检查拖动过程中 React 节点是否实时跟随
  const nodeBox = await page.locator('.spike-node').first().boundingBox()
  const beforeLeft = await page.evaluate(() => document.querySelector('.spike-node').style.left)
  await page.mouse.move(nodeBox.x + 60, nodeBox.y + 14)
  await page.mouse.down()
  await page.mouse.move(nodeBox.x + 190, nodeBox.y + 94, { steps: 12 })
  await page.waitForTimeout(50)
  const duringLeft = await page.evaluate(() => document.querySelector('.spike-node').style.left)
  await page.mouse.up()
  await page.waitForTimeout(100)

  check('拖动时节点实时跟随', beforeLeft !== duringLeft, `${beforeLeft} → ${duringLeft}`)

  // 拖动后重新测量：节点位置变化不应破坏对齐
  const afterDrag = await measureAlignment()
  check('拖动后端口偏差 < 2px', afterDrag.port < TOLERANCE, `${afterDrag.port}px`)
  check('拖动后节点框偏差 < 2px', afterDrag.box < TOLERANCE, `${afterDrag.box}px`)

  check('无页面异常', pageErrors.length === 0, `${pageErrors.length} 个`)
} finally {
  await browser.close()
}

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} 项通过`)
process.exitCode = failed.length ? 1 : 0
