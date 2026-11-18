import { chromium } from 'playwright'

const url = process.env.SPIKE_URL ?? 'http://127.0.0.1:5173'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(e.message))

try {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('.spike-port')

  await page.getByRole('button', { name: '测量偏差' }).click()
  const measureText = await page.locator('section').nth(2).innerText()
  const maxDist = Number(measureText.match(/最大偏差\s+([\d.]+)\s+px/)?.[1] ?? Infinity)

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
  const into = ports.find((p) => p.dir === 'in' && p.node !== out.node)
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

  const nodeBox = await page.locator('.spike-node').first().boundingBox()
  const beforeLeft = await page.evaluate(() => document.querySelector('.spike-node').style.left)
  await page.mouse.move(nodeBox.x + 60, nodeBox.y + 14)
  await page.mouse.down()
  await page.mouse.move(nodeBox.x + 190, nodeBox.y + 94, { steps: 12 })
  await page.waitForTimeout(50)
  const duringLeft = await page.evaluate(() => document.querySelector('.spike-node').style.left)
  await page.mouse.up()

  const checks = [
    ['几何偏差 < 2px', maxDist < 2, `${maxDist}px`],
    ['连线已创建', graphLinks === 1, `${graphLinks} 条`],
    ['React 面板同步', panelLinks === 1, `${panelLinks} 条`],
    ['拖动时节点实时跟随', beforeLeft !== duringLeft, `${beforeLeft} → ${duringLeft}`],
    ['无页面异常', pageErrors.length === 0, `${pageErrors.length} 个`],
  ]
  for (const [name, ok, detail] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} (${detail})`)
  process.exitCode = checks.every(([, ok]) => ok) ? 0 : 1
} finally {
  await browser.close()
}
