import { type FormEvent, useState } from "react";

type Props = {
  onSearch: (entryNumber: number) => void;
  onTextSearch?: (search: string) => void;
  onSubmitText?: (search: string) => void;
  placeholder?: string;
  value?: string;
};

export const PUBLIC_ENTRY_SEARCH_PLACEHOLDER = "Find by QR card #, owner, make, model, or entry #";

export function EntrySearch({
  onSearch,
  onTextSearch,
  onSubmitText,
  placeholder = "Find by QR card or entry #",
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

    if (onSubmitText) {
      setError("");
      onSubmitText(trimmed);
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
