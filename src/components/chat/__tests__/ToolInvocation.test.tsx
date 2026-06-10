import { test, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ToolInvocation, getToolFriendlyMessage } from "../ToolInvocation";

afterEach(() => {
  cleanup();
});

// --- getToolFriendlyMessage ---------------------------------------------

test("str_replace_editor create returns a creating message with the file name", () => {
  expect(
    getToolFriendlyMessage("str_replace_editor", {
      command: "create",
      path: "/components/Card.jsx",
    })
  ).toBe("Creating Card.jsx");
});

test("str_replace_editor view returns a viewing message", () => {
  expect(
    getToolFriendlyMessage("str_replace_editor", {
      command: "view",
      path: "/App.jsx",
    })
  ).toBe("Viewing App.jsx");
});

test("str_replace_editor str_replace and insert both report editing", () => {
  expect(
    getToolFriendlyMessage("str_replace_editor", {
      command: "str_replace",
      path: "/App.jsx",
    })
  ).toBe("Editing App.jsx");
  expect(
    getToolFriendlyMessage("str_replace_editor", {
      command: "insert",
      path: "/App.jsx",
    })
  ).toBe("Editing App.jsx");
});

test("str_replace_editor undo_edit reports undoing", () => {
  expect(
    getToolFriendlyMessage("str_replace_editor", {
      command: "undo_edit",
      path: "/App.jsx",
    })
  ).toBe("Undoing changes to App.jsx");
});

test("str_replace_editor with no args falls back to a generic editing message", () => {
  expect(getToolFriendlyMessage("str_replace_editor", {})).toBe(
    "Editing files"
  );
  expect(getToolFriendlyMessage("str_replace_editor")).toBe("Editing files");
});

test("file_manager rename reports both file names", () => {
  expect(
    getToolFriendlyMessage("file_manager", {
      command: "rename",
      path: "/Old.jsx",
      new_path: "/components/New.jsx",
    })
  ).toBe("Renaming Old.jsx to New.jsx");
});

test("file_manager delete reports the deleted file name", () => {
  expect(
    getToolFriendlyMessage("file_manager", {
      command: "delete",
      path: "/components/Card.jsx",
    })
  ).toBe("Deleting Card.jsx");
});

test("file_manager with no command falls back to a generic message", () => {
  expect(getToolFriendlyMessage("file_manager", {})).toBe("Managing files");
});

test("unknown tools fall back to the raw tool name", () => {
  expect(getToolFriendlyMessage("some_other_tool", {})).toBe("some_other_tool");
});

// --- ToolInvocation component -------------------------------------------

test("ToolInvocation renders the friendly message instead of the raw tool name", () => {
  render(
    <ToolInvocation
      toolName="str_replace_editor"
      args={{ command: "create", path: "/App.jsx" }}
      state="result"
      result="Success"
    />
  );

  expect(screen.getByText("Creating App.jsx")).toBeDefined();
  expect(screen.queryByText("str_replace_editor")).toBeNull();
});

test("ToolInvocation shows a completed indicator when the tool has a result", () => {
  const { container } = render(
    <ToolInvocation
      toolName="str_replace_editor"
      args={{ command: "create", path: "/App.jsx" }}
      state="result"
      result="Success"
    />
  );

  // Completed state renders a solid status dot, not a spinner
  expect(container.querySelector(".bg-emerald-500")).not.toBeNull();
  expect(container.querySelector(".animate-spin")).toBeNull();
});

test("ToolInvocation shows a loading spinner while the tool is running", () => {
  const { container } = render(
    <ToolInvocation
      toolName="str_replace_editor"
      args={{ command: "create", path: "/App.jsx" }}
      state="call"
    />
  );

  expect(container.querySelector(".animate-spin")).not.toBeNull();
  expect(container.querySelector(".bg-emerald-500")).toBeNull();
});
