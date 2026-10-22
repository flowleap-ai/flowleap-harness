import type { CSSProperties } from 'react'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarBrandMarkOwnerProps, SidebarBrandNameOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { RunningIconOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { BrandRecord } from '../brand.ts'
import css from './Brand.module.css'

/** What every brand occupant receives from the plugin body. */
export interface BrandInjected {
  /** The validated brand record. */
  brand: BrandRecord
}

/** Props of the mark occupants: the host's requested geometry plus the brand. A host class alone sizes the mark when `size` is absent. */
export type BrandMarkProps = { size?: number | undefined; className?: string | undefined } & InjectFace<BrandInjected>

/**
 * Draw the brand mark at the host's requested size. A `mono` mark is a mask
 * filled with the surrounding text colour, or the accent when the brand sets
 * one; a `color` mark is the image itself. Without a mark nothing renders and
 * the host keeps its own geometry.
 * @param props - requested size and class from the host surface, plus the brand.
 * @returns the mark element, or null when the brand has no mark.
 */
export function BrandMark({ size, className, brand }: BrandMarkProps) {
  if (brand.mark === undefined) return null
  const classes = className === undefined ? '' : ` ${className}`
  if (brand.markStyle === 'color') {
    return <img src={brand.mark} width={size} height={size} alt="" aria-hidden="true" className={`${css.colorMark}${classes}`} />
  }
  const mask = `url("${brand.mark}")`
  const style: CSSProperties = {
    ...(size === undefined ? {} : { width: size, height: size }),
    maskImage: mask,
    WebkitMaskImage: mask,
    ...(brand.accent === undefined ? {} : { color: brand.accent }),
  }
  return <span role="img" aria-hidden="true" className={`${css.monoMark}${classes}`} style={style} />
}

/**
 * The sidebar mark occupant.
 * @param props - the sidebar's requested size plus the brand.
 * @returns the mark at the sidebar's size.
 */
export function SidebarBrandMark({ size, brand }: SidebarBrandMarkOwnerProps & InjectFace<BrandInjected>) {
  return <BrandMark size={size} brand={brand} />
}

/**
 * The sidebar name occupant: the product name as text.
 * @param props - the brand.
 * @returns the product name.
 */
export function SidebarBrandName({ brand }: SidebarBrandNameOwnerProps & InjectFace<BrandInjected>) {
  return <span className={css.name}>{brand.productName}</span>
}

/**
 * The blank-session hero mark occupant.
 * @param props - the hero's requested size and class plus the brand.
 * @returns the mark at the hero's size.
 */
export function HeroBrandMark({ size, className, brand }: HeroBrandMarkOwnerProps & InjectFace<BrandInjected>) {
  return <BrandMark size={size} className={className} brand={brand} />
}

/**
 * The running status icon occupant: the mark in the status row's own icon box,
 * pulsing while the Turn runs unless the reader prefers reduced motion.
 * @param props - the host's icon box class plus the brand.
 * @returns the mark sized by the host class.
 */
export function RunningBrandMark({ className, brand }: RunningIconOwnerProps & InjectFace<BrandInjected>) {
  return <BrandMark className={[className, css.runningMark].filter(part => part !== undefined).join(' ')} brand={brand} />
}
