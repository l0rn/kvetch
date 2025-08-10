import { useState, useEffect, useRef } from 'react';
import type { Trait } from "../storage/database";

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
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          style={{ 
            flex: 1, 
            padding: '8px', 
            border: '1px solid var(--accent-gray)', 
            borderRadius: '4px',
            fontSize: '14px'
          }}
        />
        
        {allowMinCount && (
          <input
            type="number"
            min="1"
            placeholder="Min"
            value={minCount}
            onChange={(e) => setMinCount(parseInt(e.target.value) || 1)}
            style={{ 
              width: '60px', 
              padding: '8px', 
              border: '1px solid var(--accent-gray)', 
              borderRadius: '4px',
              fontSize: '14px'
            }}
          />
        )}

        {inputValue.trim().length > 0 && (
          <button 
            type="button" 
            onClick={handleCreateNew}
            style={{ 
              padding: '8px 12px', 
              backgroundColor: '#28a745', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Add
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            backgroundColor: 'white',
            border: '1px solid var(--accent-gray)',
            borderRadius: '4px',
            maxHeight: '200px',
            overflowY: 'auto',
            zIndex: 1000,
            marginTop: '2px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          {filteredTraits.map(trait => (
            <div
              key={trait.id}
              onClick={() => handleTraitClick(trait)}
              style={{
                padding: '10px',
                cursor: 'pointer',
                borderBottom: '1px solid #f0f0f0',
                fontSize: '14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.backgroundColor = '#f8f9fa';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.backgroundColor = 'white';
              }}
            >
              <span>{trait.name}</span>
              <small style={{ color: '#666' }}>Select</small>
            </div>
          ))}
          
          {filteredTraits.length === 0 && inputValue.trim().length > 0 && (
            <div
              onClick={handleCreateNew}
              style={{
                padding: '10px',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#28a745',
                fontWeight: 'bold',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.backgroundColor = '#f8f9fa';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.backgroundColor = 'white';
              }}
            >
              <span>Create "{inputValue.trim()}"</span>
              <small style={{ color: '#666' }}>New trait</small>
            </div>
          )}

          {filteredTraits.length === 0 && inputValue.trim().length === 0 && (
            <div style={{ padding: '10px', color: '#666', fontSize: '14px', textAlign: 'center' }}>
              Start typing to search or create traits...
            </div>
          )}
        </div>
      )}
    </div>
  );
}