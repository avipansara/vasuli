// The percentage pill renders the compact label 'Percent' rather than the
// SPLIT_METHODS label 'Percentage' (see compactLabel in app/add-expense.tsx).
const SPLIT_METHOD_PILL_TEXT = {
  Equal: 'Equal',
  Unequal: 'Unequal',
  Percentage: 'Percent',
  Shares: 'Shares',
};

const { dismissSuccessAlert } = require('./common');

async function openGroupExpenseForm(groupName) {
  await element(by.label('Add expense')).tap();
  await element(by.label(`Select group ${groupName}`)).tap();
  await element(by.id('add-expense-next-button')).tap();
  await waitFor(element(by.id('expense-amount-input')))
    .toBeVisible()
    .withTimeout(10000);
}

async function selectSplitMethod(label) {
  // The method pills sit below the fold. The keyboard-dismiss-button is
  // unreliable after typing into the description field, so scroll instead —
  // KeyboardAvoidingView padding keeps scrolled content above the keyboard.
  await element(by.id('expense-form-scroll')).scrollTo('bottom');
  const pillText = SPLIT_METHOD_PILL_TEXT[label] || label;
  const pill = element(by.text(pillText));
  await waitFor(pill).toBeVisible().withTimeout(5000);
  await pill.tap();
}

async function fillCustomSplit(youValue, participantValue) {
  // The custom split cards mount below the method pills; scroll to bring them into view.
  await element(by.id('expense-form-scroll')).scrollTo('bottom');
  await waitFor(element(by.id('custom-split-you-input')))
    .toBeVisible()
    .withTimeout(5000);
  await element(by.id('custom-split-you-input')).replaceText(youValue);

  const participantInput = element(by.id('custom-split-participant-input')).atIndex(0);
  await waitFor(participantInput).toBeVisible().withTimeout(5000);
  await participantInput.replaceText(participantValue);
}

async function submitExpense(groupName) {
  await element(by.id('add-expense-submit-button')).tap();
  await waitFor(element(by.text(groupName)))
    .toBeVisible()
    .withTimeout(10000);
  await dismissSuccessAlert();
}

module.exports = {
  fillCustomSplit,
  openGroupExpenseForm,
  selectSplitMethod,
  submitExpense,
};
