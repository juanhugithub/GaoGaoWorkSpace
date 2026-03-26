import { render } from "@testing-library/react";
import { ToastProvider } from "../components/common/ToastProvider";

export function renderWithToast(ui) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}
