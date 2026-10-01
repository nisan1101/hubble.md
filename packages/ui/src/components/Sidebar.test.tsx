// @vitest-environment happy-dom

import { act, type ComponentProps, type ReactNode, useState } from "react";
// @ts-expect-error This package does not ship @types/react-dom; the test only
// needs createRoot's render/unmount surface.
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sidebar, type SidebarFile } from "./Sidebar";

type Root = {
	render(children: ReactNode): void;
	unmount(): void;
};
type RenameFile = NonNullable<ComponentProps<typeof Sidebar>["onRenameFile"]>;

const roots: Root[] = [];

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
	act(() => {
		for (const root of roots) root.unmount();
	});
	roots.length = 0;
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

describe("Sidebar", () => {
	it("continues editing after a new note name is submitted", async () => {
		const onRenameFile = vi.fn();
		renderSidebar(<SidebarHarness onRenameFile={onRenameFile} />);

		await act(async () => newFileButton().click());
		await act(async () => {
			newNoteMenuItem().click();
			await Promise.resolve();
		});

		const input = renameInput("new-file");
		const focusTree = vi.spyOn(sidebarTree(), "focus");
		const frames: FrameRequestCallback[] = [];
		vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
			frames.push(callback);
			return frames.length;
		});
		act(() => {
			setInputValue(input, "daily-notes");
			input.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
			);
		});
		act(() => {
			for (const frame of frames) frame(0);
		});

		expect(onRenameFile).toHaveBeenCalledWith(
			"/workspace/new-file.md",
			"daily-notes",
			{ origin: "new-note", commit: "enter" },
		);
		expect(focusTree).not.toHaveBeenCalled();
	});

	it.each([
		"right-click",
		"actions button",
	])("copies a compacted folder path from the %s menu", async (openWith) => {
		const onCopyFolderPath = vi.fn();
		renderSidebar(
			<Sidebar
				files={[]}
				folders={[{ path: "/workspace/examples/list-tables" }]}
				currentPath={null}
				sortMode="alpha"
				getDisplayPath={(path) => path.replace("/workspace/", "")}
				onSortModeChange={() => {}}
				onSelectFile={() => {}}
				onCopyFolderPath={onCopyFolderPath}
			/>,
		);

		const trigger = document.querySelector<HTMLButtonElement>(
			'button[aria-label="Actions for examples/list-tables"]',
		);
		expect(trigger).not.toBeNull();
		await act(async () => {
			if (openWith === "right-click") {
				trigger
					?.closest('[role="treeitem"]')
					?.dispatchEvent(
						new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
					);
			} else {
				trigger?.click();
			}
		});
		const item = menuItem("Copy folder path");
		expect(item).toBeDefined();
		await act(async () => item?.click());

		expect(onCopyFolderPath).toHaveBeenCalledExactlyOnceWith(
			"examples/list-tables/",
		);
	});

	it("omits folder path copying when the host does not provide it", async () => {
		renderSidebar(
			<Sidebar
				files={[]}
				folders={[{ path: "empty" }]}
				currentPath={null}
				sortMode="alpha"
				onSortModeChange={() => {}}
				onSelectFile={() => {}}
				onRevealFolder={() => {}}
			/>,
		);
		await act(async () => {
			document
				.querySelector<HTMLButtonElement>(
					'button[aria-label="Actions for empty"]',
				)
				?.click();
		});

		expect(menuItem("Reveal in File Manager")).toBeDefined();
		expect(menuItem("Copy folder path")).toBeUndefined();
	});
});

function renderSidebar(children: ReactNode) {
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	roots.push(root);
	act(() => root.render(children));
}

function menuItem(label: string) {
	return Array.from(
		document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
	).find((element) => element.textContent?.includes(label));
}

function SidebarHarness({ onRenameFile }: { onRenameFile: RenameFile }) {
	const [files, setFiles] = useState<SidebarFile[]>([]);
	return (
		<Sidebar
			files={files}
			currentPath={null}
			sortMode="alpha"
			getDisplayPath={(path) => path.replace("/workspace/", "")}
			onSortModeChange={() => {}}
			onSelectFile={() => {}}
			onRenameFile={onRenameFile}
			onCreateFile={async () => {
				const path = "/workspace/new-file.md";
				setFiles([{ path, modifiedAt: 1 }]);
				return path;
			}}
		/>
	);
}

function newFileButton() {
	const button = document.querySelector<HTMLButtonElement>(
		'button[aria-label="New file"]',
	);
	if (!button) throw new Error("Missing new file button");
	return button;
}

function newNoteMenuItem() {
	const item = Array.from(
		document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
	).find((element) => element.textContent?.includes("New Note"));
	if (!item) throw new Error("Missing New Note menu item");
	return item;
}

function sidebarTree() {
	const tree = document.querySelector<HTMLElement>('[role="tree"]');
	if (!tree) throw new Error("Missing sidebar tree");
	return tree;
}

function renameInput(value: string) {
	const input = Array.from(
		document.querySelectorAll<HTMLInputElement>("input"),
	).find((element) => element.value === value);
	if (!input) throw new Error("Missing rename input");
	return input;
}

function setInputValue(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(
		HTMLInputElement.prototype,
		"value",
	)?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}
