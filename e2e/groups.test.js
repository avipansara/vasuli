const { loginToFriends, openGroups } = require('./helpers/auth');
const { createGroup } = require('./helpers/groups');

describe('Groups', () => {
  it('opens Groups from the native tab with the session preserved', async () => {
    await loginToFriends();
    await openGroups();
  });

  it('creates a group', async () => {
    await loginToFriends();
    await openGroups();
    const groupName = await createGroup();
    await expect(element(by.label(`${groupName}, all settled up`))).toBeVisible();
  });
});
