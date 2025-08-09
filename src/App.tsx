import { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Database } from './storage/database-pouchdb';
import type { Shift, StaffMember, ShiftOccurrence, Trait } from './storage/database-pouchdb';
import { generateShiftOccurrences } from './utils/recurrence';
import { ConstraintEngine, type ConstraintContext } from './utils/constraints';
import { ShiftsView } from './components/views/ShiftsView';
import { StaffView } from './components/views/StaffView';
import { WeeklyPlanningView } from './components/views/WeeklyPlanningView';
import { ShiftOccurrenceForm } from './components/forms/ShiftOccurrenceForm';
import { Modal } from './components/Modal';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { HamburgerMenu } from './components/HamburgerMenu';
import { ToastContainer } from './components/Toast';
import { useToast } from './hooks/useToast';
import './i18n';
import './App.css';
import { setDefaultOptions } from 'date-fns';

function App() {
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { toasts, removeToast, addToast } = useToast();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shiftOccurrences, setShiftOccurrences] = useState<ShiftOccurrence[]>([]);
  const [allTraits, setAllTraits] = useState<Trait[]>([]);
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [showOccurrenceForm, setShowOccurrenceForm] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [editingOccurrence, setEditingOccurrence] = useState<ShiftOccurrence | null>(null);

  const language= i18n.language || 'en';
  
  setDefaultOptions({ weekStartsOn: 1 }); // Set Monday as the first day of the week
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [shiftsData, staffData, occurrencesData, traitsData] = await Promise.all([
      Database.getShifts(),
      Database.getStaffMembers(),
      Database.getShiftOccurrences(),
      Database.getTraits()
    ]);
    setShifts(shiftsData);
    setStaff(staffData);
    setAllTraits(traitsData);
    
    // Generate all shift occurrences from shifts and merge with stored modifications
    const generatedOccurrences = shiftsData.flatMap(shift => generateShiftOccurrences(shift));
    const storedOccurrenceMap = new Map(occurrencesData.map(occ => [occ.id, occ]));
    
    // Merge generated occurrences with stored modifications
    const finalOccurrences = generatedOccurrences.map(generated => {
      const stored = storedOccurrenceMap.get(generated.id);
      return stored || generated;
    }).filter(occ => !occ.isDeleted);
    
    setShiftOccurrences(finalOccurrences);
  };

  const handleSaveShift = async (shiftData: Partial<Shift>, isDestructive: boolean = false) => {
    const newShift: Shift = {
      ...shiftData,
      id: editingShift?.id || `${shiftData.name}-${new Date(shiftData.startDateTime!).getTime()}`,
    } as Shift;
    // If this is a destructive change, delete all existing occurrences first
    if (isDestructive && editingShift?.id) {
      await Database.deleteShiftOccurrencesByParent(editingShift.id);
    }
    await Database.saveShift(newShift);
    await loadData();
    setShowShiftForm(false);
    setEditingShift(null);
  };

  const handleEditShift = (shift: Shift) => {
    setEditingShift(shift);
    setShowShiftForm(true);
  };

  const handleDeleteShift = async (shiftId: string) => {
    await Database.deleteShift(shiftId);
    await Database.deleteShiftOccurrencesByParent(shiftId);
    await loadData();
  };

  const handleSaveStaff = async (staffData: Omit<StaffMember, 'id'>) => {
    const newStaff: StaffMember = {
      ...staffData,
      id: editingStaff?.id || Date.now().toString(),
    };
    
    await Database.saveStaffMember(newStaff);
    await loadData();
    setShowStaffForm(false);
    setEditingStaff(null);
  };

  const handleEditStaff = (staff: StaffMember) => {
    setEditingStaff(staff);
    setShowStaffForm(true);
  };

  const handleDeleteStaff = async (staffId: string) => {
    await Database.deleteStaffMember(staffId);
    await loadData();
  };

  const handleSaveOccurrence = async (occurrence: ShiftOccurrence) => {
    await Database.saveShiftOccurrence(occurrence);
    await loadData();
    setShowOccurrenceForm(false);
    setEditingOccurrence(null);
  };

  const handleAssignStaffToShift = async (occurrenceId: string, staffId: string) => {
    const occurrence = shiftOccurrences.find(occ => occ.id === occurrenceId);
    const staffMember = staff.find(s => s.id === staffId);
    
    if (occurrence && staffMember && !occurrence.assignedStaff.includes(staffId)) {
      // Create temporary assignment for validation
      const tempAssignments: { [occurrenceId: string]: string[] } = {};
      shiftOccurrences.forEach(occ => {
        tempAssignments[occ.id] = occ.id === occurrenceId 
          ? [...occ.assignedStaff, staffId]
          : occ.assignedStaff;
      });

      // Validate constraints
      const constraintEngine = new ConstraintEngine();
      const context: ConstraintContext = {
        targetStaff: staffMember,
        targetOccurrence: occurrence,
        allStaff: staff,
        allOccurrences: shiftOccurrences,
        evaluationDate: new Date(occurrence.startDateTime),
        t,
        language,
        mode: 'check_assignment'  // Check if adding this assignment would violate constraints
      };
      const violations = constraintEngine.validateStaffAssignment(context);

      // Always proceed with assignment, but show warnings for violations
      const allViolations = violations.filter(v => v.severity === 'error' || v.severity === 'warning');
      if (allViolations.length > 0) {
        const violationMessages = allViolations.map(v => v.message);
        addToast(
          'warning',
          `${t('planning.constraintWarning', 'Constraint warning')}`,
          `• ${violationMessages.slice(0, 5).join('\n• ')}${violationMessages.length > 5 ? `\n• +${violationMessages.length - 5} more...` : ''}`);
      }

      // Proceed with assignment regardless of constraints
      const updatedOccurrence = {
        ...occurrence,
        assignedStaff: [...occurrence.assignedStaff, staffId],
        isModified: true
      };
      await Database.saveShiftOccurrence(updatedOccurrence);
      await loadData();
    }
  };

  const handleUnassignStaffFromShift = async (occurrenceId: string, staffId: string) => {
    const occurrence = shiftOccurrences.find(occ => occ.id === occurrenceId);
    if (occurrence && occurrence.assignedStaff.includes(staffId)) {
      const updatedOccurrence = {
        ...occurrence,
        assignedStaff: occurrence.assignedStaff.filter(id => id !== staffId),
        isModified: true
      };
      await Database.saveShiftOccurrence(updatedOccurrence);
      await loadData();
    }
  };

  const handleUpdateShiftOccurrences = async (updatedOccurrences: { [occurrenceId: string]: string[] }) => {
    const updates = [];
    
    for (const [occurrenceId, assignedStaff] of Object.entries(updatedOccurrences)) {
      const occurrence = shiftOccurrences.find(occ => occ.id === occurrenceId);
      if (occurrence) {
        // Only update if assignments actually changed
        const currentStaff = [...occurrence.assignedStaff].sort();
        const newStaff = [...assignedStaff].sort();
        
        if (currentStaff.join(',') !== newStaff.join(',')) {
          const updatedOccurrence = {
            ...occurrence,
            assignedStaff,
            isModified: true
          };
          updates.push(Database.saveShiftOccurrence(updatedOccurrence));
        }
      }
    }
    if (updates.length > 0) {
      await Promise.all(updates);
      await loadData();
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-container">
          <div className="brand-section">
            <h1 className="brand-title">Kvetch</h1>
            <span className="brand-subtitle">Shift Planning</span>
          </div>
          
          <nav className="main-nav">
            <Link 
              to="/shifts"
              className={`nav-link ${location.pathname === '/shifts' ? 'active' : ''}`}
            >
              {t('navigation.shifts')}
            </Link>
            <Link 
              to="/staff"
              className={`nav-link ${location.pathname === '/staff' ? 'active' : ''}`}
            >
              {t('navigation.staff')}
            </Link>
            <Link 
              to="/planning"
              className={`nav-link ${location.pathname.startsWith('/planning') ? 'active' : ''}`}
            >
              {t('navigation.planning')}
            </Link>
          </nav>
          
          <div className="header-actions">
            <LanguageSwitcher />
            <HamburgerMenu 
              onLanguageChange={i18n.changeLanguage} 
              currentLanguage={i18n.language} 
            />
          </div>
        </div>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/planning" replace />} />
          <Route 
            path="/shifts" 
            element={
              <ShiftsView
                shifts={shifts}
                shiftOccurrences={shiftOccurrences}
                showShiftForm={showShiftForm}
                editingShift={editingShift}
                onShowShiftForm={() => setShowShiftForm(true)}
                onSaveShift={handleSaveShift}
                onEditShift={handleEditShift}
                onDeleteShift={handleDeleteShift}
                onCancelShiftForm={() => {
                  setShowShiftForm(false);
                  setEditingShift(null);
                }}
              />
            } 
          />
          <Route 
            path="/staff" 
            element={
              <StaffView
                staff={staff}
                showStaffForm={showStaffForm}
                editingStaff={editingStaff}
                onShowStaffForm={() => setShowStaffForm(true)}
                onSaveStaff={handleSaveStaff}
                onEditStaff={handleEditStaff}
                onDeleteStaff={handleDeleteStaff}
                onCancelStaffForm={() => {
                  setShowStaffForm(false);
                  setEditingStaff(null);
                }}
              />
            } 
          />
          <Route 
            path="/planning" 
            element={<Navigate to={`/planning/${new Date().toISOString().split('T')[0]}`} replace />} 
          />
          <Route 
            path="/planning/:weekStr" 
            element={
              <WeeklyPlanningView
                shiftOccurrences={shiftOccurrences}
                staff={staff}
                allTraits={allTraits}
                onAssignStaffToShift={handleAssignStaffToShift}
                onUnassignStaffFromShift={handleUnassignStaffFromShift}
                onUpdateShiftOccurrences={handleUpdateShiftOccurrences}
                onShowToast={addToast}
                onEditOccurrence={(occurrence) => {
                  setEditingOccurrence(occurrence);
                  setShowOccurrenceForm(true);
                }}
              />
            } 
          />
        </Routes>
        
        {/* Occurrence Edit Modal */}
        <Modal
          isOpen={showOccurrenceForm}
          onClose={() => {
            setShowOccurrenceForm(false);
            setEditingOccurrence(null);
          }}
          title={`Edit Occurrence - ${editingOccurrence ? new Date(editingOccurrence.startDateTime).toLocaleDateString(i18n.language) : ''}`}
        >
          {editingOccurrence && (
            <ShiftOccurrenceForm
              occurrence={editingOccurrence}
              onSave={handleSaveOccurrence}
              onCancel={() => {
                setShowOccurrenceForm(false);
                setEditingOccurrence(null);
              }}
            />
          )}
        </Modal>
      </main>
      
      <ToastContainer messages={toasts} onClose={removeToast} />
    </div>
  );
}

export default App;
