const { loginToFriends, openGroups } = require('./helpers/auth');
const {
  createGroup,
  deleteExpenseFromDetail,
  deleteGroupFromDetails,
  editExpenseAmount,
  openExpenseDetail,
  openGroupDetails,
  recordExpense,
  renameGroupFromList,
} = require('./helpers/groups');

describe('Smoke journey', () => {
  it('authenticates and completes the Group and Expense lifecycles', async () => {
    await loginToFriends();
    // Authenticated launch has one known route; do not infer it from a tab
    // timeout or proceed while the session restore is still in flight.
    await expect(element(by.id('friends-screen'))).toBeVisible();

    await openGroups();
    const groupName = await createGroup(`Detox Group Smoke ${Date.now()}`);
    const renamedGroupName = `${groupName} renamed`;
    await renameGroupFromList(groupName, renamedGroupName);

    await openGroupDetails(renamedGroupName);
    const description = await recordExpense(renamedGroupName);
    await openExpenseDetail(description);
    await editExpenseAmount('24.50');
    await waitFor(element(by.text('$24.50')).atIndex(0))
      .toBeVisible()
      .withTimeout(15000);
    await deleteExpenseFromDetail(description);

    await deleteGroupFromDetails(renamedGroupName);
    await expect(element(by.label(`Restore ${renamedGroupName}`))).toBeVisible();
  }, 600000);
});
