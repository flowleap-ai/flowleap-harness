// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { sameRequest, useActRunner } from '../src/client/act-runner.ts'
import type { Act, DeadlineCheck, DeadlineId, ProposalId, TicketId } from '../src/client/api.ts'
import type { ActsResult } from '../src/client/model.ts'

const ID = '00000000-0000-4000-8000-0000000000c1' as TicketId
const DEADLINE = '00000000-0000-4000-8000-0000000000d1' as DeadlineId
const CHECK: DeadlineCheck = { id: 'none-yet', state: 'none-yet', seq: 7 }

describe('the act runner of a decision', () => {
  it('compares two commands as the request they send, whatever the order of their fields', () => {
    const approve = { proposalId: 'p-1' as ProposalId, decision: 'approve' as const }
    expect(sameRequest(
      { kind: 'ticket.decide', id: ID, reports: [approve], readings: [], deadlineCheck: CHECK },
      { deadlineCheck: { seq: 7, state: 'none-yet', id: 'none-yet' }, reports: [{ decision: 'approve', proposalId: approve.proposalId }], readings: [], id: ID, kind: 'ticket.decide' },
    )).toBe(true)
    expect(sameRequest(
      { kind: 'ticket.decide', id: ID, reports: [approve], readings: [], deadlineCheck: CHECK },
      { kind: 'ticket.decide', id: ID, reports: [approve], readings: [], deadlineCheck: { ...CHECK, seq: 8 } },
    )).toBe(false)
  })

  it('sends nothing for a retry without a failure, or for a submit while one runs', async () => {
    let answer: ((result: ActsResult) => void) | undefined
    const perform = vi.fn((_acts: readonly Act[]) => new Promise<ActsResult>((resolve) => { answer = resolve }))
    const { result } = renderHook(() => useActRunner(perform))
    expect(await result.current.retry()).toBeNull()
    let first: Promise<ActsResult | null> | undefined
    act(() => { first = result.current.submit([{ kind: 'deadline.reject', id: DEADLINE, reason: 'Wrong period' }]) })
    expect(result.current.run).toEqual({ phase: 'running' })
    expect(await result.current.submit([{ kind: 'deadline.reject', id: DEADLINE, reason: 'Other' }])).toBeNull()
    act(() => { result.current.clear() })
    expect(result.current.run).toEqual({ phase: 'running' })
    await act(async () => { answer?.({ failed: [] }) })
    expect(await first).toEqual({ failed: [] })
    expect(perform).toHaveBeenCalledOnce()
    expect(result.current.run).toEqual({ phase: 'ready' })
  })
})
