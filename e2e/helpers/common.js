async function tapAlertButton(label) {
  try {
    await element(by.text(label)).atIndex(0).tap();
  } catch {
    // The label can collide with identical content behind the modal (for
    // example swipe-action rows); fall back to the native alert action
    // buttons, where Cancel renders first and the confirm/destructive
    // action second.
    await element(by.type('UIAlertControllerActionButton')).atIndex(1).tap();
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
