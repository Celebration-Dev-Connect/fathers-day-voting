import { type FormEvent, useState } from "react";

type Props = {
  onSearch: (entryNumber: number) => void;
  onTextSearch?: (search: string) => void;
  placeholder?: string;
  value?: string;
};

export function EntrySearch({
  onSearch,
  onTextSearch,
  placeholder = "Find by entry # (e.g. 1001)",
  value,
}: Props) {
  const [localValue, setLocalValue] = useState("");
  const [error, setError] = useState("");
  const searchValue = value ?? localValue;

  function updateValue(nextValue: string) {
    if (value === undefined) setLocalValue(nextValue);
    onTextSearch?.(nextValue);
    setError("");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = searchValue.trim();
    const raw = trimmed.replace(/^#/, "");
    const num = parseInt(raw, 10);

    if (num > 0 && String(num) === raw) {
      setError("");
      onSearch(num);
      return;
    }

    if (onTextSearch) {
      setError("");
      onTextSearch(trimmed);
      return;
    }

    setError("Enter a valid entry number");
  }

  return (
    <form className="entry-search" onSubmit={handleSubmit}>
      <div className="entry-search-field">
        <input
          type="text"
          inputMode={onTextSearch ? "search" : "numeric"}
          placeholder={placeholder}
          value={searchValue}
          onChange={(e) => updateValue(e.target.value)}
          aria-label={onTextSearch ? "Search vehicles" : "Entry number"}
        />
        {error ? <p className="entry-search-error">{error}</p> : null}
      </div>
      <button type="submit" className="entry-search-btn">
        Find
      </button>
    </form>
  );
}
