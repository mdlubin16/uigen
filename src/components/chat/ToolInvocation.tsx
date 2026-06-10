"use client";

import { Loader2 } from "lucide-react";

interface ToolInvocationProps {
  toolName: string;
  args?: Record<string, any>;
  state?: string;
  result?: unknown;
}

function basename(path?: string): string {
  if (!path) return "file";
  const trimmed = path.replace(/\/+$/, "");
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || path;
}

/**
 * Translate a raw tool invocation into a short, human-friendly description of
 * what the assistant is doing (e.g. "Creating App.jsx" instead of
 * "str_replace_editor").
 */
export function getToolFriendlyMessage(
  toolName: string,
  args?: Record<string, any>
): string {
  const command = args?.command as string | undefined;
  const path = args?.path as string | undefined;

  if (toolName === "str_replace_editor") {
    switch (command) {
      case "create":
        return `Creating ${basename(path)}`;
      case "view":
        return `Viewing ${basename(path)}`;
      case "str_replace":
        return `Editing ${basename(path)}`;
      case "insert":
        return `Editing ${basename(path)}`;
      case "undo_edit":
        return `Undoing changes to ${basename(path)}`;
      default:
        return path ? `Editing ${basename(path)}` : "Editing files";
    }
  }

  if (toolName === "file_manager") {
    switch (command) {
      case "rename":
        return `Renaming ${basename(path)} to ${basename(
          args?.new_path as string | undefined
        )}`;
      case "delete":
        return `Deleting ${basename(path)}`;
      default:
        return "Managing files";
    }
  }

  return toolName;
}

export function ToolInvocation({
  toolName,
  args,
  state,
  result,
}: ToolInvocationProps) {
  const message = getToolFriendlyMessage(toolName, args);
  const isComplete = state === "result" && result != null;

  return (
    <div className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 bg-neutral-50 rounded-lg text-xs border border-neutral-200">
      {isComplete ? (
        <div className="w-2 h-2 rounded-full bg-emerald-500" />
      ) : (
        <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
      )}
      <span className="text-neutral-700">{message}</span>
    </div>
  );
}
