const { dismissSuccessAlert } = require('./helpers/common');
const { goBack, loginToFriends, openActivity, openGroups } = require('./helpers/auth');
const { openGroupDetails } = require('./helpers/groups');
const { purgeFixtureRun, seedOutstandingGroup } = require('./helpers/fixtures');

afterEach(async () => {
  await purgeFixtureRun({ testKey: 'activity-settlement-balance' });
});

describe('Activity and balances', () => {
  it('records a seeded Group settlement, finds its Activity, and confirms the balance is settled', async () => {
    await loginToFriends();
    const fixture = await seedOutstandingGroup({ testKey: 'activity-settlement-balance' });
    // The fixture is inserted after login, so reload once to invalidate the
    // Groups query that may have been populated during session restoration.
    await device.reloadReactNative();

    await openGroups();
    await openGroupDetails(fixture.groupName);
    await waitFor(element(by.id('group-settle-up-button')))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id('group-settle-up-button')).tap();
    await waitFor(element(by.id('group-settle-amount-input')))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id('group-record-settlement-button')).tap();
    await waitFor(element(by.text('Success')))
      .toBeVisible()
      .withTimeout(15000);
    await dismissSuccessAlert();

    await goBack();
    await waitFor(element(by.label('Create Group')))
      .toBeVisible()
      .withTimeout(10000);

    await openActivity();
    await element(by.id('activity-search-input')).typeText(fixture.groupName);
    // The seeded Group name is unique to this run and is included in the
    // activity card label. Match the settlement amount as well so an older
    // expense or group-join record from another run cannot satisfy the check.
    const escapedGroupName = fixture.groupName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await waitFor(element(by.label(new RegExp(`^.*?, by .*, .*?, in ${escapedGroupName}, \\+\\$12\\.00$`))))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.label('Clear activity search')).tap();

    await openGroups();
    await openGroupDetails(fixture.groupName);
    const escapedGroupNameForSummary = fixture.groupName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await waitFor(element(by.label(new RegExp(`^${escapedGroupNameForSummary}, \\d+ members, All settled up, \\$0\\.00$`))))
      .toBeVisible()
      .withTimeout(15000);
  });
});
