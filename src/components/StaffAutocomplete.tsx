import { useState, useEffect, useRef } from 'react';
import type { StaffMember, Trait } from "../storage/database";

interface StaffAutocompleteProps {
  staff: StaffMember[];
  traits: Trait[];
  selectedStaffIds: string[];
  onStaffSelect: (staffMember: StaffMember) => void;
  placeholder?: string;
}

export function StaffAutocomplete({ 
  staff, 
  traits,
  selectedStaffIds, 
  onStaffSelect, 
  placeholder = "Type staff name..." 
}: StaffAutocompleteProps) {
  const [inputValue, setInputValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredStaff, setFilteredStaff] = useState<StaffMember[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Create a map of trait IDs to names for display
  const traitMap = new Map(traits.map(trait => [trait.id, trait.name]));

  // Filter staff based on input and exclude already selected staff
  useEffect(() => {
    if (inputValue.length === 0) {
      setFilteredStaff([]);
      setShowDropdown(false);
      return;
    }

    const selectedStaffSet = new Set(selectedStaffIds);
    const filtered = staff
      .filter(member => 
        !selectedStaffSet.has(member.id) && 
        member.name.toLowerCase().includes(inputValue.toLowerCase())
      )
      .slice(0, 10); // Limit to 10 suggestions

    setFilteredStaff(filtered);
    setShowDropdown(filtered.length > 0);
  }, [inputValue, staff, selectedStaffIds]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleStaffClick = (staffMember: StaffMember) => {
    onStaffSelect(staffMember);
    setInputValue('');
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
      if (filteredStaff.length > 0) {
        handleStaffClick(filteredStaff[0]);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      inputRef.current?.blur();
    }
  };

  const getStaffTraitNames = (staffMember: StaffMember): string => {
    return staffMember.traitIds
      .map(traitId => traitMap.get(traitId) || 'Unknown')
      .join(', ');
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
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
          width: '100%', 
          padding: '8px', 
          border: '1px solid #ddd', 
          borderRadius: '4px',
          fontSize: '14px'
        }}
      />

      {showDropdown && (
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            backgroundColor: 'white',
            border: '1px solid #ddd',
            borderRadius: '4px',
            maxHeight: '200px',
            overflowY: 'auto',
            zIndex: 1000,
            marginTop: '2px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          {filteredStaff.map(staffMember => (
            <div
              key={staffMember.id}
              onClick={() => handleStaffClick(staffMember)}
              style={{
                padding: '10px',
                cursor: 'pointer',
                borderBottom: '1px solid #f0f0f0',
                fontSize: '14px'
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.backgroundColor = '#f8f9fa';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.backgroundColor = 'white';
              }}
            >
              <div style={{ fontWeight: 'bold' }}>{staffMember.name}</div>
              {staffMember.traitIds.length > 0 && (
                <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                  Traits: {getStaffTraitNames(staffMember)}
                </div>
              )}
            </div>
          ))}
          
          {filteredStaff.length === 0 && inputValue.trim().length > 0 && (
            <div style={{ padding: '10px', color: '#666', fontSize: '14px', textAlign: 'center' }}>
              No matching staff members found
            </div>
          )}
        </div>
      )}
    </div>
  );
}