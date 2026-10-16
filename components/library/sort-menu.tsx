"use client";

import { ArrowDownWideNarrow } from "lucide-react";
import { SelectMenu } from "@/components/ui/select-menu";
import { LIBRARY_SORTS, type LibrarySort } from "@/lib/queries/library";

/** "Recently added ▾" button opening a single-select listbox. */
export function SortMenu({ value, onChange }: { value: LibrarySort; onChange: (sort: LibrarySort) => void }) {
  return (
    <SelectMenu
      value={value}
      options={LIBRARY_SORTS}
      onChange={onChange}
      label="Sort by"
      icon={<ArrowDownWideNarrow className="size-4 text-text-secondary" aria-hidden="true" />}
    />
  );
}
