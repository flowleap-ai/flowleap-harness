// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clampTreeWidth, TREE_DEFAULT, TREE_MAX, TREE_MIN, TreeResize } from '../src/client/TreeResize.tsx'

/** The pointers that the handle holds; jsdom has no pointer capture. */
let captured: Set<number>
/** The animation frames that wait, by id. */
let frames: Map<number, FrameRequestCallback>

beforeEach(() => {
  captured = new Set()
  frames = new Map()
  let nextFrame = 1
  HTMLElement.prototype.setPointerCapture = (id: number) => { captured.add(id) }
  HTMLElement.prototype.releasePointerCapture = (id: number) => { captured.delete(id) }
  HTMLElement.prototype.hasPointerCapture = (id: number) => captured.has(id)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(nextFrame, callback)
    return nextFrame++
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture')
  Reflect.deleteProperty(HTMLElement.prototype, 'releasePointerCapture')
  Reflect.deleteProperty(HTMLElement.prototype, 'hasPointerCapture')
})

/** Run the waiting animation frames. */
function paint(): void {
  const waiting = [...frames.values()]
  frames.clear()
  for (const callback of waiting) callback(0)
}

function mount(width = 300) {
  const onWidth = vi.fn()
  const view = render(<TreeResize width={width} onWidth={onWidth} label="Resize the folder tree" />)
  return { onWidth, view, handle: screen.getByRole('separator', { name: 'Resize the folder tree' }) }
}

describe('clampTreeWidth', () => {
  it('keeps a width inside the app sidebar limits, rounds it, and gives the first width for a value that is not a number', () => {
    expect([TREE_MIN, TREE_MAX, TREE_DEFAULT]).toEqual([264, 420, 280])
    expect(clampTreeWidth(300.6)).toBe(301)
    expect(clampTreeWidth(100)).toBe(TREE_MIN)
    expect(clampTreeWidth(1000)).toBe(TREE_MAX)
    expect(clampTreeWidth(Number.NaN)).toBe(TREE_DEFAULT)
    expect(clampTreeWidth(Number.POSITIVE_INFINITY)).toBe(TREE_DEFAULT)
  })
})

describe('TreeResize', () => {
  it('is a vertical separator on the tree edge that names its width and limits', () => {
    const { handle } = mount(300)
    expect([
      handle.getAttribute('aria-orientation'), handle.getAttribute('aria-valuenow'), handle.getAttribute('aria-valuemin'),
      handle.getAttribute('aria-valuemax'), handle.tabIndex, handle.style.left,
    ]).toEqual(['vertical', '300', '264', '420', 0, '300px'])
  })

  it('reports one width for each animation frame while the person drags, and the last width on release', () => {
    const { onWidth, handle } = mount(300)
    fireEvent.pointerDown(handle, { button: 0, pointerId: 7, clientX: 100 })
    expect(captured).toEqual(new Set([7]))
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 110 })
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 130 })
    expect(onWidth).not.toHaveBeenCalled()
    paint()
    expect(onWidth.mock.calls).toEqual([[330]])
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 90 })
    fireEvent.pointerUp(handle, { pointerId: 7, clientX: 80 })
    expect(onWidth.mock.calls).toEqual([[330], [280]])
    expect(captured).toEqual(new Set())
    paint()
    expect(onWidth).toHaveBeenCalledTimes(2)
  })

  it('ignores a pointer that is not the dragging one, a second pointer, a button other than the main one, and a move with no drag', () => {
    const { onWidth, handle } = mount(300)
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 200 })
    fireEvent.pointerUp(handle, { pointerId: 7, clientX: 200 })
    fireEvent.pointerDown(handle, { button: 2, pointerId: 7, clientX: 100 })
    expect(captured).toEqual(new Set())
    fireEvent.pointerDown(handle, { button: 0, pointerId: 7, clientX: 100 })
    fireEvent.pointerDown(handle, { button: 0, pointerId: 8, clientX: 500 })
    expect(captured).toEqual(new Set([7]))
    fireEvent.pointerMove(handle, { pointerId: 8, clientX: 600 })
    fireEvent.pointerUp(handle, { pointerId: 8, clientX: 600 })
    paint()
    expect(onWidth).not.toHaveBeenCalled()
    fireEvent.pointerUp(handle, { pointerId: 7, clientX: 120 })
    expect(onWidth.mock.calls).toEqual([[320]])
  })

  it('stops the drag with no last report when the pointer is cancelled', () => {
    const { onWidth, handle } = mount(300)
    fireEvent.pointerCancel(handle, { pointerId: 7 })
    fireEvent.pointerDown(handle, { button: 0, pointerId: 7, clientX: 100 })
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 150 })
    fireEvent.pointerCancel(handle, { pointerId: 7 })
    expect(captured).toEqual(new Set())
    paint()
    fireEvent.pointerUp(handle, { pointerId: 7, clientX: 150 })
    expect(onWidth).not.toHaveBeenCalled()
  })

  it('stops the drag when the handle loses the pointer capture', () => {
    const { onWidth, handle } = mount(300)
    fireEvent.pointerDown(handle, { button: 0, pointerId: 7, clientX: 100 })
    captured.clear()
    const release = vi.spyOn(HTMLElement.prototype, 'releasePointerCapture')
    fireEvent.lostPointerCapture(handle, { pointerId: 7 })
    expect(release).not.toHaveBeenCalled()
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 150 })
    paint()
    expect(onWidth).not.toHaveBeenCalled()
    fireEvent.pointerDown(handle, { button: 0, pointerId: 9, clientX: 100 })
    expect(captured).toEqual(new Set([9]))
  })

  it('releases the pointer and drops the waiting frame when it goes during a drag', () => {
    const { onWidth, handle, view } = mount(300)
    fireEvent.pointerDown(handle, { button: 0, pointerId: 7, clientX: 100 })
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 150 })
    view.unmount()
    expect(captured).toEqual(new Set())
    expect(frames.size).toBe(0)
    expect(onWidth).not.toHaveBeenCalled()
  })

  it('changes the width in 16 px steps with the arrow keys and passes other keys on', () => {
    const { onWidth, handle } = mount(300)
    expect(fireEvent.keyDown(handle, { key: 'ArrowRight' })).toBe(false)
    expect(fireEvent.keyDown(handle, { key: 'ArrowLeft' })).toBe(false)
    expect(fireEvent.keyDown(handle, { key: 'ArrowUp' })).toBe(true)
    expect(fireEvent.keyDown(handle, { key: 'Enter' })).toBe(true)
    expect(onWidth.mock.calls).toEqual([[316], [284]])
  })
})
