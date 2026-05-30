import { Search } from "lucide-react";

export function SearchBox({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="search-box">
      <Search size={20} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
