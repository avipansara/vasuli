const { loginToFriends, openGroups } = require('./helpers/auth');
const { openGroupDetails } = require('./helpers/groups');
const { purgeFixtureRun, seedGroupMembership } = require('./helpers/fixtures');
const { openGroupExpenseForm } = require('./helpers/splits');
const { expect: jestExpect } = require('@jest/globals');

afterEach(async () => {
  await purgeFixtureRun({ testKey: 'recurring-expense-creation' });
});

describe('Recurring expense creation review', () => {
  it('keeps one-time Add as the default and requires You before opening review', async () => {
    await loginToFriends();
    const fixture = await seedGroupMembership({ testKey: 'recurring-expense-creation' });
    await device.reloadReactNative();
    await openGroups();
    await openGroupDetails(fixture.groupName);

    await openGroupExpenseForm(fixture.groupName);
    await element(by.id('expense-amount-input')).replaceText('120.00');
    // Dismiss the numeric keyboard before scrolling: on iOS 27 a default-start
    // swipe can begin on the hardware keyboard's accessory toolbar.
    await waitFor(element(by.id('keyboard-dismiss-button'))).toBeVisible().withTimeout(5000);
    await element(by.id('keyboard-dismiss-button')).tap();
    await waitFor(element(by.id('expense-description-input'))).toBeVisible().withTimeout(5000);
    await element(by.id('expense-description-input')).tap();
    await element(by.id('expense-description-input')).typeText(`Detox recurring review ${Date.now()}`);
    await waitFor(element(by.id('keyboard-dismiss-button'))).toBeVisible().withTimeout(5000);
    await element(by.id('keyboard-dismiss-button')).tap();
    await element(by.id('expense-form-scroll')).scrollTo('bottom');
    await expect(element(by.id('expense-repeat-none'))).toBeVisible();
    await expect(element(by.label('Add expense'))).toBeVisible();
    const formScreenshot = await device.takeScreenshot(`recurring-expense-form-${process.env.E2E_APPEARANCE || 'light'}`);
    console.log(`[ticket07] form screenshot: ${formScreenshot}`);
    await element(by.id('expense-repeat-monthly')).tap();
    await element(by.id('expense-form-scroll')).scrollTo('top');
    await element(by.label(`Paid by ${fixture.friendName}`)).tap();
    const recurringReviewAction = element(by.id('add-expense-submit-button'));
    await expect(recurringReviewAction).toBeVisible();
    jestExpect((await recurringReviewAction.getAttributes()).enabled).toBe(false);
    await expect(element(by.id('recurring-expense-review-sheet'))).toBeNotVisible();

    await element(by.label('Paid by you')).tap();
    await element(by.id('expense-form-scroll')).scrollTo('bottom');
    await element(by.label('Last due date, No end date')).tap();
    await expect(element(by.id('expense-last-due-picker'))).toBeVisible();
    await element(by.label('Last due date, No end date')).tap();
    await element(by.label('Review recurring expense')).tap();

    await waitFor(element(by.id('recurring-expense-review-sheet'))).toBeVisible().withTimeout(5000);
    const reviewScreenshot = await device.takeScreenshot(`recurring-expense-review-${process.env.E2E_APPEARANCE || 'light'}`);
    console.log(`[ticket07] review screenshot: ${reviewScreenshot}`);
    await expect(element(by.id('recurring-payment-warning'))).toBeVisible();
    await expect(element(by.text('Save recurring expense'))).toBeVisible();
    await element(by.id('recurring-review-cancel')).tap();
    await expect(element(by.id('recurring-expense-review-sheet'))).toBeNotVisible();
  }, 60000);
});
