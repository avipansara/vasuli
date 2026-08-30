async function tapAlertButton(label) {
  try {
    await element(by.text(label)).atIndex(0).tap();
  } catch {
    // The text can collide with identical content behind the modal (for
    // example swipe-action rows). Alert action buttons expose their title as
    // the accessibility label, so retry by label before giving up.
    await element(by.label(label)).atIndex(0).tap();
  }
}

async function dismissSuccessAlert() {
  try {
    await waitFor(element(by.text('OK')))
      .toBeVisible()
      .withTimeout(3000);
    await element(by.text('OK')).tap();
  } catch {
    // Some success alerts render without buttons and pop with their screen.
  }
}

module.exports = { dismissSuccessAlert, tapAlertButton };
