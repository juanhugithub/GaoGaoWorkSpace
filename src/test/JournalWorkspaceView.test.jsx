import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { JOURNAL_CATEGORIES } from "../app/constants";
import JournalWorkspaceView from "../components/journal/JournalWorkspaceView";
import { renderWithToast } from "./renderWithToast";

const journalApi = vi.hoisted(() => ({
  createJournalForDate: vi.fn(),
  createTodayJournal: vi.fn(),
  exportJournalsMarkdown: vi.fn(),
  getJournalDetail: vi.fn(),
  listJournals: vi.fn(),
  saveJournal: vi.fn(),
}));

vi.mock("../lib/journal", () => journalApi);

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
}));

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function createJournalDetail() {
  const primaryCategory = JOURNAL_CATEGORIES[0];
  const tasks = JOURNAL_CATEGORIES.reduce(
    (result, category) => ({
      ...result,
      [category]:
        category === primaryCategory
          ? [
              {
                id: "task-1",
                content: "准备项目申报",
                contact: "",
                deadline: "",
                progress: "进行中",
                priority: "中",
                remark: "",
                carriedOverFromTaskId: null,
                carriedOverFromDate: null,
                checklistItems: [
                  { id: "check-1", text: "准备资料", isCompleted: false },
                  { id: "check-2", text: "提交复核", isCompleted: false },
                ],
              },
            ]
          : [],
    }),
    {},
  );

  return {
    id: "journal-1",
    journalDate: "2026-03-24",
    date: "2026-03-24",
    weekday: "周二",
    review: "",
    tasks,
  };
}

beforeEach(() => {
  let currentDetail = createJournalDetail();

  journalApi.listJournals.mockResolvedValue([
    {
      id: "journal-1",
      journalDate: "2026-03-24",
      date: "2026-03-24",
      weekday: "周二",
    },
  ]);
  journalApi.getJournalDetail.mockImplementation(async () => cloneValue(currentDetail));
  journalApi.createTodayJournal.mockResolvedValue(cloneValue(currentDetail));
  journalApi.createJournalForDate.mockResolvedValue(cloneValue(currentDetail));
  journalApi.exportJournalsMarkdown.mockResolvedValue({
    filePath: "D:/CodexProject/GaoGaoV2/tmp/export.md",
    markdown: "",
  });
  journalApi.saveJournal.mockImplementation(async (journal) => {
    currentDetail = {
      ...currentDetail,
      id: journal.id,
      review: journal.review,
      tasks: cloneValue(journal.tasks),
    };
    return cloneValue(currentDetail);
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

test("persists checklist drag order after saving and reloading", async () => {
  const user = userEvent.setup();
  const view = renderWithToast(<JournalWorkspaceView />);

  await screen.findByText("2026-03-24");
  await waitFor(() => {
    expect(journalApi.getJournalDetail).toHaveBeenCalledWith("journal-1");
  });

  await user.click(screen.getByRole("button", { name: /清单/ }));
  await screen.findByText("Checklist 过程管理");

  expect(
    screen.getAllByPlaceholderText("输入一个可执行的检查步骤...").map((input) => input.value),
  ).toEqual(["准备资料", "提交复核"]);

  const dataTransfer = {
    effectAllowed: "",
    setData: vi.fn(),
    getData: vi.fn(),
  };

  fireEvent.dragStart(screen.getAllByTitle("拖拽排序")[0], { dataTransfer });
  fireEvent.dragOver(screen.getByText("拖到这里可移动到末尾"), { dataTransfer });
  fireEvent.drop(screen.getByText("拖到这里可移动到末尾"), { dataTransfer });
  fireEvent.dragEnd(screen.getAllByTitle("拖拽排序")[0], { dataTransfer });

  expect(
    screen.getAllByPlaceholderText("输入一个可执行的检查步骤...").map((input) => input.value),
  ).toEqual(["提交复核", "准备资料"]);

  await user.click(screen.getByRole("button", { name: "完成" }));
  await user.click(screen.getByRole("button", { name: "保存当前进度" }));

  await waitFor(() => {
    expect(journalApi.saveJournal).toHaveBeenCalledTimes(1);
  });

  expect(
    journalApi.saveJournal.mock.calls[0][0].tasks[JOURNAL_CATEGORIES[0]][0].checklistItems.map(
      (item) => item.text,
    ),
  ).toEqual(["提交复核", "准备资料"]);
  await screen.findByText("当前进度已保存");

  view.unmount();
  renderWithToast(<JournalWorkspaceView />);

  await screen.findByText("2026-03-24");
  await user.click(screen.getByRole("button", { name: /清单/ }));

  expect(
    await screen.findAllByPlaceholderText("输入一个可执行的检查步骤...").then((inputs) =>
      inputs.map((input) => input.value),
    ),
  ).toEqual(["提交复核", "准备资料"]);
});
