import { chromium } from 'playwright'

const url = process.env.CANVAS_URL ?? 'http://127.0.0.1:5173'
const TOLERANCE = 2
const NATIVE_LIMIT = 0.2 // 比例阈值：节点移出画布前后的像素差异（20%）

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))
// 固定从 seed 图开始，避免其他脚本残留的空图让端口等待超时
await page.addInitScript(() => localStorage.clear())

const checks = []
const check = (name, ok, detail) => {
  checks.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} (${detail})`)
}

/** 通过开发调试接口设置视口，等价于用户平移 + 缩放到指定状态 */
const setView = async (scale, x, y) => {
  await page.evaluate(
    ({ scale, x, y }) => window.__graphDebug.setView(scale, x, y),
    { scale, x, y },
  )
  // 等 rAF 把视口写进 store 并完成一次 commit
  await page.waitForTimeout(150)
}

const measure = () =>
  page.evaluate(() => {
    const api = window.__graphDebug
    const ports = api.measurePorts()
    const boxes = api.measureNodeBoxes()
    return {
      port: ports.length ? Math.max(...ports.map((p) => p.dist)) : 9999,
      box: boxes.length ? Math.max(...boxes.map((b) => b.max)) : 9999,
    }
  })

const measureNative = () => page.evaluate(() => window.__graphDebug.measureNativeDrawing())

const statusValue = async (label) => {
  const items = await page.evaluate(() =>
    [...document.querySelectorAll('.status-bar span')].map((el) => el.textContent?.trim() ?? ''),
  )
  const hit = items.find((text) => text.startsWith(label))
  return hit ? Number(hit.slice(label.length).trim()) : -1
}

const portCenters = () =>
  page.locator('.graph-port').evaluateAll((els) =>
    els.map((el) => {
      const rect = el.getBoundingClientRect()
      return {
        node: el.dataset.nodeId,
        dir: el.dataset.direction,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }
    }),
  )

try {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => Boolean(window.__graphDebug))
  await page.waitForSelector('.graph-port')

  // ① 三档缩放 + 不同平移量下的几何一致性
  const views = [
    { label: '0.2x', scale: 0.2, x: 40, y: 30 },
    { label: '1x', scale: 1, x: 90, y: 60 },
    { label: '3x', scale: 3, x: -10, y: -12 },
  ]

  for (const view of views) {
    await setView(view.scale, view.x, view.y)

    const alignment = await measure()
    check(`${view.label} 平移缩放后端口偏差 < 2px`, alignment.port < TOLERANCE, `${alignment.port}px`)
    check(`${view.label} 平移缩放后节点框偏差 < 2px`, alignment.box < TOLERANCE, `${alignment.box}px`)

    const native = await measureNative()
    check(
      `${view.label} 原生节点绘制已隐藏`,
      native !== null && native.sampled > 0 && native.coverage < NATIVE_LIMIT,
      native ? `区域差异 ${(native.coverage * 100).toFixed(1)}% / 采样 ${native.sampled} 个节点` : '无法读取像素',
    )
  }

  // 反证：临时恢复 LiteGraph 原生 drawNode，判据必须报警
  await setView(1, 0, 0)
  await page.evaluate(() => {
    const canvas = window.__graphDebug.canvas
    canvas.__spikeDrawNode = canvas.drawNode
    canvas.drawNode = Object.getPrototypeOf(canvas).drawNode
    canvas.setDirty(true, true)
  })
  await page.waitForTimeout(150)
  const negative = await measureNative()
  check(
    '反证：恢复原生绘制时判据报警',
    negative !== null && negative.sampled > 0 && negative.coverage >= NATIVE_LIMIT,
    negative ? `区域差异 ${(negative.coverage * 100).toFixed(1)}%` : '无法读取像素',
  )
  await page.evaluate(() => {
    const canvas = window.__graphDebug.canvas
    canvas.drawNode = canvas.__spikeDrawNode
    delete canvas.__spikeDrawNode
    canvas.setDirty(true, true)
  })
  await page.waitForTimeout(150)

  // 节点包围盒必须与 React 节点可见矩形一致（否则框选/点击命中会整体偏移）
  // 重新导入一次，排除测试流程中 LiteGraph 内部 boundingRect 与 DOM 的临时漂移
  await page.evaluate(() => {
    const api = window.__graphDebug
    api.importWorkflow(api.exportWorkflow())
  })
  await page.waitForTimeout(350)
  await setView(1, 0, 0)
  const bbox = await page.evaluate(() => {
    const api = window.__graphDebug
    const canvas = api.canvas
    const rect = canvas.canvas.getBoundingClientRect()
    return api.graph.nodes.map((node) => {
      const el = document.querySelector(`.graph-node[data-node-id="${node.id}"]`)
      const dom = el.getBoundingClientRect()
      const [bx, by] = canvas.ds.convertOffsetToCanvas([node.boundingRect[0], node.boundingRect[1]])
      return {
        id: node.id,
        dx: Math.abs(bx - (dom.left - rect.left)),
        dy: Math.abs(by - (dom.top - rect.top)),
        dw: Math.abs(node.boundingRect[2] - dom.width / canvas.ds.scale),
        dh: Math.abs(node.boundingRect[3] - dom.height / canvas.ds.scale),
      }
    })
  })
  const bboxMax = Math.max(...bbox.map((b) => Math.max(b.dx, b.dy, b.dw, b.dh)))
  const worst = bbox.reduce((a, b) =>
    Math.max(b.dx, b.dy, b.dw, b.dh) > Math.max(a.dx, a.dy, a.dw, a.dh) ? b : a,
  )
  check(
    '节点包围盒与 DOM 对齐 < 1px',
    bboxMax < 1,
    `${bboxMax.toFixed(2)}px @ #${worst.id} d=(${worst.dx},${worst.dy},${worst.dw},${worst.dh})`,
  )

  // 在节点上方空白处框选，不能误选下方的节点（标题栏上下 30px 偏移的回归用例）
  const phantomAnchor = await page.locator('.graph-node[data-node-id="2"]').boundingBox()
  await page.mouse.move(phantomAnchor.x - 10, phantomAnchor.y - 70)
  await page.mouse.down()
  await page.mouse.move(phantomAnchor.x + phantomAnchor.width + 10, phantomAnchor.y - 20, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  const phantom = await page.evaluate(() => window.__graphDebug.canvas.selectedItems.size)
  check('节点上方空白框选不误选', phantom === 0, `${phantom} 个选中`)

  // ② 从输出端口拖到输入端口生成连线，并同步到状态栏
  const ports = await portCenters()
  const out = ports.find((p) => p.dir === 'out')
  const into = ports.find((p) => p.dir === 'in' && p.node !== out?.node)
  if (!out || !into) throw new Error('未找到测试端口')

  await page.mouse.move(out.x, out.y)
  await page.mouse.down()
  await page.mouse.move(into.x, into.y, { steps: 20 })
  await page.mouse.up()
  await page.waitForTimeout(250)

  const graphLinks = await page.evaluate(() => window.__graphDebug.graph.links.size)
  check('端口拖拽生成连线', graphLinks === 1, `${graphLinks} 条`)
  check('状态栏同步连线数', (await statusValue('连线')) === 1, `${await statusValue('连线')} 条`)
  check(
    '端口连接态同步',
    (await page.locator('.graph-port.is-connected').count()) === 2,
    `${await page.locator('.graph-port.is-connected').count()} 个端口`,
  )

  // ③ 真实滚轮缩放后，渲染出的连线端点必须仍贴在 React 端口上（直接读 canvas 像素）
  await page.mouse.move(500, 400)
  await page.mouse.wheel(0, -120)
  await page.waitForTimeout(150)
  await page.mouse.wheel(0, -120)
  await page.waitForTimeout(350)

  const linkHit = await page.evaluate(() => {
    const api = window.__graphDebug
    const canvas = api.canvas
    const el = canvas.canvas
    const ctx = el.getContext('2d')
    const rect = el.getBoundingClientRect()
    const dpr = el.width / rect.width
    const target = canvas.graph.nodes.find((node) => node.inputs?.length)
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

  // 中键拖拽平移：视口与 React 覆盖层同步
  const canvasArea = await page.locator('.graph-canvas').boundingBox()
  const beforePan = await page.evaluate(() => [...window.__graphDebug.canvas.ds.offset])
  await page.mouse.move(canvasArea.x + 500, canvasArea.y + 500)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(canvasArea.x + 620, canvasArea.y + 560, { steps: 10 })
  await page.mouse.up({ button: 'middle' })
  await page.waitForTimeout(250)
  const afterPan = await page.evaluate(() => [...window.__graphDebug.canvas.ds.offset])
  const panAfter = await measure()
  check(
    '中键拖拽平移 120×60',
    Math.abs(afterPan[0] - beforePan[0] - 120) < 6 && Math.abs(afterPan[1] - beforePan[1] - 60) < 6,
    `Δ ${(afterPan[0] - beforePan[0]).toFixed(1)}, ${(afterPan[1] - beforePan[1]).toFixed(1)}`,
  )
  check(
    '平移后覆盖层跟随',
    panAfter.port < TOLERANCE && panAfter.box < TOLERANCE,
    `端口 ${panAfter.port}px / 节点框 ${panAfter.box}px`,
  )
  await setView(1, 0, 0)

  // ④ 点击选中连线（选中色）后按 Delete 删除，桥接层需同步
  const linkMid = await page.evaluate(() => {
    const api = window.__graphDebug
    const canvas = api.canvas
    const link = [...api.graph.links.values()][0]
    const origin = api.graph.getNodeById(link.origin_id)
    const target = api.graph.getNodeById(link.target_id)
    const a = origin.getOutputPos(link.origin_slot)
    const b = target.getInputPos(link.target_slot)
    // 对称贝塞尔曲线的中点即两端点的中点，确保点击落在连线上
    const [x, y] = canvas.ds.convertOffsetToCanvas([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
    const rect = canvas.canvas.getBoundingClientRect()
    return { x: rect.left + x, y: rect.top + y }
  })

  await page.mouse.click(linkMid.x, linkMid.y)
  await page.waitForTimeout(200)
  const linkColor = await page.evaluate(() => {
    const link = [...window.__graphDebug.graph.links.values()][0]
    return link?.color ?? null
  })
  check('点击选中连线', linkColor === '#4a9eff', `选中色 ${linkColor}`)

  await page.keyboard.press('Delete')
  await page.waitForTimeout(300)

  const linksAfterDelete = await page.evaluate(() => window.__graphDebug.graph.links.size)
  check('删除键删除连线', linksAfterDelete === 0, `${linksAfterDelete} 条`)
  check('状态栏同步删除', (await statusValue('连线')) === 0, `${await statusValue('连线')} 条`)
  check(
    '端口连接态复位',
    (await page.locator('.graph-port.is-connected').count()) === 0,
    `${await page.locator('.graph-port.is-connected').count()} 个端口`,
  )

  // ⑤ 点击选中节点 → React 高亮 + 状态栏选中数
  const firstNode = await page.locator('.graph-node[data-node-id="1"]').boundingBox()
  await page.mouse.click(firstNode.x + firstNode.width * 0.6, firstNode.y + 14)
  await page.waitForTimeout(200)
  check(
    '点击选中节点同步高亮',
    (await page.locator('.graph-node.is-selected').count()) === 1 && (await statusValue('选中')) === 1,
    `${await page.locator('.graph-node.is-selected').count()} 个高亮 / 选中 ${await statusValue('选中')}`,
  )

  // ⑥ 空白处拖拽框选两个节点；提示框由 React 绘制，必须与指针位置一致
  const canvasBox = await page.locator('.graph-canvas').boundingBox()
  await page.mouse.move(canvasBox.x + 20, canvasBox.y + 20)
  await page.mouse.down()
  await page.mouse.move(canvasBox.x + 820, canvasBox.y + 520, { steps: 15 })
  await page.waitForSelector('.selection-box')
  const selectionBox = await page.locator('.selection-box').boundingBox()
  const boxDx = Math.abs(selectionBox.x - (canvasBox.x + 20))
  const boxDy = Math.abs(selectionBox.y - (canvasBox.y + 20))
  const boxDw = Math.abs(selectionBox.width - 800)
  const boxDh = Math.abs(selectionBox.height - 500)
  check(
    '框选提示框跟随指针 < 2px',
    Math.max(boxDx, boxDy, boxDw, boxDh) < 2,
    `位置偏差 ${Math.max(boxDx, boxDy).toFixed(2)}px / 尺寸偏差 ${Math.max(boxDw, boxDh).toFixed(2)}px`,
  )
  await page.mouse.up()
  await page.waitForTimeout(200)
  const selectedCount = await page.locator('.graph-node.is-selected').count()
  check(
    '框选同步多个节点',
    selectedCount >= 2 && (await statusValue('选中')) === selectedCount,
    `${selectedCount} 个高亮 / 选中 ${await statusValue('选中')}`,
  )
  check('框选结束后提示框消失', (await page.locator('.selection-box').count()) === 0, '已移除')

  // ⑦ 多选拖拽：拖动其中一个，两个节点保持相对位置
  const before = await page.evaluate(() =>
    window.__graphDebug.graph.nodes.map((node) => ({ id: Number(node.id), pos: [...node.pos] })),
  )
  const dragBox = await page.locator('.graph-node[data-node-id="1"]').boundingBox()
  const beforeLeft = await page.evaluate(
    () => document.querySelector('.graph-node[data-node-id="1"]').style.left,
  )
  await page.mouse.move(dragBox.x + 60, dragBox.y + 14)
  await page.mouse.down()
  await page.mouse.move(dragBox.x + 180, dragBox.y + 74, { steps: 12 })
  await page.waitForTimeout(60)
  const duringLeft = await page.evaluate(
    () => document.querySelector('.graph-node[data-node-id="1"]').style.left,
  )
  await page.mouse.up()
  await page.waitForTimeout(250)

  const after = await page.evaluate(() =>
    window.__graphDebug.graph.nodes.map((node) => ({ id: Number(node.id), pos: [...node.pos] })),
  )
  const selectedIds = await page.evaluate(() =>
    [...window.__graphDebug.canvas.selectedItems].map((item) => Number(item.id)),
  )
  const deltas = after
    .filter((node) => selectedIds.includes(node.id))
    .map((node) => {
      const origin = before.find((item) => item.id === node.id)
      return { id: node.id, dx: node.pos[0] - origin.pos[0], dy: node.pos[1] - origin.pos[1] }
    })
  check('拖动时 React 节点实时跟随', beforeLeft !== duringLeft, `${beforeLeft} → ${duringLeft}`)
  check(
    '多选拖拽保持相对位置',
    deltas.length >= 2 &&
      deltas.every((d) => Math.abs(d.dx - deltas[0].dx) < 2 && Math.abs(d.dy - deltas[0].dy) < 2) &&
      Math.abs(deltas[0].dx) > 60,
    deltas.map((d) => `#${d.id} (${d.dx.toFixed(1)}, ${d.dy.toFixed(1)})`).join(' / '),
  )

  // 拖动后再测一次几何，确认位置变化不破坏对齐
  const afterDrag = await measure()
  check('拖动后端口偏差 < 2px', afterDrag.port < TOLERANCE, `${afterDrag.port}px`)
  check('拖动后节点框偏差 < 2px', afterDrag.box < TOLERANCE, `${afterDrag.box}px`)

  // 拖动右下角缩放：DOM 尺寸与输出端口必须在拖动过程中实时跟随
  const resizeBox = await page.locator('.graph-node[data-node-id="1"]').boundingBox()
  const sizeBeforeResize = await page.evaluate(() => [...window.__graphDebug.graph.getNodeById(1).size])
  await page.mouse.move(resizeBox.x + resizeBox.width - 2, resizeBox.y + resizeBox.height - 2)
  await page.mouse.down()
  await page.mouse.move(resizeBox.x + resizeBox.width + 60, resizeBox.y + resizeBox.height + 40, { steps: 10 })
  await page.waitForTimeout(120)
  const liveResize = await page.evaluate(() => {
    const api = window.__graphDebug
    const node = api.graph.getNodeById(1)
    const el = document.querySelector('.graph-node[data-node-id="1"]')
    const port = document.querySelector('.graph-port[data-node-id="1"][data-direction="out"][data-port-index="0"]')
    const canvasRect = api.canvas.canvas.getBoundingClientRect()
    const portRect = port.getBoundingClientRect()
    const [px] = api.canvas.ds.convertOffsetToCanvas([node.getOutputPos(0)[0], 0])
    return {
      nodeSize: [node.size[0], node.size[1]],
      domSize: [el.offsetWidth, el.offsetHeight],
      portDelta: Math.abs(portRect.left + portRect.width / 2 - (canvasRect.left + px)),
    }
  })
  await page.mouse.up()
  await page.waitForTimeout(200)
  check(
    '缩放节点时 DOM 实时跟随',
    Math.abs(liveResize.nodeSize[0] - liveResize.domSize[0]) < 1 &&
      Math.abs(liveResize.nodeSize[1] - liveResize.domSize[1]) < 1 &&
      liveResize.nodeSize[0] > sizeBeforeResize[0] + 40,
    `图 ${liveResize.nodeSize.join('×')} / DOM ${liveResize.domSize.join('×')}`,
  )
  check('缩放节点时输出端口跟随', liveResize.portDelta < TOLERANCE, `${liveResize.portDelta.toFixed(2)}px`)
  const afterResize = await measure()
  check(
    '缩放后端口与节点框偏差 < 2px',
    afterResize.port < TOLERANCE && afterResize.box < TOLERANCE,
    `端口 ${afterResize.port}px / 节点框 ${afterResize.box}px`,
  )

  // 鼠标停在 Widget 上滚轮仍应缩放，且以光标为锚点
  const widgetBox = await page
    .locator('.graph-node[data-node-id="5"] .graph-widget[data-widget-name="value"] input')
    .boundingBox()
  const anchor = [widgetBox.x + widgetBox.width / 2, widgetBox.y + widgetBox.height / 2]
  const anchorPoint = await page.evaluate(([x, y]) => {
    const api = window.__graphDebug
    const rect = api.canvas.canvas.getBoundingClientRect()
    return { scale: api.canvas.ds.scale, point: api.canvas.ds.convertCanvasToOffset([x - rect.left, y - rect.top]) }
  }, anchor)
  await page.mouse.move(anchor[0], anchor[1])
  await page.mouse.wheel(0, -240)
  await page.waitForTimeout(300)
  const afterWheel = await page.evaluate(([x, y]) => {
    const api = window.__graphDebug
    const rect = api.canvas.canvas.getBoundingClientRect()
    return { scale: api.canvas.ds.scale, point: api.canvas.ds.convertCanvasToOffset([x - rect.left, y - rect.top]) }
  }, anchor)
  const anchorDrift = Math.hypot(afterWheel.point[0] - anchorPoint.point[0], afterWheel.point[1] - anchorPoint.point[1])
  check(
    'Widget 上滚轮以光标为锚点缩放',
    afterWheel.scale > anchorPoint.scale + 0.1 && anchorDrift < TOLERANCE,
    `${anchorPoint.scale.toFixed(2)}x → ${afterWheel.scale.toFixed(2)}x，锚点漂移 ${anchorDrift.toFixed(2)}px`,
  )
  await setView(1, 0, 0)

  // ⑧ 类型校验：GEOMETRY → MATERIAL 属于跨资源域连接，必须被拦截
  const geoOut = await page
    .locator('.graph-port[data-direction="out"][data-port-type="GEOMETRY"]')
    .first()
    .boundingBox()
  const materialIn = await page
    .locator('.graph-port[data-direction="in"][data-port-type="MATERIAL"]')
    .first()
    .boundingBox()
  await page.mouse.move(geoOut.x + geoOut.width / 2, geoOut.y + geoOut.height / 2)
  await page.mouse.down()
  await page.mouse.move(materialIn.x + materialIn.width / 2, materialIn.y + materialIn.height / 2, { steps: 15 })
  await page.mouse.up()
  await page.waitForTimeout(250)
  const invalidLinks = await page.evaluate(() => window.__graphDebug.graph.links.size)
  check('类型不匹配的连接被拦截', invalidLinks === 0, `${invalidLinks} 条`)

  // ⑨ 端口颜色按类型着色（GEOMETRY = #1d9e75）
  const geoColor = await page.evaluate(() => {
    const el = document.querySelector('.graph-port[data-port-type="GEOMETRY"]')
    return el ? getComputedStyle(el).backgroundColor : ''
  })
  check('端口按类型着色', geoColor === 'rgb(29, 158, 117)', geoColor)

  // ⑩ Widget 双向绑定：修改 shader/Float 的 value，写回 LiteGraph widget
  const valueInput = page.locator('.graph-node[data-node-id="5"] .graph-widget[data-widget-name="value"] input')
  await valueInput.fill('30')
  await page.waitForTimeout(200)
  const valueWritten = await page.evaluate(() => {
    const node = window.__graphDebug.graph.getNodeById(5)
    const widget = node?.widgets?.find((item) => item.name === 'value')
    return widget ? widget.value : null
  })
  const valueShown = await valueInput.inputValue()
  check('Widget 修改写回图数据', Number(valueWritten) === 30 && valueShown === '30', `图值 ${valueWritten} / 控件 ${valueShown}`)

  // ⑪ 节点库：搜索过滤 + 点击添加
  const libraryItemCount = async () => page.locator('.node-library-item').count()
  const allItems = await libraryItemCount()
  await page.locator('.node-library-search').fill('Vec3')
  await page.waitForTimeout(150)
  const filtered = await libraryItemCount()
  check('节点库搜索过滤', allItems > 1 && filtered === 1, `${allItems} → ${filtered}`)
  await page.locator('.node-library-search').fill('')
  await page.waitForTimeout(150)

  const nodesBefore = await page.evaluate(() => window.__graphDebug.graph.nodes.length)
  await page.getByRole('button', { name: /Vec3/ }).click()
  await page.waitForTimeout(250)
  const nodesAfter = await page.evaluate(() => window.__graphDebug.graph.nodes.length)
  check('从节点库添加节点', nodesAfter === nodesBefore + 1, `${nodesBefore} → ${nodesAfter}`)

  // 拖拽添加：拖动过程中不建节点，只有落在画布才建一个，且落点跟随鼠标
  const dragBefore = await page.evaluate(() => window.__graphDebug.graph.nodes.length)
  // 节点库现在是左栏下半区，先滚到顶部保证首个条目在可视区域内
  const firstLibraryItem = page.locator('.node-library-item').first()
  await firstLibraryItem.scrollIntoViewIfNeeded()
  const libItemBox = await firstLibraryItem.boundingBox()
  const dragCanvasBox = await page.locator('.graph-canvas').boundingBox()
  await page.mouse.move(libItemBox.x + 30, libItemBox.y + 12)
  await page.mouse.down()
  // 落在画布左下空白区，避免新节点盖住 Surface 的 FLOAT 输入端口
  await page.mouse.move(dragCanvasBox.x + 160, dragCanvasBox.y + 414, { steps: 10 })
  await page.waitForTimeout(200)
  const dragDuring = await page.evaluate(() => ({
    count: window.__graphDebug.graph.nodes.length,
    highlight: document.querySelector('.graph-canvas')?.classList.contains('is-drop-target') ?? false,
  }))
  await page.mouse.up()
  await page.waitForTimeout(300)
  const dragAfter = await page.evaluate(() => {
    const nodes = window.__graphDebug.graph.nodes
    return { count: nodes.length, last: nodes[nodes.length - 1].pos.map(Math.round) }
  })
  check(
    '拖拽只在画布落点创建节点',
    dragDuring.count === dragBefore &&
      dragDuring.highlight &&
      dragAfter.count === dragBefore + 1 &&
      Math.abs(dragAfter.last[0] - 50) < 3 &&
      Math.abs(dragAfter.last[1] - 400) < 3,
    `拖动中 ${dragDuring.count} / 松手后 ${dragAfter.count} / 位置 ${dragAfter.last}`,
  )

  // ⑫ 同类型连接：用干净的两节点图，避免前面添加的节点遮挡端口
  await page.evaluate(() => {
    window.__graphDebug.importWorkflow({
      nodes: [
        {
          id: 5,
          type: 'shader/Float',
          pos: [80, 100],
          size: [160, 90],
          inputs: [],
          outputs: [{ name: 'value', type: 'FLOAT', links: [] }],
          widgets_values: [30],
        },
        {
          id: 4,
          type: 'material/Surface',
          pos: [420, 100],
          size: [220, 250],
          inputs: [
            { name: 'baseColor', type: 'COLOR', link: null },
            { name: 'roughness', type: 'FLOAT', link: null },
            { name: 'metalness', type: 'FLOAT', link: null },
            { name: 'emissive', type: 'COLOR', link: null },
          ],
          outputs: [{ name: 'material', type: 'MATERIAL', links: [] }],
          widgets_values: ['pbr', '#8b9cff', 0.5, 0.2, '#000000'],
        },
      ],
      links: [],
      config: { schema_version: 2 },
    })
  })
  await page.waitForTimeout(400)
  await setView(1, 0, 0)
  const floatOut = await page
    .locator('.graph-port[data-node-id="5"][data-direction="out"][data-port-type="FLOAT"]')
    .first()
    .boundingBox()
  const floatIn = await page
    .locator('.graph-port[data-node-id="4"][data-direction="in"][data-port-type="FLOAT"][data-port-index="1"]')
    .first()
    .boundingBox()
  await page.mouse.move(floatOut.x + floatOut.width / 2, floatOut.y + floatOut.height / 2)
  await page.mouse.down()
  await page.mouse.move(floatIn.x + floatIn.width / 2, floatIn.y + floatIn.height / 2, { steps: 15 })
  await page.mouse.up()
  await page.waitForTimeout(250)
  const validLinks = await page.evaluate(() => window.__graphDebug.graph.links.size)
  check('同类型连接正常建立', validLinks === 1, `${validLinks} 条`)

  // ⑬ 撤销 / 重做：连线
  const undoRedo = await page.evaluate(async () => {
    const api = window.__graphDebug
    const before = api.graph.links.size
    api.undo()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const afterUndo = api.graph.links.size
    api.redo()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    return { before, afterUndo, afterRedo: api.graph.links.size }
  })
  check(
    '撤销/重做恢复连线',
    undoRedo.before === 1 && undoRedo.afterUndo === 0 && undoRedo.afterRedo === 1,
    `${undoRedo.before} → ${undoRedo.afterUndo} → ${undoRedo.afterRedo}`,
  )

  // ⑭ 撤销 / 重做：节点增删
  const nodesBeforeAdd = await page.evaluate(() => window.__graphDebug.graph.nodes.length)
  await page.getByRole('button', { name: /Vec3/ }).click()
  await page.waitForTimeout(200)
  const nodesAfterAdd = await page.evaluate(() => window.__graphDebug.graph.nodes.length)
  await page.evaluate(() => window.__graphDebug.undo())
  await page.waitForTimeout(200)
  const nodesAfterUndo = await page.evaluate(() => window.__graphDebug.graph.nodes.length)
  await page.evaluate(() => window.__graphDebug.redo())
  await page.waitForTimeout(200)
  const nodesAfterRedo = await page.evaluate(() => window.__graphDebug.graph.nodes.length)
  check(
    '撤销/重做恢复节点增删',
    nodesAfterAdd === nodesBeforeAdd + 1 && nodesAfterUndo === nodesBeforeAdd && nodesAfterRedo === nodesAfterAdd,
    `${nodesBeforeAdd} → ${nodesAfterAdd} → ${nodesAfterUndo} → ${nodesAfterRedo}`,
  )

  // ⑮ Widget 变更的撤销（连续调参合并为一条）+ Ctrl+Z 快捷键
  const valueLocator = page.locator('.graph-node[data-node-id="5"] .graph-widget[data-widget-name="value"] input')
  await valueLocator.fill('42')
  await page.waitForTimeout(200)
  await page.evaluate(() => window.__graphDebug.undo())
  await page.waitForTimeout(200)
  const valueAfterUndo = await valueLocator.inputValue()
  await page.evaluate(() => window.__graphDebug.redo())
  await page.waitForTimeout(200)
  const valueAfterRedo = await valueLocator.inputValue()
  check(
    'Widget 变更可撤销/重做',
    valueAfterUndo === '30' && valueAfterRedo === '42',
    `30 → 42 → ${valueAfterUndo} → ${valueAfterRedo}`,
  )

  // 让 canvas 获得焦点后使用键盘快捷键撤销
  const focusPoint = await page.locator('.graph-canvas').boundingBox()
  await page.mouse.click(focusPoint.x + 30, focusPoint.y + 30)
  await page.waitForTimeout(150)
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(300)
  check('Ctrl+Z 快捷键撤销', (await valueLocator.inputValue()) === '30', `value=${await valueLocator.inputValue()}`)
  await page.evaluate(() => window.__graphDebug.redo())
  await page.waitForTimeout(200)

  // ⑯ 导出 → 导入 往返一致
  const roundTrip = await page.evaluate(() => {
    const api = window.__graphDebug
    const exported = api.exportWorkflow()
    const result = api.importWorkflow(exported)
    const normalize = (workflow) => ({
      nodes: workflow.nodes
        .map((node) => ({
          id: node.id,
          type: node.type,
          pos: node.pos,
          size: node.size,
          inputs: node.inputs.map((port) => [port.name, port.type, port.link ?? null]),
          outputs: node.outputs.map((port) => [port.name, port.type]),
          widgets: node.widgets_values,
        }))
        .sort((left, right) => left.id - right.id),
      links: workflow.links
        .map((link) => [link[1], link[2], link[3], link[4], link[5]])
        .sort((left, right) => String(left).localeCompare(String(right))),
    })
    return {
      ok: result.ok,
      issues: result.issues,
      before: JSON.stringify(normalize(exported)),
      after: JSON.stringify(normalize(api.exportWorkflow())),
    }
  })
  check(
    '导出再导入后图结构一致',
    roundTrip.ok && roundTrip.before === roundTrip.after,
    roundTrip.ok ? `issues ${roundTrip.issues.length}` : '导入被拒绝',
  )

  // ⑱ 非法导入被拒绝且不破坏当前图
  const invalidImport = await page.evaluate(() => {
    const api = window.__graphDebug
    const before = api.graph.nodes.length
    const result = api.importWorkflow({ nodes: 'oops' })
    return { ok: result.ok, level: result.issues[0]?.level, before, after: api.graph.nodes.length }
  })
  check(
    '非法导入被拒绝且图不变',
    invalidImport.ok === false && invalidImport.level === 1 && invalidImport.before === invalidImport.after,
    `level ${invalidImport.level} / 节点 ${invalidImport.before} → ${invalidImport.after}`,
  )

  // ⑲ 刷新后从 localStorage 恢复（独立浏览器上下文，避免污染主流程）
  const persistContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const persistPage = await persistContext.newPage()
  await persistPage.goto(url, { waitUntil: 'networkidle' })
  await persistPage.waitForFunction(() => Boolean(window.__graphDebug))
  await persistPage.waitForSelector('.graph-port')
  const persistedBefore = await persistPage.evaluate(() => ({
    nodes: window.__graphDebug.graph.nodes.length,
    pos: [...window.__graphDebug.graph.nodes[0].pos],
  }))
  await persistPage.getByRole('button', { name: /Vec3/ }).click()
  await persistPage.waitForTimeout(250)
  await persistPage.evaluate(() => window.__graphDebug.saveNow())
  const persistedAdded = await persistPage.evaluate(() => window.__graphDebug.graph.nodes.length)
  await persistPage.reload({ waitUntil: 'networkidle' })
  await persistPage.waitForFunction(() => Boolean(window.__graphDebug))
  await persistPage.waitForSelector('.graph-port')
  const persistedAfter = await persistPage.evaluate(() => ({
    nodes: window.__graphDebug.graph.nodes.length,
    pos: [...window.__graphDebug.graph.nodes[0].pos],
  }))
  await persistContext.close()
  check(
    '刷新后从 localStorage 恢复',
    persistedAdded === persistedBefore.nodes + 1 &&
      persistedAfter.nodes === persistedAdded &&
      JSON.stringify(persistedAfter.pos) === JSON.stringify(persistedBefore.pos),
    `${persistedBefore.nodes} → ${persistedAdded} → 刷新后 ${persistedAfter.nodes}`,
  )

  // ⑳ 主题切换：不丢失图数据，画布底色同步
  const themeBefore = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    nodes: window.__graphDebug.graph.nodes.length,
    pos: [...window.__graphDebug.graph.nodes[0].pos],
    bg: window.__graphDebug.canvas.clear_background_color,
  }))
  const themeButton = themeBefore.theme === 'dark' ? '浅色' : '深色'
  await page.getByRole('button', { name: new RegExp(themeButton) }).click()
  await page.waitForTimeout(250)
  const themeAfter = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    nodes: window.__graphDebug.graph.nodes.length,
    pos: [...window.__graphDebug.graph.nodes[0].pos],
    bg: window.__graphDebug.canvas.clear_background_color,
    saved: localStorage.getItem('node-editor:theme'),
  }))
  check(
    '主题切换保持图状态',
    themeAfter.theme !== themeBefore.theme &&
      themeAfter.nodes === themeBefore.nodes &&
      JSON.stringify(themeAfter.pos) === JSON.stringify(themeBefore.pos) &&
      themeAfter.bg !== themeBefore.bg,
    `${themeBefore.theme} → ${themeAfter.theme} / 画布 ${themeAfter.bg}`,
  )
  check('主题持久化', themeAfter.saved === themeAfter.theme, String(themeAfter.saved))

  // ㉑ LOD：低缩放隐藏文字与 Widget
  await setView(0.4, 100, 60)
  await page.waitForTimeout(200)
  const lod = await page.evaluate(() => ({
    active: document.querySelector('.node-overlay')?.classList.contains('is-lod') ?? false,
    widget: getComputedStyle(document.querySelector('.graph-widgets')).display,
    label: getComputedStyle(document.querySelector('.graph-port-label')).display,
  }))
  await setView(1, 0, 0)
  await page.waitForTimeout(200)
  const lodOff = await page.evaluate(
    () => document.querySelector('.node-overlay')?.classList.contains('is-lod') ?? true,
  )
  check(
    '低缩放 LOD 隐藏文字与 Widget',
    lod.active && lod.widget === 'none' && lod.label === 'none' && lodOff === false,
    `widget=${lod.widget} label=${lod.label}`,
  )

  // ㉒ 检查器：选中节点显示详情，取消选中显示空态
  const floatBox = await page.locator('.graph-node[data-node-id="5"]').boundingBox()
  await page.mouse.click(floatBox.x + floatBox.width * 0.6, floatBox.y + 14)
  await page.waitForTimeout(250)
  const inspector = await page.evaluate(() => ({
    title: document.querySelector('.inspector h2')?.textContent ?? '',
    type: document.querySelector('.inspector .hint')?.textContent ?? '',
    widgets: document.querySelectorAll('.inspector .graph-widget').length,
  }))
  check(
    '检查器显示选中节点',
    inspector.title === 'Float' && inspector.type === 'shader/Float' && inspector.widgets === 1,
    `${inspector.title} / ${inspector.widgets} 个参数`,
  )

  const canvasTopLeft = await page.locator('.graph-canvas').boundingBox()
  await page.mouse.click(canvasTopLeft.x + 30, canvasTopLeft.y + 30)
  await page.waitForTimeout(200)
  const inspectorEmpty = await page.evaluate(() => {
    const panel = document.querySelector('.inspector')
    const text = panel?.textContent ?? ''
    return Boolean(panel && text.includes('场景概览') && text.includes('未选中'))
  })
  check('检查器空态', inspectorEmpty, inspectorEmpty ? '场景概览' : '仍显示节点')

  // ㉓ 迷你地图：节点数量、投影稳定、点击目标点居中、重复点击不漂移
  const miniBefore = await page.evaluate(() => {
    const map = document.querySelector('.minimap').getBoundingClientRect()
    return {
      exists: Boolean(document.querySelector('.minimap')),
      nodes: document.querySelectorAll('.minimap-node').length,
      graphNodes: window.__graphDebug.graph.nodes.length,
      rects: [...document.querySelectorAll('.minimap-node')].map((el) => {
        const r = el.getBoundingClientRect()
        return [Math.round(r.x - map.x), Math.round(r.y - map.y)]
      }),
    }
  })
  const miniBox = await page.locator('.minimap').boundingBox()
  const miniClickX = miniBox.x + miniBox.width * 0.7
  const miniClickY = miniBox.y + miniBox.height * 0.6

  // 与组件相同的投影：把点击位置换算成期望的图坐标
  const miniTarget = await page.evaluate(
    ([clientX, clientY]) => {
      const nodes = window.__graphDebug.graph.nodes
      const map = document.querySelector('.minimap').getBoundingClientRect()
      let minX = Math.min(...nodes.map((n) => n.pos[0])) - 80
      let minY = Math.min(...nodes.map((n) => n.pos[1])) - 80
      let maxX = Math.max(...nodes.map((n) => n.pos[0] + n.size[0])) + 80
      let maxY = Math.max(...nodes.map((n) => n.pos[1] + n.size[1])) + 80
      if (maxX - minX < 1200) {
        const extra = (1200 - (maxX - minX)) / 2
        minX -= extra
        maxX += extra
      }
      if (maxY - minY < 800) {
        const extra = (800 - (maxY - minY)) / 2
        minY -= extra
        maxY += extra
      }
      const scale = Math.min(200 / (maxX - minX), 130 / (maxY - minY))
      const offsetX = (200 - (maxX - minX) * scale) / 2
      const offsetY = (130 - (maxY - minY) * scale) / 2
      return [minX + (clientX - map.left - 1 - offsetX) / scale, minY + (clientY - map.top - 1 - offsetY) / scale]
    },
    [miniClickX, miniClickY],
  )

  await page.mouse.click(miniClickX, miniClickY)
  await page.waitForTimeout(300)
  const miniAfter = await page.evaluate(() => {
    const api = window.__graphDebug
    const map = document.querySelector('.minimap').getBoundingClientRect()
    const canvasRect = api.canvas.canvas.getBoundingClientRect()
    const viewportRect = document.querySelector('.minimap-viewport').getBoundingClientRect()
    return {
      offset: [...api.canvas.ds.offset],
      center: api.canvas.ds.convertCanvasToOffset([canvasRect.width / 2, canvasRect.height / 2]),
      rects: [...document.querySelectorAll('.minimap-node')].map((el) => {
        const r = el.getBoundingClientRect()
        return [Math.round(r.x - map.x), Math.round(r.y - map.y)]
      }),
      viewportCenter: [
        viewportRect.x + viewportRect.width / 2 - map.x,
        viewportRect.y + viewportRect.height / 2 - map.y,
      ],
    }
  })
  const clickBorder = [miniClickX - miniBox.x, miniClickY - miniBox.y]
  const centerDelta = Math.hypot(miniAfter.center[0] - miniTarget[0], miniAfter.center[1] - miniTarget[1])
  const markerDelta = Math.hypot(
    miniAfter.viewportCenter[0] - clickBorder[0],
    miniAfter.viewportCenter[1] - clickBorder[1],
  )
  check(
    '迷你地图展示并可导航',
    miniBefore.exists && miniBefore.nodes === miniBefore.graphNodes && miniAfter.offset.some((value) => value !== 0),
    `${miniBefore.nodes} 个节点`,
  )
  check(
    '点击迷你地图后目标点居中 < 2px',
    centerDelta < 2,
    `偏差 ${centerDelta.toFixed(2)}px`,
  )
  check(
    '迷你地图投影不随视口漂移',
    JSON.stringify(miniAfter.rects) === JSON.stringify(miniBefore.rects) && markerDelta < 2,
    `节点色块稳定 / 视口标记偏差 ${markerDelta.toFixed(2)}px`,
  )

  // 同一像素再点一次：已经居中，不应继续移动
  const offsetAfterFirst = miniAfter.offset
  await page.mouse.click(miniClickX, miniClickY)
  await page.waitForTimeout(300)
  const miniRepeat = await page.evaluate(() => [...window.__graphDebug.canvas.ds.offset])
  const repeatDelta = Math.hypot(miniRepeat[0] - offsetAfterFirst[0], miniRepeat[1] - offsetAfterFirst[1])
  check('重复点击同一位置不漂移', repeatDelta < 0.5, `Δ ${repeatDelta.toFixed(2)}px`)
  await setView(1, 0, 0)

  // ㉔ 无障碍：画布 / 工具按钮 / Widget 均有可访问名称
  const a11y = await page.evaluate(() => ({
    canvas: document.querySelector('canvas.litegraph-canvas')?.getAttribute('aria-label'),
    headerButtons: [...document.querySelectorAll('.header-actions button')].every(
      (button) => (button.getAttribute('aria-label') ?? button.textContent ?? '').trim().length > 0,
    ),
    widget: document
      .querySelector('.graph-widget input, .graph-widget select')
      ?.getAttribute('aria-label'),
  }))
  check(
    '无障碍名称完整',
    a11y.canvas === '节点画布' && a11y.headerButtons && Boolean(a11y.widget),
    `canvas=${a11y.canvas} widget=${a11y.widget}`,
  )

  // ㉕ 100 节点渲染性能（canvas.draw 为同步帧，目标 < 20ms/帧）
  const perf = await page.evaluate(() => {
    const api = window.__graphDebug
    const original = api.exportWorkflow()
    const nodes = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      type: 'shader/Float',
      pos: [(index % 10) * 260, Math.floor(index / 10) * 200],
      size: [160, 90],
      inputs: [],
      outputs: [],
      widgets_values: [1],
    }))
    const result = api.importWorkflow({ nodes, links: [], config: { schema_version: 1 } })
    // 缩到 0.3x 让 100 个节点尽量同时可见，测的是真实绘制负载
    api.setView(0.3, 40, 40)
    const canvas = api.canvas
    const start = performance.now()
    for (let frame = 0; frame < 20; frame++) canvas.draw(true, true)
    const avg = (performance.now() - start) / 20
    const count = api.graph.nodes.length
    api.importWorkflow(original)
    return { ok: result.ok, avg, count }
  })
  check(
    '100 节点渲染 < 20ms/帧',
    perf.ok && perf.count === 100 && perf.avg < 20,
    `${perf.avg.toFixed(1)}ms/帧`,
  )

  // ㉖ 响应式：1280 与 1920 宽度下布局不溢出
  for (const width of [1280, 1920]) {
    const context = await browser.newContext({ viewport: { width, height: 860 } })
    const probePage = await context.newPage()
    await probePage.goto(url, { waitUntil: 'networkidle' })
    await probePage.waitForFunction(() => Boolean(window.__graphDebug))
    const layout = await probePage.evaluate(() => {
      const canvas = document.querySelector('.graph-canvas').getBoundingClientRect()
      const status = document.querySelector('.status-bar').getBoundingClientRect()
      const header = document.querySelector('.app-header').getBoundingClientRect()
      const side = document.querySelector('.side-panel').getBoundingClientRect()
      return {
        canvasWidth: canvas.width,
        maxRight: Math.max(status.right, header.right, side.right),
        innerWidth: window.innerWidth,
      }
    })
    await context.close()
    check(
      `${width}px 布局无溢出`,
      layout.maxRight <= layout.innerWidth + 0.5 && layout.canvasWidth > 400,
      `画布 ${Math.round(layout.canvasWidth)}px`,
    )
  }

  check('无页面异常', pageErrors.length === 0, `${pageErrors.length} 个`)
} finally {
  await browser.close()
}

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} 项通过`)
process.exitCode = failed.length ? 1 : 0
