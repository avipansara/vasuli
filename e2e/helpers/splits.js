// The percentage pill renders the compact label 'Percent' rather than the
// SPLIT_METHODS label 'Percentage' (see compactLabel in app/add-expense.tsx).
const SPLIT_METHOD_PILL_TEXT = {
  Equal: 'Equal',
  Unequal: 'Unequal',
  Percentage: 'Percent',
  Shares: 'Shares',
};

const { dismissSuccessAlert } = require('./common');

async function openGroupExpenseForm() {
  await element(by.label('Add expense')).tap();
  await waitFor(element(by.id('expense-amount-input')))
    .toBeVisible()
    .withTimeout(10000);
}

async function fillExpenseDescription(description) {
  await element(by.id('expense-description-input')).tap();
  await element(by.id('expense-description-input')).typeText(description);
  await dismissExpenseKeyboard();
}

async function dismissExpenseKeyboard() {
  const dismiss = element(by.id('keyboard-dismiss-button'));
  await waitFor(dismiss).toBeVisible().withTimeout(5000);
  await dismiss.tap();
}

async function openSplitEditor() {
  await element(by.id('expense-split-button')).tap();
}

async function applySplit() {
  await element(by.text('Apply split')).tap();
}

async function selectSplitMethod(label) {
  await openSplitEditor();
  const pill = element(by.text(SPLIT_METHOD_PILL_TEXT[label]));
  await waitFor(pill).toBeVisible().withTimeout(5000);
  await pill.tap();
}

async function fillCustomSplit(youValue, participantValue) {
  await element(by.id('expense-split-scroll')).scrollTo('bottom');
  await element(by.id('custom-split-you-input')).replaceText(youValue);
  await element(by.id('custom-split-participant-input')).atIndex(0).replaceText(participantValue);
  await applySplit();
}

async function submitExpense(groupName) {
  await element(by.id('add-expense-submit-button')).tap();
  await waitFor(element(by.text(groupName)))
    .toBeVisible()
    .withTimeout(10000);
  await dismissSuccessAlert();
}

module.exports = {
  applySplit,
  dismissExpenseKeyboard,
  openSplitEditor,
  fillCustomSplit,
  fillExpenseDescription,
  openGroupExpenseForm,
  selectSplitMethod,
  submitExpense,
};
