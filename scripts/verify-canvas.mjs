import { chromium } from 'playwright'

const url = process.env.CANVAS_URL ?? 'http://127.0.0.1:5173'
const TOLERANCE = 2
const NATIVE_LIMIT = 0.2 // 比例阈值：节点移出画布前后的像素差异（20%）

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))

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
    { label: '3x', scale: 3, x: -27, y: -63 },
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
  check('节点包围盒与 DOM 对齐 < 1px', bboxMax < 1, `${bboxMax.toFixed(2)}px`)

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
  check(
    '框选同步两个节点',
    (await page.locator('.graph-node.is-selected').count()) === 2 && (await statusValue('选中')) === 2,
    `${await page.locator('.graph-node.is-selected').count()} 个高亮 / 选中 ${await statusValue('选中')}`,
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
    deltas.length === 2 &&
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
    .locator('.graph-node[data-node-id="2"] .graph-widget[data-widget-name="steps"] input')
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

  // ⑧ 类型校验：VAE → MODEL 属于非法连接，必须被拦截
  const vaeOut = await page
    .locator('.graph-port[data-direction="out"][data-port-type="VAE"]')
    .first()
    .boundingBox()
  const modelIn = await page
    .locator('.graph-port[data-direction="in"][data-port-type="MODEL"]')
    .first()
    .boundingBox()
  await page.mouse.move(vaeOut.x + vaeOut.width / 2, vaeOut.y + vaeOut.height / 2)
  await page.mouse.down()
  await page.mouse.move(modelIn.x + modelIn.width / 2, modelIn.y + modelIn.height / 2, { steps: 15 })
  await page.mouse.up()
  await page.waitForTimeout(250)
  const invalidLinks = await page.evaluate(() => window.__graphDebug.graph.links.size)
  check('类型不匹配的连接被拦截', invalidLinks === 0, `${invalidLinks} 条`)

  // ⑨ 端口颜色按类型着色（MODEL = #b39ddb）
  const modelColor = await page.evaluate(() => {
    const el = document.querySelector('.graph-port[data-port-type="MODEL"]')
    return el ? getComputedStyle(el).backgroundColor : ''
  })
  check('端口按类型着色', modelColor === 'rgb(179, 157, 219)', modelColor)

  // ⑩ Widget 双向绑定：修改 KSampler 的 steps，写回 LiteGraph widget
  const stepsInput = page.locator('.graph-node[data-node-id="2"] .graph-widget[data-widget-name="steps"] input')
  await stepsInput.fill('30')
  await page.waitForTimeout(200)
  const stepsValue = await page.evaluate(() => {
    const node = window.__graphDebug.graph.getNodeById(2)
    const widget = node?.widgets?.find((item) => item.name === 'steps')
    return widget ? widget.value : null
  })
  const stepsShown = await stepsInput.inputValue()
  check('Widget 修改写回图数据', Number(stepsValue) === 30 && stepsShown === '30', `图值 ${stepsValue} / 控件 ${stepsShown}`)

  // ⑪ 节点库：搜索过滤 + 点击添加
  const libraryItemCount = async () => page.locator('.node-library-item').count()
  const allItems = await libraryItemCount()
  await page.locator('.node-library-search').fill('采样')
  await page.waitForTimeout(150)
  const filtered = await libraryItemCount()
  check('节点库搜索过滤', allItems > 1 && filtered === 1, `${allItems} → ${filtered}`)
  await page.locator('.node-library-search').fill('')
  await page.waitForTimeout(150)

  const nodesBefore = await page.evaluate(() => window.__graphDebug.graph.nodes.length)
  await page.getByRole('button', { name: /VAE 解码/ }).click()
  await page.waitForTimeout(250)
  const nodesAfter = await page.evaluate(() => window.__graphDebug.graph.nodes.length)
  check('从节点库添加节点', nodesAfter === nodesBefore + 1, `${nodesBefore} → ${nodesAfter}`)

  // ⑫ 新增节点可参与类型校验（LATENT → VAE 非法；LATENT → LATENT 合法）
  // KSampler 的 LATENT 输出在画布可见区域内；EmptyLatent 在右侧，可能被开发面板遮住
  const latentOut = await page
    .locator('.graph-port[data-direction="out"][data-port-type="LATENT"]')
    .first()
    .boundingBox()
  const latentIn = await page
    .locator('.graph-port[data-direction="in"][data-port-type="LATENT"]')
    .last()
    .boundingBox()
  await page.mouse.move(latentOut.x + latentOut.width / 2, latentOut.y + latentOut.height / 2)
  await page.mouse.down()
  await page.mouse.move(latentIn.x + latentIn.width / 2, latentIn.y + latentIn.height / 2, { steps: 15 })
  await page.mouse.up()
  await page.waitForTimeout(250)
  const validLinks = await page.evaluate(() => window.__graphDebug.graph.links.size)
  check('同类型连接正常建立', validLinks === 1, `${validLinks} 条`)

  check('无页面异常', pageErrors.length === 0, `${pageErrors.length} 个`)
} finally {
  await browser.close()
}

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} 项通过`)
process.exitCode = failed.length ? 1 : 0
