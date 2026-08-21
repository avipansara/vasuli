const { dismissSuccessAlert } = require('./helpers/common');
const { goBack, loginToFriends, openActivity, openGroups } = require('./helpers/auth');
const {
  addFirstAvailableFriend,
  createGroup,
  openGroupDetails,
  recordExpense,
} = require('./helpers/groups');

describe('Activity and balances', () => {
  it('shows recorded activity and reflects settlement in balances', async () => {
    await loginToFriends();
    await openGroups();
    const groupName = await createGroup();
    await openGroupDetails(groupName);
    await addFirstAvailableFriend(groupName);
    const description = await recordExpense(groupName);

    await goBack();
    await waitFor(element(by.label('Create group')))
      .toBeVisible()
      .withTimeout(10000);

    await openActivity();
    await element(by.id('activity-search-input')).typeText(description);
    // The search input echoes the typed text, so match the result card by its
    // accessibility label ("${description}, by ...") instead of by.text.
    // Detox evaluates label regexes as full-string matches on iOS.
    await waitFor(element(by.label(new RegExp(`^${description}, by .*$`))))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.label('Clear activity search')).tap();

    await openGroups();
    await openGroupDetails(groupName);
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
    await waitFor(element(by.label(`${groupName}, all settled up`)))
      .toBeVisible()
      .withTimeout(15000);
  });
});
