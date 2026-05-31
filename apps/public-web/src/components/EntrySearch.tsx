import { type FormEvent, useState } from "react";

type Props = {
  onSearch: (entryNumber: number) => void;
};

export function EntrySearch({ onSearch }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const raw = value.trim().replace(/^#/, "");
    const num = parseInt(raw, 10);
    if (!num || num <= 0) {
      setError("Enter a valid entry number");
      return;
    }
    setError("");
    onSearch(num);
  }

  return (
    <form className="entry-search" onSubmit={handleSubmit}>
      <div className="entry-search-field">
        <input
          type="text"
          inputMode="numeric"
          placeholder="Find by entry # (e.g. 1001)"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
          aria-label="Entry number"
        />
        {error ? <p className="entry-search-error">{error}</p> : null}
      </div>
      <button type="submit" className="entry-search-btn">
        Find
      </button>
    </form>
  );
}
