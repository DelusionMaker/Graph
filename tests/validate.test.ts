import { describe, expect, it } from 'vitest'
import { isValidTypePair } from '../src/graph/portTypes'

describe('isValidTypePair', () => {
  it('同类型可连接', () => {
    expect(isValidTypePair('FLOAT', 'FLOAT')).toBe(true)
    expect(isValidTypePair('GEOMETRY', 'GEOMETRY')).toBe(true)
    expect(isValidTypePair('POSTFX', 'POSTFX')).toBe(true)
  })

  it('通配符任意方向可连接', () => {
    expect(isValidTypePair('*', 'MATERIAL')).toBe(true)
    expect(isValidTypePair('POSTFX', '*')).toBe(true)
  })

  it('INT 与 FLOAT 数值兼容（既有规则）', () => {
    expect(isValidTypePair('INT', 'FLOAT')).toBe(true)
    expect(isValidTypePair('FLOAT', 'INT')).toBe(true)
  })

  it('FLOAT 广播到 VEC3 / COLOR', () => {
    expect(isValidTypePair('FLOAT', 'VEC3')).toBe(true)
    expect(isValidTypePair('FLOAT', 'COLOR')).toBe(true)
  })

  it('FLOAT 不能直接连 VEC2', () => {
    expect(isValidTypePair('FLOAT', 'VEC2')).toBe(false)
  })

  it('COLOR 与 VEC3 等价', () => {
    expect(isValidTypePair('COLOR', 'VEC3')).toBe(true)
    expect(isValidTypePair('VEC3', 'COLOR')).toBe(true)
  })

  it('资源类型域隔离', () => {
    expect(isValidTypePair('MATERIAL', 'FLOAT')).toBe(false)
    expect(isValidTypePair('POSTFX', 'COLOR')).toBe(false)
    expect(isValidTypePair('GEOMETRY', 'MATERIAL')).toBe(false)
    expect(isValidTypePair('MATERIAL', 'POSTFX')).toBe(false)
  })

  it('未知类型与不相干类型不匹配', () => {
    expect(isValidTypePair('FOO', 'BAR')).toBe(false)
    expect(isValidTypePair('VEC3', 'VEC2')).toBe(false)
  })

  it('资源与光照类型保持域隔离', () => {
    expect(isValidTypePair('GEOMETRY', 'GEOMETRY')).toBe(true)
    expect(isValidTypePair('GEOMETRY', 'MATERIAL')).toBe(false)
    expect(isValidTypePair('LIGHT', 'LIGHTS')).toBe(false)
  })
})
