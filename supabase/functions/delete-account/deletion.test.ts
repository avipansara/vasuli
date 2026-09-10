import { describe, expect, it } from 'vitest'
import { buildDistinctIdInput, parseProjectIdList, posthogDeleteUrl } from './deletion'

describe('delete-account analytics helpers', () => {
  it('uses the same domain-separated identity input as the client', () => {
    expect(buildDistinctIdInput(' user-123 ')).toBe('vasuli-analytics-distinct-id/v1:user-123')
  })

  it('parses configured project IDs and builds safe deletion URLs', () => {
    expect(parseProjectIdList('111, 222')).toEqual(['111', '222'])
    expect(posthogDeleteUrl('https://us.i.posthog.com/', 'a/b')).toBe(
      'https://us.i.posthog.com/api/projects/a%2Fb/persons/bulk_delete/',
    )
  })
})
