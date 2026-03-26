const DEFAULT_ERROR_DURATION = 4200;

function describeError(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

export function showSuccessToast(showToast, { title, description = "", duration } = {}) {
  showToast({
    tone: "success",
    title,
    description,
    ...(typeof duration === "number" ? { duration } : {}),
  });
}

export function showInfoToast(showToast, { title, description = "", duration } = {}) {
  showToast({
    tone: "info",
    title,
    description,
    ...(typeof duration === "number" ? { duration } : {}),
  });
}

export function showWarningToast(showToast, { title, description = "", duration } = {}) {
  showToast({
    tone: "warning",
    title,
    description,
    ...(typeof duration === "number" ? { duration } : {}),
  });
}

export function showErrorToast(showToast, { title, error, description, duration } = {}) {
  showToast({
    tone: "error",
    title,
    description: description ?? describeError(error),
    duration: duration ?? DEFAULT_ERROR_DURATION,
  });
}
