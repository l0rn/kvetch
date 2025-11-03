import { useState, useEffect, useRef } from 'react';
import type { Trait } from "../storage/database";
import '../styles/autocomplete.css';

interface TraitAutocompleteProps {
  traits: Trait[];
  selectedTraits: { traitId: string; minCount?: number }[];
  onTraitSelect: (trait: Trait, minCount?: number) => void;
  placeholder?: string;
  allowMinCount?: boolean;
}

export function TraitAutocomplete({ 
  traits, 
  selectedTraits, 
  onTraitSelect, 
  placeholder = "Type trait name...", 
  allowMinCount = false 
}: TraitAutocompleteProps) {
  const [inputValue, setInputValue] = useState('');
  const [minCount, setMinCount] = useState(1);
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredTraits, setFilteredTraits] = useState<Trait[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter traits based on input and exclude already selected traits
  useEffect(() => {
    if (inputValue.length === 0) {
      setFilteredTraits([]);
      setShowDropdown(false);
      return;
    }

    const selectedTraitIds = new Set(selectedTraits.map(st => st.traitId));
    const filtered = traits
      .filter(trait => 
        !selectedTraitIds.has(trait.id) && 
        trait.name.toLowerCase().includes(inputValue.toLowerCase())
      )
      .slice(0, 10); // Limit to 10 suggestions

    setFilteredTraits(filtered);
    setShowDropdown(filtered.length > 0 || inputValue.trim().length > 0);
  }, [inputValue, traits, selectedTraits]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleTraitClick = (trait: Trait) => {
    onTraitSelect(trait, allowMinCount ? minCount : undefined);
    setInputValue('');
    setMinCount(1);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const handleCreateNew = () => {
    const trimmedValue = inputValue.trim();
    if (trimmedValue.length === 0) return;

    // Create a new trait object (the parent will handle actual creation)
    const newTrait: Trait = {
      id: '', // Will be set when created
      name: trimmedValue,
      createdAt: new Date().toISOString()
    };

    onTraitSelect(newTrait, allowMinCount ? minCount : undefined);
    setInputValue('');
    setMinCount(1);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const handleInputFocus = () => {
    if (inputValue.length > 0) {
      setShowDropdown(true);
    }
  };

  const handleInputBlur = (e: React.FocusEvent) => {
    // Delay hiding dropdown to allow clicks on dropdown items
    setTimeout(() => {
      if (!dropdownRef.current?.contains(e.relatedTarget as Node)) {
        setShowDropdown(false);
      }
    }, 200);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredTraits.length > 0) {
        handleTraitClick(filteredTraits[0]);
      } else if (inputValue.trim().length > 0) {
        handleCreateNew();
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="autocomplete-container">
      <div className="autocomplete-input-row">
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          className="autocomplete-input"
        />

        {allowMinCount && (
          <input
            type="number"
            min="1"
            placeholder="Min"
            value={minCount}
            onChange={(e) => setMinCount(parseInt(e.target.value) || 1)}
            className="autocomplete-min-count"
          />
        )}

        {inputValue.trim().length > 0 && (
          <button
            type="button"
            onClick={handleCreateNew}
            className="autocomplete-add-button"
          >
            Add
          </button>
        )}
      </div>

      {showDropdown && (
        <div ref={dropdownRef} className="autocomplete-dropdown">
          {filteredTraits.map(trait => (
            <div
              key={trait.id}
              onClick={() => handleTraitClick(trait)}
              className="autocomplete-item"
            >
              <span className="autocomplete-item-label">{trait.name}</span>
              <small className="autocomplete-item-hint">Select</small>
            </div>
          ))}

          {filteredTraits.length === 0 && inputValue.trim().length > 0 && (
            <div
              onClick={handleCreateNew}
              className="autocomplete-create-item"
            >
              <span>Create "{inputValue.trim()}"</span>
              <small className="autocomplete-item-hint">New trait</small>
            </div>
          )}

          {filteredTraits.length === 0 && inputValue.trim().length === 0 && (
            <div className="autocomplete-empty">
              Start typing to search or create traits...
            </div>
          )}
        </div>
      )}
    </div>
  );
}