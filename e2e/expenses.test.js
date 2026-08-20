const { loginToFriends } = require('./helpers/auth');
const { createGroupWithExpense, openGroupDetails } = require('./helpers/groups');

describe('Expenses', () => {
  it('creates a group and records an expense', async () => {
    await loginToFriends();
    const { groupName, expenseDescription } = await createGroupWithExpense();
    await openGroupDetails(groupName);
    await expect(element(by.text(expenseDescription))).toBeVisible();
  });
});
