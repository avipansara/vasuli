import { describe, expect, it } from 'vitest'
import type { CaptureEvent } from '@posthog/core'

import { filterOutboundEvent } from '@/lib/analytics/outbound-filter'

describe('filterOutboundEvent', () => {
  it('passes an approved product event with approved properties', () => {
    const out = filterOutboundEvent({
      event: 'expense created',
      properties: {
        platform: 'ios',
        app_version: '1.2.3',
        group_key: 'b'.repeat(64),
        group_size_bucket: '3-5',
        expense_input_method: 'manual',
        currency_code: 'USD',
      },
      uuid: 'uuid-1',
      timestamp: new Date('2026-09-09T00:00:00.000Z'),
    })
    expect(out?.event).toBe('expense created')
    expect(out?.properties).toMatchObject({ currency_code: 'USD' })
    expect(out?.timestamp).toEqual(new Date('2026-09-09T00:00:00.000Z'))
  })

  it('drops every automatic PostHog event', () => {
    for (const event of ['$screen', '$autocapture', '$feature_flag_called', 'Application Opened']) {
      expect(filterOutboundEvent({ event, properties: {} })).toBeNull()
    }
  })

  it('strips unapproved SDK-enriched properties while keeping approved context', () => {
    const out = filterOutboundEvent({
      event: 'group viewed',
      properties: {
        platform: 'android',
        $screen_name: 'GroupDetail',
        $current_url: 'vasuli://groups/secret-id',
        $geoip_country_code: 'US',
        group_key: 'c'.repeat(64),
      },
    })
    expect(out?.properties).toMatchObject({ platform: 'android' })
    expect(out?.properties).not.toHaveProperty('$screen_name')
    expect(out?.properties).not.toHaveProperty('$current_url')
    expect(out?.properties).not.toHaveProperty('$geoip_country_code')
  })

  it('drops events carrying raw UUIDs, free text, or sensitive keys', () => {
    const rawGroupId = '11111111-1111-4111-8111-111111111111'
    expect(
      filterOutboundEvent({
        event: 'expense created',
        properties: { group_key: rawGroupId },
      }),
    ).toBeNull()
    expect(
      filterOutboundEvent({
        event: 'expense created',
        properties: { description: 'Dinner with friends' } as CaptureEvent['properties'],
      }),
    ).toBeNull()
    expect(
      filterOutboundEvent({
        event: 'expense created',
        properties: { email: 'user@example.com' } as CaptureEvent['properties'],
      }),
    ).toBeNull()
  })

  it('keeps EAS-owned UUID release context on SDK-enriched events', () => {
    // Regression: eas_project_id / eas_update_id are UUID-shaped by
    // definition. The raw-UUID guard must not drop events carrying them —
    // on real EAS builds that is every event.
    const out = filterOutboundEvent({
      event: 'group viewed',
      properties: {
        group_key: 'c'.repeat(64),
        platform: 'ios',
        app_version: '1.0.20',
        eas_project_id: '51957bab-a534-404f-b0da-978906d3a9b0',
        eas_update_id: 'd21e81e3-e11c-419c-acc4-303ae83e47ce',
        eas_runtime_version: '1.0.20',
        eas_account: 'avi.pansara',
        $lib: 'posthog-react-native',
        $lib_version: '4.68.4',
        $app_build: '20',
        $device_type: 'Mobile',
        $os_name: 'iOS',
        $os_version: '18.6.2',
        $is_emulator: true,
        $session_id: 'abc123session',
        $process_person_profile: true,
      },
      uuid: 'uuid-3',
      timestamp: new Date('2026-09-09T20:34:27.000Z'),
    })
    expect(out?.event).toBe('group viewed')
    expect(out?.properties).toMatchObject({
      eas_project_id: '51957bab-a534-404f-b0da-978906d3a9b0',
      eas_update_id: 'd21e81e3-e11c-419c-acc4-303ae83e47ce',
      group_key: 'c'.repeat(64),
    })
  })

  it('accepts the real CaptureEvent hook shape without a top-level distinct ID', () => {
    const timestamp = new Date('2026-09-09T00:00:00.000Z')
    const captureEvent: CaptureEvent = {
      event: 'expense created',
      properties: { platform: 'ios' },
      uuid: 'uuid-2',
      timestamp,
    }

    const out = filterOutboundEvent(captureEvent)

    expect(out).toEqual({
      event: 'expense created',
      properties: { platform: 'ios' },
      uuid: 'uuid-2',
      timestamp,
    })
  })

  it('preserves the privacy-safe invite type dimension', () => {
    const out = filterOutboundEvent({
      event: 'invite accepted',
      properties: { invite_type: 'friend_request' },
    } as CaptureEvent)

    expect(out?.properties).toEqual({ invite_type: 'friend_request' })
  })
})
