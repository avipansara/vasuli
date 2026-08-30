const { loginToFriends, openGroups } = require('./helpers/auth');
const {
  createGroup,
  deleteExpenseFromDetail,
  editExpenseAmount,
  openExpenseDetail,
  openGroupDetails,
  recordExpense,
} = require('./helpers/groups');

describe('Expense lifecycle', () => {
  it('edits and deletes an expense from its detail screen', async () => {
    await loginToFriends();
    await openGroups();
    const groupName = await createGroup();
    await openGroupDetails(groupName);
    const description = await recordExpense(groupName);

    await openExpenseDetail(description);
    await editExpenseAmount('24.50');
    await waitFor(element(by.text('$24.50')).atIndex(0))
      .toBeVisible()
      .withTimeout(15000);

    await deleteExpenseFromDetail(description);
  });
});
