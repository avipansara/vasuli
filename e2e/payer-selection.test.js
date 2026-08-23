const { goBack, loginToFriends, openFriends, openGroups } = require('./helpers/auth');
const {
  addFirstAvailableFriend,
  createGroup,
  openFriendDetail,
  openGroupDetails,
} = require('./helpers/groups');

describe('Payer selection', () => {
  it('records an expense paid by the friend and flips the balance direction', async () => {
    await loginToFriends();
    await openGroups();
    const groupName = await createGroup();
    await openGroupDetails(groupName);
    const friendName = await addFirstAvailableFriend(groupName);
    if (!friendName) {
      throw new Error(
        'Payer selection E2E requires at least one accepted friend for the configured development test account.',
      );
    }

    await element(by.label('Add expense')).tap();
    await element(by.label(`Select group ${groupName}`)).tap();
    await element(by.id('add-expense-next-button')).tap();
    await waitFor(element(by.id('expense-amount-input')))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id('expense-amount-input')).replaceText('9.00');
    await element(by.id('expense-description-input')).typeText(`Detox Payer ${Date.now()}`);
    await element(by.label(`Paid by ${friendName}`)).tap();
    await element(by.id('add-expense-submit-button')).tap();
    await waitFor(element(by.text(groupName)))
      .toBeVisible()
      .withTimeout(10000);

    await goBack();
    await waitFor(element(by.label('Create group')))
      .toBeVisible()
      .withTimeout(10000);
    await openFriends();
    await openFriendDetail(friendName);

    await waitFor(element(by.text(`YOU OWE ${friendName.split(' ')[0].toUpperCase()}`)))
      .toBeVisible()
      .withTimeout(15000);
  });
});
