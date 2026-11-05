/**
 * A fake run Session for the agent panel: the resource state that `useResource` reads, a Session binding that marks
 * its Session, the conversation slot as a marked element, and the new chat that the composer starts.
 */
import type { ReactNode } from 'react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ResourceSnapshot } from '@deepseek-ai/dsh-client-resources/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RunSession } from '../src/client/agent-run.ts'
import type { PanelProps } from '../src/client/Panel.tsx'
import type { NewChat } from '../src/client/screens/context.ts'

/** A fake reference to a Session with the given id. */
export function fakeReference(id: string): SessionReference {
  return { sessionId: id as SessionId, release: () => {} } as Partial<SessionReference> as SessionReference
}

/**
 * The agent panel's share of the panel props over a resource state that the test sets.
 * @param initial - the first state; by default the runtime has no resource service.
 * @returns the props, the state, the addresses that the panel read, the prompts of the new chats, and the new chat
 * service, which a test sets to null for a runtime with no Session navigation.
 */
export function agentProps(initial: ResourceSnapshot<RunSession> = { status: 'none', value: undefined, failure: undefined }) {
  const resource = createSnapshotStore<ResourceSnapshot<RunSession>>(initial)
  const read = bindSnapshotSelector(resource)
  const addresses: string[] = []
  const prompts: string[] = []
  const ask = createSnapshotStore<NewChat | null>({ start: (prompt) => { prompts.push(prompt) } })
  const props: Pick<PanelProps, 'useResource' | 'SessionProvider' | 'renderSlot' | 'useAsk'> = {
    useAsk: bindSnapshotSelector(ask),
    useResource: ((address: string) => {
      addresses.push(address)
      return read(value => value)
    }) as PanelProps['useResource'],
    SessionProvider: ({ session, children }: { session?: SessionReference | undefined; children: ReactNode }) => (
      <div data-session={session?.sessionId}>{children}</div>
    ),
    renderSlot: ((key: string) => <div data-slot={key}>Conversation</div>) as PanelProps['renderSlot'],
  }
  return { props, resource, addresses, prompts, ask }
}
