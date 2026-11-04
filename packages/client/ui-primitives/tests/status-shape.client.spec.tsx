// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { STATUS_SHAPES, StateDot, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { StatusShape } from '@deepseek-ai/dsh-client-ui-primitives'

afterEach(cleanup)

/** The geometry of each shape's drawing, which tells the six shapes apart without colour. */
function drawing(svg: Element): string {
  return [...svg.children].map(child => `${child.tagName}${child.getAttribute('stroke-dasharray') === null ? '' : ':dashed'}${child.getAttribute('d') ?? ''}`).join(' ')
}

describe('StateDot shape', () => {
  it.each(STATUS_SHAPES)('draws %s as a 14px decorative icon', (shape) => {
    const { container } = render(<StateDot shape={shape} />)
    const icon = container.firstElementChild as SVGSVGElement
    expect(icon.tagName).toBe('svg')
    expect(icon.dataset['shape']).toBe(shape)
    expect(icon.getAttribute('width')).toBe('14')
    expect(icon.getAttribute('aria-hidden')).toBe('true')
  })

  it('gives each shape its own drawing, so the shape carries the meaning in grey scale', () => {
    const drawings = STATUS_SHAPES.map((shape) => {
      const { container, unmount } = render(<StateDot shape={shape} />)
      const result = drawing(container.firstElementChild!)
      unmount()
      return result
    })
    expect(new Set(drawings).size).toBe(STATUS_SHAPES.length)
    expect(drawings[0]).toBe('circle:dashed circle')
    expect(drawings[4]).toMatch(/^path/)
  })

  it('takes a size and a placement class', () => {
    const { container } = render(<StateDot shape="ok" size={16} className="placed" />)
    const icon = container.firstElementChild as SVGSVGElement
    expect(icon.getAttribute('width')).toBe('16')
    expect(icon.classList.contains('placed')).toBe(true)
  })

  it('keeps the five colour states for callers that pass no shape', () => {
    const { container } = render(<StateDot state="warning" />)
    expect((container.firstElementChild as HTMLElement).dataset['state']).toBe('warning')
  })

  it('rejects a shape together with a state at the type level', () => {
    // @ts-expect-error a status icon takes a shape or a state, not both
    expect(() => render(<StateDot shape="ok" state="done" />)).not.toThrow()
  })
})

describe('Tag shape', () => {
  it.each(STATUS_SHAPES)('draws the %s pill with its icon before the word', (shape) => {
    render(<Tag shape={shape}>Word</Tag>)
    const pill = screen.getByText('Word')
    expect(pill.dataset['shape']).toBe(shape)
    expect(pill.dataset['tone']).toBeUndefined()
    expect((pill.firstElementChild as SVGSVGElement).dataset['shape']).toBe(shape)
  })

  it('keeps a caller class', () => {
    render(<Tag shape="run" className="placed">Running</Tag>)
    expect(screen.getByText('Running').classList.contains('placed')).toBe(true)
  })

  it('requires the word at the type level', () => {
    const word = (shape: StatusShape) => shape
    // @ts-expect-error the status pill cannot render without its word
    expect(() => render(<Tag shape={word('ok')} />)).not.toThrow()
  })
})
