const { loginToFriends, openGroups } = require('./helpers/auth');
const { createGroup, deleteGroupFromDetails, renameGroupFromList } = require('./helpers/groups');

describe('Group management', () => {
  it('renames a group from the list and deletes it from its details', async () => {
    await loginToFriends();
    await openGroups();
    const groupName = await createGroup();
    const renamedGroupName = `${groupName} renamed`;

    await renameGroupFromList(groupName, renamedGroupName);
    await deleteGroupFromDetails(renamedGroupName);

    await waitFor(element(by.label('Create Group')))
      .toBeVisible()
      .withTimeout(10000);
  });
});
